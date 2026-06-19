import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCommercialReadiness } from "../scripts/commercial-readiness.mjs";

const expectedSiteUrl = "https://payshield-lime.vercel.app";

function readyHealth(overrides: Record<string, unknown> = {}) {
  return {
    commercial: {
      activationCoreServiceAuthConfigured: true,
      checkoutConfigured: true,
      mode: "checkout",
      paidAccessReady: true,
      priceLabel: "$19/month",
      remainingGates: [],
      webhookSigningSecretConfigured: true,
    },
    moneyRails: {
      bankLinkReady: true,
      detectionMode: "plaid_transactions_sync",
      paycheckDetectionReady: true,
      plaidConfigured: true,
      providerAdapterConfigured: true,
      providerAdapterMissing: [],
      remainingGates: [],
      tokenVaultConfigured: true,
      tokenVaultStoreReady: true,
      transferConfigured: true,
      transferReady: true,
    },
    neobank: {
      backendConfigured: true,
      clerkConfigured: true,
      liveMoneyReady: true,
      mode: "live_provider",
      postgresSchemaVerified: true,
      postgresSchemaVersion: "0010",
      providerConfigured: true,
      remainingGates: [],
    },
    ok: true,
    service: "payshield-web-app",
    siteUrl: expectedSiteUrl,
    waitlist: {
      mode: "blob",
      paidTrafficReady: true,
      requireWebhook: true,
      storageConfigured: true,
      storageProvider: "blob",
    },
    ...overrides,
  };
}

test("commercial readiness passes only when revenue, rails, backend, auth, provider, and ledger gates are ready", () => {
  const result = evaluateCommercialReadiness({
    expectedSiteUrl,
    health: readyHealth(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
  assert.equal(result.remainingGates.length, 0);
  assert.equal(result.commercial.paidAccess, "ready");
  assert.equal(result.moneyRails.bankLink, "ready");
  assert.equal(result.moneyRails.tokenVault, "ready");
  assert.equal(result.moneyRails.transfer, "ready");
  assert.equal(result.neobank.liveMoney, "ready");
});

test("commercial readiness fails with actionable gates for current architecture-mode production", () => {
  const result = evaluateCommercialReadiness({
    expectedSiteUrl,
    health: readyHealth({
      commercial: {
        checkoutConfigured: false,
        mode: "not_configured",
        paidAccessReady: false,
        priceLabel: "$19/month",
        remainingGates: [
          "STRIPE_SECRET_KEY",
          "PAYSHIELD_COMMERCIAL_PRICE_ID or PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
          "STRIPE_WEBHOOK_SECRET",
        ],
        webhookSigningSecretConfigured: false,
      },
      moneyRails: {
        bankLinkReady: false,
        detectionMode: "manual_or_provider_webhook",
        paycheckDetectionReady: false,
        plaidConfigured: false,
        providerAdapterConfigured: false,
        providerAdapterMissing: [
          "PAYSHIELD_BAAS_ADAPTER=http_json",
          "PAYSHIELD_BAAS_API_BASE_URL",
          "PAYSHIELD_BAAS_API_KEY",
          "PAYSHIELD_BAAS_PROVIDER",
        ],
        remainingGates: [
          "PLAID_CLIENT_ID",
          "PLAID_SECRET",
          "PAYSHIELD_TRANSFER_ENABLED",
          "PAYSHIELD_BAAS_ADAPTER=http_json",
          "PAYSHIELD_BAAS_API_BASE_URL",
          "PAYSHIELD_BAAS_API_KEY",
        ],
        tokenVaultConfigured: false,
        tokenVaultStoreReady: false,
        transferConfigured: false,
        transferReady: false,
      },
      neobank: {
        backendConfigured: false,
        clerkConfigured: false,
        liveMoneyReady: false,
        mode: "architecture",
        postgresConfigured: false,
        postgresSchemaVerified: false,
        postgresSchemaVersion: "0010",
        providerConfigured: false,
        remainingGates: [
          "provider_contract",
          "provider_credentials",
          "provider_adapter",
          "sponsor_disclosures",
          "counsel_signoff",
          "operations_runbooks",
          "postgres_ledger",
          "dedicated_backend",
          "clerk_auth",
        ],
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.commercial.paidAccess, "blocked");
  assert.equal(result.moneyRails.bankLink, "blocked");
  assert.equal(result.moneyRails.tokenVault, "blocked");
  assert.equal(result.moneyRails.transfer, "blocked");
  assert.equal(result.neobank.backend, "blocked");
  assert.equal(result.neobank.liveMoney, "blocked");
  assert.equal(result.remainingGates.includes("stripe_checkout"), true);
  assert.equal(result.remainingGates.includes("token_vault_handoff"), true);
  assert.equal(result.remainingGates.includes("bank_link"), true);
  assert.equal(result.remainingGates.includes("transfer_ready"), true);
  assert.equal(result.remainingGates.includes("core_backend"), true);
  assert.equal(result.remainingGates.includes("clerk_auth"), true);
  assert.equal(result.remainingGates.includes("postgres_ledger"), true);
  assert.equal(result.remainingGates.includes("provider_credentials"), true);
  assert.equal(result.remainingGates.includes("provider_adapter"), true);
  assert.equal(
    result.providerReportedGates.includes("STRIPE_WEBHOOK_SECRET"),
    true,
  );
  assert.equal(
    result.providerReportedGates.includes("provider_contract"),
    true,
  );
  assert.equal(
    result.providerReportedGates.includes("provider_adapter"),
    true,
  );
});

test("commercial readiness requires the production URL and current ledger schema version", () => {
  const result = evaluateCommercialReadiness({
    expectedSiteUrl,
    health: readyHealth({
      neobank: {
        backendConfigured: true,
        clerkConfigured: true,
        liveMoneyReady: true,
        mode: "live_provider",
        postgresSchemaVerified: true,
        postgresSchemaVersion: "0005",
        providerConfigured: true,
        remainingGates: [],
      },
      siteUrl: "https://preview.example",
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.remainingGates.includes("site_url"), true);
  assert.equal(result.remainingGates.includes("postgres_ledger"), true);
});

test("commercial readiness requires paid traffic lead capture before commercial launch", () => {
  const result = evaluateCommercialReadiness({
    expectedSiteUrl,
    health: readyHealth({
      waitlist: {
        mode: "demo",
        paidTrafficReady: false,
        requireWebhook: false,
      },
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.remainingGates.includes("paid_traffic_capture"), true);
  assert.match(result.failures.join("\n"), /lead capture/);
});
