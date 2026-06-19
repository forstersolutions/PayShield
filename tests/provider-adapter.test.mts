import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  getBankingProvider,
  ProviderAdapterError,
} from "../src/app/lib/neobank/provider.ts";

const envKeys = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "PAYSHIELD_BAAS_ADAPTER",
  "PAYSHIELD_BAAS_API_BASE_URL",
  "PAYSHIELD_BAAS_API_KEY",
  "PAYSHIELD_BAAS_CONTRACT_APPROVED",
  "PAYSHIELD_BAAS_PROVIDER",
  "PAYSHIELD_CORE_API_URL",
  "PAYSHIELD_CORE_SERVICE_TOKEN",
  "PAYSHIELD_LEDGER_DATABASE_URL",
  "PAYSHIELD_LEDGER_SCHEMA_VERIFIED",
  "PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION",
  "PAYSHIELD_LIVE_MONEY_ENABLED",
  "PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED",
  "PAYSHIELD_REGULATED_COUNSEL_SIGNOFF",
  "PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED",
  "VERCEL_ENV",
];
const originalFetch = globalThis.fetch;

function resetEnv() {
  for (const key of envKeys) {
    delete process.env[key];
  }
}

function setLiveProviderEnv() {
  process.env.CLERK_SECRET_KEY = "clerk-secret";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test";
  process.env.PAYSHIELD_BAAS_ADAPTER = "http_json";
  process.env.PAYSHIELD_BAAS_API_BASE_URL = "http://127.0.0.1:8999";
  process.env.PAYSHIELD_BAAS_API_KEY = "provider-key";
  process.env.PAYSHIELD_BAAS_CONTRACT_APPROVED = "true";
  process.env.PAYSHIELD_BAAS_PROVIDER = "marqeta";
  process.env.PAYSHIELD_CORE_API_URL = "http://127.0.0.1:8080";
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-secret";
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgres://payshield:secret@example.invalid:5432/ledger";
  process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED = "true";
  process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION = "0010";
  process.env.PAYSHIELD_LIVE_MONEY_ENABLED = "true";
  process.env.PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED = "true";
  process.env.PAYSHIELD_REGULATED_COUNSEL_SIGNOFF = "true";
  process.env.PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED = "true";
}

beforeEach(() => {
  resetEnv();
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  resetEnv();
  globalThis.fetch = originalFetch;
});

test("live banking provider creates transfers through the configured adapter URL", async () => {
  setLiveProviderEnv();
  const calls: Array<{ body: Record<string, unknown>; url: string }> = [];

  globalThis.fetch = async (input, init) => {
    calls.push({
      body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown>,
      url: String(input),
    });

    return Response.json({
      providerTransferId: "tr_provider_123",
      requestId: "req_provider_123",
    });
  };

  const provider = getBankingProvider();
  const transfer = await provider.createAchTransfer({
    amountCents: 2500,
    destinationPayeeId: "payee_abc_apartments",
    idempotencyKey: "transfer-test",
    sourceBucketId: "rent",
  });

  assert.deepEqual(transfer, {
    providerTransferId: "tr_provider_123",
    status: "created",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "http://127.0.0.1:8999/ach-transfers");
  assert.equal(calls[0]?.body.operation, "createAchTransfer");
  assert.equal(calls[0]?.body.providerName, "marqeta");
});

test("live banking provider rejects adapter responses missing provider ids", async () => {
  setLiveProviderEnv();
  globalThis.fetch = async () => Response.json({ ok: true });

  const provider = getBankingProvider();

  await assert.rejects(
    () =>
      provider.createBillPayment({
        amountCents: 9900,
        idempotencyKey: "bill-test",
        payee: {
          allowedBucketId: "rent",
          id: "payee_abc_apartments",
          maxCents: 100_000,
          name: "ABC Apartments",
          status: "approved",
        },
      }),
    ProviderAdapterError,
  );
});
