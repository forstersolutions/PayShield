import assert from "node:assert/strict";
import { test } from "node:test";
import {
  friendlyGateLabel,
  gateCategory,
  uniqueFriendlyGateLabels,
} from "../src/app/lib/readiness-gates.ts";

test("readiness gate labels distinguish money-control runtime from token custody", () => {
  assert.equal(
    friendlyGateLabel("PAYSHIELD_CORE_API_URL"),
    "Money-control runtime",
  );
  assert.equal(
    friendlyGateLabel("PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL"),
    "Token custody receiver",
  );
});

test("readiness gate labels cover revenue, bank, provider, and live-control gates", () => {
  assert.equal(friendlyGateLabel("STRIPE_SECRET_KEY"), "Stripe API key");
  assert.equal(
    friendlyGateLabel("PAYSHIELD_COMMERCIAL_PRICE_ID or PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL"),
    "Checkout price or payment link",
  );
  assert.equal(friendlyGateLabel("PLAID_SECRET"), "Plaid credentials");
  assert.equal(
    friendlyGateLabel("PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY"),
    "Token custody encryption key",
  );
  assert.equal(
    friendlyGateLabel("PAYSHIELD_PROVIDER_WEBHOOK_SECRET"),
    "Provider webhook signing",
  );
  assert.equal(
    friendlyGateLabel("PAYSHIELD_BAAS_API_BASE_URL"),
    "Provider adapter URL",
  );
  assert.equal(friendlyGateLabel("postgres_ledger"), "Verified Supabase ledger");
  assert.equal(friendlyGateLabel("clerk_auth"), "Clerk authentication");
});

test("readiness gate categories keep setup groups stable", () => {
  assert.equal(gateCategory("STRIPE_WEBHOOK_SECRET"), "Revenue");
  assert.equal(gateCategory("PLAID_CLIENT_ID"), "Bank link");
  assert.equal(
    gateCategory("PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL"),
    "Bank link",
  );
  assert.equal(gateCategory("PAYSHIELD_TRANSFER_ENABLED"), "Movement");
  assert.equal(gateCategory("provider_contract"), "Live control");
});

test("friendly gate summaries dedupe duplicate setup blockers", () => {
  assert.deepEqual(
    uniqueFriendlyGateLabels([
      "PLAID_CLIENT_ID",
      "PLAID_SECRET",
      "PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL",
      "PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL",
    ]),
    ["Plaid credentials", "Token custody receiver"],
  );
});
