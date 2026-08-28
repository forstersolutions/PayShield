import { GRAYSTON_SUPPORT_EMAIL } from "../brand.ts";
import { getCommercialReadiness } from "../commercial/billing.ts";
import type { AppSession } from "./auth.ts";
import { createNeobankSnapshot } from "./demo-state.ts";
import { getMoneyRailReadiness } from "./money-rails.ts";
import { householdForSession } from "./session-household.ts";
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
        "PAYSHIELD_CORE_RUNTIME",
        "PAYSHIELD_LEDGER_DATABASE_URL",
        "PAYSHIELD_LEDGER_SCHEMA_VERIFIED",
        "PAYSHIELD_SUPABASE_SECURITY_VERIFIED",
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
        `npm run smoke:deploy -- ${input.siteUrl}`,
        `npm run production:routes -- ${input.siteUrl}`,
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
        "Configure Stripe checkout, webhook signing, and durable membership activation so paid households unlock automatically.",
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
        "Configure the Vercel money-control runtime and verified Supabase ledger so billing events activate household access durably.",
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
        "Set PAYSHIELD_TOKEN_VAULT_KEY_ID and PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY for encrypted server-side token custody.",
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

function buildOperatingCockpit(input: {
  activationPlan: ReturnType<typeof buildActivationPlan>;
  commercial: ReturnType<typeof getCommercialReadiness>;
  moneyRails: ReturnType<typeof getMoneyRailReadiness>;
  neobank: NeobankReadiness;
  protectedCents: number;
  revenueAndRails: ReturnType<typeof buildRevenueAndRails>;
  safeToSpendCents: number;
}) {
  const railsByKey = new Map(
    input.revenueAndRails.rails.map((rail) => [rail.key, rail]),
  );
  const stageByKey = new Map(
    input.activationPlan.stages.map((stage) => [stage.key, stage]),
  );
  const moneyMovementStage = stageByKey.get("money_movement");
  const cardControlStage = stageByKey.get("card_control");
  const transactionRail = railsByKey.get("transaction_sync");
  const priceLabel = input.commercial.priceLabel || "$19/month";
  const lanes = [
    {
      blockers: cleanMissing(input.commercial.missing),
      canRunNow: input.commercial.checkoutConfigured,
      key: "revenue",
      label: "Charge household",
      ownerAction:
        "Configure Stripe checkout, webhook signing, and durable membership activation.",
      primaryEndpoint: "POST /api/app/billing/checkout",
      ready: input.commercial.paidAccessReady,
      state: input.commercial.paidAccessReady
        ? "paid_access_active"
        : input.commercial.checkoutConfigured
          ? "checkout_available"
          : "stripe_setup_required",
      userAction: `Subscribe at ${priceLabel}`,
      value: priceLabel,
    },
    {
      blockers: cleanMissing(railsByKey.get("bank_connection")?.blockers),
      canRunNow: input.moneyRails.bankLinkReady,
      key: "bank_connection",
      label: "Connect bank",
      ownerAction:
        "Open Plaid Link and vault the provider token outside the browser.",
      primaryEndpoint: "POST /api/app/bank-link/token",
      ready: input.moneyRails.bankLinkReady,
      state:
        railsByKey.get("bank_connection")?.state ??
        (input.moneyRails.bankLinkReady ? "ready" : "setup_needed"),
      userAction: "Connect external funding source",
      value: input.moneyRails.plaidEnv || "plaid",
    },
    {
      blockers: cleanMissing(transactionRail?.blockers),
      canRunNow: input.moneyRails.transactionSyncReady,
      key: "transaction_sync",
      label: "Sync activity",
      ownerAction:
        "Use linked-bank transaction sync to find payroll-like deposits.",
      primaryEndpoint: "POST /api/app/paychecks/sync",
      ready: input.moneyRails.transactionSyncReady,
      state:
        transactionRail?.state ??
        (input.moneyRails.transactionSyncReady ? "ready" : "setup_needed"),
      userAction: "Sync linked-bank activity",
      value: input.moneyRails.detectionMode,
    },
    {
      blockers: cleanMissing(
        stageByKey.get("paycheck_detection")?.requiredGates,
      ),
      canRunNow:
        input.moneyRails.paycheckDetectionReady ||
        input.moneyRails.transactionSyncReady,
      key: "paycheck_detection",
      label: "Detect paycheck",
      ownerAction:
        "Turn payroll deposits into balanced protected-bucket journal entries.",
      primaryEndpoint: "POST /api/app/paychecks/detect",
      ready: input.moneyRails.paycheckDetectionReady,
      state:
        stageByKey.get("paycheck_detection")?.status ?? "setup_needed",
      userAction: "Run paycheck detection",
      value: `${Math.round(
        (input.protectedCents /
          Math.max(1, input.protectedCents + input.safeToSpendCents)) *
          100,
      )}% protected`,
    },
    {
      blockers: [],
      canRunNow: true,
      key: "protection_rules",
      label: "Protect funds",
      ownerAction:
        "Customize buckets, payees, due cadence, priorities, and unlock rules.",
      primaryEndpoint: "POST /api/app/buckets",
      ready: true,
      state: input.neobank.postgresSchemaVerified ? "durable" : "control_model",
      userAction: "Save bucket profile",
      value: `${input.protectedCents} protected cents`,
    },
    {
      blockers: cleanMissing(moneyMovementStage?.requiredGates),
      canRunNow: true,
      key: "money_movement",
      label: "Move protected funds",
      ownerAction:
        "Validate bucket balance, payee approval, and provider handoff before release.",
      primaryEndpoint: "POST /api/app/transfers",
      ready: input.moneyRails.transferReady,
      state: moneyMovementStage?.status ?? "intent_validation_active",
      userAction: "Create transfer intent",
      value: input.moneyRails.transferReady
        ? "provider ready"
        : "intent validation",
    },
    {
      blockers: cleanMissing(cardControlStage?.requiredGates),
      canRunNow: true,
      key: "card_control",
      label: "Control spending",
      ownerAction:
        "Approve only Safe to Spend and configured biller exceptions.",
      primaryEndpoint: "POST /api/card/authorize",
      ready: input.neobank.liveMoneyReady,
      state: cardControlStage?.status ?? "ledger_decisions_active",
      userAction: "Check card swipe",
      value: `${input.safeToSpendCents} safe cents`,
    },
  ];
  const nextLane =
    lanes.find((lane) => !lane.ready) ?? lanes.find((lane) => lane.canRunNow) ?? lanes[0];

  return {
    blockerCount: lanes.reduce(
      (total, lane) => total + lane.blockers.length,
      0,
    ),
    headline: "Charge -> connect -> detect -> protect -> move",
    lanes,
    mode: input.neobank.liveMoneyReady ? "live_money" : "credential_gated",
    moneySummary: {
      priceLabel,
      protectedCents: input.protectedCents,
      safeToSpendCents: input.safeToSpendCents,
      totalCents: input.protectedCents + input.safeToSpendCents,
    },
    nextAction: {
      blockers: nextLane.blockers,
      canRunNow: nextLane.canRunNow,
      key: nextLane.key,
      label: nextLane.label,
      ownerAction: nextLane.ownerAction,
      primaryEndpoint: nextLane.primaryEndpoint,
      state: nextLane.state,
      userAction: nextLane.userAction,
    },
    proof: {
      activationEndpoint: "/api/app/activation",
      auditEndpoint: "/api/app/audit/export",
      operationsEndpoint: "/api/app/operations",
      supportContact: GRAYSTON_SUPPORT_EMAIL,
    },
    readyLaneCount: lanes.filter((lane) => lane.ready).length,
    service: "payshield-operating-cockpit",
    totalLaneCount: lanes.length,
  };
}

export function buildCommercialOperatingState(input: {
  commercial: ReturnType<typeof getCommercialReadiness>;
  moneyRails: ReturnType<typeof getMoneyRailReadiness>;
  neobank: NeobankReadiness;
  protectedCents: number;
  safeToSpendCents: number;
}) {
  const liveMoneyMissing = neobankMissing(input.neobank);
  const revenueBlockers = cleanMissing(input.commercial.missing);
  const bankBlockers = cleanMissing(
    input.moneyRails.missing.filter(
      (gate) =>
        gate.includes("PLAID") ||
        gate.includes("TOKEN_VAULT") ||
        gate.includes("token vault"),
    ),
  );
  const detectionBlockers = cleanMissing(
    input.moneyRails.missing.filter(
      (gate) =>
        gate.includes("PLAID") ||
        gate.includes("TOKEN_VAULT") ||
        gate.includes("PROVIDER_WEBHOOK"),
    ),
  );
  const movementBlockers = cleanMissing([
    ...input.moneyRails.missing.filter(
      (gate) =>
        gate.includes("TRANSFER") ||
        gate.includes("transfer") ||
        gate.includes("PAYSHIELD_BAAS"),
    ),
    ...input.moneyRails.providerAdapterMissing,
    ...liveMoneyMissing,
  ]);
  const rails = [
    {
      blockers: revenueBlockers,
      canRunNow: input.commercial.paymentCollectionReady,
      endpoint: "POST /api/app/billing/checkout",
      key: "revenue",
      label: "Collect household subscription",
      ownerSwitch: "Stripe Checkout + webhook + core paid-access activation",
      provider: "Stripe",
      ready: input.commercial.paidAccessReady,
      state: input.commercial.paidAccessReady
        ? "paid_access_active"
        : input.commercial.paymentCollectionReady
          ? "payment_collection_ready"
          : "stripe_setup_required",
      userOutcome:
        "Household payment creates the commercial access record that unlocks money workflows.",
    },
    {
      blockers: bankBlockers,
      canRunNow: input.moneyRails.bankLinkReady,
      endpoint: "POST /api/app/bank-link/token",
      key: "bank_connection",
      label: "Connect the household bank",
      ownerSwitch: "Plaid credentials + signed token vault + encrypted custody",
      provider: "Plaid Link",
      ready: input.moneyRails.bankLinkReady,
      state: input.moneyRails.bankLinkReady
        ? "bank_link_ready"
        : input.moneyRails.plaidConfigured
          ? "token_custody_needed"
          : "plaid_setup_required",
      userOutcome:
        "User-approved bank connection is exchanged for a server-side token custody reference.",
    },
    {
      blockers: detectionBlockers,
      canRunNow:
        input.moneyRails.paycheckDetectionReady ||
        input.moneyRails.transactionSyncReady,
      endpoint: "POST /api/app/paychecks/sync",
      key: "paycheck_detection",
      label: "Detect payroll and split buckets",
      ownerSwitch: "Payroll rules + Plaid sync/provider events + durable ledger",
      provider:
        input.moneyRails.detectionMode === "plaid_transactions_sync"
          ? "Plaid Transactions"
          : "Provider events",
      ready: input.moneyRails.paycheckDetectionReady,
      state: input.moneyRails.paycheckDetectionReady
        ? "automatic_detection_ready"
        : input.moneyRails.transactionSyncReady
          ? "sync_ready_rule_gate"
          : "detection_setup_required",
      userOutcome:
        "Income posts to the ledger, funds protected buckets first, then computes Safe to Spend.",
    },
    {
      blockers: [],
      canRunNow: true,
      endpoint: "POST /api/app/buckets",
      key: "protection_rules",
      label: "Customize protected buckets",
      ownerSwitch: "Bucket targets + priority + payees + unlock rules",
      provider: "PayShield ledger",
      ready: true,
      state: input.neobank.postgresSchemaVerified
        ? "durable_controls_ready"
        : "editable_control_model",
      userOutcome:
        "Households define exactly which obligations get protected before spending.",
    },
    {
      blockers: movementBlockers,
      canRunNow: input.moneyRails.transferReady,
      endpoint: "POST /api/app/transfers",
      key: "money_movement",
      label: "Move only approved protected money",
      ownerSwitch: "Transfer/BaaS provider + live-money evidence gates",
      provider: "BaaS or transfer adapter",
      ready: input.moneyRails.transferReady,
      state: input.moneyRails.transferReady
        ? "provider_handoff_ready"
        : input.moneyRails.transferConfigured
          ? "live_gates_needed"
          : "intent_validation_only",
      userOutcome:
        "Provider handoff is created only after bucket balance and destination checks pass.",
    },
    {
      blockers: liveMoneyMissing,
      canRunNow: input.neobank.liveMoneyReady,
      endpoint: "POST /api/card/authorize",
      key: "card_control",
      label: "Approve only Safe to Spend",
      ownerSwitch: "Card gateway + live-money evidence gates",
      provider: "Card authorization gateway",
      ready: input.neobank.liveMoneyReady,
      state: input.neobank.liveMoneyReady
        ? "gateway_ready"
        : "ledger_decision_path_ready",
      userOutcome:
        "Card swipes approve from Safe to Spend or an approved biller bucket, then decline everything else.",
    },
  ];
  const nextRail = rails.find((rail) => !rail.ready) ?? rails[0];

  return {
    activeRailCount: rails.filter((rail) => rail.ready).length,
    headline: "Subscribe -> connect bank -> detect paycheck -> protect -> release",
    mode: input.neobank.liveMoneyReady
      ? "live_money_operating"
      : input.commercial.paymentCollectionReady
        ? "revenue_ready_provider_gated"
        : "commercial_setup_required",
    moneySummary: {
      priceLabel: input.commercial.priceLabel,
      protectedCents: input.protectedCents,
      safeToSpendCents: input.safeToSpendCents,
      totalCents: input.protectedCents + input.safeToSpendCents,
    },
    nextRail: {
      blockers: nextRail.blockers,
      endpoint: nextRail.endpoint,
      key: nextRail.key,
      label: nextRail.label,
      ownerSwitch: nextRail.ownerSwitch,
      state: nextRail.state,
    },
    rails,
    revenueModel: {
      billingProvider: "Stripe",
      checkoutEndpoint: "POST /api/app/billing/checkout",
      checkoutMode: input.commercial.mode,
      canActivatePaidAccess: input.commercial.paidAccessReady,
      canCollectPayment: input.commercial.paymentCollectionReady,
      priceLabel: input.commercial.priceLabel,
      publicCheckoutEndpoint: "POST /api/public/billing/checkout",
      webhookEndpoint: input.commercial.webhookEndpointPath,
    },
    service: "payshield-commercial-operating-state",
    totalRailCount: rails.length,
  };
}

export function buildGuidedMoneyFlow(input: {
  commercial: ReturnType<typeof getCommercialReadiness>;
  moneyRails: ReturnType<typeof getMoneyRailReadiness>;
  neobank: NeobankReadiness;
  protectedCents: number;
  safeToSpendCents: number;
}) {
  const liveMoneyMissing = neobankMissing(input.neobank);
  const revenueBlockers = cleanMissing(input.commercial.missing);
  const bankBlockers = cleanMissing(
    input.moneyRails.missing.filter(
      (gate) =>
        gate.includes("PLAID") ||
        gate.includes("TOKEN_VAULT") ||
        gate.includes("token vault"),
    ),
  );
  const detectionBlockers = cleanMissing(
    input.moneyRails.missing.filter(
      (gate) =>
        gate.includes("PLAID") ||
        gate.includes("TOKEN_VAULT") ||
        gate.includes("PROVIDER_WEBHOOK"),
    ),
  );
  const coreLedgerBlockers = liveMoneyMissing.filter((gate) =>
    ["postgres_ledger", "dedicated_backend", "core_service_auth"].includes(gate),
  );
  const movementBlockers = cleanMissing([
    ...input.moneyRails.missing.filter(
      (gate) =>
        gate.includes("TRANSFER") ||
        gate.includes("transfer") ||
        gate.includes("PAYSHIELD_BAAS"),
    ),
    ...input.moneyRails.providerAdapterMissing,
    ...liveMoneyMissing,
  ]);
  const steps = [
    {
      blockers: revenueBlockers,
      canRunNow: input.commercial.paymentCollectionReady,
      endpoint: "POST /api/app/billing/checkout",
      evidence:
        "Checkout session, signed webhook event, and durable paid-access record.",
      key: "commercial_access",
      label: "Earn",
      ownerAction:
        "Set Stripe Checkout, webhook signing, and durable membership activation so paid access is recorded automatically.",
      primaryAction: "Start checkout",
      ready: input.commercial.paidAccessReady,
      runMode: input.commercial.paidAccessReady
        ? "live_revenue"
        : input.commercial.paymentCollectionReady
          ? "payment_collection"
          : "setup_required",
      status: input.commercial.paidAccessReady
        ? "paid_access_active"
        : input.commercial.paymentCollectionReady
          ? "checkout_ready"
          : "stripe_setup_required",
      title: "Charge the household",
      userOutcome:
        "PayShield can collect the household subscription before private money controls open.",
      uiTarget: "money-operations",
    },
    {
      blockers: bankBlockers,
      canRunNow: input.moneyRails.bankLinkReady,
      endpoint: "POST /api/app/bank-link/token",
      evidence:
        "Plaid Link token, public-token exchange, masked account, and token vault reference.",
      key: "bank_connection",
      label: "Connect",
      ownerAction:
        "Configure Plaid, token-vault handoff, webhook signing, and encrypted custody.",
      primaryAction: "Connect bank",
      ready: input.moneyRails.bankLinkReady,
      runMode: input.moneyRails.bankLinkReady ? "provider_live" : "setup_required",
      status: input.moneyRails.bankLinkReady
        ? "bank_link_ready"
        : input.moneyRails.plaidConfigured
          ? "token_custody_needed"
          : "plaid_setup_required",
      title: "Connect the funding source",
      userOutcome:
        "The household authorizes the external account PayShield will inspect for income and release rules.",
      uiTarget: "money-operations",
    },
    {
      blockers: cleanMissing([...liveMoneyMissing, ...movementBlockers]),
      canRunNow: input.neobank.liveMoneyReady,
      endpoint: "POST /api/app/direct-deposit",
      evidence:
        "Provider account opening record, masked routing instructions, and household routing status.",
      key: "direct_deposit",
      label: "Route",
      ownerAction:
        "Connect the account/card provider before direct-deposit instructions are shown to households.",
      primaryAction: "Set paycheck routing",
      ready: input.neobank.liveMoneyReady,
      runMode: input.neobank.liveMoneyReady ? "provider_live" : "provider_gate",
      status: input.neobank.liveMoneyReady
        ? "routing_ready"
        : "provider_activation_required",
      title: "Route paychecks into PayShield",
      userOutcome:
        "Payroll lands inside the controlled account path before ordinary spending can reach it.",
      uiTarget: "money-operations",
    },
    {
      blockers: cleanMissing([...detectionBlockers, ...coreLedgerBlockers]),
      canRunNow:
        input.moneyRails.transactionSyncReady ||
        input.moneyRails.paycheckDetectionReady,
      endpoint: "POST /api/app/paychecks/sync",
      evidence:
        "Saved payroll rule, synced transaction cursor, provider event, and idempotent detection record.",
      key: "transaction_sync",
      label: "Detect",
      ownerAction:
        "Wire Plaid transaction sync and durable core storage so payroll activity becomes paycheck detections.",
      primaryAction: "Sync bank activity",
      ready: input.moneyRails.transactionSyncReady,
      runMode: input.moneyRails.transactionSyncReady
        ? "provider_live"
        : "setup_required",
      status: input.moneyRails.transactionSyncReady
        ? "sync_ready"
        : input.moneyRails.bankLinkReady
          ? "core_storage_needed"
          : "bank_link_needed",
      title: "Recognize payroll deposits",
      userOutcome:
        "Provider activity is converted into paycheck events PayShield can split into protected buckets.",
      uiTarget: "money-operations",
    },
    {
      blockers: cleanMissing([...detectionBlockers, ...coreLedgerBlockers]),
      canRunNow: input.moneyRails.paycheckDetectionReady,
      endpoint: "POST /api/app/paychecks/detect",
      evidence:
        "Balanced journal entry, bucket funding record, and recalculated Safe to Spend.",
      key: "paycheck_detection",
      label: "Split",
      ownerAction:
        "Activate signed provider events and durable ledger writes before automatic paycheck splits run.",
      primaryAction: "Run paycheck split",
      ready: input.moneyRails.paycheckDetectionReady,
      runMode: input.moneyRails.paycheckDetectionReady
        ? "ledger_live"
        : "core_gate",
      status: input.moneyRails.paycheckDetectionReady
        ? "automatic_detection_ready"
        : input.moneyRails.transactionSyncReady
          ? "rule_gate"
          : "core_required",
      title: "Split income before spending",
      userOutcome:
        "Rent, vehicle, insurance, and custom obligations fund before Safe to Spend is updated.",
      uiTarget: "money-operations",
    },
    {
      blockers: [],
      canRunNow: true,
      endpoint: "POST /api/app/buckets",
      evidence:
        "Bucket profile, priority order, payee assignments, unlock rules, and audit export.",
      key: "protected_buckets",
      label: "Protect",
      ownerAction:
        "Let the household customize buckets, targets, due cadence, payees, and release controls.",
      primaryAction: "Edit buckets",
      ready: true,
      runMode: input.neobank.postgresSchemaVerified
        ? "durable_controls"
        : "control_model",
      status: input.neobank.postgresSchemaVerified
        ? "durable_controls_ready"
        : "customizable_now",
      title: "Customize protected buckets",
      userOutcome:
        "The household decides exactly what gets protected before everyday spending.",
      uiTarget: "bucket-studio",
    },
    {
      blockers: movementBlockers,
      canRunNow: input.moneyRails.transferReady,
      endpoint: "POST /api/app/transfers",
      evidence:
        "Transfer intent, approved payee, source bucket validation, provider handoff, and reconciliation record.",
      key: "protected_transfer",
      label: "Release",
      ownerAction:
        "Configure the transfer/BaaS adapter and live-money gates before provider movement executes.",
      primaryAction: "Create transfer intent",
      ready: input.moneyRails.transferReady,
      runMode: input.moneyRails.transferReady ? "provider_live" : "intent_gate",
      status: input.moneyRails.transferReady
        ? "provider_handoff_ready"
        : input.moneyRails.transferConfigured
          ? "live_gates_needed"
          : "intent_validation_only",
      title: "Release only approved money",
      userOutcome:
        "Protected funds move only to approved destinations after bucket and provider checks pass.",
      uiTarget: "money-operations",
    },
    {
      blockers: liveMoneyMissing,
      canRunNow: input.neobank.liveMoneyReady,
      endpoint: "POST /api/card/authorize",
      evidence:
        "Authorization request, Safe-to-Spend decision, approved biller exception, and audit record.",
      key: "card_control",
      label: "Spend",
      ownerAction:
        "Attach the card gateway only after provider, ledger, counsel, and runbook gates pass.",
      primaryAction: "Check card swipe",
      ready: input.neobank.liveMoneyReady,
      runMode: input.neobank.liveMoneyReady ? "gateway_live" : "ledger_gate",
      status: input.neobank.liveMoneyReady
        ? "gateway_ready"
        : "ledger_decision_path_ready",
      title: "Approve only Safe to Spend",
      userOutcome:
        "Every card decision is answered from Safe to Spend or an approved bill-only bucket.",
      uiTarget: "card-authorization",
    },
  ];
  const nextStep = steps.find((step) => !step.ready) ?? steps[0];
  const readyStepCount = steps.filter((step) => step.ready).length;
  const availableNowCount = steps.filter((step) => step.canRunNow).length;

  return {
    headline: "Pay -> connect -> route -> detect -> protect -> release",
    mode: input.neobank.liveMoneyReady
      ? "live_money_flow"
      : input.commercial.paymentCollectionReady
        ? "revenue_ready_provider_gated"
        : "setup_to_revenue",
    nextStep: {
      blockers: nextStep.blockers,
      canRunNow: nextStep.canRunNow,
      endpoint: nextStep.endpoint,
      key: nextStep.key,
      label: nextStep.label,
      primaryAction: nextStep.primaryAction,
      runMode: nextStep.runMode,
      status: nextStep.status,
      title: nextStep.title,
      uiTarget: nextStep.uiTarget,
    },
    progress: {
      availableNowCount,
      blockedStepCount: steps.filter((step) => step.blockers.length > 0).length,
      percent: Math.round((readyStepCount / Math.max(1, steps.length)) * 100),
      readyStepCount,
      totalStepCount: steps.length,
    },
    service: "payshield-guided-money-flow",
    steps,
    summary:
      "One guided operating path collects revenue, links the funding source, identifies payroll, funds protected buckets first, and releases only approved money.",
    totals: {
      priceLabel: input.commercial.priceLabel,
      protectedCents: input.protectedCents,
      safeToSpendCents: input.safeToSpendCents,
      totalCents: input.protectedCents + input.safeToSpendCents,
    },
  };
}

export function buildActivationRunway(input: {
  commercial: ReturnType<typeof getCommercialReadiness>;
  guidedMoneyFlow: ReturnType<typeof buildGuidedMoneyFlow>;
  moneyRails: ReturnType<typeof getMoneyRailReadiness>;
  neobank: NeobankReadiness;
  protectedCents: number;
  safeToSpendCents: number;
}) {
  const guidedStepByKey = new Map(
    input.guidedMoneyFlow.steps.map((step) => [step.key, step]),
  );
  const priceLabel = input.commercial.priceLabel || "$19/month";
  const coreGateMissing = neobankMissing(input.neobank);
  const durableEvidenceReady =
    input.neobank.postgresSchemaVerified &&
    input.neobank.backendConfigured &&
    input.moneyRails.transactionSyncReady;
  const liveDecisionReady =
    input.neobank.liveMoneyReady && input.moneyRails.transferReady;
  const milestones = [
    {
      blockers: cleanMissing(input.commercial.missing),
      canRunNow: input.commercial.paymentCollectionReady,
      customerOutcome:
        "The household pays for access before private money controls unlock.",
      endpoint: "POST /api/app/billing/checkout",
      key: "first_revenue",
      label: "Earn",
      operatorOutcome:
        "Stripe checkout, webhook signing, and durable activation create the paid-access record.",
      primaryAction: "Start checkout",
      proofArtifacts: [
        "checkout_intent",
        "signed_stripe_webhook",
        "commercial_access_record",
      ],
      ready: input.commercial.paidAccessReady,
      revenueImpact: `Starts ${priceLabel} household revenue.`,
      setupAction:
        "Configure Stripe checkout, webhook signing, and durable Supabase activation storage.",
      title: "Collect the first paid household",
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
      customerOutcome:
        "The household links the external account PayShield will inspect for income.",
      endpoint: "POST /api/app/bank-link/token",
      key: "first_bank_connection",
      label: "Connect",
      operatorOutcome:
        "Plaid Link exchanges the public token and stores only server-side custody references in app records.",
      primaryAction: "Connect bank",
      proofArtifacts: [
        "link_token",
        "public_token_exchange",
        "token_vault_reference",
      ],
      ready: input.moneyRails.bankLinkReady,
      revenueImpact:
        "Turns a paid signup into an account that can reach paycheck protection.",
      setupAction:
        "Configure Plaid credentials, signed token-vault handoff, and encrypted token custody.",
      title: "Connect the funding source",
    },
    {
      blockers: cleanMissing([
        ...input.moneyRails.missing.filter(
          (gate) =>
            gate.includes("PLAID") ||
            gate.includes("TOKEN_VAULT") ||
            gate.includes("PROVIDER_WEBHOOK"),
        ),
        ...coreGateMissing.filter((gate) =>
          ["postgres_ledger", "dedicated_backend", "core_service_auth"].includes(
            gate,
          ),
        ),
      ]),
      canRunNow:
        input.moneyRails.paycheckDetectionReady ||
        input.moneyRails.transactionSyncReady,
      customerOutcome:
        "Payroll activity becomes a paycheck event before Safe to Spend changes.",
      endpoint: "POST /api/app/paychecks/sync",
      key: "first_detected_paycheck",
      label: "Detect",
      operatorOutcome:
        "Transaction sync, provider events, and idempotency keys create a durable detection record.",
      primaryAction: "Sync bank activity",
      proofArtifacts: [
        "paycheck_rule",
        "transaction_sync_cursor",
        "idempotent_detection_record",
      ],
      ready: input.moneyRails.paycheckDetectionReady,
      revenueImpact:
        "Creates the first visible protection moment after a household pays.",
      setupAction:
        "Configure transaction sync, provider webhook signing, durable core storage, and detection rules.",
      title: "Recognize payroll automatically",
    },
    {
      blockers: [],
      canRunNow: true,
      customerOutcome:
        "The household chooses protected categories, target amounts, priorities, payees, and unlock rules.",
      endpoint: "POST /api/app/buckets",
      key: "first_protection_profile",
      label: "Protect",
      operatorOutcome:
        "Bucket profiles define what must be funded before ordinary spending updates.",
      primaryAction: "Edit buckets",
      proofArtifacts: [
        "bucket_profile",
        "payee_assignments",
        "safe_to_spend_preview",
      ],
      ready: true,
      revenueImpact:
        "Gives the product its immediate value even before live provider movement opens.",
      setupAction:
        "No provider setup is required for configuration; durable evidence uses the Supabase ledger.",
      title: "Customize the protection rules",
    },
    {
      blockers: durableEvidenceReady
        ? []
        : cleanMissing(
            ([
              "postgres_ledger",
              "dedicated_backend",
              "core_service_auth",
            ] as const).filter((gate) => coreGateMissing.includes(gate)),
          ),
      canRunNow: durableEvidenceReady,
      customerOutcome:
        "A paycheck split is provable, reversible, and auditable without mutating posted journal entries.",
      endpoint: "GET /api/app/audit/export",
      key: "first_audit_proof",
      label: "Prove",
      operatorOutcome:
        "Postgres ledger, core auth, and sync events prove every balance and exception path.",
      primaryAction: "Export audit",
      proofArtifacts: [
        "balanced_journal_entry",
        "bucket_balance_snapshot",
        "audit_export",
      ],
      ready: durableEvidenceReady,
      revenueImpact:
        "Creates support, compliance, and household trust evidence for retention.",
      setupAction:
        "Configure the Vercel money-control runtime and verify Supabase schema 0022.",
      title: "Prove the ledger evidence",
    },
    {
      blockers: liveDecisionReady
        ? []
        : cleanMissing([
            ...input.moneyRails.providerAdapterMissing,
            ...input.moneyRails.missing.filter(
              (gate) =>
                gate.includes("TRANSFER") ||
                gate.includes("transfer") ||
                gate.includes("PAYSHIELD_BAAS"),
            ),
            ...coreGateMissing,
          ]),
      canRunNow: liveDecisionReady,
      customerOutcome:
        "Approved transfers and card decisions release only Safe to Spend or assigned bill money.",
      endpoint: "POST /api/card/authorize",
      key: "first_live_decision",
      label: "Release",
      operatorOutcome:
        "Provider adapter, card gateway, counsel approvals, runbooks, and ledger checks answer live-money decisions.",
      primaryAction: "Check card swipe",
      proofArtifacts: [
        "safe_to_spend_authorization",
        "approved_biller_exception",
        "provider_reconciliation_record",
      ],
      ready: liveDecisionReady,
      revenueImpact:
        "Completes the product promise households pay for: protected money cannot be casually spent.",
      setupAction:
        "Configure the BaaS/card provider, transfer adapter, sponsor approvals, counsel signoff, runbooks, and live-money gate.",
      title: "Authorize real-world release",
    },
  ];
  const nextMilestone =
    milestones.find((milestone) => !milestone.ready) ?? milestones[0];
  const readyMilestoneCount = milestones.filter(
    (milestone) => milestone.ready,
  ).length;
  const runnableMilestoneCount = milestones.filter(
    (milestone) => milestone.canRunNow,
  ).length;

  return {
    customerPath: [
      "Pay for access",
      "Connect funding source",
      "Confirm paycheck rules",
      "Customize buckets and payees",
      "Review Safe to Spend",
      "Release only approved money",
    ],
    headline: "Collect revenue, connect money, prove protection.",
    milestones,
    mode: liveDecisionReady
      ? "live_decision_ready"
      : input.commercial.paymentCollectionReady
        ? "selling_with_provider_setup"
        : "setup_to_first_payment",
    nextMilestone: {
      blockers: nextMilestone.blockers,
      canRunNow: nextMilestone.canRunNow,
      endpoint: nextMilestone.endpoint,
      key: nextMilestone.key,
      label: nextMilestone.label,
      primaryAction: nextMilestone.primaryAction,
      revenueImpact: nextMilestone.revenueImpact,
      setupAction: nextMilestone.setupAction,
      title: nextMilestone.title,
    },
    ownerPath: [
      "Configure membership and durable access activation",
      "Turn on Clerk household identity",
      "Configure Plaid and token custody",
      "Verify Postgres ledger schema 0022",
      "Connect BaaS/card provider adapter",
      "Record counsel, sponsor, and runbook approvals before live money",
    ],
    proof: {
      activationEndpoint: "/api/app/activation",
      auditEndpoint: "/api/app/audit/export",
      healthEndpoint: "/api/health",
      operationsEndpoint: "/api/app/operations",
      productionStatusCommand:
        "npm run smoke:deploy -- https://payshield-lime.vercel.app && npm run production:routes -- https://payshield-lime.vercel.app",
      requiredBeforeLiveMoney: cleanMissing([
        ...coreGateMissing,
        ...input.moneyRails.providerAdapterMissing,
        ...input.moneyRails.missing,
      ]),
    },
    progress: {
      blockedMilestoneCount: milestones.filter(
        (milestone) => milestone.blockers.length > 0,
      ).length,
      percent: Math.round(
        (readyMilestoneCount / Math.max(1, milestones.length)) * 100,
      ),
      readyMilestoneCount,
      runnableMilestoneCount,
      totalMilestoneCount: milestones.length,
    },
    service: "payshield-activation-runway",
    syncedWithGuidedFlow: {
      nextGuidedStep: input.guidedMoneyFlow.nextStep.key,
      protectedBucketStatus:
        guidedStepByKey.get("protected_buckets")?.status ?? "unknown",
      releaseStatus:
        guidedStepByKey.get("protected_transfer")?.status ?? "unknown",
    },
  };
}

export function createHouseholdOperationsPacket(session?: AppSession) {
  const snapshot = createNeobankSnapshot();
  const commercial = getCommercialReadiness();
  const moneyRails = getMoneyRailReadiness();
  const household = householdForSession(snapshot, session);
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
  const activationPlan = buildActivationPlan({
    commercial,
    moneyRails,
    neobank: snapshot.readiness,
  });
  const revenueAndRails = buildRevenueAndRails({
    commercial,
    moneyRails,
    neobank: snapshot.readiness,
    protectedCents,
    safeToSpendCents,
  });
  const operatingCockpit = buildOperatingCockpit({
    activationPlan,
    commercial,
    moneyRails,
    neobank: snapshot.readiness,
    protectedCents,
    revenueAndRails,
    safeToSpendCents,
  });
  const commercialOperatingState = buildCommercialOperatingState({
    commercial,
    moneyRails,
    neobank: snapshot.readiness,
    protectedCents,
    safeToSpendCents,
  });
  const guidedMoneyFlow = buildGuidedMoneyFlow({
    commercial,
    moneyRails,
    neobank: snapshot.readiness,
    protectedCents,
    safeToSpendCents,
  });
  const activationRunway = buildActivationRunway({
    commercial,
    guidedMoneyFlow,
    moneyRails,
    neobank: snapshot.readiness,
    protectedCents,
    safeToSpendCents,
  });

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
          "Bucket rules require the Supabase ledger before they can be saved.",
      },
      payeePersistence: {
        persisted: false,
        persistence: "memory",
        persistenceReason:
          "Payees require the Supabase ledger before they can be saved.",
      },
      payees: snapshot.payees,
    },
    directDeposit: snapshot.directDeposit,
    generatedAt: new Date().toISOString(),
    household,
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
    activationPlan,
    activationRunway,
    commercialOperatingState,
    guidedMoneyFlow,
    revenueAndRails,
    operatingCockpit,
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
      activationRunway: packet.activationRunway,
      commercialOperatingState: packet.commercialOperatingState,
      guidedMoneyFlow: packet.guidedMoneyFlow,
      moneyRails: packet.moneyRails,
      operatingCockpit: packet.operatingCockpit,
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
        `npm run smoke:deploy -- ${siteUrl}`,
        `npm run production:routes -- ${siteUrl}`,
        'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:verify',
      ],
    },
    service: "payshield-activation-console",
    support: packet.support,
    activationRunway: packet.activationRunway,
    commercialOperatingState: packet.commercialOperatingState,
    guidedMoneyFlow: packet.guidedMoneyFlow,
    operatingCockpit: packet.operatingCockpit,
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
    activationRunway: packet.activationRunway,
    commercialAccess: packet.commercialAccess,
    guidedMoneyFlow: packet.guidedMoneyFlow,
    revenueAndRails: packet.revenueAndRails,
    operatingCockpit: packet.operatingCockpit,
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
