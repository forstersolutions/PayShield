import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  assertBalanced,
  authorizeCardTransaction,
  buildBucketBalances,
  LedgerIdempotencyConflictError,
  LedgerBook,
  postPaycheckDeposit,
  reverseEntry,
  scheduleBillPayment,
  unlockProtectedFunds,
} from "../src/app/lib/neobank/ledger.ts";
import {
  createDemoLedgerBook,
  neobankBuckets,
  neobankPayees,
} from "../src/app/lib/neobank/demo-state.ts";

beforeEach(() => {
  delete process.env.PAYSHIELD_BAAS_ADAPTER;
  delete process.env.PAYSHIELD_BAAS_API_BASE_URL;
  delete process.env.PAYSHIELD_BAAS_API_KEY;
  delete process.env.PAYSHIELD_BAAS_CONTRACT_APPROVED;
  delete process.env.PAYSHIELD_BAAS_PROVIDER;
  delete process.env.PAYSHIELD_CORE_API_URL;
  delete process.env.PAYSHIELD_CORE_REQUIRE_SERVICE_TOKEN;
  delete process.env.PAYSHIELD_CORE_SERVICE_TOKEN;
  delete process.env.PAYSHIELD_LEDGER_DATABASE_URL;
  delete process.env.PAYSHIELD_LIVE_MONEY_ENABLED;
  delete process.env.PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED;
  delete process.env.PAYSHIELD_REGULATED_COUNSEL_SIGNOFF;
  delete process.env.PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED;
});

function bucketBalance(amountCents: number, bucketId: string) {
  const book = createDemoLedgerBook(amountCents);

  return buildBucketBalances(book, neobankBuckets).find(
    (bucket) => bucket.id === bucketId,
  )?.availableCents;
}

test("paycheck deposit splits protected buckets before safe spending", () => {
  assert.equal(bucketBalance(300_000, "rent"), 50_000);
  assert.equal(bucketBalance(300_000, "vehicle"), 30_000);
  assert.equal(bucketBalance(300_000, "insurance"), 50_000);
  assert.equal(bucketBalance(300_000, "kids"), 5_000);
  assert.equal(bucketBalance(300_000, "vacation"), 10_000);
  assert.equal(bucketBalance(300_000, "emergency"), 10_000);
  assert.equal(bucketBalance(300_000, "safe_spending"), 145_000);
});

test("short paycheck funds priority buckets and leaves safe spending at zero", () => {
  assert.equal(bucketBalance(90_000, "rent"), 50_000);
  assert.equal(bucketBalance(90_000, "vehicle"), 30_000);
  assert.equal(bucketBalance(90_000, "insurance"), 10_000);
  assert.equal(bucketBalance(90_000, "kids"), 0);
  assert.equal(bucketBalance(90_000, "safe_spending"), 0);
});

test("duplicate paycheck events are idempotent", () => {
  const book = new LedgerBook();
  const input = {
    amountCents: 300_000,
    employerName: "Demo payroll",
    idempotencyKey: "deposit-duplicate",
    receivedAt: "2026-06-12T12:00:00.000Z",
  };

  postPaycheckDeposit(book, neobankBuckets, input);
  postPaycheckDeposit(book, neobankBuckets, input);

  assert.equal(book.allEntries().length, 1);
  assert.equal(book.bucketAvailable("safe_spending"), 145_000);
});

test("unbalanced journal entries are rejected", () => {
  assert.throws(
    () =>
      assertBalanced([
        {
          accountId: "asset:program_cash",
          amountCents: 100,
        },
      ]),
    /not balanced/,
  );
});

test("card authorization approves only safe spending for ordinary purchases", () => {
  const book = createDemoLedgerBook();
  const decision = authorizeCardTransaction(book, neobankPayees, {
    amountCents: 8_000,
    idempotencyKey: "card-walmart-8000",
    merchantCategoryCode: "5411",
    merchantName: "Walmart",
  });

  assert.equal(decision.approved, true);
  assert.equal(decision.bucketId, "safe_spending");
  assert.equal(book.bucketAvailable("safe_spending"), 137_000);
});

test("duplicate approved card authorization replays the original decision", () => {
  const book = createDemoLedgerBook();
  const input = {
    amountCents: 100_000,
    idempotencyKey: "card-retry-safe-spend",
    merchantCategoryCode: "5411",
    merchantName: "Grocery market",
  };

  const firstDecision = authorizeCardTransaction(book, neobankPayees, input);
  const secondDecision = authorizeCardTransaction(book, neobankPayees, input);

  assert.equal(firstDecision.approved, true);
  assert.equal(secondDecision.approved, true);
  assert.equal(secondDecision.approvedAmountCents, 100_000);
  assert.equal(secondDecision.code, "approved");
  assert.equal(book.allEntries().length, 2);
  assert.equal(book.bucketAvailable("safe_spending"), 45_000);
});

test("card authorization rejects reused idempotency key with changed payload", () => {
  const book = createDemoLedgerBook();
  const input = {
    amountCents: 25_000,
    idempotencyKey: "card-retry-conflict",
    merchantName: "Grocery market",
  };

  authorizeCardTransaction(book, neobankPayees, input);

  assert.throws(
    () =>
      authorizeCardTransaction(book, neobankPayees, {
        ...input,
        amountCents: 30_000,
      }),
    LedgerIdempotencyConflictError,
  );
  assert.equal(book.allEntries().length, 2);
  assert.equal(book.bucketAvailable("safe_spending"), 120_000);
});

test("card authorization declines when protected money would be needed", () => {
  const book = createDemoLedgerBook();
  const decision = authorizeCardTransaction(book, neobankPayees, {
    amountCents: 180_000,
    idempotencyKey: "card-large-ordinary",
    merchantName: "Furniture store",
  });

  assert.equal(decision.approved, false);
  assert.equal(decision.code, "insufficient_safe_spend");
  assert.equal(book.bucketAvailable("safe_spending"), 145_000);
});

test("approved payee can draw from its assigned protected bucket", () => {
  const book = createDemoLedgerBook();
  const decision = authorizeCardTransaction(book, neobankPayees, {
    amountCents: 50_000,
    idempotencyKey: "card-rent-payee",
    merchantName: "ABC Apartments",
    payeeId: "payee_abc_apartments",
  });

  assert.equal(decision.approved, true);
  assert.equal(decision.bucketId, "rent");
  assert.equal(book.bucketAvailable("rent"), 0);
  assert.equal(book.bucketAvailable("safe_spending"), 145_000);
});

test("bill payment schedules approved payee from assigned protected bucket", () => {
  const book = createDemoLedgerBook();
  const decision = scheduleBillPayment(book, neobankPayees, {
    amountCents: 50_000,
    idempotencyKey: "bill-rent-july",
    memo: "July rent",
    payeeId: "payee_abc_apartments",
    scheduledFor: "2026-07-01",
  });
  const entry = book.findByIdempotencyKey("bill-rent-july");

  assert.equal(decision.accepted, true);
  assert.equal(decision.code, "scheduled");
  assert.equal(decision.bucketId, "rent");
  assert.equal(book.bucketAvailable("rent"), 0);
  assert.equal(book.bucketAvailable("safe_spending"), 145_000);
  assert.equal(entry?.type, "bill_payment");
  assert.equal(
    entry?.lines.some(
      (line) =>
        line.accountId === "liability:bill_pay_pending" &&
        line.amountCents === -50_000,
    ),
    true,
  );
});

test("duplicate bill payment replays original ledger decision", () => {
  const book = createDemoLedgerBook();
  const input = {
    amountCents: 30_000,
    idempotencyKey: "bill-auto-retry",
    payeeId: "payee_auto_lender",
    scheduledFor: "2026-07-15",
  };

  const firstDecision = scheduleBillPayment(book, neobankPayees, input);
  const secondDecision = scheduleBillPayment(book, neobankPayees, input);

  assert.equal(firstDecision.accepted, true);
  assert.equal(secondDecision.accepted, true);
  assert.equal(secondDecision.reason.includes("Duplicate"), true);
  assert.equal(book.allEntries().length, 2);
  assert.equal(book.bucketAvailable("vehicle"), 0);
});

test("bill payment rejects unapproved payee, payee limit, and insufficient bucket funds", () => {
  const unapproved = scheduleBillPayment(createDemoLedgerBook(), neobankPayees, {
    amountCents: 10_000,
    idempotencyKey: "bill-unapproved",
    payeeId: "payee_missing",
    scheduledFor: "2026-07-01",
  });
  const overLimit = scheduleBillPayment(createDemoLedgerBook(), neobankPayees, {
    amountCents: 120_000,
    idempotencyKey: "bill-over-limit",
    payeeId: "payee_abc_apartments",
    scheduledFor: "2026-07-01",
  });
  const unfunded = scheduleBillPayment(createDemoLedgerBook(), neobankPayees, {
    amountCents: 60_000,
    idempotencyKey: "bill-underfunded-rent",
    payeeId: "payee_abc_apartments",
    scheduledFor: "2026-07-01",
  });

  assert.equal(unapproved.accepted, false);
  assert.equal(unapproved.code, "payee_not_allowed");
  assert.equal(overLimit.accepted, false);
  assert.equal(overLimit.code, "amount_exceeds_payee_limit");
  assert.equal(unfunded.accepted, false);
  assert.equal(unfunded.code, "insufficient_bucket_funds");
});

test("bill payment rejects reused idempotency key with changed payload", () => {
  const book = createDemoLedgerBook();
  const input = {
    amountCents: 30_000,
    idempotencyKey: "bill-retry-conflict",
    payeeId: "payee_auto_lender",
    scheduledFor: "2026-07-15",
  };

  scheduleBillPayment(book, neobankPayees, input);

  assert.throws(
    () =>
      scheduleBillPayment(book, neobankPayees, {
        ...input,
        amountCents: 20_000,
      }),
    LedgerIdempotencyConflictError,
  );
  assert.equal(book.bucketAvailable("vehicle"), 0);
});

test("emergency unlock moves protected funds into safe spending with recovery plan", () => {
  const book = createDemoLedgerBook();
  const result = unlockProtectedFunds(book, {
    amountCents: 20_000,
    bucketId: "rent",
    idempotencyKey: "unlock-rent-20000",
    mode: "slow_free",
    reason: "Emergency repair",
  });

  assert.equal(result.unlockedCents, 20_000);
  assert.equal(result.recoveryChecks, 2);
  assert.equal(result.recoveryPerCheckCents, 10_000);
  assert.equal(book.bucketAvailable("rent"), 30_000);
  assert.equal(book.bucketAvailable("safe_spending"), 165_000);
});

test("duplicate emergency unlock replays the recovery plan", () => {
  const book = createDemoLedgerBook();
  const input = {
    amountCents: 50_000,
    bucketId: "rent" as const,
    idempotencyKey: "unlock-rent-retry",
    mode: "slow_free" as const,
    reason: "Emergency repair",
  };

  const firstResult = unlockProtectedFunds(book, input);
  const secondResult = unlockProtectedFunds(book, input);

  assert.deepEqual(secondResult, firstResult);
  assert.equal(book.allEntries().length, 2);
  assert.equal(book.bucketAvailable("rent"), 0);
  assert.equal(book.bucketAvailable("safe_spending"), 195_000);
});

test("emergency unlock rejects reused idempotency key with changed bucket", () => {
  const book = createDemoLedgerBook();
  const input = {
    amountCents: 20_000,
    bucketId: "rent" as const,
    idempotencyKey: "unlock-retry-conflict",
    mode: "slow_free" as const,
    reason: "Emergency repair",
  };

  unlockProtectedFunds(book, input);

  assert.throws(
    () =>
      unlockProtectedFunds(book, {
        ...input,
        bucketId: "vehicle",
      }),
    LedgerIdempotencyConflictError,
  );
  assert.equal(book.allEntries().length, 2);
  assert.equal(book.bucketAvailable("rent"), 30_000);
  assert.equal(book.bucketAvailable("vehicle"), 30_000);
  assert.equal(book.bucketAvailable("safe_spending"), 165_000);
});

test("reversal posts a new entry and never mutates the original", () => {
  const book = new LedgerBook();
  const entry = postPaycheckDeposit(book, neobankBuckets, {
    amountCents: 120_000,
    employerName: "Demo payroll",
    idempotencyKey: "deposit-reversal",
    receivedAt: "2026-06-12T12:00:00.000Z",
  });
  const reversed = reverseEntry(book, entry, "deposit-reversal-reversed");

  assert.equal(book.allEntries().length, 2);
  assert.equal(reversed.reversedEntryId, entry.id);
  assert.equal(entry.reversedEntryId, undefined);
  assert.equal(book.bucketAvailable("rent"), 0);
});
