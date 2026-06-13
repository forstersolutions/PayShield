import { GRAYSTON_SUPPORT_EMAIL } from "../brand.ts";
import { getCommercialReadiness } from "../commercial/billing.ts";
import type { AppSession } from "./auth.ts";
import { createNeobankSnapshot } from "./demo-state.ts";
import { getMoneyRailReadiness } from "./money-rails.ts";
import type { NeobankReadiness } from "./types.ts";

function cleanMissing(values: string[] | undefined) {
  return [...new Set(values ?? [])].filter(Boolean);
}

function neobankMissing(readiness: NeobankReadiness) {
  return readiness.gates.filter((gate) => !gate.ok).map((gate) => gate.id);
}

function buildActivationPlan(input: {
  commercial: ReturnType<typeof getCommercialReadiness>;
  moneyRails: ReturnType<typeof getMoneyRailReadiness>;
  neobank: NeobankReadiness;
}) {
  const stages = [
    {
      actionHref: "#money-operations",
      key: "revenue",
      label: "Revenue",
      ownerAction:
        "Configure Stripe checkout, webhook signing, and core activation so paid households unlock automatically.",
      primaryEndpoint: "POST /api/app/billing/checkout",
      ready: input.commercial.paidAccessReady,
      requiredGates: cleanMissing(input.commercial.missing),
      status: input.commercial.paidAccessReady
        ? "ready"
        : input.commercial.checkoutConfigured
          ? "activation_needed"
          : "stripe_needed",
      title: "Charge the household",
      userAction: "Activate paid access",
    },
    {
      actionHref: "#money-operations",
      key: "bank_connection",
      label: "Bank connection",
      ownerAction:
        "Configure Plaid credentials and token-vault handoff so users can connect an external account from the app.",
      primaryEndpoint: "POST /api/app/bank-link/token",
      ready: input.moneyRails.bankLinkReady,
      requiredGates: cleanMissing(
        input.moneyRails.missing.filter(
          (gate) =>
            gate.includes("PLAID") ||
            gate.includes("TOKEN_VAULT") ||
            gate.includes("token vault"),
        ),
      ),
      status: input.moneyRails.bankLinkReady
        ? "ready"
        : input.moneyRails.plaidConfigured
          ? "vault_needed"
          : "plaid_needed",
      title: "Connect banks",
      userAction: "Connect bank",
    },
    {
      actionHref: "#money-operations",
      key: "paycheck_detection",
      label: "Paycheck detection",
      ownerAction:
        "Store detection rules and consume Plaid/provider events so payroll deposits split into buckets automatically.",
      primaryEndpoint: "POST /api/app/paychecks/detect",
      ready: input.moneyRails.paycheckDetectionReady,
      requiredGates: cleanMissing(
        input.moneyRails.missing.filter(
          (gate) =>
            gate.includes("PLAID") ||
            gate.includes("TOKEN_VAULT") ||
            gate.includes("PROVIDER_WEBHOOK"),
        ),
      ),
      status: input.moneyRails.paycheckDetectionReady
        ? "automatic"
        : input.moneyRails.detectionMode === "plaid_transactions_sync"
          ? "provider_event_needed"
          : "manual_event_ready",
      title: "Detect paychecks",
      userAction: "Save rule and run detection",
    },
    {
      actionHref: "#bucket-studio",
      key: "protection_rules",
      label: "Protection rules",
      ownerAction:
        "Use the bucket studio to customize protected categories, priorities, due rules, payees, and unlock behavior.",
      primaryEndpoint: "POST /api/app/buckets",
      ready: true,
      requiredGates: [],
      status: input.neobank.postgresSchemaVerified ? "durable" : "control_model",
      title: "Protect the paycheck",
      userAction: "Save bucket profile",
    },
    {
      actionHref: "#money-operations",
      key: "money_movement",
      label: "Money movement",
      ownerAction:
        "Configure transfer/BaaS credentials plus the live-money gates so approved transfers execute after ledger validation.",
      primaryEndpoint: "POST /api/app/transfers",
      ready: input.moneyRails.transferReady,
      requiredGates: cleanMissing([
        ...input.moneyRails.missing.filter(
          (gate) => gate.includes("TRANSFER") || gate.includes("transfer/BaaS"),
        ),
        ...neobankMissing(input.neobank),
      ]),
      status: input.moneyRails.transferReady
        ? "ready"
        : input.moneyRails.transferConfigured
          ? "live_gates_needed"
          : "intent_validation_active",
      title: "Move protected funds",
      userAction: "Create transfer intent",
    },
    {
      actionHref: "#card-authorization",
      key: "card_control",
      label: "Card control",
      ownerAction:
        "Connect a provider gateway so authorization decisions run against Safe to Spend and approved biller buckets.",
      primaryEndpoint: "POST /api/card/authorize",
      ready: input.neobank.liveMoneyReady,
      requiredGates: neobankMissing(input.neobank),
      status: input.neobank.liveMoneyReady ? "gateway_ready" : "ledger_decisions_active",
      title: "Approve only safe spend",
      userAction: "Check card swipe",
    },
  ];
  const nextStage = stages.find((stage) => !stage.ready) ?? stages[0];

  return {
    generatedAt: new Date().toISOString(),
    liveMoneyReady: input.neobank.liveMoneyReady,
    nextStageKey: nextStage.key,
    readyCount: stages.filter((stage) => stage.ready).length,
    revenueReady: input.commercial.paidAccessReady,
    stages,
    totalStages: stages.length,
  };
}

export function createHouseholdOperationsPacket(session?: AppSession) {
  const snapshot = createNeobankSnapshot();
  const commercial = getCommercialReadiness();
  const moneyRails = getMoneyRailReadiness();
  const safeToSpendCents =
    snapshot.buckets.find((bucket) => bucket.id === "safe_spending")
      ?.availableCents ?? 0;
  const protectedCents = snapshot.buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.availableCents, 0);
  const operations = {
    bankConnections: [],
    billingEvents: [],
    billPayments: [],
    cardDecisions: [],
    checkoutIntents: [],
    directDepositSetups: [],
    journalEntries: snapshot.ledgerEntries,
    moneyRailEvents: [],
    paycheckDetectionRules: [],
    paycheckDetections: [],
    reconciliationExceptions: [],
    transferIntents: [],
    unlockRequests: [],
  };
  const timeline = snapshot.ledgerEntries
    .slice(-6)
    .reverse()
    .map((entry) => ({
      amountCents:
        typeof entry.metadata?.amountCents === "number"
          ? entry.metadata.amountCents
          : null,
      at: entry.createdAt,
      detail: entry.memo,
      id: entry.id,
      label: entry.type.replace(/_/g, " "),
      rail: "ledger",
      status: "posted",
    }));

  return {
    balances: {
      protectedCents,
      safeToSpendCents,
      totalCents: safeToSpendCents + protectedCents,
    },
    buckets: snapshot.buckets,
    card: snapshot.card,
    controls: {
      bucketPersistence: {
        persisted: false,
        persistence: "memory",
        persistenceReason:
          "Bucket rules are running from the Vercel control model until the dedicated core is configured.",
      },
      payeePersistence: {
        persisted: false,
        persistence: "memory",
        persistenceReason:
          "Payees are running from the Vercel control model until the dedicated core is configured.",
      },
      payees: snapshot.payees,
    },
    directDeposit: snapshot.directDeposit,
    generatedAt: new Date().toISOString(),
    household: {
      householdId: snapshot.householdId,
      kycStatus: snapshot.user.kycStatus,
      profileAccess: snapshot.user.profileAccess,
      userId: session?.userId ?? snapshot.user.id,
    },
    commercialAccess: {
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      mode: commercial.mode,
      priceLabel: commercial.priceLabel,
      providerCustomerId: null,
      providerName: "stripe",
      providerSubscriptionId: null,
      readyForCheckout: commercial.checkoutConfigured,
      state: commercial.checkoutConfigured ? "ready" : "needs_setup",
      subscriptionStatus: null,
    },
    activationPlan: buildActivationPlan({
      commercial,
      moneyRails,
      neobank: snapshot.readiness,
    }),
    moneyRails,
    operations,
    operationalAudit: {
      audit: null,
      auditFound: false,
      persisted: false,
      persistence: "memory",
      persistenceReason:
        "Dedicated core storage is not configured for this request.",
    },
    readiness: snapshot.readiness,
    service: "payshield-household-operations",
    statusCards: [
      {
        key: "paid_access",
        label: "Paid access",
        state: commercial.checkoutConfigured ? "ready" : "needs_setup",
      },
      {
        key: "bank_connection",
        label: "Bank connection",
        state: moneyRails.bankLinkReady ? "ready" : "needs_setup",
      },
      {
        key: "direct_deposit",
        label: "Paycheck routing",
        state: snapshot.readiness.liveMoneyReady ? "ready" : "needs_setup",
      },
      {
        key: "paycheck_detection",
        label: "Paycheck detection",
        state: moneyRails.paycheckDetectionReady ? "ready" : "needs_setup",
      },
      {
        key: "protected_transfer",
        label: "Protected transfer",
        state: moneyRails.transferReady ? "ready" : "needs_setup",
      },
      {
        key: "reconciliation",
        label: "Exception queue",
        state: "clear",
      },
    ],
    support: {
      contact: GRAYSTON_SUPPORT_EMAIL,
      operator: "Grayston Technologies",
    },
    timeline,
  };
}

export function createHouseholdAuditPacket(session?: AppSession) {
  const packet = createHouseholdOperationsPacket(session);

  return {
    balances: packet.balances,
    buckets: packet.buckets,
    card: packet.card,
    controls: packet.controls,
    directDeposit: packet.directDeposit,
    exportVersion: "payshield-household-audit-v1",
    generatedAt: packet.generatedAt,
    household: packet.household,
    activationPlan: packet.activationPlan,
    commercialAccess: packet.commercialAccess,
    ledger: {
      entries: packet.operations.journalEntries,
      source: "core_control_model",
    },
    moneyRails: packet.moneyRails,
    operations: packet.operations,
    readiness: packet.readiness,
    service: "payshield-audit-export",
    statusCards: packet.statusCards,
    support: packet.support,
    timeline: packet.timeline,
  };
}
