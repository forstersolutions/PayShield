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

test("reports missing paid-traffic webhook variables in prototype env state", () => {
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
