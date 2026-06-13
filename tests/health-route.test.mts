import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { GET } from "../src/app/api/health/route.ts";

async function parseJson(response: Response) {
  return (await response.json()) as {
    ok?: unknown;
    service?: unknown;
    siteUrl?: unknown;
    neobank?: {
      backendConfigured?: unknown;
      postgresConfigured?: unknown;
      postgresSchemaVerified?: unknown;
      postgresSchemaVersion?: unknown;
      remainingGates?: unknown;
    };
    commercial?: {
      paidAccessReady?: unknown;
      priceLabel?: unknown;
      remainingGates?: unknown;
      webhookSigningSecretConfigured?: unknown;
    };
    moneyRails?: {
      bankLinkReady?: unknown;
      paycheckDetectionReady?: unknown;
      tokenVaultConfigured?: unknown;
      tokenVaultStoreReady?: unknown;
      providerWebhookSigningConfigured?: unknown;
      transferReady?: unknown;
    };
    waitlist?: {
      mode?: unknown;
      paidTrafficReady?: unknown;
      requireWebhook?: unknown;
      storageConfigured?: unknown;
      storageMisconfigured?: unknown;
      storageProvider?: unknown;
      webhookConfigured?: unknown;
      webhookEndpointConfigured?: unknown;
      webhookMisconfigured?: unknown;
      webhookSigningConfigured?: unknown;
    };
  };
}

beforeEach(() => {
  delete process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK;
  delete process.env.PAYSHIELD_WAITLIST_STORAGE;
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET;
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
  delete process.env.PAYSHIELD_CORE_API_URL;
  delete process.env.PAYSHIELD_LEDGER_DATABASE_URL;
  delete process.env.PAYSHIELD_LEDGER_SCHEMA_FINGERPRINT;
  delete process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED;
  delete process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION;
  delete process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET;
  delete process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID;
  delete process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET;
  delete process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL;
  delete process.env.PLAID_CLIENT_ID;
  delete process.env.PLAID_SECRET;
  delete process.env.PAYSHIELD_COMMERCIAL_PRICE_ID;
  delete process.env.PAYSHIELD_COMMERCIAL_PRICE_LABEL;
  delete process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.VERCEL_ENV;
});

test("reports demo waitlist mode without exposing webhook details", async () => {
  const response = GET();
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.ok, true);
  assert.equal(body.service, "payshield-web-app");
  assert.equal(body.waitlist?.mode, "demo");
  assert.equal(body.waitlist?.paidTrafficReady, false);
  assert.equal(body.waitlist?.storageConfigured, false);
  assert.equal(body.waitlist?.storageMisconfigured, false);
  assert.equal(body.waitlist?.storageProvider, null);
  assert.equal(body.waitlist?.webhookConfigured, false);
  assert.equal(body.waitlist?.webhookEndpointConfigured, false);
  assert.equal(body.waitlist?.webhookMisconfigured, false);
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
  assert.equal(body.waitlist?.webhookEndpointConfigured, true);
  assert.equal(body.waitlist?.webhookMisconfigured, false);
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
  assert.equal(body.waitlist?.webhookEndpointConfigured, true);
  assert.equal(body.waitlist?.webhookMisconfigured, false);
  assert.equal(body.waitlist?.webhookSigningConfigured, true);
  assert.equal(body.waitlist?.paidTrafficReady, true);
  assert.equal(serialized.includes("https://example.com/webhook"), false);
  assert.equal(serialized.includes("secret-value"), false);
});

test("reports unhealthy when production webhook persistence is not HTTPS", async () => {
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = "http://example.com/webhook";
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET = "secret-value";
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";
  process.env.VERCEL_ENV = "production";

  const response = GET();
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.waitlist?.mode, "webhook");
  assert.equal(body.waitlist?.webhookConfigured, true);
  assert.equal(body.waitlist?.webhookEndpointConfigured, false);
  assert.equal(body.waitlist?.webhookMisconfigured, true);
  assert.equal(body.waitlist?.webhookSigningConfigured, true);
  assert.equal(body.waitlist?.paidTrafficReady, false);
  assert.equal(serialized.includes("http://example.com/webhook"), false);
  assert.equal(serialized.includes("secret-value"), false);
});

test("reports unhealthy when webhook URL includes unsafe secret-bearing parts", async () => {
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL =
    "https://example.com/webhook?token=secret";
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET = "secret-value";
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";
  process.env.VERCEL_ENV = "production";

  const response = GET();
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.waitlist?.mode, "webhook");
  assert.equal(body.waitlist?.webhookConfigured, true);
  assert.equal(body.waitlist?.webhookEndpointConfigured, false);
  assert.equal(body.waitlist?.webhookMisconfigured, true);
  assert.equal(body.waitlist?.webhookSigningConfigured, true);
  assert.equal(body.waitlist?.paidTrafficReady, false);
  assert.equal(serialized.includes("token=secret"), false);
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

test("reports paid-traffic ready when Blob persistence is required and configured", async () => {
  process.env.BLOB_READ_WRITE_TOKEN = "blob-secret";
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";
  process.env.PAYSHIELD_WAITLIST_STORAGE = "blob";

  const response = GET();
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.waitlist?.mode, "blob");
  assert.equal(body.waitlist?.paidTrafficReady, true);
  assert.equal(body.waitlist?.storageConfigured, true);
  assert.equal(body.waitlist?.storageMisconfigured, false);
  assert.equal(body.waitlist?.storageProvider, "blob");
  assert.equal(body.waitlist?.webhookConfigured, false);
  assert.equal(body.waitlist?.webhookSigningConfigured, false);
  assert.equal(serialized.includes("blob-secret"), false);
});

test("reports unhealthy when Blob persistence is selected but missing token", async () => {
  process.env.PAYSHIELD_WAITLIST_STORAGE = "blob";

  const response = GET();
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.waitlist?.mode, "blob");
  assert.equal(body.waitlist?.storageConfigured, false);
  assert.equal(body.waitlist?.storageMisconfigured, true);
  assert.equal(body.waitlist?.paidTrafficReady, false);
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

test("does not count an unsafe core URL as a configured regulated backend", async () => {
  process.env.PAYSHIELD_CORE_API_URL = "https://user:secret@example.com/core";

  const response = GET();
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);
  const remainingGates = body.neobank?.remainingGates as string[];

  assert.equal(response.status, 200);
  assert.equal(body.neobank?.backendConfigured, false);
  assert.equal(remainingGates.includes("dedicated_backend"), true);
  assert.equal(serialized.includes("user:secret"), false);
});

test("does not count a Postgres URL as ready until ledger schema is verified", async () => {
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgres://payshield:secret@example.invalid:5432/ledger";

  const urlOnly = GET();
  const urlOnlyBody = await parseJson(urlOnly);
  const urlOnlyRemaining = urlOnlyBody.neobank?.remainingGates as string[];

  assert.equal(urlOnlyBody.neobank?.postgresConfigured, true);
  assert.equal(urlOnlyBody.neobank?.postgresSchemaVerified, false);
  assert.equal(urlOnlyBody.neobank?.postgresSchemaVersion, "0008");
  assert.equal(urlOnlyRemaining.includes("postgres_ledger"), true);

  process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED = "true";
  process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION = "0008";

  const verified = GET();
  const verifiedBody = await parseJson(verified);
  const verifiedRemaining = verifiedBody.neobank?.remainingGates as string[];

  assert.equal(verifiedBody.neobank?.postgresConfigured, true);
  assert.equal(verifiedBody.neobank?.postgresSchemaVerified, true);
  assert.equal(verifiedRemaining.includes("postgres_ledger"), false);
});

test("reports commercial and money rail readiness gates", async () => {
  const missing = GET();
  const missingBody = await parseJson(missing);
  const commercialGates = missingBody.commercial?.remainingGates as string[];

  assert.equal(missingBody.commercial?.paidAccessReady, false);
  assert.equal(missingBody.commercial?.priceLabel, "$19/month");
  assert.equal(
    commercialGates.includes("STRIPE_WEBHOOK_SECRET"),
    true,
  );
  assert.equal(missingBody.moneyRails?.bankLinkReady, false);
  assert.equal(missingBody.moneyRails?.transferReady, false);

  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.PAYSHIELD_COMMERCIAL_PRICE_ID = "price_test";
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";

  const configured = GET();
  const configuredBody = await parseJson(configured);

  assert.equal(configuredBody.commercial?.paidAccessReady, true);
  assert.equal(
    configuredBody.commercial?.webhookSigningSecretConfigured,
    true,
  );
  assert.equal(configuredBody.moneyRails?.bankLinkReady, false);
  assert.equal(configuredBody.moneyRails?.paycheckDetectionReady, false);
  assert.equal(configuredBody.moneyRails?.tokenVaultConfigured, true);
  assert.equal(configuredBody.moneyRails?.tokenVaultStoreReady, false);

  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";

  const vaultConfigured = GET();
  const vaultConfiguredBody = await parseJson(vaultConfigured);

  assert.equal(vaultConfiguredBody.moneyRails?.bankLinkReady, true);
  assert.equal(vaultConfiguredBody.moneyRails?.paycheckDetectionReady, false);
  assert.equal(
    vaultConfiguredBody.moneyRails?.providerWebhookSigningConfigured,
    false,
  );
  assert.equal(vaultConfiguredBody.moneyRails?.tokenVaultStoreReady, true);

  process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "provider-webhook-secret";

  const signedProviderConfigured = GET();
  const signedProviderConfiguredBody = await parseJson(signedProviderConfigured);

  assert.equal(
    signedProviderConfiguredBody.moneyRails?.paycheckDetectionReady,
    true,
  );
  assert.equal(
    signedProviderConfiguredBody.moneyRails?.providerWebhookSigningConfigured,
    true,
  );
});
