import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { beforeEach, test } from "node:test";
import { NextRequest } from "next/server.js";
import { POST as authorizeCard } from "../src/app/api/card/authorize/route.ts";
import { POST as startCheckout } from "../src/app/api/app/billing/checkout/route.ts";
import { POST as openBillingPortal } from "../src/app/api/app/billing/portal/route.ts";
import { POST as billingWebhook } from "../src/app/api/app/billing/webhook/route.ts";
import { POST as createBankLinkToken } from "../src/app/api/app/bank-link/token/route.ts";
import { GET as getActivation } from "../src/app/api/app/activation/route.ts";
import { GET as exportAudit } from "../src/app/api/app/audit/export/route.ts";
import { GET as getBalances } from "../src/app/api/app/balances/route.ts";
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
  delete process.env.PAYSHIELD_BAAS_API_KEY;
  delete process.env.PAYSHIELD_BAAS_CONTRACT_APPROVED;
  delete process.env.PAYSHIELD_BAAS_PROVIDER;
  delete process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL;
  delete process.env.PAYSHIELD_COMMERCIAL_PRICE_ID;
  delete process.env.PAYSHIELD_CORE_API_URL;
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
});

test("activation endpoint exposes operator launch checklist and smoke commands", async () => {
  const response = await getActivation();
  const body = await parseJson(response);
  const activationPlan = body.activationPlan as Record<string, unknown>;
  const currentState = body.currentState as Record<string, unknown>;
  const nextAction = body.nextAction as Record<string, unknown>;
  const operatorRunbook = body.operatorRunbook as Record<string, unknown>;
  const smokeCommands = operatorRunbook.smokeCommands as string[];

  assert.equal(response.status, 200);
  assert.equal(body.service, "payshield-activation-console");
  assert.equal(activationPlan.nextStageKey, "revenue");
  assert.equal(nextAction.primaryEndpoint, "POST /api/app/billing/checkout");
  assert.equal(
    smokeCommands.some((command) => command.includes("/api/app/activation")),
    true,
  );
  assert.equal(operatorRunbook.activationEndpoint, "/api/app/activation");
  assert.equal(
    Array.isArray(operatorRunbook.remainingGates),
    true,
  );
  assert.equal(
    (currentState.commercialAccess as Record<string, unknown>).state,
    "needs_setup",
  );
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

test("bucket endpoint loads editable household profile templates", async () => {
  const response = await getBuckets();
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(body.buckets), true);
  assert.equal(body.persisted, false);
  assert.equal(body.profilePersistence, "stateless_model");
  assert.equal(body.profileSource, "local_simulation");
  assert.equal(Array.isArray(body.templates), true);
  assert.equal((body.templates as string[]).includes("Childcare"), true);
});

test("bucket endpoint saves customizable protected bucket profile", async () => {
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
  const buckets = body.buckets as Array<Record<string, unknown>>;

  assert.equal(response.status, 200);
  assert.equal(body.persisted, false);
  assert.equal(body.protectedCents, 70_000);
  assert.equal(body.profilePersistence, "stateless_model");
  assert.equal(body.profileSource, "local_simulation");
  assert.equal(body.safeToSpendPreviewCents, 230_000);
  assert.equal(buckets[0]?.priority, 10);
  assert.equal(buckets[1]?.id, "custom_childcare");
  assert.equal(
    body.safeSpendRule,
    "Safe to Spend is computed only after protected buckets fund.",
  );
});

test("onboarding fails closed until live-money gates are configured", async () => {
  const response = await startOnboarding();
  const body = await parseJson(response);

  assert.equal(response.status, 423);
  assert.equal((body.liveMoney as Record<string, unknown>).ok, false);
  assert.equal((body.customer as Record<string, unknown>).status, "blocked");
  assert.equal((body.card as Record<string, unknown>).status, "blocked");
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

test("paid access checkout blocks payment links without activation persistence", async () => {
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
  const readiness = body.readiness as Record<string, unknown>;
  const checkoutIntent = body.checkoutIntent as Record<string, unknown>;

  assert.equal(response.status, 424);
  assert.equal(readiness.checkoutConfigured, true);
  assert.equal(readiness.checkoutOperationalReady, false);
  assert.equal(checkoutIntent.status, "blocked");
  assert.equal(checkoutIntent.errorCode, "checkout_activation_not_ready");
});

test("paid access checkout session uses the authenticated customer identity", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PRICE_ID = "price_payShield";
  process.env.PAYSHIELD_CORE_API_URL = "https://core.payshield.test";
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
    assert.equal(form.get("metadata[payshield_user_id]"), "user_clerk_123");
    assert.equal(
      form.get("subscription_data[metadata][payshield_user_id]"),
      "user_clerk_123",
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

test("billing webhook verifies Stripe signature and summarizes paid access", async () => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

  const payload = JSON.stringify({
    data: {
      object: {
        amount_total: 1900,
        client_reference_id: "user_demo_001",
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

  assert.equal(response.status, 200);
  assert.equal(body.received, true);
  assert.equal(body.persisted, false);
  assert.equal(summary.accessStatus, "active");
  assert.equal(summary.customerId, "cus_test");
  assert.equal(summary.subscriptionId, "sub_test");
  assert.equal(summary.subscriptionStatus, "active");
});

test("money workflows require activation-ready paid access before commercial operations", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL =
    "https://buy.stripe.com/live_paid_access";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

  const cases: Array<[string, () => Promise<Response>]> = [
    [
      "bank linking",
      () =>
        createBankLinkToken(
          makeRequest("/api/app/bank-link/token", {
            origin: endpoint,
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
  ];

  for (const [operation, request] of cases) {
    const response = await request();
    const body = await parseJson(response);

    assert.equal(response.status, 402, operation);
    assert.equal(body.code, "paid_access_not_configured", operation);
    assert.equal(
      String(body.error).includes(operation),
      true,
      `${operation} should be named in the paid-access error`,
    );
    assert.equal(body.service, "payshield-paid-access-gate", operation);
  }
});

test("bank link token fails closed until Plaid is configured", async () => {
  const response = await createBankLinkToken(
    makeRequest("/api/app/bank-link/token", {}),
  );
  const body = await parseJson(response);
  const readiness = body.readiness as Record<string, unknown>;

  assert.equal(response.status, 424);
  assert.equal(readiness.plaidConfigured, false);
  assert.equal(Array.isArray(readiness.missing), true);
});

test("bank link token requires signed token-vault handoff before Plaid Link", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";

  const response = await createBankLinkToken(
    makeRequest("/api/app/bank-link/token", {}),
  );
  const body = await parseJson(response);
  const readiness = body.readiness as Record<string, unknown>;
  const missing = readiness.missing as string[];

  assert.equal(response.status, 424);
  assert.equal(readiness.plaidConfigured, true);
  assert.equal(readiness.tokenVaultConfigured, true);
  assert.equal(readiness.tokenVaultStoreReady, false);
  assert.equal(missing.includes("PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL"), true);
  assert.equal(missing.includes("PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET"), true);
});

test("direct deposit route records paycheck routing setup", async () => {
  const response = await setupDirectDeposit(
    makeRequest("/api/app/direct-deposit", {
      idempotencyKey: "route-direct-deposit-primary",
    }),
  );
  const body = await parseJson(response);
  const directDeposit = body.directDeposit as Record<string, unknown>;
  const persistence = body.persistence as Record<string, unknown>;
  const setup = body.setup as Record<string, unknown>;

  assert.equal(response.status, 423);
  assert.equal(body.service, "payshield-direct-deposit-setup");
  assert.equal(body.persisted, false);
  assert.equal(directDeposit.providerStatus, "gated");
  assert.equal(directDeposit.routingLast4, "----");
  assert.equal(persistence.persistence, "memory");
  assert.equal(setup.status, "blocked");
  assert.equal(setup.idempotencyKey, "route-direct-deposit-primary");
});

test("paycheck detection posts a split before safe spend", async () => {
  const response = await detectPaycheck(
    makeRequest("/api/app/paychecks/detect", {
      amountCents: 300_000,
      employerName: "Acme Payroll",
      idempotencyKey: "route-paycheck-detect",
      receivedAt: "2026-07-01T12:00:00.000Z",
    }),
  );
  const body = await parseJson(response);
  const entry = body.ledgerEntry as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.protectedCents, 155_000);
  assert.equal(body.safeToSpendCents, 145_000);
  assert.equal(entry.type, "paycheck_deposit");
});

test("paycheck detection rule route validates recurring payroll setup", async () => {
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
  const rule = body.rule as Record<string, unknown>;
  const amountRange = rule.amountRangeCents as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.service, "payshield-paycheck-detection-rules");
  assert.equal(body.persisted, false);
  assert.equal(rule.ruleName, "ACME payroll");
  assert.equal(rule.expectedFrequency, "biweekly");
  assert.equal(amountRange.min, 150_000);

  const invalid = await savePaycheckRule(
    makeRequest("/api/app/paychecks/rules", {
      employerNamePattern: "ACME PAYROLL",
      maximumAmountCents: 150_000,
      minimumAmountCents: 150_000,
      ruleName: "Invalid payroll",
    }),
  );
  const invalidBody = await parseJson(invalid);

  assert.equal(invalid.status, 400);
  assert.equal(
    invalidBody.error,
    "maximumAmountCents must be greater than minimumAmountCents.",
  );
});

test("transfer route validates bucket funds and returns provider gate", async () => {
  const response = await createTransfer(
    makeRequest("/api/app/transfers", {
      amountCents: 25_000,
      destinationPayeeId: "payee_abc_apartments",
      idempotencyKey: "route-transfer-rent",
      sourceBucketId: "rent",
    }),
  );
  const body = await parseJson(response);
  const providerTransfer = body.providerTransfer as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(providerTransfer.status, "blocked");

  const rejected = await createTransfer(
    makeRequest("/api/app/transfers", {
      amountCents: 999_999,
      destinationPayeeId: "payee_abc_apartments",
      sourceBucketId: "rent",
    }),
  );

  assert.equal(rejected.status, 400);
});

test("card authorization route approves safe-spend purchase in simulation mode", async () => {
  const response = await authorizeCard(
    makeRequest("/api/card/authorize", {
      amountCents: 8_000,
      idempotencyKey: "route-card-8000",
      merchantName: "Grocery market",
    }),
  );
  const body = await parseJson(response);
  const decision = body.decision as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.mode, "simulation");
  assert.equal(decision.approved, true);
  assert.equal(decision.bucketId, "safe_spending");
});

test("card authorization route declines unsafe ordinary spend", async () => {
  const response = await authorizeCard(
    makeRequest("/api/card/authorize", {
      amountCents: 180_000,
      idempotencyKey: "route-card-180000",
      merchantName: "Furniture store",
    }),
  );
  const body = await parseJson(response);
  const decision = body.decision as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(decision.approved, false);
  assert.equal(decision.code, "insufficient_safe_spend");
});

test("unlock route returns recovery plan", async () => {
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
  const result = body.result as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(result.unlockedCents, 20_000);
  assert.equal(result.recoveryPerCheckCents, 10_000);
});

test("payee route models protected-bucket payee pending provider approval", async () => {
  const response = await createPayee(
    makeRequest("/api/app/payees", {
      allowedBucketId: "rent",
      maxCents: 95_000,
      name: "New landlord",
    }),
  );
  const body = await parseJson(response);
  const payee = body.payee as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(payee.allowedBucketId, "rent");
  assert.equal(payee.status, "provider_pending");
});

test("bill payment route schedules approved payee from protected bucket", async () => {
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
  const decision = body.decision as Record<string, unknown>;
  const providerBillPayment = body.providerBillPayment as Record<
    string,
    unknown
  >;

  assert.equal(response.status, 200);
  assert.equal(decision.accepted, true);
  assert.equal(decision.code, "scheduled");
  assert.equal(decision.bucketId, "rent");
  assert.equal(providerBillPayment.status, "blocked");
  assert.equal(
    body.message,
    "Bill payment scheduled in the protected bucket model. Provider execution requires active money-movement controls.",
  );
});

test("bill payment route rejects invalid or unsafe schedule requests", async () => {
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
  const unapprovedBody = await parseJson(unapprovedPayee);
  const decision = unapprovedBody.decision as Record<string, unknown>;

  assert.equal(invalidDate.status, 400);
  assert.equal(unapprovedPayee.status, 400);
  assert.equal(decision.accepted, false);
  assert.equal(decision.code, "payee_not_allowed");
});

test("provider webhook route accepts events but reports blocked mode without provider gates", async () => {
  const response = await providerWebhook(
    makeRequest("/api/provider/webhooks", {
      eventId: "evt_demo",
      type: "deposit.posted",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 202);
  assert.equal(body.accepted, true);
  assert.equal(body.mode, "blocked");
  assert.equal(body.providerWebhookAuthenticity, "not_required");
});

test("provider webhook route fails closed in production without signing secret", async () => {
  process.env.VERCEL_ENV = "production";

  const response = await providerWebhook(
    makeRequest("/api/provider/webhooks", {
      eventId: "evt_unsigned_production_provider",
      type: "transactions.sync",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.accepted, false);
  assert.equal(body.mode, "blocked");
  assert.equal(body.providerWebhookAuthenticity, "missing_secret");
  assert.match(String(body.error), /PAYSHIELD_PROVIDER_WEBHOOK_SECRET/);
});

test("provider webhook route requires signature when provider webhook secret is configured", async () => {
  process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "provider-webhook-secret";

  const unsigned = await providerWebhook(
    makeRequest("/api/provider/webhooks", {
      eventId: "evt_unsigned_provider",
      type: "transactions.sync",
    }),
  );
  const unsignedBody = await parseJson(unsigned);

  assert.equal(unsigned.status, 401);
  assert.equal(unsignedBody.accepted, false);
  assert.match(String(unsignedBody.error), /signed raw body/i);

  const signed = await providerWebhook(
    makeProviderWebhookRequest(
      {
        eventId: "evt_signed_provider",
        type: "transactions.sync",
      },
      "provider-webhook-secret",
    ),
  );
  const signedBody = await parseJson(signed);

  assert.equal(signed.status, 202);
  assert.equal(signedBody.accepted, true);
  assert.equal(signedBody.mode, "blocked");
  assert.equal(signedBody.providerWebhookAuthenticity, "verified");
});
