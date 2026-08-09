import { getCommercialReadiness } from "../commercial/billing.ts";
import { friendlyGateLabel } from "../readiness-gates.ts";
import { createNeobankSnapshot } from "./demo-state.ts";
import { getMoneyRailReadiness } from "./money-rails.ts";
import type { AppSession } from "./auth.ts";
import { householdForSession } from "./session-household.ts";
import type {
  BucketBalance,
  BucketId,
  BucketProtection,
  Payee,
} from "./types.ts";

export type MoneyControlPlanInput = {
  buckets: BucketBalance[];
  employerName: string;
  expectedFrequency: "weekly" | "biweekly" | "semimonthly" | "monthly" | "unknown";
  payees: Payee[];
  paycheckAmountCents: number;
  preferredPayeeId: string | null;
  preferredTransferBucketId: BucketId | null;
  requestedTransferCents: number;
  ruleName: string;
};

type NormalizedPlanResult =
  | {
      errors: string[];
      input: null;
      ok: false;
    }
  | {
      errors: [];
      input: MoneyControlPlanInput;
      ok: true;
    };

const frequencyValues = new Set([
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "unknown",
]);
const controlPlanProtectionValues = new Set<BucketProtection>([
  "bill_only",
  "emergency",
  "hard_lock",
  "soft_lock",
  "spendable",
]);
const controlPlanPayeeStatuses = new Set<Payee["status"]>([
  "approved",
  "modeled",
  "provider_pending",
]);
const controlPlanBucketIdPattern =
  /^(rent|vehicle|insurance|kids|vacation|emergency|safe_spending|custom_[a-z0-9_]{1,64})$/;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function toCents(value: unknown, fallback: number, options = { max: 2_000_000, min: 1 }) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount) || amount < options.min || amount > options.max) {
    return null;
  }

  return amount;
}

function cleanBucketId(value: unknown): BucketId | null {
  const id = cleanText(value, 80);

  if (!controlPlanBucketIdPattern.test(id)) {
    return null;
  }

  return id as BucketId;
}

function integerCents(value: unknown, fallback = 0) {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount)) {
    return fallback;
  }

  return Math.max(0, Math.min(2_000_000, amount));
}

function normalizePlanBuckets(
  value: unknown,
  fallback: BucketBalance[],
): BucketBalance[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const buckets = value
    .map((item): BucketBalance | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const id = cleanBucketId(record.id);
      const protection = cleanText(record.protection, 40) as BucketProtection;

      if (!id || !controlPlanProtectionValues.has(protection)) {
        return null;
      }

      const targetCents = integerCents(record.targetCents);
      const availableCents = integerCents(record.availableCents, targetCents);
      const fundedCents = integerCents(record.fundedCents, availableCents);

      return {
        availableCents,
        due: cleanText(record.due, 48) || "Every check",
        fundedCents,
        id,
        name: cleanText(record.name, 80) || "Protected bucket",
        payeeId: cleanText(record.payeeId, 120) || undefined,
        priority:
          typeof record.priority === "number" && Number.isFinite(record.priority)
            ? Math.max(1, Math.round(record.priority))
            : 999,
        protection,
        shortCents: integerCents(
          record.shortCents,
          Math.max(0, targetCents - fundedCents),
        ),
        targetCents,
      };
    })
    .filter((bucket): bucket is BucketBalance => Boolean(bucket))
    .sort((left, right) => left.priority - right.priority);
  const protectedCount = buckets.filter((bucket) => bucket.id !== "safe_spending")
    .length;
  const hasSafeSpend = buckets.some((bucket) => bucket.id === "safe_spending");

  if (!protectedCount) {
    return fallback;
  }

  if (hasSafeSpend) {
    return buckets;
  }

  return [
    ...buckets,
    {
      availableCents: 0,
      due: "Remainder",
      fundedCents: 0,
      id: "safe_spending",
      name: "Safe to Spend",
      priority: 1000,
      protection: "spendable",
      shortCents: 0,
      targetCents: 0,
    },
  ];
}

function normalizePlanPayees(
  value: unknown,
  fallback: Payee[],
  buckets: BucketBalance[],
): Payee[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const bucketIds = new Set(buckets.map((bucket) => bucket.id));
  const payees = value
    .map((item): Payee | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const allowedBucketId = cleanBucketId(record.allowedBucketId);
      const status = cleanText(record.status, 40) as Payee["status"];

      if (
        !allowedBucketId ||
        !bucketIds.has(allowedBucketId) ||
        !controlPlanPayeeStatuses.has(status)
      ) {
        return null;
      }

      return {
        allowedBucketId,
        id: cleanText(record.id, 120) || `payee_${allowedBucketId}`,
        maxCents: integerCents(record.maxCents, 0),
        name: cleanText(record.name, 80) || "Approved payee",
        status,
      };
    })
    .filter((payee): payee is Payee => Boolean(payee));

  return payees.length ? payees : fallback;
}

function uniqueFriendlyGates(gates: string[]) {
  return [...new Set(gates.map(friendlyGateLabel))].filter(Boolean);
}

function neobankMissing(snapshot: ReturnType<typeof createNeobankSnapshot>) {
  return snapshot.readiness.gates.filter((gate) => !gate.ok).map((gate) => gate.id);
}

function payeeForBucket(payees: Payee[], bucketId: BucketId) {
  return payees.find(
    (payee) => payee.status === "approved" && payee.allowedBucketId === bucketId,
  );
}

function protectedBuckets(buckets: BucketBalance[]) {
  return buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .sort((left, right) => left.priority - right.priority);
}

function defaultTransferBucket(buckets: BucketBalance[], payees: Payee[]) {
  return (
    protectedBuckets(buckets).find(
      (bucket) => bucket.availableCents > 0 && payeeForBucket(payees, bucket.id),
    ) ?? protectedBuckets(buckets)[0]
  );
}

function normalizeFrequency(value: unknown): MoneyControlPlanInput["expectedFrequency"] {
  const frequency = cleanText(value, 20).toLowerCase();

  return frequencyValues.has(frequency)
    ? (frequency as MoneyControlPlanInput["expectedFrequency"])
    : "biweekly";
}

export function normalizeMoneyControlPlanInput(
  payload: unknown,
  buckets: BucketBalance[] = createNeobankSnapshot().buckets,
  payees: Payee[] = createNeobankSnapshot().payees,
): NormalizedPlanResult {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const errors: string[] = [];
  const paycheckAmountCents = toCents(record.paycheckAmountCents, 300_000, {
    max: 2_000_000,
    min: 10_000,
  });
  const requestedTransferCents = toCents(record.requestedTransferCents, 25_000, {
    max: 500_000,
    min: 0,
  });
  const planBuckets = normalizePlanBuckets(record.buckets, buckets);
  const planPayees = normalizePlanPayees(record.payees, payees, planBuckets);
  const preferredBucket = cleanBucketId(record.preferredTransferBucketId);
  const bucketIds = new Set(planBuckets.map((bucket) => bucket.id));
  const defaultBucket = defaultTransferBucket(planBuckets, planPayees);
  const preferredTransferBucketId =
    preferredBucket && bucketIds.has(preferredBucket)
      ? preferredBucket
      : defaultBucket?.id ?? null;
  const preferredPayeeId = cleanText(record.preferredPayeeId, 120) || null;

  if (paycheckAmountCents === null) {
    errors.push("paycheckAmountCents must be integer cents from 10000 to 2000000.");
  }

  if (requestedTransferCents === null) {
    errors.push("requestedTransferCents must be integer cents from 0 to 500000.");
  }

  if (errors.length > 0) {
    return {
      errors,
      input: null,
      ok: false,
    };
  }

  return {
    errors: [],
    input: {
      buckets: planBuckets,
      employerName: cleanText(record.employerName, 80) || "Payroll deposit",
      expectedFrequency: normalizeFrequency(record.expectedFrequency),
      payees: planPayees,
      paycheckAmountCents: paycheckAmountCents ?? 300_000,
      preferredPayeeId,
      preferredTransferBucketId,
      requestedTransferCents: requestedTransferCents ?? 25_000,
      ruleName: cleanText(record.ruleName, 80) || "Primary payroll",
    },
    ok: true,
  };
}

function createBucketAllocationPlan(buckets: BucketBalance[], paycheckAmountCents: number) {
  let remaining = paycheckAmountCents;

  const protectedPlan = protectedBuckets(buckets).map((bucket) => {
    const projectedFundingCents = Math.min(bucket.targetCents, Math.max(0, remaining));
    remaining -= projectedFundingCents;

    return {
      availableCents: bucket.availableCents,
      bucketId: bucket.id,
      due: bucket.due,
      name: bucket.name,
      priority: bucket.priority,
      projectedFundingCents,
      protection: bucket.protection,
      shortCents: Math.max(0, bucket.targetCents - projectedFundingCents),
      targetCents: bucket.targetCents,
    };
  });

  return {
    buckets: protectedPlan,
    projectedProtectedCents: protectedPlan.reduce(
      (sum, bucket) => sum + bucket.projectedFundingCents,
      0,
    ),
    projectedSafeToSpendCents: Math.max(0, remaining),
    shortfallCents: protectedPlan.reduce(
      (sum, bucket) => sum + bucket.shortCents,
      0,
    ),
  };
}

function createFundingSchedule(
  allocation: ReturnType<typeof createBucketAllocationPlan>,
) {
  const protectedSchedule = allocation.buckets.map((bucket, index) => {
    const status =
      bucket.projectedFundingCents >= bucket.targetCents
        ? "funded"
        : bucket.projectedFundingCents > 0
          ? "partial"
          : "waiting";

    return {
      amountCents: bucket.projectedFundingCents,
      bucketId: bucket.bucketId,
      due: bucket.due,
      key: `bucket:${bucket.bucketId}`,
      label: bucket.name,
      protection: bucket.protection,
      sequence: index + 1,
      shortCents: bucket.shortCents,
      status,
      targetCents: bucket.targetCents,
      type: "protected_bucket",
    };
  });

  return [
    ...protectedSchedule,
    {
      amountCents: allocation.projectedSafeToSpendCents,
      bucketId: "safe_spending",
      due: "Remainder",
      key: "safe_to_spend",
      label: "Safe to Spend",
      protection: "spendable",
      sequence: protectedSchedule.length + 1,
      shortCents: 0,
      status: "safe_to_spend",
      targetCents: 0,
      type: "safe_to_spend",
    },
  ];
}

function createTransferPlan(input: {
  buckets: BucketBalance[];
  moneyRails: ReturnType<typeof getMoneyRailReadiness>;
  payees: Payee[];
  planInput: MoneyControlPlanInput;
}) {
  const selectedBucket =
    input.buckets.find(
      (bucket) => bucket.id === input.planInput.preferredTransferBucketId,
    ) ?? defaultTransferBucket(input.buckets, input.payees);
  const approvedPayees = selectedBucket
    ? input.payees.filter(
        (payee) =>
          payee.status === "approved" && payee.allowedBucketId === selectedBucket.id,
      )
    : [];
  const selectedPayee =
    approvedPayees.find((payee) => payee.id === input.planInput.preferredPayeeId) ??
    approvedPayees[0] ??
    null;
  const maxTransferCents =
    selectedBucket && selectedPayee
      ? Math.min(selectedBucket.availableCents, selectedPayee.maxCents)
      : 0;
  const requestedTransferCents = Math.min(
    input.planInput.requestedTransferCents,
    maxTransferCents,
  );

  return {
    allowedNow:
      requestedTransferCents > 0 &&
      Boolean(selectedBucket) &&
      Boolean(selectedPayee),
    approvedPayeeCount: approvedPayees.length,
    destinationPayeeId: selectedPayee?.id ?? null,
    destinationPayeeName: selectedPayee?.name ?? null,
    endpoint: "POST /api/app/transfers",
    maxTransferCents,
    providerReady: input.moneyRails.transferReady,
    providerStatus: input.moneyRails.transferReady
      ? "provider_handoff_ready"
      : "intent_validation_only",
    requestedTransferCents,
    sourceBucketId: selectedBucket?.id ?? null,
    sourceBucketName: selectedBucket?.name ?? null,
  };
}

export function createHouseholdMoneyControlPlan(
  payload: unknown = {},
  session?: AppSession,
) {
  const snapshot = createNeobankSnapshot();
  const commercial = getCommercialReadiness();
  const moneyRails = getMoneyRailReadiness();
  const household = householdForSession(snapshot, session);
  const normalized = normalizeMoneyControlPlanInput(
    payload,
    snapshot.buckets,
    snapshot.payees,
  );

  if (!normalized.ok) {
    return {
      errors: normalized.errors,
      service: "payshield-household-control-plan",
    };
  }

  const planInput = normalized.input;
  const planBuckets = planInput.buckets;
  const planPayees = planInput.payees;
  const allocation = createBucketAllocationPlan(
    planBuckets,
    planInput.paycheckAmountCents,
  );
  const fundingSchedule = createFundingSchedule(allocation);
  const liveMoneyGates = neobankMissing(snapshot);
  const bankLinkGates = moneyRails.missing.filter(
    (gate) => gate.includes("PLAID") || gate.includes("TOKEN_VAULT"),
  );
  const detectionGates = moneyRails.missing.filter(
    (gate) =>
      gate.includes("PLAID") ||
      gate.includes("TOKEN_VAULT") ||
      gate.includes("PROVIDER_WEBHOOK"),
  );
  const transferGates = [
    ...moneyRails.missing.filter(
      (gate) =>
        gate.includes("TRANSFER") ||
        gate.includes("transfer") ||
        gate.includes("PAYSHIELD_BAAS"),
    ),
    ...moneyRails.providerAdapterMissing,
    ...liveMoneyGates,
  ];
  const transferPlan = createTransferPlan({
    buckets: planBuckets,
    moneyRails,
    payees: planPayees,
    planInput,
  });
  const operatingSteps = [
    {
      blockers: uniqueFriendlyGates(commercial.missing),
      canRunNow: commercial.paymentCollectionReady,
      endpoint: "POST /api/app/billing/checkout",
      key: "revenue_gate",
      ownerAction:
        "Configure Stripe checkout, webhook signing, and core activation storage.",
      ready: commercial.paidAccessReady,
      status: commercial.paymentCollectionReady
        ? commercial.paidAccessReady
          ? "collecting_and_activating"
          : "collecting_activation_pending"
        : "stripe_setup_needed",
      title: "Revenue gate",
      userAction: `Start ${commercial.priceLabel} household access.`,
    },
    {
      blockers: uniqueFriendlyGates(bankLinkGates),
      canRunNow: moneyRails.bankLinkReady,
      endpoint: "POST /api/app/bank-link/token",
      key: "bank_connection",
      ownerAction:
        "Configure Plaid credentials, signed token-vault handoff, and encrypted token custody.",
      ready: moneyRails.bankLinkReady,
      status: moneyRails.bankLinkReady ? "ready" : "provider_setup_needed",
      title: "Bank connection",
      userAction: "Connect the bank source used for payroll detection.",
    },
    {
      blockers: uniqueFriendlyGates(detectionGates),
      canRunNow: true,
      endpoint: "POST /api/app/paychecks/rules",
      key: "paycheck_detection",
      ownerAction:
        "Turn on Plaid transaction sync and provider webhook signing for automatic detection.",
      ready: moneyRails.paycheckDetectionReady,
      status: moneyRails.paycheckDetectionReady
        ? "automatic"
        : "controlled_rule_ready",
      title: "Paycheck detection",
      userAction: `Save ${planInput.ruleName} for ${planInput.employerName}.`,
    },
    {
      blockers: [],
      canRunNow: true,
      endpoint: "POST /api/app/buckets",
      key: "protected_buckets",
      ownerAction:
        "Confirm bucket targets, priority order, due rules, approved payees, and unlock behavior.",
      ready: true,
      status:
        planBuckets === snapshot.buckets ? "customizable_now" : "workspace_profile",
      title: "Protected buckets",
      userAction: "Protect obligations before Safe to Spend is calculated.",
    },
    {
      blockers: uniqueFriendlyGates(transferGates),
      canRunNow: transferPlan.allowedNow,
      endpoint: "POST /api/app/transfers",
      key: "protected_transfer",
      ownerAction:
        "Configure transfer credentials and live-money gates before provider execution.",
      ready: moneyRails.transferReady,
      status: transferPlan.providerStatus,
      title: "Protected transfer",
      userAction:
        transferPlan.sourceBucketName && transferPlan.destinationPayeeName
          ? `Validate ${transferPlan.sourceBucketName} payment to ${transferPlan.destinationPayeeName}.`
          : "Approve a protected-bucket payee before release.",
    },
    {
      blockers: uniqueFriendlyGates(liveMoneyGates),
      canRunNow: true,
      endpoint: "POST /api/card/authorize",
      key: "card_control",
      ownerAction:
        "Connect a card gateway after provider, ledger, auth, counsel, and runbook gates pass.",
      ready: snapshot.readiness.liveMoneyReady,
      status: snapshot.readiness.liveMoneyReady
        ? "gateway_ready"
        : "ledger_decision_ready",
      title: "Card control",
      userAction: "Check purchases against Safe to Spend and approved billers.",
    },
  ];
  const nextAction =
    operatingSteps.find((step) => !step.canRunNow) ??
    operatingSteps.find((step) => !step.ready) ??
    operatingSteps[0];

  return {
    allocation,
    bankConnection: {
      endpoint: "POST /api/app/bank-link/token",
      plaidEnv: moneyRails.plaidEnv,
      ready: moneyRails.bankLinkReady,
      tokenCustodyReady: moneyRails.tokenVaultStoreReady,
    },
    detectionRule: {
      amountRangeCents: {
        max: null,
        min: Math.max(10_000, Math.round(planInput.paycheckAmountCents * 0.6)),
      },
      employerNamePattern: planInput.employerName,
      endpoint: "POST /api/app/paychecks/rules",
      expectedFrequency: planInput.expectedFrequency,
      ruleName: planInput.ruleName,
      transactionNamePattern: planInput.employerName,
    },
    generatedAt: new Date().toISOString(),
    fundingSchedule,
    household,
    input: planInput,
    monetization: {
      endpoint: "POST /api/app/billing/checkout",
      paidAccessReady: commercial.paidAccessReady,
      paymentCollectionReady: commercial.paymentCollectionReady,
      priceLabel: commercial.priceLabel,
      status: commercial.paidAccessReady
        ? "paid_access_ready"
        : commercial.paymentCollectionReady
          ? "payment_collection_ready"
          : "checkout_setup_needed",
    },
    nextAction,
    operatingSteps,
    proof: {
      auditEndpoint: "/api/app/audit/export",
      healthEndpoint: "/api/health",
      operationsEndpoint: "/api/app/operations",
      planEndpoint: "/api/app/control-plan",
    },
    service: "payshield-household-control-plan",
    source: {
      bucketPersistence:
        planBuckets === snapshot.buckets ? "memory" : "workspace_profile",
      ledger: "control_model",
      payeePersistence:
        planPayees === snapshot.payees ? "memory" : "workspace_profile",
    },
    summary: {
      approvedPayeeCount: planPayees.filter((payee) => payee.status === "approved").length,
      bucketCount: allocation.buckets.length,
      nextActionKey: nextAction.key,
      paycheckAmountCents: planInput.paycheckAmountCents,
      projectedProtectedCents: allocation.projectedProtectedCents,
      projectedSafeToSpendCents: allocation.projectedSafeToSpendCents,
      protectedTargetCents: allocation.buckets.reduce(
        (sum, bucket) => sum + bucket.targetCents,
        0,
      ),
      readyStepCount: operatingSteps.filter((step) => step.canRunNow).length,
      shortfallCents: allocation.shortfallCents,
      totalStepCount: operatingSteps.length,
    },
    transferPlan,
  };
}
