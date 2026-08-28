import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { getCommercialReadiness } from "../src/app/lib/commercial/billing.ts";
import { forwardCoreRequest } from "../src/app/lib/neobank/core-client.ts";
import { getCoreServiceConfig } from "../src/app/lib/neobank/core-config.ts";
import { auditSupabaseInfrastructure } from "../scripts/supabase-infra-audit.mjs";
import { checkSupabaseSchema } from "../scripts/supabase-schema.mjs";

const runtimeEnvironment = [
  "PAYSHIELD_COMMERCIAL_PRICE_ID",
  "PAYSHIELD_CORE_API_URL",
  "PAYSHIELD_CORE_RUNTIME",
  "PAYSHIELD_CORE_SERVICE_TOKEN",
  "PAYSHIELD_LEDGER_DATABASE_URL",
  "PAYSHIELD_LEDGER_SCHEMA_VERIFIED",
  "PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION",
  "PAYSHIELD_SUPABASE_SECURITY_VERIFIED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "VERCEL_ENV",
];

beforeEach(() => {
  for (const name of runtimeEnvironment) {
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of runtimeEnvironment) {
    delete process.env[name];
  }
});

function configureVercelRuntime() {
  process.env.PAYSHIELD_CORE_RUNTIME = "vercel";
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgresql://postgres.project:secret@db.us-east-1.pooler.supabase.com:6543/postgres?sslmode=require";
  process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED = "true";
  process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION = "0022";
  process.env.PAYSHIELD_SUPABASE_SECURITY_VERIFIED = "true";
}

test("Vercel runtime fails closed until the Supabase ledger is verified", () => {
  const missingDatabase = getCoreServiceConfig({
    NODE_ENV: "test",
    PAYSHIELD_CORE_RUNTIME: "vercel",
  });
  const missingSecurity = getCoreServiceConfig({
    NODE_ENV: "test",
    PAYSHIELD_CORE_RUNTIME: "vercel",
    PAYSHIELD_LEDGER_DATABASE_URL:
      "postgresql://postgres:secret@localhost:5432/payshield",
    PAYSHIELD_LEDGER_SCHEMA_VERIFIED: "true",
    PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION: "0022",
  });

  assert.equal(missingDatabase.mode, "in_process");
  assert.equal(missingDatabase.ok, false);
  assert.match(String(missingDatabase.error), /Supabase transaction pooler/);
  assert.equal(missingSecurity.mode, "in_process");
  assert.equal(missingSecurity.ok, false);
  assert.match(String(missingSecurity.error), /forced RLS and Data API isolation/);
});

test("Vercel production accepts only a verified Supabase transaction pooler", () => {
  const rejected = getCoreServiceConfig({
    NODE_ENV: "test",
    PAYSHIELD_CORE_RUNTIME: "vercel",
    PAYSHIELD_LEDGER_DATABASE_URL:
      "postgresql://postgres:secret@db.example.com:5432/payshield",
    PAYSHIELD_LEDGER_SCHEMA_VERIFIED: "true",
    PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION: "0022",
    PAYSHIELD_SUPABASE_SECURITY_VERIFIED: "true",
    VERCEL_ENV: "production",
  });
  const accepted = getCoreServiceConfig({
    NODE_ENV: "test",
    PAYSHIELD_CORE_RUNTIME: "vercel",
    PAYSHIELD_LEDGER_DATABASE_URL:
      "postgresql://postgres.project:secret@db.us-east-1.pooler.supabase.com:6543/postgres",
    PAYSHIELD_LEDGER_SCHEMA_VERIFIED: "true",
    PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION: "0022",
    PAYSHIELD_SUPABASE_SECURITY_VERIFIED: "true",
    VERCEL_ENV: "production",
  });

  assert.equal(rejected.ok, false);
  assert.match(String(rejected.error), /transaction-pooler/);
  assert.equal(accepted.mode, "in_process");
  assert.equal(accepted.ok, true);
});

test("membership activation uses the in-process runtime without a service token", () => {
  configureVercelRuntime();
  process.env.PAYSHIELD_COMMERCIAL_PRICE_ID = "price_payshield";
  process.env.STRIPE_SECRET_KEY = "sk_test_payshield";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_payshield";

  const readiness = getCommercialReadiness();

  assert.equal(readiness.activationCoreConfigured, true);
  assert.equal(readiness.activationCoreServiceAuthConfigured, true);
  assert.equal(readiness.activationCoreReady, true);
  assert.equal(readiness.paidAccessReady, true);
  assert.equal(readiness.missing.includes("PAYSHIELD_CORE_SERVICE_TOKEN"), false);
});

test("Vercel facade dispatches core requests in-process", async () => {
  configureVercelRuntime();

  const response = await forwardCoreRequest({
    method: "GET",
    path: "/health",
  });
  const body = (await response?.json()) as Record<string, unknown>;

  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get("x-payshield-core-proxied"), "true");
  assert.equal(body.service, "payshield-core");
  assert.equal(body.status, "healthy");
});

test("Supabase infrastructure and schema source controls pass", async () => {
  const infrastructure = auditSupabaseInfrastructure();
  const schema = await checkSupabaseSchema();

  assert.equal(infrastructure.ok, true, infrastructure.failures.join("; "));
  assert.equal(schema.ok, true, schema.failures.join("; "));
  assert.equal(schema.migrationCount, 1);
});
