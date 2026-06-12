import type {
  BucketBalance,
  BucketDefinition,
  BucketId,
  CardAuthorizationDecision,
  CardAuthorizationInput,
  JournalEntry,
  JournalEntryType,
  JournalLine,
  LedgerAccountId,
  PaycheckDepositInput,
  Payee,
  UnlockInput,
  UnlockResult,
} from "./types.ts";

export const bucketAccount = (bucketId: BucketId): LedgerAccountId =>
  `liability:bucket:${bucketId}`;

export function cents(value: number) {
  if (!Number.isInteger(value)) {
    throw new Error("Money amounts must be integer cents.");
  }

  return value;
}

export function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value / 100);
}

function entryId(type: JournalEntryType, idempotencyKey: string) {
  const cleaned = idempotencyKey.replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 80);
  return `${type}:${cleaned || "entry"}`;
}

export function assertBalanced(lines: JournalLine[]) {
  const total = lines.reduce((sum, line) => sum + line.amountCents, 0);

  if (total !== 0) {
    throw new Error(`Journal entry is not balanced: ${total} cents`);
  }
}

export class LedgerBook {
  private readonly entries = new Map<string, JournalEntry>();

  constructor(initialEntries: JournalEntry[] = []) {
    for (const entry of initialEntries) {
      this.post(entry);
    }
  }

  allEntries() {
    return [...this.entries.values()];
  }

  has(idempotencyKey: string) {
    return [...this.entries.values()].some(
      (entry) => entry.idempotencyKey === idempotencyKey,
    );
  }

  post(entry: JournalEntry) {
    assertBalanced(entry.lines);

    if (this.has(entry.idempotencyKey)) {
      return this.allEntries().find(
        (candidate) => candidate.idempotencyKey === entry.idempotencyKey,
      ) as JournalEntry;
    }

    this.entries.set(entry.id, entry);
    return entry;
  }

  createEntry(input: {
    idempotencyKey: string;
    lines: JournalLine[];
    memo: string;
    metadata?: JournalEntry["metadata"];
    reversedEntryId?: string;
    type: JournalEntryType;
  }) {
    return this.post({
      createdAt: new Date().toISOString(),
      id: entryId(input.type, input.idempotencyKey),
      idempotencyKey: input.idempotencyKey,
      lines: input.lines,
      memo: input.memo,
      metadata: input.metadata,
      reversedEntryId: input.reversedEntryId,
      type: input.type,
    });
  }

  balance(accountId: LedgerAccountId) {
    return this.allEntries().reduce((sum, entry) => {
      const accountTotal = entry.lines
        .filter((line) => line.accountId === accountId)
        .reduce((lineSum, line) => lineSum + line.amountCents, 0);

      return sum + accountTotal;
    }, 0);
  }

  bucketAvailable(bucketId: BucketId) {
    return Math.max(0, -this.balance(bucketAccount(bucketId)));
  }
}

export function buildBucketBalances(
  book: LedgerBook,
  buckets: BucketDefinition[],
) {
  return buckets.map<BucketBalance>((bucket) => {
    const availableCents = book.bucketAvailable(bucket.id);
    const fundedCents = Math.min(bucket.targetCents, availableCents);

    return {
      ...bucket,
      availableCents,
      fundedCents,
      shortCents: Math.max(0, bucket.targetCents - availableCents),
    };
  });
}

export function postPaycheckDeposit(
  book: LedgerBook,
  buckets: BucketDefinition[],
  input: PaycheckDepositInput,
) {
  if (book.has(input.idempotencyKey)) {
    return book.allEntries().find(
      (entry) => entry.idempotencyKey === input.idempotencyKey,
    ) as JournalEntry;
  }

  let remaining = cents(input.amountCents);
  const sortedBuckets = [...buckets].sort((a, b) => a.priority - b.priority);
  const lines: JournalLine[] = [
    {
      accountId: "asset:program_cash",
      amountCents: input.amountCents,
    },
  ];

  for (const bucket of sortedBuckets) {
    if (bucket.id === "safe_spending") {
      continue;
    }

    const funded = Math.min(bucket.targetCents, Math.max(0, remaining));

    if (funded > 0) {
      lines.push({
        accountId: bucketAccount(bucket.id),
        amountCents: -funded,
      });
      remaining -= funded;
    }
  }

  if (remaining > 0) {
    lines.push({
      accountId: bucketAccount("safe_spending"),
      amountCents: -remaining,
    });
  }

  return book.createEntry({
    idempotencyKey: input.idempotencyKey,
    lines,
    memo: `Paycheck deposit from ${input.employerName}`,
    metadata: {
      amountCents: input.amountCents,
      employerName: input.employerName,
      receivedAt: input.receivedAt,
    },
    type: "paycheck_deposit",
  });
}

export function authorizeCardTransaction(
  book: LedgerBook,
  payees: Payee[],
  input: CardAuthorizationInput,
) {
  const payee = input.payeeId
    ? payees.find((candidate) => candidate.id === input.payeeId)
    : null;
  const bucketId = payee?.allowedBucketId ?? "safe_spending";
  const available = book.bucketAvailable(bucketId);
  const approvedByPayee =
    !input.payeeId ||
    Boolean(payee && payee.status === "approved" && input.amountCents <= payee.maxCents);

  let decision: CardAuthorizationDecision;

  if (!approvedByPayee) {
    decision = {
      approved: false,
      approvedAmountCents: 0,
      bucketId,
      code: "payee_not_allowed",
      reason: "This merchant is not approved for the requested protected bucket.",
    };
  } else if (input.amountCents > available) {
    decision = {
      approved: false,
      approvedAmountCents: 0,
      bucketId,
      code: "insufficient_safe_spend",
      reason:
        bucketId === "safe_spending"
          ? "Safe-to-spend does not cover this purchase."
          : "The approved bucket does not have enough protected funds.",
    };
  } else {
    decision = {
      approved: true,
      approvedAmountCents: input.amountCents,
      bucketId,
      code: "approved",
      reason:
        bucketId === "safe_spending"
          ? "Purchase fits the safe-to-spend balance."
          : "Approved payee can draw from the protected bucket.",
    };

    book.createEntry({
      idempotencyKey: input.idempotencyKey,
      lines: [
        {
          accountId: bucketAccount(bucketId),
          amountCents: input.amountCents,
        },
        {
          accountId: "liability:card_settlement",
          amountCents: -input.amountCents,
        },
      ],
      memo: `Card authorization: ${input.merchantName}`,
      metadata: {
        amountCents: input.amountCents,
        merchantCategoryCode: input.merchantCategoryCode ?? null,
        merchantName: input.merchantName,
        payeeId: input.payeeId ?? null,
      },
      type: "card_authorization",
    });
  }

  return decision;
}

export function unlockProtectedFunds(book: LedgerBook, input: UnlockInput) {
  if (input.bucketId === "safe_spending") {
    throw new Error("Safe spending is already unlocked.");
  }

  const unlockedCents = Math.min(
    cents(input.amountCents),
    book.bucketAvailable(input.bucketId),
  );

  if (unlockedCents <= 0) {
    throw new Error("No protected funds are available to unlock.");
  }

  book.createEntry({
    idempotencyKey: input.idempotencyKey,
    lines: [
      {
        accountId: bucketAccount(input.bucketId),
        amountCents: unlockedCents,
      },
      {
        accountId: bucketAccount("safe_spending"),
        amountCents: -unlockedCents,
      },
    ],
    memo: `Emergency unlock from ${input.bucketId}`,
    metadata: {
      amountCents: unlockedCents,
      mode: input.mode,
      reason: input.reason,
    },
    type: "bucket_unlock",
  });

  const recoveryChecks = input.mode === "instant_fixed_fee" ? 1 : 2;
  const result: UnlockResult = {
    recoveryChecks,
    recoveryPerCheckCents: Math.ceil(unlockedCents / recoveryChecks),
    unlockedCents,
  };

  return result;
}

export function reverseEntry(
  book: LedgerBook,
  entry: JournalEntry,
  idempotencyKey: string,
) {
  return book.createEntry({
    idempotencyKey,
    lines: entry.lines.map((line) => ({
      accountId: line.accountId,
      amountCents: -line.amountCents,
    })),
    memo: `Reversal for ${entry.id}`,
    reversedEntryId: entry.id,
    type: "reversal",
  });
}
