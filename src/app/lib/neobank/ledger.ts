import type {
  BucketBalance,
  BucketDefinition,
  BucketId,
  BillPaymentDecision,
  BillPaymentInput,
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

export class LedgerIdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerIdempotencyConflictError";
  }
}

function metadataNumber(entry: JournalEntry, key: string) {
  const value = entry.metadata?.[key];

  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function metadataString(entry: JournalEntry, key: string) {
  const value = entry.metadata?.[key];

  return typeof value === "string" ? value : null;
}

function bucketIdFromAccount(accountId: LedgerAccountId) {
  const prefix = "liability:bucket:";

  return accountId.startsWith(prefix)
    ? (accountId.slice(prefix.length) as BucketId)
    : null;
}

function bucketLineAmount(entry: JournalEntry, direction: "credit" | "debit") {
  const line = entry.lines.find((candidate) => {
    if (!candidate.accountId.startsWith("liability:bucket:")) {
      return false;
    }

    return direction === "debit"
      ? candidate.amountCents > 0
      : candidate.amountCents < 0;
  });

  if (!line) {
    return null;
  }

  return {
    amountCents: Math.abs(line.amountCents),
    bucketId: bucketIdFromAccount(line.accountId),
  };
}

function assertSameIdempotentPayload(
  existing: JournalEntry,
  expected: Record<string, string | number | null | undefined>,
) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue === undefined) {
      continue;
    }

    const existingValue = existing.metadata?.[key];

    if (existingValue !== expectedValue) {
      throw new LedgerIdempotencyConflictError(
        `Idempotency key ${existing.idempotencyKey} already belongs to a different ${existing.type} payload.`,
      );
    }
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

  findByIdempotencyKey(idempotencyKey: string) {
    return this.allEntries().find(
      (entry) => entry.idempotencyKey === idempotencyKey,
    );
  }

  has(idempotencyKey: string) {
    return Boolean(this.findByIdempotencyKey(idempotencyKey));
  }

  post(entry: JournalEntry) {
    assertBalanced(entry.lines);

    if (this.has(entry.idempotencyKey)) {
      return this.findByIdempotencyKey(entry.idempotencyKey) as JournalEntry;
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
  const existing = book.findByIdempotencyKey(input.idempotencyKey);

  if (existing) {
    if (existing.type !== "card_authorization") {
      throw new LedgerIdempotencyConflictError(
        `Idempotency key ${input.idempotencyKey} is already used for ${existing.type}.`,
      );
    }

    assertSameIdempotentPayload(existing, {
      amountCents: input.amountCents,
      merchantCategoryCode: input.merchantCategoryCode ?? null,
      merchantName: input.merchantName,
      payeeId: input.payeeId ?? null,
    });

    const bucketLine = bucketLineAmount(existing, "debit");

    return {
      approved: true,
      approvedAmountCents:
        metadataNumber(existing, "amountCents") ?? bucketLine?.amountCents ?? 0,
      bucketId:
        (metadataString(existing, "bucketId") as BucketId | null) ??
        bucketLine?.bucketId ??
        bucketId,
      code: "approved",
      reason: "Duplicate authorization replayed from the original ledger entry.",
    };
  }

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
        bucketId,
        merchantCategoryCode: input.merchantCategoryCode ?? null,
        merchantName: input.merchantName,
        payeeId: input.payeeId ?? null,
      },
      type: "card_authorization",
    });
  }

  return decision;
}

export function scheduleBillPayment(
  book: LedgerBook,
  payees: Payee[],
  input: BillPaymentInput,
) {
  const payee = payees.find((candidate) => candidate.id === input.payeeId);
  const bucketId = payee?.allowedBucketId;
  const existing = book.findByIdempotencyKey(input.idempotencyKey);

  if (existing) {
    if (existing.type !== "bill_payment") {
      throw new LedgerIdempotencyConflictError(
        `Idempotency key ${input.idempotencyKey} is already used for ${existing.type}.`,
      );
    }

    assertSameIdempotentPayload(existing, {
      amountCents: input.amountCents,
      payeeId: input.payeeId,
      scheduledFor: input.scheduledFor,
    });

    return {
      accepted: true,
      amountCents:
        metadataNumber(existing, "amountCents") ?? input.amountCents,
      bucketId:
        (metadataString(existing, "bucketId") as BucketId | null) ??
        bucketLineAmount(existing, "debit")?.bucketId ??
        bucketId,
      code: "scheduled",
      payeeId: input.payeeId,
      providerStatus: "blocked",
      reason: "Duplicate bill payment replayed from the original ledger entry.",
      scheduledFor: metadataString(existing, "scheduledFor") ?? input.scheduledFor,
    } satisfies BillPaymentDecision;
  }

  if (!payee || payee.status !== "approved" || !bucketId) {
    return {
      accepted: false,
      amountCents: 0,
      code: "payee_not_allowed",
      payeeId: input.payeeId,
      providerStatus: "blocked",
      reason: "Bill payments require an approved protected-bucket payee.",
    } satisfies BillPaymentDecision;
  }

  if (input.amountCents > payee.maxCents) {
    return {
      accepted: false,
      amountCents: 0,
      bucketId,
      code: "amount_exceeds_payee_limit",
      payeeId: input.payeeId,
      providerStatus: "blocked",
      reason: "The scheduled payment exceeds the approved payee limit.",
      scheduledFor: input.scheduledFor,
    } satisfies BillPaymentDecision;
  }

  if (input.amountCents > book.bucketAvailable(bucketId)) {
    return {
      accepted: false,
      amountCents: 0,
      bucketId,
      code: "insufficient_bucket_funds",
      payeeId: input.payeeId,
      providerStatus: "blocked",
      reason: "The protected bucket does not have enough funds for this bill.",
      scheduledFor: input.scheduledFor,
    } satisfies BillPaymentDecision;
  }

  book.createEntry({
    idempotencyKey: input.idempotencyKey,
    lines: [
      {
        accountId: bucketAccount(bucketId),
        amountCents: input.amountCents,
      },
      {
        accountId: "liability:bill_pay_pending",
        amountCents: -input.amountCents,
      },
    ],
    memo: input.memo || `Bill payment: ${payee.name}`,
    metadata: {
      amountCents: input.amountCents,
      bucketId,
      memo: input.memo ?? null,
      payeeId: payee.id,
      payeeName: payee.name,
      scheduledFor: input.scheduledFor,
    },
    type: "bill_payment",
  });

  return {
    accepted: true,
    amountCents: input.amountCents,
    bucketId,
    code: "scheduled",
    payeeId: input.payeeId,
    providerStatus: "blocked",
    reason: "Bill payment fits the approved payee and protected bucket.",
    scheduledFor: input.scheduledFor,
  } satisfies BillPaymentDecision;
}

export function unlockProtectedFunds(book: LedgerBook, input: UnlockInput) {
  if (input.bucketId === "safe_spending") {
    throw new Error("Safe spending is already unlocked.");
  }

  const existing = book.findByIdempotencyKey(input.idempotencyKey);

  if (existing) {
    if (existing.type !== "bucket_unlock") {
      throw new LedgerIdempotencyConflictError(
        `Idempotency key ${input.idempotencyKey} is already used for ${existing.type}.`,
      );
    }

    assertSameIdempotentPayload(existing, {
      amountCents: input.amountCents,
      bucketId: input.bucketId,
      mode: input.mode,
    });

    const bucketLine = bucketLineAmount(existing, "debit");
    const unlockedCents =
      metadataNumber(existing, "amountCents") ?? bucketLine?.amountCents ?? 0;
    const recoveryChecks =
      metadataNumber(existing, "recoveryChecks") ??
      (input.mode === "instant_fixed_fee" ? 1 : 2);

    return {
      recoveryChecks,
      recoveryPerCheckCents:
        metadataNumber(existing, "recoveryPerCheckCents") ??
        Math.ceil(unlockedCents / recoveryChecks),
      unlockedCents,
    };
  }

  const unlockedCents = Math.min(
    cents(input.amountCents),
    book.bucketAvailable(input.bucketId),
  );

  if (unlockedCents <= 0) {
    throw new Error("No protected funds are available to unlock.");
  }

  const recoveryChecks = input.mode === "instant_fixed_fee" ? 1 : 2;
  const result: UnlockResult = {
    recoveryChecks,
    recoveryPerCheckCents: Math.ceil(unlockedCents / recoveryChecks),
    unlockedCents,
  };

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
      bucketId: input.bucketId,
      amountCents: unlockedCents,
      mode: input.mode,
      recoveryChecks: result.recoveryChecks,
      recoveryPerCheckCents: result.recoveryPerCheckCents,
      reason: input.reason,
    },
    type: "bucket_unlock",
  });

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
