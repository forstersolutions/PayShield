import { getCommercialReadiness } from "../commercial/billing.ts";
import { friendlyGateLabel } from "../readiness-gates.ts";
import { createNeobankSnapshot } from "./demo-state.ts";
import { getMoneyRailReadiness } from "./money-rails.ts";
import type { BucketBalance, BucketId, Payee } from "./types.ts";

export type MoneyControlPlanInput = {
  employerName: string;
  expectedFrequency: "weekly" | "biweekly" | "semimonthly" | "monthly" | "unknown";
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
  const preferredBucket = cleanText(record.preferredTransferBucketId, 80) as BucketId;
  const bucketIds = new Set(buckets.map((bucket) => bucket.id));
  const defaultBucket = defaultTransferBucket(buckets, payees);
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
      employerName: cleanText(record.employerName, 80) || "Payroll deposit",
      expectedFrequency: normalizeFrequency(record.expectedFrequency),
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
  };
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

export function createHouseholdMoneyControlPlan(payload: unknown = {}) {
  const snapshot = createNeobankSnapshot();
  const commercial = getCommercialReadiness();
  const moneyRails = getMoneyRailReadiness();
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
  const allocation = createBucketAllocationPlan(
    snapshot.buckets,
    planInput.paycheckAmountCents,
  );
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
    buckets: snapshot.buckets,
    moneyRails,
    payees: snapshot.payees,
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
      status: "customizable_now",
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
    summary: {
      approvedPayeeCount: snapshot.payees.filter((payee) => payee.status === "approved").length,
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
      totalStepCount: operatingSteps.length,
    },
    transferPlan,
  };
}
