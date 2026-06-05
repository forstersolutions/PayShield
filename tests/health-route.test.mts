import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../src/app/api/health/route.ts";

async function parseJson(response: Response) {
  return (await response.json()) as {
    ok?: unknown;
    service?: unknown;
    siteUrl?: unknown;
    waitlist?: {
      mode?: unknown;
      paidTrafficReady?: unknown;
      requireWebhook?: unknown;
      webhookConfigured?: unknown;
    };
  };
}

test("reports demo waitlist mode without exposing webhook details", async () => {
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET;
  delete process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK;

  const response = GET();
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.ok, true);
  assert.equal(body.service, "payshield-market-site");
  assert.equal(body.waitlist?.mode, "demo");
  assert.equal(body.waitlist?.paidTrafficReady, false);
  assert.equal(body.waitlist?.webhookConfigured, false);
  assert.equal(serialized.includes("PAYSHIELD_WAITLIST_WEBHOOK_SECRET"), false);
});

test("reports unhealthy when webhook persistence is required but missing", async () => {
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";

  try {
    const response = GET();
    const body = await parseJson(response);

    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.waitlist?.mode, "demo");
    assert.equal(body.waitlist?.requireWebhook, true);
    assert.equal(body.waitlist?.paidTrafficReady, false);
  } finally {
    delete process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK;
  }
});

test("reports paid-traffic ready when webhook persistence is required and configured", async () => {
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = "https://example.com/webhook";
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET = "secret-value";
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";

  try {
    const response = GET();
    const body = await parseJson(response);
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.waitlist?.mode, "webhook");
    assert.equal(body.waitlist?.webhookConfigured, true);
    assert.equal(body.waitlist?.paidTrafficReady, true);
    assert.equal(serialized.includes("https://example.com/webhook"), false);
    assert.equal(serialized.includes("secret-value"), false);
  } finally {
    delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
    delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET;
    delete process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK;
  }
});
