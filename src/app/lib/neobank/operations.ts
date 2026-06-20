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

function vercelEnvAddCommand(name: string) {
  return `npx vercel env add ${name} production`;
}

function buildSetupGroup(input: {
  checks: string[];
  endpoint: string;
  env: string[];
  key: string;
  productAction: string;
  ready: boolean;
  title: string;
  unlocks: string;
}) {
  return {
    ...input,
    setupCommands: input.env.map(vercelEnvAddCommand),
  };
}

function buildActivationSetupGroups(input: {
  commercial: ReturnType<typeof getCommercialReadiness>;
  moneyRails: ReturnType<typeof getMoneyRailReadiness>;
  neobank: NeobankReadiness;
  siteUrl: string;
}) {
  return [
    buildSetupGroup({
      checks: [
        `curl -fsS ${input.siteUrl}/api/health`,
        `curl -fsS ${input.siteUrl}/api/launch/activation`,
      ],
      endpoint: "POST /api/app/billing/checkout",
      env: [
        "STRIPE_SECRET_KEY",
        "PAYSHIELD_COMMERCIAL_PRICE_ID",
        "PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
        "STRIPE_WEBHOOK_SECRET",
        "PAYSHIELD_CORE_API_URL",
        "PAYSHIELD_CORE_SERVICE_TOKEN",
      ],
      key: "revenue",
      productAction:
        "Collect paid household access before bank link and money controls unlock.",
      ready: input.commercial.paidAccessReady,
      title: "Revenue switch",
      unlocks: "Checkout, billing webhook, and commercial access state.",
    }),
    buildSetupGroup({
      checks: [
        `curl -fsS ${input.siteUrl}/api/launch/activation`,
        `curl -fsS ${input.siteUrl}/api/app/me`,
      ],
      endpoint: "GET /api/app/me",
      env: [
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "CLERK_SECRET_KEY",
        "PAYSHIELD_REVIEW_APP_ACCESS_TOKEN",
      ],
      key: "access",
      productAction:
        "Map every signed-in person to one PayShield household before private records open.",
      ready: input.neobank.clerkConfigured,
      title: "Household access",
      unlocks: "Authenticated app entry, household scope, and private support records.",
    }),
    buildSetupGroup({
      checks: [
        `curl -fsS ${input.siteUrl}/api/launch/activation`,
        "npm run test -- tests/neobank-api.test.mts",
      ],
      endpoint: "POST /api/app/bank-link/token",
      env: [
        "PLAID_ENV",
        "PLAID_CLIENT_ID",
        "PLAID_SECRET",
        "PLAID_PRODUCTS",
        "PLAID_COUNTRY_CODES",
        "PLAID_WEBHOOK_URL",
        "PAYSHIELD_TOKEN_VAULT_KEY_ID",
        "PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL",
        "PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET",
        "PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY",
      ],
      key: "bank_connection",
      productAction:
        "Let households connect an external funding source and vault the provider token outside the browser.",
      ready: input.moneyRails.bankLinkReady,
      title: "Bank connection",
      unlocks: "Plaid Link, public-token exchange, masked account records, and token custody.",
    }),
    buildSetupGroup({
      checks: [
        `curl -fsS ${input.siteUrl}/api/launch/activation`,
        'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:verify',
      ],
      endpoint:
        "POST /api/app/paychecks/sync + POST /api/app/paychecks/detect",
      env: [
        "PLAID_CLIENT_ID",
        "PLAID_SECRET",
        "PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY",
        "PAYSHIELD_PROVIDER_WEBHOOK_SECRET",
        "PAYSHIELD_LEDGER_DATABASE_URL",
        "PAYSHIELD_LEDGER_SCHEMA_VERIFIED",
        "PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION",
        "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE",
      ],
      key: "paycheck_detection",
      productAction:
        "Turn provider activity into detected deposits, balanced bucket splits, and Safe to Spend updates.",
      ready:
        input.moneyRails.paycheckDetectionReady &&
        input.neobank.postgresSchemaVerified,
      title: "Detection and ledger",
      unlocks:
        "Plaid transaction sync, signed provider events, idempotent payroll detection, and durable journal evidence.",
    }),
    buildSetupGroup({
      checks: [
        `curl -fsS ${input.siteUrl}/api/launch/activation`,
        "npm run test -- tests/neobank-ledger.test.mts",
      ],
      endpoint: "POST /api/app/transfers",
      env: [
        "PAYSHIELD_TRANSFER_ENABLED",
        "PAYSHIELD_BAAS_PROVIDER",
        "PAYSHIELD_BAAS_ADAPTER",
        "PAYSHIELD_BAAS_API_BASE_URL",
        "PAYSHIELD_BAAS_API_KEY",
      ],
      key: "money_movement",
      productAction:
        "Validate source bucket, approved destination, amount, and provider handoff before funds move.",
      ready: input.moneyRails.transferReady,
      title: "Movement rail",
      unlocks: "Protected transfers, provider execution records, and reconciliation matching.",
    }),
    buildSetupGroup({
      checks: [
        `curl -fsS ${input.siteUrl}/api/health`,
        "npm run verify",
        `npm run market:status -- ${input.siteUrl} --expect-site-url ${input.siteUrl}`,
      ],
      endpoint: "POST /api/card/authorize",
      env: [
        "PAYSHIELD_BAAS_CONTRACT_APPROVED",
        "PAYSHIELD_BAAS_ADAPTER",
        "PAYSHIELD_BAAS_API_BASE_URL",
        "PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED",
        "PAYSHIELD_REGULATED_COUNSEL_SIGNOFF",
        "PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED",
        "PAYSHIELD_LIVE_MONEY_ENABLED",
        "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE",
      ],
      key: "live_control",
      productAction:
        "Open card authorization and live-money decisions only after every regulated gate is recorded.",
      ready: input.neobank.liveMoneyReady,
      title: "Live control gate",
      unlocks: "Safe-to-spend authorization, approved biller exceptions, and release controls.",
    }),
  ];
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
        "Point PAYSHIELD_CORE_API_URL at the always-on core and set PAYSHIELD_CORE_SERVICE_TOKEN so paid access persists through authenticated core writes.",
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
        "Configure Plaid credentials, signed token-vault handoff, and encrypted token custody so users can connect an external account from the app.",
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
        "Set PAYSHIELD_TOKEN_VAULT_KEY_ID, PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET, and PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY; use PAYSHIELD_CORE_API_URL as the default vault receiver or override with PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL.",
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
        "Saved paycheck rule, Plaid transaction sync event, balanced ledger entry, and updated Safe to Spend.",
      key: "paycheck_detection",
      label: "Paycheck detection",
      ownerAction:
        "Store detection rules and sync Plaid/provider events so payroll deposits split into buckets automatically.",
      primaryEndpoint: "POST /api/app/paychecks/sync",
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
        : input.moneyRails.bankLinkReady
          ? "provider_event_needed"
          : "setup_needed",
      setupChecklist: [
        "Save employer, amount, frequency, and provider account matching rules.",
        "Set Plaid credentials, token-vault encryption, durable Postgres, and provider webhook signing.",
        "Verify duplicate sync/provider events are idempotent and exceptions enter the queue.",
      ],
      title: "Detect paychecks",
      userAction: "Save rule and sync bank activity",
      verification:
        "Run /api/app/paychecks/sync, /api/app/paychecks/detect, or a signed provider webhook and confirm protected buckets fund before Safe to Spend.",
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

function buildRevenueAndRails(input: {
  commercial: ReturnType<typeof getCommercialReadiness>;
  moneyRails: ReturnType<typeof getMoneyRailReadiness>;
  neobank: NeobankReadiness;
  protectedCents: number;
  safeToSpendCents: number;
}) {
  const liveMoneyMissing = neobankMissing(input.neobank);
  const priceLabel = input.commercial.priceLabel || "$19/month";

  return {
    operatingSequence: [
      "Collect paid household access",
      "Bind the household identity",
      "Connect the external bank source",
      "Sync linked-bank activity",
      "Route and detect paycheck deposits",
      "Split protected buckets before Safe to Spend",
      "Release funds only through approved transfers, billers, unlocks, or card decisions",
    ],
    rails: [
      {
        blockers: cleanMissing(input.commercial.missing),
        canRunNow: input.commercial.paidAccessReady,
        endpoint: "POST /api/app/billing/checkout",
        key: "revenue",
        label: "Get paid",
        ownerAction:
          "Configure Stripe Checkout, webhook signing, and core persistence.",
        provider: "Stripe",
        state: input.commercial.paidAccessReady
          ? "active"
          : input.commercial.checkoutConfigured
            ? "activation_needed"
            : "stripe_needed",
        userAction: `Subscribe at ${priceLabel}`,
        unlocks: "Commercial access, billing status, and paid money workflows.",
      },
      {
        blockers: cleanMissing([
          ...input.moneyRails.missing.filter(
            (gate) =>
              gate.includes("PLAID") ||
              gate.includes("TOKEN_VAULT") ||
              gate.includes("token vault"),
          ),
          ...liveMoneyMissing.filter((gate) =>
            ["postgres_ledger", "dedicated_backend", "core_service_auth"].includes(
              gate,
            ),
          ),
        ]),
        canRunNow: input.moneyRails.transactionSyncReady,
        endpoint: "POST /api/app/paychecks/sync",
        key: "transaction_sync",
        label: "Sync activity",
        ownerAction:
          "Run Plaid Transactions sync from the core so payroll-like deposits enter the bucket ledger.",
        provider: "Plaid Transactions",
        state: input.moneyRails.transactionSyncReady
          ? "ready"
          : input.moneyRails.bankLinkReady
            ? "core_storage_needed"
            : "bank_link_needed",
        userAction: "Sync linked-bank activity",
        unlocks: "Synced transactions, paycheck detections, exceptions, and cursor evidence.",
      },
      {
        blockers: cleanMissing(
          input.moneyRails.missing.filter(
            (gate) =>
              gate.includes("PLAID") ||
              gate.includes("TOKEN_VAULT") ||
              gate.includes("token vault"),
          ),
        ),
        canRunNow: input.moneyRails.bankLinkReady,
        endpoint: "POST /api/app/bank-link/token",
        key: "bank_connection",
        label: "Connect banks",
        ownerAction:
          "Set Plaid credentials, signed token-vault handoff, and encrypted token custody.",
        provider: "Plaid Link",
        state: input.moneyRails.bankLinkReady
          ? "ready"
          : input.moneyRails.plaidConfigured
            ? "vault_needed"
            : "plaid_needed",
        userAction: "Launch bank connection",
        unlocks: "Masked funding source, token custody, and provider account mapping.",
      },
      {
        blockers: cleanMissing(
          input.moneyRails.missing.filter(
            (gate) =>
              gate.includes("PLAID") ||
              gate.includes("TOKEN_VAULT") ||
              gate.includes("PROVIDER_WEBHOOK"),
          ),
        ),
        canRunNow: input.moneyRails.paycheckDetectionReady,
        endpoint: "POST /api/app/paychecks/sync",
        key: "paycheck_detection",
        label: "Detect income",
        ownerAction:
          "Configure Plaid/token-vault credentials, sync cursor storage, signed provider events, and the durable core before paycheck detection runs from the app.",
        provider:
          input.moneyRails.detectionMode === "plaid_transactions_sync"
            ? "Plaid Transactions"
            : "Provider webhook",
        state: input.moneyRails.paycheckDetectionReady
          ? "automatic"
          : input.moneyRails.bankLinkReady
            ? "provider_event_needed"
            : "setup_needed",
        userAction: "Save payroll rule and sync income",
        unlocks: "Priority bucket funding and a recalculated Safe to Spend balance.",
      },
      {
        blockers: cleanMissing([
          ...input.moneyRails.missing.filter(
            (gate) => gate.includes("TRANSFER") || gate.includes("transfer/BaaS"),
          ),
          ...liveMoneyMissing,
        ]),
        canRunNow: input.moneyRails.transferReady,
        endpoint: "POST /api/app/transfers",
        key: "money_movement",
        label: "Move funds",
        ownerAction:
          "Set transfer/BaaS credentials, provider approvals, durable ledger, and operating gates.",
        provider: "BaaS or transfer partner",
        state: input.moneyRails.transferReady
          ? "ready"
          : input.moneyRails.transferConfigured
            ? "live_gates_needed"
            : "intent_validation_active",
        userAction: "Create protected transfer intent",
        unlocks: "Provider handoff only after bucket balance and payee validation pass.",
      },
      {
        blockers: cleanMissing(liveMoneyMissing),
        canRunNow: input.neobank.liveMoneyReady,
        endpoint: "POST /api/card/authorize",
        key: "card_control",
        label: "Control spend",
        ownerAction:
          "Connect the card authorization gateway after provider, counsel, ledger, auth, and runbook gates pass.",
        provider: "Card gateway",
        state: input.neobank.liveMoneyReady
          ? "gateway_ready"
          : "ledger_decisions_active",
        userAction: "Check swipe decision",
        unlocks: "Safe-to-spend approvals, protected-fund declines, and biller exceptions.",
      },
    ],
    summary: {
      bankLinkReady: input.moneyRails.bankLinkReady,
      detectionMode: input.moneyRails.detectionMode,
      liveMoneyReady: input.neobank.liveMoneyReady,
      priceLabel,
      protectedCents: input.protectedCents,
      revenueReady: input.commercial.paidAccessReady,
      safeToSpendCents: input.safeToSpendCents,
      transferReady: input.moneyRails.transferReady,
    },
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
    revenueAndRails: buildRevenueAndRails({
      commercial,
      moneyRails,
      neobank: snapshot.readiness,
      protectedCents,
      safeToSpendCents,
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
        key: "transaction_sync",
        label: "Bank sync",
        state:
          moneyRails.transactionSyncReady ? "ready" : "needs_setup",
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
  const setupGroups = buildActivationSetupGroups({
    commercial: getCommercialReadiness(),
    moneyRails: packet.moneyRails,
    neobank: packet.readiness,
    siteUrl,
  });

  return {
    activationPlan: packet.activationPlan,
    currentState: {
      commercialAccess: packet.commercialAccess,
      moneyRails: packet.moneyRails,
      readiness: packet.readiness,
      revenueAndRails: packet.revenueAndRails,
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
      activationEndpoint: "/api/launch/activation",
      appActivationEndpoint: "/api/app/activation",
      auditEndpoint: "/api/app/audit/export",
      healthEndpoint: "/api/health",
      operationsEndpoint: "/api/app/operations",
      remainingGates,
      setupGroups,
      siteUrl,
      authenticatedSmokeCommands: [
        `curl -fsS ${siteUrl}/api/app/activation`,
        `curl -fsS ${siteUrl}/api/app/operations`,
        `curl -fsS ${siteUrl}/api/app/audit/export`,
      ],
      smokeCommands: [
        `curl -fsS ${siteUrl}/api/health`,
        `curl -fsS ${siteUrl}/api/launch/activation`,
        "npm run vercel:env:audit -- --profile commercial",
        `npm run market:status -- ${siteUrl} --expect-site-url ${siteUrl}`,
        'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:verify',
      ],
    },
    service: "payshield-activation-console",
    support: packet.support,
    revenueAndRails: packet.revenueAndRails,
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
    revenueAndRails: packet.revenueAndRails,
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
