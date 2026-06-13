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
  const priceLabel = input.commercial.priceLabel || "$19/month";
  const stages = [
    {
      actionHref: "#money-operations",
      businessImpact:
        `Collect ${priceLabel} before the household can use bank link, paycheck detection, protected transfers, or card controls.`,
      evidence:
        "Stripe checkout intent, verified webhook event, and active commercial access record.",
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
      setupChecklist: [
        "Set STRIPE_SECRET_KEY plus PAYSHIELD_COMMERCIAL_PRICE_ID or a live payment link.",
        "Set STRIPE_WEBHOOK_SECRET for /api/app/billing/webhook.",
        "Point PAYSHIELD_CORE_API_URL at the always-on core so paid access persists.",
      ],
      title: "Charge the household",
      userAction: "Activate paid access",
      verification:
        "Create checkout, complete a Stripe test/live event, then confirm commercialAccess.state is active.",
    },
    {
      actionHref: "#money-operations",
      businessImpact:
        "Turn a paying household into a connected funding source with token custody outside the browser.",
      evidence:
        "Plaid Link token, public-token exchange, masked account metadata, and token vault reference.",
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
      setupChecklist: [
        "Set PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, and PLAID_PRODUCTS.",
        "Set PAYSHIELD_TOKEN_VAULT_KEY_ID, PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL, and PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET.",
        "Verify /api/app/bank-link/exchange records the masked account and vault reference.",
      ],
      title: "Connect banks",
      userAction: "Connect bank",
      verification:
        "Open Plaid Link, exchange the public token, then confirm bankConnections contains the linked source.",
    },
    {
      actionHref: "#money-operations",
      businessImpact:
        "Convert connected account activity into automatic payroll detection and bucket funding.",
      evidence:
        "Saved paycheck rule, signed provider event, balanced ledger entry, and updated Safe to Spend.",
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
      setupChecklist: [
        "Save employer, amount, frequency, and provider account matching rules.",
        "Set PAYSHIELD_PROVIDER_WEBHOOK_SECRET for signed provider events.",
        "Verify duplicate provider events are idempotent and exceptions enter the queue.",
      ],
      title: "Detect paychecks",
      userAction: "Save rule and run detection",
      verification:
        "Run /api/app/paychecks/detect or send a signed provider webhook and confirm protected buckets fund before Safe to Spend.",
    },
    {
      actionHref: "#bucket-studio",
      businessImpact:
        "Give households configurable protected categories, priorities, payees, and unlock rules before spend happens.",
      evidence:
        "Bucket profile, payee list, target amounts, due rules, and immutable ledger journal.",
      key: "protection_rules",
      label: "Protection rules",
      ownerAction:
        "Use the bucket studio to customize protected categories, priorities, due rules, payees, and unlock behavior.",
      primaryEndpoint: "POST /api/app/buckets",
      ready: true,
      requiredGates: [],
      status: input.neobank.postgresSchemaVerified ? "durable" : "control_model",
      setupChecklist: [
        "Customize protected buckets, targets, priorities, and due cadence.",
        "Assign approved payees and bucket-only bill routes.",
        "Verify journal entries stay balanced and safe-spend excludes protected funds.",
      ],
      title: "Protect the paycheck",
      userAction: "Save bucket profile",
      verification:
        "Save the bucket profile, run a paycheck split, then export the audit packet.",
    },
    {
      actionHref: "#money-operations",
      businessImpact:
        "Release protected money only after PayShield validates the bucket balance and provider handoff state.",
      evidence:
        "Transfer intent, source bucket validation, destination payee, provider status, and audit record.",
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
      setupChecklist: [
        "Set PAYSHIELD_TRANSFER_ENABLED plus transfer or BaaS credentials.",
        "Keep PAYSHIELD_LIVE_MONEY_ENABLED off until provider, ledger, auth, counsel, and runbook gates pass.",
        "Verify provider handoff records match settlement and exception queues.",
      ],
      title: "Move protected funds",
      userAction: "Create transfer intent",
      verification:
        "Create a transfer intent, confirm it cannot exceed the bucket balance, then confirm provider execution only opens when live gates pass.",
    },
    {
      actionHref: "#card-authorization",
      businessImpact:
        "Approve ordinary spending only from Safe to Spend while approved billers can draw from assigned buckets.",
      evidence:
        "Authorization request, approved amount, bucket decision, denial reason, and ledger record.",
      key: "card_control",
      label: "Card control",
      ownerAction:
        "Connect a provider gateway so authorization decisions run against Safe to Spend and approved biller buckets.",
      primaryEndpoint: "POST /api/card/authorize",
      ready: input.neobank.liveMoneyReady,
      requiredGates: neobankMissing(input.neobank),
      status: input.neobank.liveMoneyReady ? "gateway_ready" : "ledger_decisions_active",
      setupChecklist: [
        "Connect a provider authorization gateway to POST /api/card/authorize.",
        "Map merchant, MCC, payee, and partial-approval metadata into the ledger decision.",
        "Verify overreach declines and approved billers cannot drain unrelated buckets.",
      ],
      title: "Approve only safe spend",
      userAction: "Check card swipe",
      verification:
        "Send safe-spend, protected-overreach, and approved-biller authorization cases and confirm decisions match the ledger.",
    },
  ];
  const nextStage = stages.find((stage) => !stage.ready) ?? stages[0];

  return {
    businessModel: {
      billingProvider: "Stripe",
      priceLabel,
      revenuePath:
        "Checkout -> webhook -> commercial access -> bank link -> paycheck controls.",
      supportContact: GRAYSTON_SUPPORT_EMAIL,
    },
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

function activationPacketFromOperations(
  packet: ReturnType<typeof createHouseholdOperationsPacket>,
) {
  const remainingGates = [
    ...new Set(
      packet.activationPlan.stages.flatMap((stage) => stage.requiredGates),
    ),
  ];
  const nextStage =
    packet.activationPlan.stages.find(
      (stage) => stage.key === packet.activationPlan.nextStageKey,
    ) ?? packet.activationPlan.stages[0];
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://payshield-lime.vercel.app";

  return {
    activationPlan: packet.activationPlan,
    currentState: {
      commercialAccess: packet.commercialAccess,
      moneyRails: packet.moneyRails,
      readiness: packet.readiness,
      statusCards: packet.statusCards,
    },
    generatedAt: packet.generatedAt,
    household: packet.household,
    nextAction: {
      actionHref: nextStage.actionHref,
      ownerAction: nextStage.ownerAction,
      primaryEndpoint: nextStage.primaryEndpoint,
      requiredGates: nextStage.requiredGates,
      title: nextStage.title,
      userAction: nextStage.userAction,
      verification: nextStage.verification,
    },
    operatorRunbook: {
      activationEndpoint: "/api/app/activation",
      auditEndpoint: "/api/app/audit/export",
      healthEndpoint: "/api/health",
      operationsEndpoint: "/api/app/operations",
      remainingGates,
      siteUrl,
      smokeCommands: [
        `curl -fsS ${siteUrl}/api/health`,
        `curl -fsS ${siteUrl}/api/app/activation`,
        `npm run market:status -- ${siteUrl} --expect-site-url ${siteUrl}`,
        'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:verify',
      ],
    },
    service: "payshield-activation-console",
    support: packet.support,
  };
}

export function createHouseholdActivationPacket(session?: AppSession) {
  return activationPacketFromOperations(createHouseholdOperationsPacket(session));
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
