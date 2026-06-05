import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
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
      storageConfigured?: unknown;
      storageMisconfigured?: unknown;
      storageProvider?: unknown;
      webhookConfigured?: unknown;
      webhookSigningConfigured?: unknown;
    };
  };
}

beforeEach(() => {
  delete process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK;
  delete process.env.PAYSHIELD_WAITLIST_STORAGE;
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET;
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
});

test("reports demo waitlist mode without exposing webhook details", async () => {
  const response = GET();
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.ok, true);
  assert.equal(body.service, "payshield-market-site");
  assert.equal(body.waitlist?.mode, "demo");
  assert.equal(body.waitlist?.paidTrafficReady, false);
  assert.equal(body.waitlist?.storageConfigured, false);
  assert.equal(body.waitlist?.storageMisconfigured, false);
  assert.equal(body.waitlist?.storageProvider, null);
  assert.equal(body.waitlist?.webhookConfigured, false);
  assert.equal(body.waitlist?.webhookSigningConfigured, false);
  assert.equal(serialized.includes("PAYSHIELD_WAITLIST_WEBHOOK_SECRET"), false);
  assert.equal(serialized.includes("UPSTASH_REDIS_REST_TOKEN"), false);
});

test("reports unhealthy when webhook persistence is required but missing", async () => {
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";

  const response = GET();
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.waitlist?.mode, "demo");
  assert.equal(body.waitlist?.requireWebhook, true);
  assert.equal(body.waitlist?.paidTrafficReady, false);
});

test("reports unhealthy when webhook persistence is required but unsigned", async () => {
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = "https://example.com/webhook";
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";

  const response = GET();
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.waitlist?.mode, "webhook");
  assert.equal(body.waitlist?.webhookConfigured, true);
  assert.equal(body.waitlist?.webhookSigningConfigured, false);
  assert.equal(body.waitlist?.paidTrafficReady, false);
  assert.equal(serialized.includes("https://example.com/webhook"), false);
});

test("reports paid-traffic ready when signed webhook persistence is required and configured", async () => {
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = "https://example.com/webhook";
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET = "secret-value";
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";

  const response = GET();
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.waitlist?.mode, "webhook");
  assert.equal(body.waitlist?.webhookConfigured, true);
  assert.equal(body.waitlist?.webhookSigningConfigured, true);
  assert.equal(body.waitlist?.paidTrafficReady, true);
  assert.equal(serialized.includes("https://example.com/webhook"), false);
  assert.equal(serialized.includes("secret-value"), false);
});

test("reports paid-traffic ready when Upstash persistence is required and configured", async () => {
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";
  process.env.PAYSHIELD_WAITLIST_STORAGE = "upstash";
  process.env.UPSTASH_REDIS_REST_URL = "https://known-lion.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-secret";

  const response = GET();
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.waitlist?.mode, "upstash");
  assert.equal(body.waitlist?.paidTrafficReady, true);
  assert.equal(body.waitlist?.storageConfigured, true);
  assert.equal(body.waitlist?.storageMisconfigured, false);
  assert.equal(body.waitlist?.storageProvider, "upstash");
  assert.equal(body.waitlist?.webhookConfigured, false);
  assert.equal(body.waitlist?.webhookSigningConfigured, false);
  assert.equal(serialized.includes("known-lion.upstash.io"), false);
  assert.equal(serialized.includes("upstash-secret"), false);
});

test("reports unhealthy when Upstash persistence is selected but missing credentials", async () => {
  process.env.PAYSHIELD_WAITLIST_STORAGE = "upstash";

  const response = GET();
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.waitlist?.mode, "upstash");
  assert.equal(body.waitlist?.storageConfigured, false);
  assert.equal(body.waitlist?.storageMisconfigured, true);
  assert.equal(body.waitlist?.paidTrafficReady, false);
});
