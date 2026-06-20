import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { beforeEach, test } from "node:test";
import { NextRequest } from "next/server.js";
import { POST as authorizeCard } from "../src/app/api/card/authorize/route.ts";
import { POST as startCheckout } from "../src/app/api/app/billing/checkout/route.ts";
import { POST as startPublicCheckout } from "../src/app/api/public/billing/checkout/route.ts";
import { POST as openBillingPortal } from "../src/app/api/app/billing/portal/route.ts";
import { POST as billingWebhook } from "../src/app/api/app/billing/webhook/route.ts";
import { POST as createBankLinkToken } from "../src/app/api/app/bank-link/token/route.ts";
import { GET as getActivation } from "../src/app/api/app/activation/route.ts";
import { GET as getLaunchActivation } from "../src/app/api/launch/activation/route.ts";
import { POST as recordLaunchGateEvidence } from "../src/app/api/launch/gate-evidence/route.ts";
import { GET as exportAudit } from "../src/app/api/app/audit/export/route.ts";
import { GET as getBalances } from "../src/app/api/app/balances/route.ts";
import {
  GET as getControlPlan,
  POST as generateControlPlan,
} from "../src/app/api/app/control-plan/route.ts";
import { POST as setupDirectDeposit } from "../src/app/api/app/direct-deposit/route.ts";
import { GET as getBillingStatus } from "../src/app/api/app/billing/status/route.ts";
import {
  GET as getBuckets,
  POST as saveBuckets,
} from "../src/app/api/app/buckets/route.ts";
import { POST as scheduleBillPayment } from "../src/app/api/app/bill-payments/route.ts";
import { GET as getMe } from "../src/app/api/app/me/route.ts";
import { POST as startOnboarding } from "../src/app/api/app/onboarding/start/route.ts";
import { GET as getOperations } from "../src/app/api/app/operations/route.ts";
import { POST as createPayee } from "../src/app/api/app/payees/route.ts";
import { POST as detectPaycheck } from "../src/app/api/app/paychecks/detect/route.ts";
import { POST as savePaycheckRule } from "../src/app/api/app/paychecks/rules/route.ts";
import { POST as syncPaychecks } from "../src/app/api/app/paychecks/sync/route.ts";
import { POST as resolveReconciliation } from "../src/app/api/app/reconciliation/resolve/route.ts";
import { POST as createTransfer } from "../src/app/api/app/transfers/route.ts";
import { POST as unlockBucket } from "../src/app/api/app/unlocks/route.ts";
import { POST as providerWebhook } from "../src/app/api/provider/webhooks/route.ts";
import {
  createCommercialCheckoutSession,
  paidAccessRequired,
} from "../src/app/lib/commercial/billing.ts";

const endpoint = "https://payshield.test";

beforeEach(() => {
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.PAYSHIELD_BAAS_ADAPTER;
  delete process.env.PAYSHIELD_BAAS_API_BASE_URL;
  delete process.env.PAYSHIELD_BAAS_API_KEY;
  delete process.env.PAYSHIELD_BAAS_CONTRACT_APPROVED;
  delete process.env.PAYSHIELD_BAAS_PROVIDER;
  delete process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL;
  delete process.env.PAYSHIELD_COMMERCIAL_PRICE_ID;
  delete process.env.PAYSHIELD_CORE_API_URL;
  delete process.env.PAYSHIELD_CORE_REQUIRE_SERVICE_TOKEN;
  delete process.env.PAYSHIELD_CORE_SERVICE_TOKEN;
  delete process.env.PAYSHIELD_LEDGER_DATABASE_URL;
  delete process.env.PAYSHIELD_LIVE_MONEY_ENABLED;
  delete process.env.PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED;
  delete process.env.PAYSHIELD_REQUIRE_PAID_ACCESS;
  delete process.env.PAYSHIELD_PROVIDER_WEBHOOK_REPLAY_TOLERANCE_SECONDS;
  delete process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET;
  delete process.env.PAYSHIELD_TRANSFER_ENABLED;
  delete process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID;
  delete process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET;
  delete process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL;
  delete process.env.PLAID_CLIENT_ID;
  delete process.env.PLAID_SECRET;
  delete process.env.PAYSHIELD_REGULATED_COUNSEL_SIGNOFF;
  delete process.env.PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.VERCEL_ENV;
});

function makeRequest(path: string, payload: unknown) {
  return new NextRequest(`${endpoint}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

function makeRawRequest(
  path: string,
  body: string,
  headers: Record<string, string> = {
    "content-type": "application/json",
  },
) {
  return new NextRequest(`${endpoint}${path}`, {
    body,
    headers,
    method: "POST",
  });
}

function makeStripeWebhookRequest(payload: string, secret: string, timestamp: number) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return new NextRequest(`${endpoint}/api/app/billing/webhook`, {
    body: payload,
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${signature}`,
    },
    method: "POST",
  });
}

function makeProviderWebhookRequest(
  payload: unknown,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000).toString(),
) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return new NextRequest(`${endpoint}/api/provider/webhooks`, {
    body,
    headers: {
      "content-type": "application/json",
      "x-payshield-provider-signature": `t=${timestamp},v1=${signature}`,
    },
    method: "POST",
  });
}

async function parseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("me endpoint reports private app state and gated live money", async () => {
  const response = await getMe();
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(body.auth, {
    authMode: "demo",
    email: "private-household@example.com",
    name: "PayShield household",
    userId: "user_demo_001",
  });
  assert.equal((body.profile as Record<string, unknown>).access, "approved");
  assert.equal((body.readiness as Record<string, unknown>).liveMoneyReady, false);
});

test("balances endpoint exposes safe spend and protected buckets", async () => {
  const response = await getBalances();
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.safeToSpendCents, 145_000);
  assert.equal(body.protectedCents, 155_000);
  assert.equal(Array.isArray(body.buckets), true);
});

test("operations endpoint exposes the revenue and money-control record", async () => {
  const response = await getOperations();
  const body = await parseJson(response);
  const balances = body.balances as Record<string, unknown>;
  const statusCards = body.statusCards as Array<Record<string, unknown>>;
  const timeline = body.timeline as Array<Record<string, unknown>>;
  const activationPlan = body.activationPlan as Record<string, unknown>;
  const activationStages = activationPlan.stages as Array<Record<string, unknown>>;
  const revenueAndRails = body.revenueAndRails as Record<string, unknown>;
  const operatingCockpit = body.operatingCockpit as Record<string, unknown>;
  const commercialOperatingState = body.commercialOperatingState as Record<
    string,
    unknown
  >;
  const cockpitLanes = operatingCockpit.lanes as Array<Record<string, unknown>>;
  const nextAction = operatingCockpit.nextAction as Record<string, unknown>;
  const rails = revenueAndRails.rails as Array<Record<string, unknown>>;
  const commercialRails = commercialOperatingState.rails as Array<
    Record<string, unknown>
  >;

  assert.equal(response.status, 200);
  assert.equal(body.service, "payshield-household-operations");
  assert.equal(balances.safeToSpendCents, 145_000);
  assert.equal(balances.protectedCents, 155_000);
  assert.equal(
    statusCards.some((card) => card.key === "bank_connection"),
    true,
  );
  assert.equal(timeline[0]?.rail, "ledger");
  assert.equal(activationPlan.revenueReady, false);
  assert.equal(activationPlan.nextStageKey, "revenue");
  assert.deepEqual(activationPlan.businessModel, {
    billingProvider: "Stripe",
    priceLabel: "$19/month",
    revenuePath:
      "Checkout -> webhook -> commercial access -> bank link -> paycheck controls.",
    supportContact: "support@graystontechnologies.com",
  });
  assert.equal(
    activationStages.some(
      (stage) =>
        stage.key === "bank_connection" &&
        stage.primaryEndpoint === "POST /api/app/bank-link/token" &&
        String(stage.businessImpact).includes("connected funding source") &&
        Array.isArray(stage.setupChecklist) &&
        String(stage.evidence).includes("token vault reference"),
    ),
    true,
  );
  assert.equal((revenueAndRails.summary as Record<string, unknown>).priceLabel, "$19/month");
  assert.equal(operatingCockpit.service, "payshield-operating-cockpit");
  assert.equal(
    operatingCockpit.headline,
    "Charge -> connect -> detect -> protect -> move",
  );
  assert.equal(
    commercialOperatingState.headline,
    "Subscribe -> connect bank -> detect paycheck -> protect -> release",
  );
  assert.equal(
    commercialOperatingState.service,
    "payshield-commercial-operating-state",
  );
  assert.equal(
    (commercialOperatingState.revenueModel as Record<string, unknown>)
      .publicCheckoutEndpoint,
    "POST /api/public/billing/checkout",
  );
  assert.equal(operatingCockpit.mode, "credential_gated");
  assert.equal(operatingCockpit.readyLaneCount, 1);
  assert.equal(operatingCockpit.totalLaneCount, 7);
  assert.equal(commercialOperatingState.activeRailCount, 1);
  assert.equal(commercialOperatingState.totalRailCount, 6);
  assert.equal(
    (commercialOperatingState.nextRail as Record<string, unknown>).key,
    "revenue",
  );
  assert.equal(nextAction.key, "revenue");
  assert.equal(nextAction.primaryEndpoint, "POST /api/app/billing/checkout");
  assert.equal(
    cockpitLanes.some(
      (lane) =>
        lane.key === "bank_connection" &&
        lane.primaryEndpoint === "POST /api/app/bank-link/token" &&
        lane.ready === false,
    ),
    true,
  );
  assert.equal(
    cockpitLanes.some(
      (lane) =>
        lane.key === "protection_rules" &&
        lane.ready === true &&
        lane.canRunNow === true,
    ),
    true,
  );
  assert.equal(
    rails.some(
      (rail) =>
        rail.key === "revenue" &&
        rail.label === "Get paid" &&
        rail.endpoint === "POST /api/app/billing/checkout" &&
        String(rail.unlocks).includes("paid money workflows"),
    ),
    true,
  );
  assert.equal(
    rails.some(
      (rail) =>
        rail.key === "bank_connection" &&
        rail.provider === "Plaid Link" &&
        rail.endpoint === "POST /api/app/bank-link/token",
    ),
    true,
  );
  assert.equal(
    commercialRails.some(
      (rail) =>
        rail.key === "money_movement" &&
        rail.endpoint === "POST /api/app/transfers" &&
        String(rail.userOutcome).includes("Provider handoff"),
    ),
    true,
  );
});

test("control plan endpoint turns paycheck input into a usable operating plan", async () => {
  const response = await getControlPlan();
  const body = await parseJson(response);
  const summary = body.summary as Record<string, unknown>;
  const allocation = body.allocation as Record<string, unknown>;
  const buckets = allocation.buckets as Array<Record<string, unknown>>;
  const operatingSteps = body.operatingSteps as Array<Record<string, unknown>>;
  const monetization = body.monetization as Record<string, unknown>;
  const transferPlan = body.transferPlan as Record<string, unknown>;
  const proof = body.proof as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.service, "payshield-household-control-plan");
  assert.equal(summary.paycheckAmountCents, 300_000);
  assert.equal(summary.projectedProtectedCents, 155_000);
  assert.equal(summary.projectedSafeToSpendCents, 145_000);
  assert.equal(summary.readyStepCount, 4);
  assert.equal(monetization.priceLabel, "$19/month");
  assert.equal(monetization.endpoint, "POST /api/app/billing/checkout");
  assert.equal(
    operatingSteps.some(
      (step) =>
        step.key === "revenue_gate" &&
        step.title === "Revenue gate" &&
        step.endpoint === "POST /api/app/billing/checkout",
    ),
    true,
  );
  assert.equal(
    operatingSteps.some(
      (step) =>
        step.key === "bank_connection" &&
        step.endpoint === "POST /api/app/bank-link/token",
    ),
    true,
  );
  assert.equal(
    operatingSteps.some(
      (step) =>
        step.key === "paycheck_detection" &&
        step.endpoint === "POST /api/app/paychecks/rules" &&
        step.canRunNow === true,
    ),
    true,
  );
  assert.equal(
    buckets.some(
      (bucket) =>
        bucket.bucketId === "rent" &&
        bucket.projectedFundingCents === 50_000,
    ),
    true,
  );
  assert.equal(transferPlan.endpoint, "POST /api/app/transfers");
  assert.equal(proof.planEndpoint, "/api/app/control-plan");
  assert.equal(proof.auditEndpoint, "/api/app/audit/export");
});

test("control plan post validates and regenerates paycheck projections", async () => {
  const response = await generateControlPlan(
    makeRequest("/api/app/control-plan", {
      employerName: "Acme Payroll",
      expectedFrequency: "weekly",
      paycheckAmountCents: 220_000,
      requestedTransferCents: 20_000,
      ruleName: "Acme weekly payroll",
    }),
  );
  const body = await parseJson(response);
  const summary = body.summary as Record<string, unknown>;
  const detectionRule = body.detectionRule as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(summary.paycheckAmountCents, 220_000);
  assert.equal(summary.projectedProtectedCents, 155_000);
  assert.equal(summary.projectedSafeToSpendCents, 65_000);
  assert.equal(detectionRule.employerNamePattern, "Acme Payroll");
  assert.equal(detectionRule.ruleName, "Acme weekly payroll");

  const badResponse = await generateControlPlan(
    makeRequest("/api/app/control-plan", {
      paycheckAmountCents: 1,
    }),
  );
  const badBody = await parseJson(badResponse);

  assert.equal(badResponse.status, 400);
  assert.equal(Array.isArray(badBody.errors), true);
});

test("control plan post rejects oversized and malformed request bodies", async () => {
  const oversized = await generateControlPlan(
    makeRawRequest(
      "/api/app/control-plan",
      JSON.stringify({
        employerName: "x".repeat(20_000),
        paycheckAmountCents: 300_000,
      }),
    ),
  );
  const malformed = await generateControlPlan(
    makeRawRequest("/api/app/control-plan", "{"),
  );
  const oversizedBody = await parseJson(oversized);
  const malformedBody = await parseJson(malformed);

  assert.equal(oversized.status, 413);
  assert.equal(oversizedBody.error, "Request body is too large.");
  assert.equal(oversizedBody.service, "payshield-household-control-plan");
  assert.equal(malformed.status, 400);
  assert.equal(malformedBody.error, "Invalid request body.");
  assert.equal(malformedBody.service, "payshield-household-control-plan");
});

test("activation endpoint exposes operator launch checklist and smoke commands", async () => {
  const response = await getActivation();
  const body = await parseJson(response);
  const activationPlan = body.activationPlan as Record<string, unknown>;
  const currentState = body.currentState as Record<string, unknown>;
  const nextAction = body.nextAction as Record<string, unknown>;
  const operatorRunbook = body.operatorRunbook as Record<string, unknown>;
  const revenueAndRails = body.revenueAndRails as Record<string, unknown>;
  const smokeCommands = operatorRunbook.smokeCommands as string[];
  const authenticatedSmokeCommands =
    operatorRunbook.authenticatedSmokeCommands as string[];
  const setupGroups = operatorRunbook.setupGroups as Array<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.equal(body.service, "payshield-activation-console");
  assert.equal(activationPlan.nextStageKey, "revenue");
  assert.equal(nextAction.primaryEndpoint, "POST /api/app/billing/checkout");
  assert.equal(
    smokeCommands.some((command) => command.includes("/api/launch/activation")),
    true,
  );
  assert.equal(
    smokeCommands.includes("npm run vercel:env:audit -- --profile commercial"),
    true,
  );
  assert.equal(
    authenticatedSmokeCommands.some((command) =>
      command.includes("/api/app/activation"),
    ),
    true,
  );
  assert.equal(operatorRunbook.activationEndpoint, "/api/launch/activation");
  assert.equal(operatorRunbook.appActivationEndpoint, "/api/app/activation");
  assert.equal(
    Array.isArray(operatorRunbook.remainingGates),
    true,
  );
  assert.equal(
    setupGroups.some(
      (group) =>
        group.key === "bank_connection" &&
        Array.isArray(group.setupCommands) &&
        String((group.setupCommands as string[]).join("\n")).includes(
          "npx vercel env add PLAID_CLIENT_ID production",
        ) &&
        String(group.productAction).includes("external funding source"),
    ),
    true,
  );
  assert.equal(
    setupGroups.some(
      (group) =>
        group.key === "revenue" &&
        Array.isArray(group.setupCommands) &&
        String((group.setupCommands as string[]).join("\n")).includes(
          "npx vercel env add STRIPE_SECRET_KEY production",
        ),
    ),
    true,
  );
  assert.equal(
    (currentState.commercialAccess as Record<string, unknown>).state,
    "needs_setup",
  );
  assert.equal(
    Array.isArray(revenueAndRails.rails),
    true,
  );
});

test("launch gate evidence route requires durable authenticated core", async () => {
  const response = await recordLaunchGateEvidence(
    makeRequest("/api/launch/gate-evidence", {
      approvedBy: "Grayston Operations",
      evidenceRef: "notion-counsel-signoff-2026-06",
      evidenceSummary:
        "Redacted counsel approval summary for production launch controls.",
      gateId: "counsel_signoff",
      scope: "counsel",
      status: "approved",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-production-gate-evidence");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("launch activation endpoint stays available while app auth is locked and redacts secrets", async () => {
  process.env.VERCEL_ENV = "production";
  process.env.STRIPE_SECRET_KEY = "sk_live_secret-value";
  process.env.STRIPE_WEBHOOK_SECRET = "stripe-webhook-secret";
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "https://vault.example/token";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";

  const response = getLaunchActivation();
  const body = await parseJson(response);
  const operatorRunbook = body.operatorRunbook as Record<string, unknown>;
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.service, "payshield-activation-console");
  assert.equal(operatorRunbook.activationEndpoint, "/api/launch/activation");
  assert.match(serialized, /npx vercel env add STRIPE_SECRET_KEY production/);
  assert.match(serialized, /npx vercel env add PLAID_SECRET production/);
  assert.equal(serialized.includes("sk_live_secret-value"), false);
  assert.equal(serialized.includes("stripe-webhook-secret"), false);
  assert.equal(serialized.includes("plaid-secret"), false);
  assert.equal(serialized.includes("vault-secret"), false);
  assert.equal(serialized.includes("https://vault.example/token"), false);
});

test("billing status exposes household paid-access state", async () => {
  const response = await getBillingStatus();
  const body = await parseJson(response);
  const commercialAccess = body.commercialAccess as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.service, "payshield-billing-status");
  assert.equal(commercialAccess.state, "needs_setup");
  assert.equal(commercialAccess.priceLabel, "$19/month");
});

test("billing portal requires durable Stripe customer state", async () => {
  const response = await openBillingPortal(
    makeRequest("/api/app/billing/portal", {
      returnPath: "/app?billing=manage",
    }),
  );
  const body = await parseJson(response);
  const readiness = body.readiness as Record<string, unknown>;

  assert.equal(response.status, 424);
  assert.match(String(body.error), /Stripe customer/i);
  assert.equal(readiness.portalConfigured, false);
  assert.deepEqual(readiness.missing, [
    "STRIPE_SECRET_KEY",
    "provider_customer_id",
  ]);
});

test("billing portal rejects oversized request bodies", async () => {
  const response = await openBillingPortal(
    makeRawRequest(
      "/api/app/billing/portal",
      JSON.stringify({
        note: "x".repeat(20_000),
        returnPath: "/app?billing=manage",
      }),
    ),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 413);
  assert.equal(body.error, "Request body is too large.");
  assert.equal(body.service, "payshield-billing-portal");
});

test("audit export returns a downloadable household operations packet", async () => {
  const response = await exportAudit();
  const body = await parseJson(response);
  const ledger = body.ledger as Record<string, unknown>;
  const activationPlan = body.activationPlan as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.service, "payshield-audit-export");
  assert.equal(body.exportVersion, "payshield-household-audit-v1");
  assert.equal(
    response.headers
      .get("content-disposition")
      ?.includes("payshield-household-audit.json"),
    true,
  );
  assert.equal(ledger.source, "core_control_model");
  assert.equal(Array.isArray(ledger.entries), true);
  assert.equal(activationPlan.totalStages, 6);
});

test("reconciliation resolution fails closed without the dedicated core store", async () => {
  const response = await resolveReconciliation(
    makeRequest("/api/app/reconciliation/resolve", {
      exceptionId: "reconciliation_exception_demo",
      reason: "duplicate_event",
      resolutionNote: "Provider replay reviewed and no ledger change was needed.",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 424);
  assert.equal(body.service, "payshield-reconciliation-resolution");
  assert.equal(body.code, "core_operations_required");
  assert.match(String(body.error), /core operations store/i);
});

test("bucket endpoint loads editable household profile templates", async () => {
  const response = await getBuckets();
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(body.buckets), true);
  assert.equal(body.persisted, false);
  assert.equal(body.profilePersistence, "stateless_model");
  assert.equal(body.profileSource, "app_template_model");
  assert.equal(Array.isArray(body.templates), true);
  assert.equal((body.templates as string[]).includes("Childcare"), true);
});

test("bucket endpoint requires the dedicated core before saving protected profiles", async () => {
  const response = await saveBuckets(
    makeRequest("/api/app/buckets", {
      action: "replace_profile",
      buckets: [
        {
          due: "1st",
          id: "rent",
          name: "Rent",
          protection: "bill_only",
          targetCents: 50_000,
        },
        {
          due: "Every check",
          id: "custom_childcare",
          name: "Childcare",
          protection: "hard_lock",
          targetCents: 20_000,
        },
      ],
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-bucket-controls");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("onboarding requires the dedicated authenticated core service", async () => {
  const response = await startOnboarding();
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-provider-onboarding");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("paid access checkout reports missing Stripe configuration", async () => {
  const response = await startCheckout(
    makeRequest("/api/app/billing/checkout", {
      cancelPath: "/app?billing=cancelled",
      successPath: "/app?billing=active",
    }),
  );
  const body = await parseJson(response);
  const readiness = body.readiness as Record<string, unknown>;
  const checkoutIntent = body.checkoutIntent as Record<string, unknown>;

  assert.equal(response.status, 424);
  assert.equal(readiness.checkoutConfigured, false);
  assert.equal(checkoutIntent.status, "blocked");
  assert.equal(checkoutIntent.errorCode, "checkout_not_configured");
  assert.equal(Array.isArray(readiness.missing), true);
});

test("paid access checkout rejects oversized and malformed request bodies", async () => {
  const oversized = await startCheckout(
    makeRawRequest(
      "/api/app/billing/checkout",
      JSON.stringify({
        cancelPath: "/app?billing=cancelled",
        note: "x".repeat(20_000),
      }),
    ),
  );
  const malformed = await startCheckout(
    makeRawRequest("/api/app/billing/checkout", "{"),
  );
  const oversizedBody = await parseJson(oversized);
  const malformedBody = await parseJson(malformed);

  assert.equal(oversized.status, 413);
  assert.equal(oversizedBody.error, "Request body is too large.");
  assert.equal(oversizedBody.service, "payshield-checkout");
  assert.equal(malformed.status, 400);
  assert.equal(malformedBody.error, "Invalid request body.");
  assert.equal(malformedBody.service, "payshield-checkout");
});

test("production runtime requires paid access before money workflows", () => {
  process.env.VERCEL_ENV = "production";

  const gate = paidAccessRequired();

  assert.equal(gate.required, true);
  assert.equal(gate.readiness.checkoutConfigured, false);
});

test("paid access checkout can return a configured payment link", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL =
    "https://buy.stripe.com/live_123";
  process.env.PAYSHIELD_CORE_API_URL = "https://core.payshield.test";
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-secret";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const originalFetch = globalThis.fetch;
  let coreCalls = 0;

  globalThis.fetch = async (_input, init) => {
    coreCalls += 1;
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
      string,
      unknown
    >;

    return new Response(
      JSON.stringify({
        checkoutIntent: {
          checkoutMode: requestBody.checkoutMode ?? "not_configured",
          checkoutUrlPresent: Boolean(requestBody.checkoutUrlPresent),
          errorCode: requestBody.errorCode || null,
          idempotencyKey: requestBody.idempotencyKey,
          priceLabel: requestBody.priceLabel ?? "$19/month",
          providerCheckoutId: requestBody.providerCheckoutId ?? null,
          providerName: "stripe",
          status: requestBody.status,
          userId: "user_demo_001",
        },
        persistence: {
          persisted: true,
          persistence: "postgres",
        },
        service: "payshield-checkout-intent",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const response = await startCheckout(
      makeRequest("/api/app/billing/checkout", {
        cancelPath: "/app?billing=cancelled",
        idempotencyKey: "payment-link-ready",
        successPath: "/app?billing=active",
      }),
    );
    const body = await parseJson(response);
    const checkoutIntent = body.checkoutIntent as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.url, "https://buy.stripe.com/live_123");
    assert.equal(checkoutIntent.status, "payment_link");
    assert.equal(checkoutIntent.checkoutUrlPresent, true);
    assert.equal(coreCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("authenticated paid access checkout can collect while activation persistence is pending", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL =
    "https://buy.stripe.com/live_missing_core";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

  const response = await startCheckout(
    makeRequest("/api/app/billing/checkout", {
      cancelPath: "/app?billing=cancelled",
      successPath: "/app?billing=active",
    }),
  );
  const body = await parseJson(response);
  const activation = body.activation as Record<string, unknown>;
  const readiness = body.readiness as Record<string, unknown>;
  const checkoutIntent = body.checkoutIntent as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.url, "https://buy.stripe.com/live_missing_core");
  assert.equal(activation.autoActivationReady, false);
  assert.equal(activation.mode, "payment_collection_only");
  assert.equal(readiness.checkoutConfigured, true);
  assert.equal(readiness.checkoutOperationalReady, false);
  assert.equal(readiness.paymentCollectionReady, true);
  assert.equal(checkoutIntent.status, "payment_link");
  assert.equal(checkoutIntent.errorCode, null);
});

test("paid access checkout session uses the authenticated customer identity", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PRICE_ID = "price_payShield";
  process.env.PAYSHIELD_CORE_API_URL = "https://core.payshield.test";
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-secret";
  process.env.STRIPE_SECRET_KEY = "sk_test_payShield";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const originalFetch = globalThis.fetch;
  let capturedBody = "";
  let capturedStripeVersion = "";

  globalThis.fetch = async (_input, init) => {
    capturedBody = String(init?.body ?? "");
    capturedStripeVersion = String(
      (init?.headers as Record<string, string>)?.["stripe-version"] ?? "",
    );

    return new Response(
      JSON.stringify({
        id: "cs_test_household",
        url: "https://checkout.stripe.com/c/pay/cs_test_household",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const result = await createCommercialCheckoutSession({
      email: "customer@example.com",
      origin: endpoint,
      userId: "user_clerk_123",
    });
    const form = new URLSearchParams(capturedBody);

    assert.equal(result.status, 200);
    assert.equal(capturedStripeVersion, "2026-02-25.clover");
    assert.equal(form.get("customer_email"), "customer@example.com");
    assert.equal(form.get("client_reference_id"), "user_clerk_123");
    assert.equal(
      form.get("metadata[payshield_customer_email]"),
      "customer@example.com",
    );
    assert.equal(form.get("metadata[payshield_user_id]"), "user_clerk_123");
    assert.equal(
      form.get("subscription_data[metadata][payshield_customer_email]"),
      "customer@example.com",
    );
    assert.equal(
      form.get("subscription_data[metadata][payshield_user_id]"),
      "user_clerk_123",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public checkout requires valid email before collecting payment", async () => {
  const response = await startPublicCheckout(
    makeRequest("/api/public/billing/checkout", {
      email: "not-an-email",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 400);
  assert.match(String(body.error), /valid email/i);
});

test("public checkout rejects oversized commercial request bodies", async () => {
  const response = await startPublicCheckout(
    makeRawRequest(
      "/api/public/billing/checkout",
      JSON.stringify({
        email: "buyer@example.com",
        message: "x".repeat(20_000),
      }),
    ),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 413);
  assert.equal(body.error, "Request body is too large.");
  assert.equal(body.service, "payshield-public-checkout");
});

test("public checkout accepts bounded url-encoded commercial requests", async () => {
  const response = await startPublicCheckout(
    makeRawRequest(
      "/api/public/billing/checkout",
      new URLSearchParams({
        email: "not-an-email",
      }).toString(),
      {
        "content-type": "application/x-www-form-urlencoded",
      },
    ),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 400);
  assert.match(String(body.error), /valid email/i);
});

test("public checkout rejects static payment links that cannot carry household identity", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL =
    "https://buy.stripe.com/live_public";
  process.env.PAYSHIELD_CORE_API_URL = "https://core.payshield.test";
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-secret";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
      string,
      unknown
    >;

    return new Response(
      JSON.stringify({
        checkoutIntent: {
          checkoutMode: requestBody.checkoutMode ?? "not_configured",
          checkoutUrlPresent: Boolean(requestBody.checkoutUrlPresent),
          errorCode: requestBody.errorCode || null,
          idempotencyKey: requestBody.idempotencyKey,
          priceLabel: requestBody.priceLabel ?? "$19/month",
          providerCheckoutId: requestBody.providerCheckoutId ?? null,
          providerName: "stripe",
          status: requestBody.status,
          userId: "email_public",
        },
        persistence: {
          persisted: true,
          persistence: "postgres",
        },
        service: "payshield-checkout-intent",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const response = await startPublicCheckout(
      makeRequest("/api/public/billing/checkout", {
        email: "buyer@example.com",
      }),
    );
    const body = await parseJson(response);
    const checkoutIntent = body.checkoutIntent as Record<string, unknown>;

    assert.equal(response.status, 424);
    assert.equal(checkoutIntent.status, "blocked");
    assert.equal(checkoutIntent.errorCode, "checkout_session_required");
    assert.match(String(body.error), /Checkout Session mode/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public checkout creates Stripe session with email-stable PayShield identity", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PRICE_ID = "price_public_access";
  process.env.PAYSHIELD_CORE_API_URL = "https://core.payshield.test";
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-secret";
  process.env.STRIPE_SECRET_KEY = "sk_test_public_checkout";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const originalFetch = globalThis.fetch;
  const coreBodies: Record<string, unknown>[] = [];
  let stripeBody = "";

  globalThis.fetch = async (input, init) => {
    const url = String(input);

    if (url === "https://api.stripe.com/v1/checkout/sessions") {
      stripeBody = String(init?.body ?? "");

      return new Response(
        JSON.stringify({
          id: "cs_test_public_household",
          url: "https://checkout.stripe.com/c/pay/cs_test_public_household",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    }

    const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
      string,
      unknown
    >;

    coreBodies.push(requestBody);

    return new Response(
      JSON.stringify({
        checkoutIntent: {
          checkoutMode: requestBody.checkoutMode ?? "not_configured",
          checkoutUrlPresent: Boolean(requestBody.checkoutUrlPresent),
          errorCode: requestBody.errorCode || null,
          idempotencyKey: requestBody.idempotencyKey,
          priceLabel: requestBody.priceLabel ?? "$19/month",
          providerCheckoutId: requestBody.providerCheckoutId ?? null,
          providerName: "stripe",
          status: requestBody.status,
          userId: "email_public",
        },
        persistence: {
          persisted: true,
          persistence: "postgres",
        },
        service: "payshield-checkout-intent",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const response = await startPublicCheckout(
      makeRequest("/api/public/billing/checkout", {
        email: "Buyer@Example.com",
        name: "Buyer Household",
      }),
    );
    const body = await parseJson(response);
    const form = new URLSearchParams(stripeBody);
    const userId = String(form.get("client_reference_id") ?? "");

    assert.equal(response.status, 200);
    assert.equal(body.url, "https://checkout.stripe.com/c/pay/cs_test_public_household");
    assert.equal(coreBodies.length, 2);
    assert.equal(coreBodies[0]?.status, "requested");
    assert.equal(coreBodies[1]?.status, "created");
    assert.equal(form.get("customer_email"), "buyer@example.com");
    assert.match(userId, /^email_[a-f0-9]{32}$/);
    assert.equal(
      form.get("metadata[payshield_customer_email]"),
      "buyer@example.com",
    );
    assert.equal(form.get("metadata[payshield_user_id]"), userId);
    assert.equal(
      form.get("subscription_data[metadata][payshield_customer_email]"),
      "buyer@example.com",
    );
    assert.equal(
      form.get("subscription_data[metadata][payshield_user_id]"),
      userId,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("billing webhook fails closed without Stripe signing secret", async () => {
  const payload = JSON.stringify({
    data: { object: { id: "cs_test_missing_secret" } },
    id: "evt_missing_secret",
    type: "checkout.session.completed",
  });
  const response = await billingWebhook(
    makeStripeWebhookRequest(payload, "whsec_test", Math.floor(Date.now() / 1000)),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.match(String(body.error), /signing secret/i);
});

test("billing webhook rejects oversized raw payloads before signature handling", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const payload = JSON.stringify({
    data: {
      object: {
        id: "cs_test_oversized",
        metadata: {
          note: "x".repeat(70_000),
        },
      },
    },
    id: "evt_oversized",
    type: "checkout.session.completed",
  });
  const response = await billingWebhook(
    makeStripeWebhookRequest(payload, "whsec_test", Math.floor(Date.now() / 1000)),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 413);
  assert.equal(body.error, "Request body is too large.");
  assert.equal(body.service, "payshield-stripe-webhook");
});

test("billing webhook fails closed when paid-access state cannot persist to core", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

  const payload = JSON.stringify({
    data: {
      object: {
        amount_total: 1900,
        client_reference_id: "user_demo_001",
        customer_details: {
          email: "payer@example.com",
        },
        customer: "cus_test",
        id: "cs_test_paid",
        mode: "subscription",
        payment_status: "paid",
        status: "complete",
        subscription: "sub_test",
      },
    },
    id: "evt_checkout_paid",
    type: "checkout.session.completed",
  });
  const response = await billingWebhook(
    makeStripeWebhookRequest(payload, "whsec_test", Math.floor(Date.now() / 1000)),
  );
  const body = await parseJson(response);
  const summary = body.summary as Record<string, unknown>;

  assert.equal(response.status, 503);
  assert.equal(body.accepted, false);
  assert.equal(body.received, false);
  assert.equal(body.persisted, false);
  assert.match(String(body.error), /paid-access state was not persisted/i);
  assert.equal(summary.accessStatus, "active");
  assert.equal(summary.customerEmail, "payer@example.com");
  assert.equal(summary.customerId, "cus_test");
  assert.equal(summary.subscriptionId, "sub_test");
  assert.equal(summary.subscriptionStatus, "active");
});

test("billing webhook forwards verified paid-access events to core", async () => {
  process.env.PAYSHIELD_CORE_API_URL = "https://core.payshield.test";
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-secret";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const originalFetch = globalThis.fetch;
  let capturedAuthorization = "";
  let capturedBody = "";
  let capturedUrl = "";

  globalThis.fetch = async (input, init) => {
    capturedAuthorization = String(
      (init?.headers as Headers | Record<string, string>) instanceof Headers
        ? (init?.headers as Headers).get("authorization") ?? ""
        : (init?.headers as Record<string, string>)?.authorization ?? "",
    );
    capturedBody = String(init?.body ?? "");
    capturedUrl = String(input);

    return new Response(
      JSON.stringify({
        accepted: true,
        accessStatus: "active",
        persisted: true,
        persistence: {
          persisted: true,
          persistence: "postgres",
        },
        service: "payshield-commercial-billing",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 200,
      },
    );
  };

  try {
    const payload = JSON.stringify({
      data: {
        object: {
          amount_total: 1900,
          client_reference_id: "user_demo_001",
          customer_details: {
            email: "payer@example.com",
          },
          customer: "cus_test",
          id: "cs_test_paid",
          mode: "subscription",
          payment_status: "paid",
          status: "complete",
          subscription: "sub_test",
        },
      },
      id: "evt_checkout_paid_forwarded",
      type: "checkout.session.completed",
    });
    const response = await billingWebhook(
      makeStripeWebhookRequest(
        payload,
        "whsec_test",
        Math.floor(Date.now() / 1000),
      ),
    );
    const body = await parseJson(response);
    const forwarded = JSON.parse(capturedBody) as Record<string, unknown>;
    const summary = forwarded.summary as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.accepted, true);
    assert.equal(body.persisted, true);
    assert.equal(capturedUrl, "https://core.payshield.test/api/commercial/billing-events");
    assert.equal(capturedAuthorization, "Bearer core-secret");
    assert.equal(forwarded.providerName, "stripe");
    assert.equal(summary.accessStatus, "active");
    assert.equal(summary.customerEmail, "payer@example.com");
    assert.equal(summary.customerId, "cus_test");
    assert.equal(summary.subscriptionId, "sub_test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("billing webhook attaches invoice events through nested subscription metadata", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

  const payload = JSON.stringify({
    data: {
      object: {
        amount_paid: 1900,
        customer: "cus_invoice",
        customer_email: "buyer@example.com",
        id: "in_paid",
        parent: {
          subscription_details: {
            metadata: {
              payshield_customer_email: "buyer@example.com",
              payshield_user_id: "email_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
            subscription: "sub_invoice",
          },
        },
        status: "paid",
      },
    },
    id: "evt_invoice_paid",
    type: "invoice.payment_succeeded",
  });
  const response = await billingWebhook(
    makeStripeWebhookRequest(payload, "whsec_test", Math.floor(Date.now() / 1000)),
  );
  const body = await parseJson(response);
  const summary = body.summary as Record<string, unknown>;

  assert.equal(response.status, 503);
  assert.equal(body.accepted, false);
  assert.equal(body.persisted, false);
  assert.equal(summary.accessStatus, "active");
  assert.equal(summary.amountPaidCents, 1900);
  assert.equal(summary.customerEmail, "buyer@example.com");
  assert.equal(summary.customerId, "cus_invoice");
  assert.equal(summary.invoiceId, "in_paid");
  assert.equal(summary.subscriptionId, "sub_invoice");
  assert.equal(summary.subscriptionStatus, "active");
  assert.equal(summary.userId, "email_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
});

test("money workflows require activation-ready paid access or the dedicated core before commercial operations", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL =
    "https://buy.stripe.com/live_paid_access";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

  const coreCases: Array<[string, () => Promise<Response>]> = [
    [
      "bank linking",
      () =>
        createBankLinkToken(
          makeRequest("/api/app/bank-link/token", {
            origin: endpoint,
          }),
        ),
    ],
    [
      "paycheck detection setup",
      () =>
        savePaycheckRule(
          makeRequest("/api/app/paychecks/rules", {
            employerNamePattern: "ACME PAYROLL",
            minimumAmountCents: 150_000,
            ruleName: "ACME payroll",
          }),
        ),
    ],
    [
      "paycheck detection",
      () =>
        detectPaycheck(
          makeRequest("/api/app/paychecks/detect", {
            amountCents: 300_000,
            employerName: "Acme Payroll",
            idempotencyKey: "route-paid-gate-paycheck",
          }),
        ),
    ],
    [
      "linked-bank paycheck sync",
      () =>
        syncPaychecks(
          makeRequest("/api/app/paychecks/sync", {
            maxPages: 1,
          }),
        ),
    ],
    ["provider onboarding", () => startOnboarding()],
    [
      "direct deposit setup",
      () =>
        setupDirectDeposit(
          makeRequest("/api/app/direct-deposit", {
            idempotencyKey: "route-paid-gate-direct-deposit",
          }),
        ),
    ],
    [
      "protected bucket profile changes",
      () =>
        saveBuckets(
          makeRequest("/api/app/buckets", {
            action: "replace_profile",
            buckets: [
              {
                due: "1st",
                id: "rent",
                name: "Rent",
                protection: "bill_only",
                targetCents: 50_000,
              },
            ],
          }),
        ),
    ],
    [
      "protected payee controls",
      () =>
        createPayee(
          makeRequest("/api/app/payees", {
            allowedBucketId: "rent",
            maxCents: 95_000,
            name: "New landlord",
          }),
        ),
    ],
    [
      "protected transfers",
      () =>
        createTransfer(
          makeRequest("/api/app/transfers", {
            amountCents: 25_000,
            destinationPayeeId: "payee_abc_apartments",
            idempotencyKey: "route-paid-gate-transfer",
            sourceBucketId: "rent",
          }),
        ),
    ],
    [
      "bill payment controls",
      () =>
        scheduleBillPayment(
          makeRequest("/api/app/bill-payments", {
            amountCents: 50_000,
            idempotencyKey: "route-paid-gate-bill",
            payeeId: "payee_abc_apartments",
            scheduledFor: "2026-07-01",
          }),
        ),
    ],
    [
      "protected bucket unlocks",
      () =>
        unlockBucket(
          makeRequest("/api/app/unlocks", {
            amountCents: 5_000,
            bucketId: "emergency",
            idempotencyKey: "route-paid-gate-unlock",
            mode: "slow_free",
            reason: "Temporary cash need",
          }),
        ),
    ],
    [
      "card authorization",
      () =>
        authorizeCard(
          makeRequest("/api/card/authorize", {
            amountCents: 2_500,
            idempotencyKey: "route-paid-gate-card",
            merchantName: "Corner Market",
          }),
        ),
    ],
    [
      "provider webhook ingestion",
      () =>
        providerWebhook(
          makeRequest("/api/provider/webhooks", {
            eventId: "evt_paid_gate_provider",
            type: "transactions.sync",
          }),
        ),
    ],
  ];

  for (const [operation, request] of coreCases) {
    const response = await request();
    const body = await parseJson(response);

    assert.equal(response.status, 503, operation);
    assert.equal(body.code, "core_service_required", operation);
    assert.equal(
      String(body.error).includes("PAYSHIELD_CORE_API_URL"),
      true,
      `${operation} should name the missing core service`,
    );
  }
});

test("bank link token requires the dedicated authenticated core service", async () => {
  const response = await createBankLinkToken(
    makeRequest("/api/app/bank-link/token", {}),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-bank-link-token");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("bank link token still refuses local Plaid handling when credentials are present without core", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";

  const response = await createBankLinkToken(
    makeRequest("/api/app/bank-link/token", {}),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-bank-link-token");
  assert.match(String(body.error), /dedicated PayShield core service/);
});

test("linked-bank paycheck sync requires the dedicated core custody path", async () => {
  const response = await syncPaychecks(
    makeRequest("/api/app/paychecks/sync", {
      maxPages: 1,
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-paycheck-transaction-sync");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("direct deposit route requires the dedicated authenticated core service", async () => {
  const response = await setupDirectDeposit(
    makeRequest("/api/app/direct-deposit", {
      idempotencyKey: "route-direct-deposit-primary",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-direct-deposit-setup");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("direct deposit route rejects oversized configured-core request bodies before proxying", async () => {
  process.env.PAYSHIELD_CORE_API_URL = "https://core.payshield.test";
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-secret";
  const originalFetch = globalThis.fetch;
  let coreCalls = 0;

  globalThis.fetch = async () => {
    coreCalls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  try {
    const response = await setupDirectDeposit(
      makeRawRequest(
        "/api/app/direct-deposit",
        JSON.stringify({
          idempotencyKey: "route-direct-deposit-primary",
          notes: "x".repeat(20_000),
        }),
      ),
    );
    const body = await parseJson(response);

    assert.equal(response.status, 413);
    assert.equal(body.error, "Request body is too large.");
    assert.equal(body.service, "payshield-direct-deposit-setup");
    assert.equal(coreCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("paycheck detection requires the dedicated core instead of local ledger simulation", async () => {
  const response = await detectPaycheck(
    makeRequest("/api/app/paychecks/detect", {
      amountCents: 300_000,
      employerName: "Acme Payroll",
      idempotencyKey: "route-paycheck-detect",
      receivedAt: "2026-07-01T12:00:00.000Z",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-paycheck-detection");
  assert.match(String(body.error), /dedicated PayShield core service/);
});

test("paycheck detection rule route requires durable core storage", async () => {
  const response = await savePaycheckRule(
    makeRequest("/api/app/paychecks/rules", {
      employerNamePattern: "ACME PAYROLL",
      expectedFrequency: "biweekly",
      idempotencyKey: "route-rule-acme-payroll",
      maximumAmountCents: 250_000,
      minimumAmountCents: 150_000,
      ruleName: "ACME payroll",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-paycheck-detection-rules");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);

  const invalid = await savePaycheckRule(
    makeRequest("/api/app/paychecks/rules", {
      employerNamePattern: "ACME PAYROLL",
      maximumAmountCents: 150_000,
      minimumAmountCents: 150_000,
      ruleName: "Invalid payroll",
    }),
  );
  const invalidBody = await parseJson(invalid);

  assert.equal(invalid.status, 503);
  assert.equal(invalidBody.code, "core_service_required");
});

test("transfer route requires the dedicated authenticated core service", async () => {
  const response = await createTransfer(
    makeRequest("/api/app/transfers", {
      amountCents: 25_000,
      destinationPayeeId: "payee_abc_apartments",
      idempotencyKey: "route-transfer-rent",
      sourceBucketId: "rent",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-transfer-intents");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("card authorization route requires the dedicated authenticated core service", async () => {
  const response = await authorizeCard(
    makeRequest("/api/card/authorize", {
      amountCents: 8_000,
      idempotencyKey: "route-card-8000",
      merchantName: "Grocery market",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-card-authorization");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("unlock route requires the dedicated authenticated core service", async () => {
  const response = await unlockBucket(
    makeRequest("/api/app/unlocks", {
      amountCents: 20_000,
      bucketId: "rent",
      idempotencyKey: "route-unlock-rent",
      mode: "slow_free",
      reason: "Emergency repair",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-unlocks");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("payee route requires the dedicated authenticated core service", async () => {
  const response = await createPayee(
    makeRequest("/api/app/payees", {
      allowedBucketId: "rent",
      maxCents: 95_000,
      name: "New landlord",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-payees");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("bill payment route requires the dedicated authenticated core service", async () => {
  const response = await scheduleBillPayment(
    makeRequest("/api/app/bill-payments", {
      amountCents: 50_000,
      idempotencyKey: "route-bill-rent",
      memo: "July rent",
      payeeId: "payee_abc_apartments",
      scheduledFor: "2026-07-01",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-bill-payments");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("bill payment route refuses local validation without the core service", async () => {
  const invalidDate = await scheduleBillPayment(
    makeRequest("/api/app/bill-payments", {
      amountCents: 50_000,
      payeeId: "payee_abc_apartments",
      scheduledFor: "July 1",
    }),
  );
  const unapprovedPayee = await scheduleBillPayment(
    makeRequest("/api/app/bill-payments", {
      amountCents: 50_000,
      payeeId: "payee_missing",
      scheduledFor: "2026-07-01",
    }),
  );
  const invalidBody = await parseJson(invalidDate);
  const unapprovedBody = await parseJson(unapprovedPayee);

  assert.equal(invalidDate.status, 503);
  assert.equal(unapprovedPayee.status, 503);
  assert.equal(invalidBody.code, "core_service_required");
  assert.equal(unapprovedBody.code, "core_service_required");
});

test("provider webhook route requires the dedicated authenticated core service", async () => {
  const response = await providerWebhook(
    makeRequest("/api/provider/webhooks", {
      eventId: "evt_provider_core_required",
      type: "deposit.posted",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-provider-webhook");
  assert.match(String(body.error), /PAYSHIELD_CORE_API_URL/);
});

test("provider webhook route refuses local signature handling even when a webhook secret is present", async () => {
  process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "provider-webhook-secret";

  const response = await providerWebhook(
    makeProviderWebhookRequest(
      {
        access_token: "access-token-should-not-return",
        eventId: "evt_signed_income_provider",
        processor_token: "processor-token-should-not-return",
        providerName: "plaid",
        routing_number: "021000021",
        transactions: [
          {
            account_id: "acc_payroll",
            account_number: "123456789",
            amount: -1875.42,
            date: "2026-06-12",
            item_id: "item_payroll",
            name: "ACME PAYROLL",
            pending: false,
            personal_finance_category: {
              detailed: "INCOME_WAGES",
              primary: "INCOME",
            },
            transaction_id: "txn_payroll_001",
          },
          {
            account_id: "acc_payroll",
            amount: 42.99,
            date: "2026-06-12",
            item_id: "item_payroll",
            name: "Coffee shop",
            pending: false,
            personal_finance_category: {
              detailed: "FOOD_AND_DRINK_COFFEE",
              primary: "FOOD_AND_DRINK",
            },
            transaction_id: "txn_debit_001",
          },
          {
            account_id: "acc_payroll",
            amount: -25_000,
            date: "2026-06-12",
            item_id: "item_payroll",
            name: "OVERSIZED PAYROLL",
            pending: false,
            personal_finance_category: {
              detailed: "INCOME_WAGES",
              primary: "INCOME",
            },
            transaction_id: "txn_payroll_too_large",
          },
        ],
        type: "transactions.sync",
      },
      "provider-webhook-secret",
    ),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_required");
  assert.equal(body.service, "payshield-provider-webhook");
  assert.match(String(body.error), /dedicated PayShield core service/);
  assert.equal(JSON.stringify(body).includes("access-token-should-not-return"), false);
  assert.equal(JSON.stringify(body).includes("processor-token-should-not-return"), false);
  assert.equal(JSON.stringify(body).includes("021000021"), false);
});
