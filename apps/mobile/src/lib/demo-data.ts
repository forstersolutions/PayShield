import type {
  BillPayment,
  BucketBalance,
  MoneyProfile,
  OperationsPacket,
  Payee,
  TimelineItem,
} from "@/lib/types";

const now = new Date();
now.setSeconds(0, 0);
const inDays = (days: number) => {
  const value = new Date(now);
  value.setDate(value.getDate() + days);
  return value.toISOString();
};

const initialBuckets: BucketBalance[] = [
  { availableCents: 50000, due: "1st", fundedCents: 50000, id: "rent", name: "Rent", payeeId: "payee_home", priority: 10, protection: "bill_only", shortCents: 0, targetCents: 50000 },
  { availableCents: 30000, due: "15th", fundedCents: 30000, id: "vehicle", name: "Vehicle", payeeId: "payee_auto", priority: 20, protection: "bill_only", shortCents: 0, targetCents: 30000 },
  { availableCents: 50000, due: "22nd", fundedCents: 50000, id: "insurance", name: "Insurance", payeeId: "payee_insurance", priority: 30, protection: "bill_only", shortCents: 0, targetCents: 50000 },
  { availableCents: 5000, due: "Every check", fundedCents: 5000, id: "kids", name: "Kids", priority: 40, protection: "hard_lock", shortCents: 0, targetCents: 5000 },
  { availableCents: 10000, due: "Every check", fundedCents: 10000, id: "vacation", name: "Vacation", priority: 50, protection: "soft_lock", shortCents: 0, targetCents: 10000 },
  { availableCents: 10000, due: "Every check", fundedCents: 10000, id: "emergency", name: "Emergency", priority: 60, protection: "emergency", shortCents: 0, targetCents: 10000 },
  { availableCents: 145000, due: "Remainder", fundedCents: 145000, id: "safe_spending", name: "Safe to Spend", priority: 1000, protection: "spendable", shortCents: 0, targetCents: 0 },
];

const initialPayees: Payee[] = [
  { allowedBucketId: "rent", id: "payee_home", maxCents: 120000, name: "Home Property Group", status: "approved" },
  { allowedBucketId: "vehicle", id: "payee_auto", maxCents: 80000, name: "Auto Finance", status: "approved" },
  { allowedBucketId: "insurance", id: "payee_insurance", maxCents: 70000, name: "Family Insurance", status: "approved" },
];

const initialBills: BillPayment[] = [
  { amountCents: 50000, bucketId: "rent", id: "bill_rent_next", memo: "Monthly rent", payeeId: "payee_home", scheduledFor: inDays(3).slice(0, 10), status: "scheduled" },
  { amountCents: 30000, bucketId: "vehicle", id: "bill_auto_next", memo: "Vehicle payment", payeeId: "payee_auto", scheduledFor: inDays(9).slice(0, 10), status: "scheduled" },
];

const initialTimeline: TimelineItem[] = [
  { amountCents: 300000, at: now.toISOString(), detail: "$1,550 protected before spending", id: "event_paycheck", label: "Paycheck protected", rail: "paycheck", status: "complete" },
  { amountCents: 4286, at: inDays(-1), detail: "Corner Market", id: "event_card", label: "Card purchase", rail: "card", status: "approved" },
  { amountCents: 50000, at: inDays(-2), detail: "Home Property Group", id: "event_bill", label: "Bill scheduled", rail: "bill_pay", status: "scheduled" },
];

function calculateBalances(buckets: BucketBalance[]) {
  const safeToSpendCents = buckets.find((bucket) => bucket.id === "safe_spending")?.availableCents ?? 0;
  const protectedCents = buckets.filter((bucket) => bucket.id !== "safe_spending").reduce((total, bucket) => total + bucket.availableCents, 0);
  return { protectedCents, safeToSpendCents, totalCents: protectedCents + safeToSpendCents };
}

let moneyProfile: MoneyProfile = {
  employerName: "Grayston Payroll",
  expectedFrequency: "biweekly",
  nextPayday: inDays(12).slice(0, 10),
  paycheckAmountCents: 300000,
};

const packet: OperationsPacket = {
  balances: calculateBalances(initialBuckets),
  buckets: initialBuckets,
  card: { authorizationMode: "core_ledger", cardLast4: "4821", status: "active" },
  commercialAccess: { priceLabel: "$19/month", state: "active", subscriptionStatus: "active" },
  controls: { payees: initialPayees },
  directDeposit: { accountLast4: "6134", accountName: "PayShield paycheck account", providerStatus: "ready", routingLast4: "0210", status: "ready" },
  generatedAt: now.toISOString(),
  household: { email: "household@example.com", householdId: "household_review", name: "The Forster Household", userId: "review_user" },
  operations: {
    bankConnections: [{ accountLast4: "8842", accountName: "Everyday checking", id: "bank_review", institutionName: "Connected Bank", status: "active" }],
    billPayments: initialBills,
    paycheckDetectionRules: [{ employerNamePattern: "GRAYSTON PAYROLL", expectedFrequency: "biweekly", id: "rule_review", minimumAmountCents: 250000, ruleName: "Primary paycheck", status: "active" }],
  },
  timeline: initialTimeline,
};

function bodyRecord(body: unknown) {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function addTimeline(item: Omit<TimelineItem, "at">) {
  packet.timeline = [{ ...item, at: new Date().toISOString() }, ...(packet.timeline ?? [])];
  packet.generatedAt = new Date().toISOString();
}

function updateBuckets(buckets: BucketBalance[]) {
  packet.buckets = buckets;
  packet.balances = calculateBalances(buckets);
}

export async function demoRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 180));
  const input = bodyRecord(body);

  if (path === "/api/app/operations" && method === "GET") return structuredClone(packet) as T;
  if (path === "/api/app/money-profile" && method === "GET") return { profile: structuredClone(moneyProfile) } as T;
  if (path === "/api/app/money-profile" && method === "POST") {
    moneyProfile = { ...moneyProfile, ...(input as Partial<MoneyProfile>) };
    return { message: "Paycheck plan saved.", profile: structuredClone(moneyProfile) } as T;
  }
  if (path === "/api/app/protection-plan" && method === "POST") {
    moneyProfile = { ...moneyProfile, ...(input as Partial<MoneyProfile>) };
    const definitions = Array.isArray(input.buckets) ? input.buckets : [];
    let remaining = moneyProfile.paycheckAmountCents;
    const buckets = definitions.map((value, index) => {
      const item = bodyRecord(value);
      const targetCents = Number(item.targetCents ?? 0);
      const fundedCents = Math.min(remaining, targetCents);
      remaining -= fundedCents;
      return {
        availableCents: fundedCents,
        due: String(item.due ?? "Every check"),
        fundedCents,
        id: String(item.id ?? `custom_bucket_${index + 1}`),
        name: String(item.name ?? "Bucket"),
        priority: (index + 1) * 10,
        protection: String(item.protection ?? "hard_lock") as BucketBalance["protection"],
        shortCents: Math.max(0, targetCents - fundedCents),
        targetCents,
      };
    });
    buckets.push({ availableCents: remaining, due: "Remainder", fundedCents: remaining, id: "safe_spending", name: "Safe to Spend", priority: 1000, protection: "spendable", shortCents: 0, targetCents: 0 });
    updateBuckets(buckets);
    packet.operations = {
      ...(packet.operations ?? {}),
      paycheckDetectionRules: [{
        employerNamePattern: moneyProfile.employerName,
        expectedFrequency: moneyProfile.expectedFrequency,
        id: String(input.detectionRuleId ?? `rule_${Date.now()}`),
        minimumAmountCents: Math.max(1, Math.floor(moneyProfile.paycheckAmountCents * 0.5)),
        ruleName: `${moneyProfile.employerName} paycheck`,
        status: "active",
      }],
    };
    addTimeline({ detail: `${buckets.length - 1} protected buckets`, id: `event_plan_${Date.now()}`, label: "Protection plan updated", rail: "buckets", status: "complete" });
    return { buckets: structuredClone(buckets), message: "Your protection plan and paycheck detection are active.", profile: structuredClone(moneyProfile) } as T;
  }
  if (path === "/api/app/buckets" && method === "POST") {
    const definitions = Array.isArray(input.buckets) ? input.buckets : [];
    let remaining = moneyProfile.paycheckAmountCents;
    const buckets = definitions.map((value, index) => {
      const item = bodyRecord(value);
      const targetCents = Number(item.targetCents ?? 0);
      const fundedCents = Math.min(remaining, targetCents);
      remaining -= fundedCents;
      return {
        availableCents: fundedCents,
        due: String(item.due ?? "Every check"),
        fundedCents,
        id: String(item.id ?? `custom_bucket_${index + 1}`),
        name: String(item.name ?? "Bucket"),
        priority: (index + 1) * 10,
        protection: String(item.protection ?? "hard_lock") as BucketBalance["protection"],
        shortCents: Math.max(0, targetCents - fundedCents),
        targetCents,
      };
    });
    buckets.push({ availableCents: remaining, due: "Remainder", fundedCents: remaining, id: "safe_spending", name: "Safe to Spend", priority: 1000, protection: "spendable", shortCents: 0, targetCents: 0 });
    updateBuckets(buckets);
    addTimeline({ detail: `${buckets.length - 1} protected buckets`, id: `event_plan_${Date.now()}`, label: "Protection plan updated", rail: "buckets", status: "complete" });
    return { buckets: structuredClone(buckets), message: "Protection plan saved." } as T;
  }
  if (path === "/api/app/payees" && method === "POST") {
    const payee: Payee = { allowedBucketId: String(input.allowedBucketId), id: `payee_${Date.now()}`, maxCents: Number(input.maxCents), name: String(input.name), status: "provider_pending" };
    packet.controls = { payees: [...(packet.controls?.payees ?? []), payee] };
    return { message: "Destination added.", payee } as T;
  }
  if (path === "/api/app/payees" && method === "PATCH") {
    const payee = packet.controls?.payees?.find((item) => item.id === input.payeeId);
    if (!payee) throw new Error("Payment destination was not found.");
    payee.allowedBucketId = String(input.allowedBucketId);
    payee.maxCents = Number(input.maxCents);
    payee.name = String(input.name);
    payee.status = "provider_pending";
    return { message: "Payment destination updated.", payee } as T;
  }
  if (path === "/api/app/payees" && method === "DELETE") {
    const payee = packet.controls?.payees?.find((item) => item.id === input.payeeId);
    if (!payee) throw new Error("Payment destination was not found.");
    const inUse = packet.operations?.billPayments?.some((bill) => bill.payeeId === payee.id && ["scheduled", "submitted"].includes(bill.status));
    if (inUse) throw new Error("Cancel or reassign scheduled payments before removing this destination.");
    payee.status = "archived";
    return { message: "Payment destination removed.", payeeId: payee.id } as T;
  }
  if (path === "/api/app/payees/verify" && method === "POST") {
    const payees = packet.controls?.payees ?? [];
    const payee = payees.find((item) => item.id === input.payeeId);
    if (payee) payee.status = "approved";
    return { message: "Destination verified.", payee } as T;
  }
  if (path === "/api/app/bill-payments" && method === "POST") {
    const payee = packet.controls?.payees?.find((item) => item.id === input.payeeId);
    const bill: BillPayment = { amountCents: Number(input.amountCents), bucketId: payee?.allowedBucketId, id: `bill_${Date.now()}`, memo: input.memo ? String(input.memo) : null, payeeId: String(input.payeeId), scheduledFor: String(input.scheduledFor), status: "scheduled" };
    packet.operations = { ...(packet.operations ?? {}), billPayments: [...(packet.operations?.billPayments ?? []), bill] };
    addTimeline({ amountCents: bill.amountCents, detail: payee?.name ?? "Approved destination", id: `event_${bill.id}`, label: "Bill scheduled", rail: "bill_pay", status: "scheduled" });
    return { decision: { accepted: true }, message: "Bill scheduled.", payment: bill } as T;
  }
  if (path === "/api/app/bill-payments/cancel" && method === "POST") {
    const bill = packet.operations?.billPayments?.find((item) => item.id === input.scheduleId);
    if (bill) bill.status = "canceled";
    return { message: "Bill canceled." } as T;
  }
  if (path === "/api/app/transfers" && method === "POST") {
    const amount = Number(input.amountCents);
    updateBuckets(packet.buckets.map((bucket) => bucket.id === input.sourceBucketId ? { ...bucket, availableCents: Math.max(0, bucket.availableCents - amount) } : bucket));
    addTimeline({ amountCents: amount, detail: "Approved destination", id: `event_transfer_${Date.now()}`, label: "Transfer requested", rail: "transfer", status: "submitted" });
    return { message: "Transfer request created." } as T;
  }
  if (path === "/api/app/unlocks" && method === "POST") {
    const amount = Number(input.amountCents);
    updateBuckets(packet.buckets.map((bucket) => {
      if (bucket.id === input.bucketId) return { ...bucket, availableCents: Math.max(0, bucket.availableCents - amount) };
      if (bucket.id === "safe_spending") return { ...bucket, availableCents: bucket.availableCents + amount };
      return bucket;
    }));
    addTimeline({ amountCents: amount, detail: String(input.reason), id: `event_unlock_${Date.now()}`, label: "Protected money unlocked", rail: "unlock", status: "complete" });
    return { message: "Money moved to Safe to Spend.", result: { recoveryChecks: input.mode === "instant_fixed_fee" ? 1 : 2, recoveryPerCheckCents: Math.ceil(amount / (input.mode === "instant_fixed_fee" ? 1 : 2)), unlockedCents: amount } } as T;
  }
  if (path === "/api/app/card/status" && method === "POST") {
    packet.card = { ...packet.card, status: String(input.status) };
    return { card: packet.card, message: input.status === "frozen" ? "Card locked." : "Card unlocked." } as T;
  }
  if (path === "/api/app/paychecks/rules" && method === "POST") {
    const rule = {
      employerNamePattern: String(input.employerNamePattern ?? ""),
      expectedFrequency: String(input.expectedFrequency ?? "unknown"),
      id: String(input.id ?? `rule_${Date.now()}`),
      minimumAmountCents: Number(input.minimumAmountCents ?? 0),
      ruleName: String(input.ruleName ?? "Paycheck"),
      status: String(input.status ?? "active"),
    };
    packet.operations = { ...(packet.operations ?? {}), paycheckDetectionRules: [rule] };
    return { message: "Paycheck detection rule saved.", rule } as T;
  }
  if (path === "/api/app/paychecks/sync" && method === "POST") {
    return { accepted: true, detectionCount: 0, sync: { addedCount: 0, modifiedCount: 0 } } as T;
  }
  if (path === "/api/app/onboarding/start" && method === "POST") {
    return { directDeposit: packet.directDeposit, message: "Account and card setup are complete." } as T;
  }
  if (path === "/api/app/direct-deposit" && method === "POST") {
    return {
      directDeposit: {
        ...packet.directDeposit,
        instructionsExpiresAt: inDays(1),
        instructionsUrl: "https://example.com/payshield/direct-deposit",
      },
      message: "Secure direct deposit instructions refreshed for your provider account.",
    } as T;
  }
  if (path === "/api/app/account-closure" && method === "POST") {
    return { closure: { id: "closure_demo", status: "requested" }, message: "Your account closure request has been received." } as T;
  }

  if (path === "/api/app/card/manage" && method === "POST") {
    return {
      message: "Secure card controls are ready.",
      session: { managementUrl: "https://example.com/payshield/card" },
    } as T;
  }
  if (path === "/api/app/bank-connections" && method === "DELETE") {
    const bankConnections = packet.operations?.bankConnections ?? [];
    const bank = bankConnections.find((item) => item.id === input.bankConnectionId);
    if (!bank) throw new Error("Bank connection was not found.");
    bank.status = "revoked";
    return { bankConnectionId: bank.id, message: "Bank disconnected. Paycheck detection for this account is off." } as T;
  }
  if (path === "/api/app/audit/export" && method === "GET") return structuredClone(packet) as T;
  if (path === "/api/app/billing/status" && method === "GET") return { access: packet.commercialAccess, active: true, priceLabel: "$19/month" } as T;

  throw new Error(`Demo route not implemented: ${method} ${path}`);
}

export function connectDemoBank() {
  packet.operations = {
    ...(packet.operations ?? {}),
    bankConnections: [{ accountLast4: "8842", accountName: "Everyday checking", id: `bank_${Date.now()}`, institutionName: "Connected Bank", status: "active" }],
  };
}
