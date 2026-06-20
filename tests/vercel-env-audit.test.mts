import assert from "node:assert/strict";
import { test } from "node:test";
import { auditVercelEnvList } from "../scripts/vercel-env-audit.mjs";

const productionOnly = `
Vercel CLI 54.9.1 (Node.js 22.22.2)
Retrieving project...
> Environment Variables found for james-projects-397b955f/payshield [227ms]

 name                       value               environments        created
 NEXT_PUBLIC_SITE_URL       Encrypted           Production          11h ago
`;

test("reports missing paid-traffic webhook variables in demo-capture env state", () => {
  const result = auditVercelEnvList({ text: productionOnly });

  assert.equal(result.ok, false);
  assert.deepEqual(result.configured, ["NEXT_PUBLIC_SITE_URL"]);
  assert.deepEqual(result.missing, [
    "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
    "PAYSHIELD_WAITLIST_WEBHOOK_URL",
    "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
  ]);
  assert.deepEqual(result.wrongEnvironment, []);
});

test("passes when required variables exist for production", () => {
  const result = auditVercelEnvList({
    text: `
      NEXT_PUBLIC_SITE_URL                 Encrypted           Production          11h ago
      PAYSHIELD_WAITLIST_WEBHOOK_URL       Encrypted           Production          1m ago
      PAYSHIELD_WAITLIST_WEBHOOK_SECRET    Encrypted           Production          1m ago
      PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK   Encrypted           Production          1m ago
    `,
  });

  assert.equal(result.ok, true);
  assert.equal((result as { capturePath: string }).capturePath, "webhook");
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.wrongEnvironment, []);
});

test("passes when Vercel-native Upstash capture variables exist for production", () => {
  const result = auditVercelEnvList({
    text: `
      NEXT_PUBLIC_SITE_URL                 Encrypted           Production          11h ago
      PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK   Encrypted           Production          1m ago
      PAYSHIELD_WAITLIST_STORAGE           Encrypted           Production          1m ago
      UPSTASH_REDIS_REST_URL               Encrypted           Production          1m ago
      UPSTASH_REDIS_REST_TOKEN             Encrypted           Production          1m ago
    `,
  });

  assert.equal(result.ok, true);
  assert.equal((result as { capturePath: string }).capturePath, "upstash");
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.wrongEnvironment, []);
});

test("passes when Vercel-native Blob capture variables exist for production", () => {
  const result = auditVercelEnvList({
    text: `
      NEXT_PUBLIC_SITE_URL                 Encrypted           Production          11h ago
      PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK   Encrypted           Production          1m ago
      PAYSHIELD_WAITLIST_STORAGE           Encrypted           Production          1m ago
      BLOB_READ_WRITE_TOKEN                Encrypted           Production          1m ago
    `,
  });

  assert.equal(result.ok, true);
  assert.equal((result as { capturePath: string }).capturePath, "blob");
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.wrongEnvironment, []);
});

test("flags variables that exist outside the required environment", () => {
  const result = auditVercelEnvList({
    text: `
      NEXT_PUBLIC_SITE_URL                 Encrypted           Production          11h ago
      PAYSHIELD_WAITLIST_WEBHOOK_URL       Encrypted           Preview             1m ago
      PAYSHIELD_WAITLIST_WEBHOOK_SECRET    Encrypted           Preview             1m ago
      PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK   Encrypted           Production          1m ago
    `,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.wrongEnvironment, [
    "PAYSHIELD_WAITLIST_WEBHOOK_URL",
    "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
  ]);
});

test("commercial profile reports the revenue, access, bank, detection, movement, and live-control gates", () => {
  const result = auditVercelEnvList({
    profile: "commercial",
    text: productionOnly,
  }) as {
    groups: Array<{
      key: string;
      missing: string[];
      setupCommands: string[];
    }>;
    missing: string[];
    ok: boolean;
    profile: string;
    setupCommands: string[];
  };
  const revenue = result.groups.find((group) => group.key === "revenue");
  const bank = result.groups.find((group) => group.key === "bank_connection");
  const movement = result.groups.find((group) => group.key === "money_movement");

  assert.equal(result.ok, false);
  assert.equal(result.profile, "commercial");
  assert.equal(result.groups.length, 6);
  assert.deepEqual(revenue?.missing, [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "PAYSHIELD_CORE_API_URL",
    "PAYSHIELD_CORE_SERVICE_TOKEN",
    "PAYSHIELD_COMMERCIAL_PRICE_ID or PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
  ]);
  assert.equal(bank?.missing.includes("PLAID_SECRET"), true);
  assert.equal(
    bank?.missing.includes(
      "PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL",
    ),
    true,
  );
  assert.equal(
    bank?.missing.includes("PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY"),
    true,
  );
  assert.equal(movement?.missing.includes("PAYSHIELD_BAAS_ADAPTER"), true);
  assert.equal(movement?.missing.includes("PAYSHIELD_BAAS_API_BASE_URL"), true);
  assert.equal(movement?.missing.includes("PAYSHIELD_BAAS_API_KEY"), true);
  assert.equal(
    result.setupCommands.includes(
      "npx vercel env add PAYSHIELD_BAAS_API_KEY production",
    ),
    true,
  );
});

test("commercial profile passes when production revenue and money-rail variables exist", () => {
  const result = auditVercelEnvList({
    profile: "commercial",
    text: `
      STRIPE_SECRET_KEY                         Encrypted           Production          1m ago
      STRIPE_WEBHOOK_SECRET                     Encrypted           Production          1m ago
      PAYSHIELD_COMMERCIAL_PRICE_ID             Encrypted           Production          1m ago
      PAYSHIELD_CORE_API_URL                    Encrypted           Production          1m ago
      PAYSHIELD_CORE_SERVICE_TOKEN              Encrypted           Production          1m ago
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY         Encrypted           Production          1m ago
      CLERK_SECRET_KEY                          Encrypted           Production          1m ago
      PLAID_ENV                                 Encrypted           Production          1m ago
      PLAID_CLIENT_ID                           Encrypted           Production          1m ago
      PLAID_SECRET                              Encrypted           Production          1m ago
      PAYSHIELD_TOKEN_VAULT_KEY_ID              Encrypted           Production          1m ago
      PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET      Encrypted           Production          1m ago
      PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY      Encrypted           Production          1m ago
      PAYSHIELD_PROVIDER_WEBHOOK_SECRET         Encrypted           Production          1m ago
      PAYSHIELD_LEDGER_DATABASE_URL             Encrypted           Production          1m ago
      PAYSHIELD_LEDGER_SCHEMA_VERIFIED          Encrypted           Production          1m ago
      PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION  Encrypted           Production          1m ago
      PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE    Encrypted           Production          1m ago
      PAYSHIELD_TRANSFER_ENABLED                Encrypted           Production          1m ago
      PAYSHIELD_BAAS_PROVIDER                   Encrypted           Production          1m ago
      PAYSHIELD_BAAS_ADAPTER                    Encrypted           Production          1m ago
      PAYSHIELD_BAAS_API_BASE_URL               Encrypted           Production          1m ago
      PAYSHIELD_BAAS_API_KEY                    Encrypted           Production          1m ago
      PAYSHIELD_BAAS_CONTRACT_APPROVED          Encrypted           Production          1m ago
      PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED    Encrypted           Production          1m ago
      PAYSHIELD_REGULATED_COUNSEL_SIGNOFF       Encrypted           Production          1m ago
      PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED    Encrypted           Production          1m ago
      PAYSHIELD_LIVE_MONEY_ENABLED              Encrypted           Production          1m ago
    `,
  }) as {
    configured: string[];
    groups: Array<{
      alternatives: Array<{ configured: string[]; ok: boolean }>;
      key: string;
      ok: boolean;
    }>;
    missing: string[];
    ok: boolean;
    wrongEnvironment: string[];
  };
  const revenue = result.groups.find((group) => group.key === "revenue");

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.wrongEnvironment, []);
  assert.equal(result.groups.every((group) => group.ok), true);
  assert.deepEqual(revenue?.alternatives[0]?.configured, [
    "PAYSHIELD_COMMERCIAL_PRICE_ID",
  ]);
  assert.equal(result.configured.includes("PLAID_SECRET"), true);
});

test("all profile combines capture and commercial production gates", () => {
  const result = auditVercelEnvList({
    profile: "all",
    text: `
      NEXT_PUBLIC_SITE_URL                       Encrypted           Production          1m ago
      PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK         Encrypted           Production          1m ago
      PAYSHIELD_WAITLIST_WEBHOOK_URL             Encrypted           Production          1m ago
      PAYSHIELD_WAITLIST_WEBHOOK_SECRET          Encrypted           Production          1m ago
      STRIPE_SECRET_KEY                          Encrypted           Production          1m ago
      STRIPE_WEBHOOK_SECRET                      Encrypted           Production          1m ago
      PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL      Encrypted           Production          1m ago
    `,
  }) as {
    capture: { ok: boolean };
    capturePath: string;
    commercial: { ok: boolean };
    missing: string[];
    ok: boolean;
    profile: string;
  };

  assert.equal(result.profile, "all");
  assert.equal(result.capture.ok, true);
  assert.equal(result.capturePath, "webhook");
  assert.equal(result.commercial.ok, false);
  assert.equal(result.ok, false);
  assert.equal(result.missing.includes("CLERK_SECRET_KEY"), true);
});
