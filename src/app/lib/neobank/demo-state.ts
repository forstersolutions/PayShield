import {
  authorizeCardTransaction,
  buildBucketBalances,
  LedgerBook,
  postPaycheckDeposit,
  scheduleBillPayment,
  unlockProtectedFunds,
} from "./ledger.ts";
import { getNeobankReadiness } from "./readiness.ts";
import type {
  BucketDefinition,
  BucketId,
  BillPaymentInput,
  CardAuthorizationInput,
  NeobankSnapshot,
  Payee,
  PayShieldUser,
  UnlockInput,
} from "./types.ts";

export const neobankBuckets: BucketDefinition[] = [
  {
    due: "1st",
    id: "rent",
    name: "Rent",
    payeeId: "payee_abc_apartments",
    priority: 10,
    protection: "bill_only",
    targetCents: 50_000,
  },
  {
    due: "15th",
    id: "vehicle",
    name: "Vehicle",
    payeeId: "payee_auto_lender",
    priority: 20,
    protection: "bill_only",
    targetCents: 30_000,
  },
  {
    due: "22nd",
    id: "insurance",
    name: "Insurance",
    payeeId: "payee_insurance",
    priority: 30,
    protection: "bill_only",
    targetCents: 50_000,
  },
  {
    due: "Every check",
    id: "kids",
    name: "Kids",
    priority: 40,
    protection: "hard_lock",
    targetCents: 5_000,
  },
  {
    due: "Every check",
    id: "vacation",
    name: "Vacation",
    priority: 50,
    protection: "soft_lock",
    targetCents: 10_000,
  },
  {
    due: "Every check",
    id: "emergency",
    name: "Emergency",
    priority: 60,
    protection: "emergency",
    targetCents: 10_000,
  },
  {
    due: "Remainder",
    id: "safe_spending",
    name: "Safe to Spend",
    priority: 100,
    protection: "spendable",
    targetCents: 0,
  },
];

export const neobankPayees: Payee[] = [
  {
    allowedBucketId: "rent",
    id: "payee_abc_apartments",
    maxCents: 100_000,
    name: "ABC Apartments",
    status: "approved",
  },
  {
    allowedBucketId: "vehicle",
    id: "payee_auto_lender",
    maxCents: 80_000,
    name: "Auto lender",
    status: "approved",
  },
  {
    allowedBucketId: "insurance",
    id: "payee_insurance",
    maxCents: 70_000,
    name: "Insurance carrier",
    status: "approved",
  },
];

export const demoUser: PayShieldUser = {
  email: "private-household@example.com",
  householdId: "household_demo_001",
  id: "user_demo_001",
  kycStatus: "provider_pending",
  name: "PayShield household",
  profileAccess: "approved",
};

export function createDemoLedgerBook(amountCents = 300_000) {
  const book = new LedgerBook();

  postPaycheckDeposit(book, neobankBuckets, {
    amountCents,
    employerName: "Demo payroll",
    idempotencyKey: `demo-paycheck-${amountCents}`,
    receivedAt: "2026-06-12T12:00:00.000Z",
  });

  return book;
}

export function createNeobankSnapshot(book = createDemoLedgerBook()): NeobankSnapshot {
  const readiness = getNeobankReadiness();

  return {
    buckets: buildBucketBalances(book, neobankBuckets),
    card: {
      authorizationMode: readiness.liveMoneyReady ? "provider_gateway" : "simulation",
      cardLast4: readiness.liveMoneyReady ? "9244" : "----",
      status: readiness.liveMoneyReady ? "live" : "gated",
    },
    directDeposit: {
      accountLast4: readiness.liveMoneyReady ? "4421" : "----",
      accountName: "PayShield protected paycheck account",
      providerStatus: readiness.liveMoneyReady ? "live" : "gated",
      routingLast4: readiness.liveMoneyReady ? "0210" : "----",
    },
    householdId: demoUser.householdId,
    ledgerEntries: book.allEntries(),
    payees: neobankPayees,
    readiness,
    user: demoUser,
  };
}

export function simulateCardAuthorization(input: CardAuthorizationInput) {
  const book = createDemoLedgerBook();
  const decision = authorizeCardTransaction(book, neobankPayees, input);

  return {
    balances: buildBucketBalances(book, neobankBuckets),
    decision,
    ledgerEntries: book.allEntries(),
    mode: "simulation" as const,
  };
}

export function simulateBillPayment(input: BillPaymentInput) {
  const book = createDemoLedgerBook();
  const decision = scheduleBillPayment(book, neobankPayees, input);

  return {
    balances: buildBucketBalances(book, neobankBuckets),
    decision,
    ledgerEntries: book.allEntries(),
    mode: "simulation" as const,
    readiness: getNeobankReadiness(),
  };
}

export function simulateUnlock(input: UnlockInput) {
  const book = createDemoLedgerBook();
  const result = unlockProtectedFunds(book, input);

  return {
    balances: buildBucketBalances(book, neobankBuckets),
    ledgerEntries: book.allEntries(),
    mode: "simulation" as const,
    result,
  };
}

export function isBucketId(value: unknown): value is BucketId {
  return neobankBuckets.some((bucket) => bucket.id === value);
}
