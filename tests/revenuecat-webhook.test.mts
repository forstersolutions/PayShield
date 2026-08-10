import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { NextRequest } from "next/server.js";

import { POST as revenueCatWebhook } from "../src/app/api/app/billing/revenuecat/webhook/route.ts";
import {
  parseRevenueCatWebhook,
  summarizeRevenueCatBillingEvent,
  verifyRevenueCatAuthorization,
} from "../src/app/lib/commercial/revenuecat-webhook.ts";

const managedEnvironment = [
  "PAYSHIELD_CORE_API_URL",
  "PAYSHIELD_CORE_SERVICE_TOKEN",
  "PAYSHIELD_MOBILE_STORE_BILLING_ENABLED",
  "PAYSHIELD_REVENUECAT_ENTITLEMENT_ID",
  "PAYSHIELD_REVENUECAT_WEBHOOK_SECRET",
] as const;
const originalEnvironment = Object.fromEntries(
  managedEnvironment.map((name) => [name, process.env[name]]),
);
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;

  for (const name of managedEnvironment) {
    const value = originalEnvironment[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

function revenueCatEvent(overrides: Record<string, unknown> = {}) {
  return {
    app_user_id: "user_clerk_123",
    currency: "USD",
    entitlement_ids: ["payshield_pro"],
    environment: "SANDBOX",
    event_timestamp_ms: Date.now(),
    expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
    id: "rc_evt_001",
    original_app_user_id: "user_clerk_123",
    original_transaction_id: "rc_original_001",
    price_in_purchased_currency: 19,
    product_id: "payshield_monthly",
    store: "APP_STORE",
    transaction_id: "rc_transaction_001",
    type: "INITIAL_PURCHASE",
    ...overrides,
  };
}

function summarize(overrides: Record<string, unknown> = {}) {
  const event = revenueCatEvent(overrides);

  return summarizeRevenueCatBillingEvent({
    entitlementId: "payshield_pro",
    event,
    eventId: String(event.id),
    eventType: String(event.type),
  });
}

test("RevenueCat webhook authorization is exact and timing safe", () => {
  assert.equal(
    verifyRevenueCatAuthorization({
      authorization: "Bearer rc_webhook_secret",
      secret: "rc_webhook_secret",
    }).ok,
    true,
  );
  assert.equal(
    verifyRevenueCatAuthorization({
      authorization: "Bearer wrong",
      secret: "rc_webhook_secret",
    }).ok,
    false,
  );
  assert.equal(
    verifyRevenueCatAuthorization({ authorization: "", secret: "" }).ok,
    false,
  );
});

test("RevenueCat subscription lifecycle preserves access until expiration", () => {
  const purchase = summarize();
  const cancellation = summarize({ id: "rc_evt_cancel", type: "CANCELLATION" });
  const expiration = summarize({ id: "rc_evt_expired", type: "EXPIRATION" });
  const billingIssue = summarize({ id: "rc_evt_billing", type: "BILLING_ISSUE" });

  assert.equal(purchase.handled, true);
  assert.equal(purchase.accessStatus, "active");
  assert.equal(purchase.amountPaidCents, 1900);
  assert.equal(purchase.userId, "user_clerk_123");
  assert.equal(cancellation.accessStatus, "active");
  assert.equal(cancellation.cancelAtPeriodEnd, true);
  assert.equal(expiration.accessStatus, "canceled");
  assert.equal(billingIssue.accessStatus, "past_due");
});

test("RevenueCat events cannot activate the wrong entitlement or an anonymous user", () => {
  const wrongEntitlement = summarize({ entitlement_ids: ["another_product"] });
  const anonymous = summarize({
    aliases: [],
    app_user_id: "$RCAnonymousID:anonymous",
    original_app_user_id: "$RCAnonymousID:anonymous",
  });

  assert.equal(wrongEntitlement.handled, false);
  assert.equal(wrongEntitlement.accessStatus, "ignored");
  assert.equal(anonymous.handled, false);
  assert.equal(anonymous.userId, null);
});

test("RevenueCat parser rejects malformed and incomplete payloads", () => {
  assert.equal(parseRevenueCatWebhook("{").event, null);
  assert.equal(parseRevenueCatWebhook(JSON.stringify({ event: {} })).event, null);
});

test("authenticated RevenueCat events are forwarded to durable core access storage", async () => {
  process.env.PAYSHIELD_CORE_API_URL = "https://core.payshield.test";
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-service-secret";
  process.env.PAYSHIELD_MOBILE_STORE_BILLING_ENABLED = "true";
  process.env.PAYSHIELD_REVENUECAT_ENTITLEMENT_ID = "payshield_pro";
  process.env.PAYSHIELD_REVENUECAT_WEBHOOK_SECRET = "rc_webhook_secret";
  let forwardedBody = "";
  let forwardedAuthorization = "";
  let forwardedUrl = "";

  globalThis.fetch = async (input, init) => {
    forwardedUrl = String(input);
    forwardedBody = String(init?.body || "");
    forwardedAuthorization = new Headers(init?.headers).get("authorization") || "";

    return Response.json(
      {
        accepted: true,
        persisted: true,
        service: "payshield-commercial-billing",
      },
      { status: 200 },
    );
  };

  const response = await revenueCatWebhook(
    new NextRequest("https://payshield.test/api/app/billing/revenuecat/webhook", {
      body: JSON.stringify({ api_version: "1.0", event: revenueCatEvent() }),
      headers: {
        authorization: "Bearer rc_webhook_secret",
        "content-type": "application/json",
      },
      method: "POST",
    }),
  );
  const forwarded = JSON.parse(forwardedBody) as Record<string, unknown>;
  const summary = forwarded.summary as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(forwardedUrl, "https://core.payshield.test/api/commercial/billing-events");
  assert.equal(forwardedAuthorization, "Bearer core-service-secret");
  assert.equal(forwarded.providerName, "revenuecat");
  assert.equal(summary.accessStatus, "active");
  assert.equal(summary.userId, "user_clerk_123");
});

test("RevenueCat endpoint fails closed without configured authentication", async () => {
  delete process.env.PAYSHIELD_REVENUECAT_WEBHOOK_SECRET;
  const response = await revenueCatWebhook(
    new NextRequest("https://payshield.test/api/app/billing/revenuecat/webhook", {
      body: JSON.stringify({ api_version: "1.0", event: revenueCatEvent() }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.status, 503);
});
