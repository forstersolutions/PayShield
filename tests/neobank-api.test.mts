import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { NextRequest } from "next/server.js";
import { POST as authorizeCard } from "../src/app/api/card/authorize/route.ts";
import { POST as startCheckout } from "../src/app/api/app/billing/checkout/route.ts";
import { POST as createBankLinkToken } from "../src/app/api/app/bank-link/token/route.ts";
import { GET as getBalances } from "../src/app/api/app/balances/route.ts";
import {
  GET as getBuckets,
  POST as saveBuckets,
} from "../src/app/api/app/buckets/route.ts";
import { POST as scheduleBillPayment } from "../src/app/api/app/bill-payments/route.ts";
import { GET as getMe } from "../src/app/api/app/me/route.ts";
import { POST as startOnboarding } from "../src/app/api/app/onboarding/start/route.ts";
import { POST as createPayee } from "../src/app/api/app/payees/route.ts";
import { POST as detectPaycheck } from "../src/app/api/app/paychecks/detect/route.ts";
import { POST as createTransfer } from "../src/app/api/app/transfers/route.ts";
import { POST as unlockBucket } from "../src/app/api/app/unlocks/route.ts";
import { POST as providerWebhook } from "../src/app/api/provider/webhooks/route.ts";

const endpoint = "https://payshield.test";

beforeEach(() => {
  delete process.env.CLERK_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  delete process.env.PAYSHIELD_BAAS_API_KEY;
  delete process.env.PAYSHIELD_BAAS_CONTRACT_APPROVED;
  delete process.env.PAYSHIELD_BAAS_PROVIDER;
  delete process.env.PAYSHIELD_BETA_PAYMENT_LINK_URL;
  delete process.env.PAYSHIELD_BETA_PRICE_ID;
  delete process.env.PAYSHIELD_CORE_API_URL;
  delete process.env.PAYSHIELD_LEDGER_DATABASE_URL;
  delete process.env.PAYSHIELD_LIVE_MONEY_ENABLED;
  delete process.env.PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED;
  delete process.env.PAYSHIELD_TRANSFER_ENABLED;
  delete process.env.PLAID_CLIENT_ID;
  delete process.env.PLAID_SECRET;
  delete process.env.PAYSHIELD_REGULATED_COUNSEL_SIGNOFF;
  delete process.env.PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED;
  delete process.env.STRIPE_SECRET_KEY;
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

async function parseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test("me endpoint reports private app state and gated live money", async () => {
  const response = await getMe();
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(body.auth, {
    authMode: "demo",
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

  assert.equal(response.status, 424);
  assert.equal(readiness.checkoutConfigured, false);
  assert.equal(Array.isArray(readiness.missing), true);
});

test("paid access checkout can return a configured payment link", async () => {
  process.env.PAYSHIELD_BETA_PAYMENT_LINK_URL = "https://buy.stripe.com/test_123";

  const response = await startCheckout(
    makeRequest("/api/app/billing/checkout", {
      cancelPath: "/app?billing=cancelled",
      successPath: "/app?billing=active",
    }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.url, "https://buy.stripe.com/test_123");
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
});
