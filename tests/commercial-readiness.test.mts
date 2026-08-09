import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCommercialReadiness } from "../scripts/commercial-readiness.mjs";

function readyEvidence() {
  return {
    health: {
      ok: true,
      service: "payshield-web-app",
      status: "healthy",
    },
    membership: {
      available: true,
      membership: { priceLabel: "$19/month" },
      service: "payshield-membership-status",
      status: "available",
    },
  };
}

test("commercial readiness requires live membership and product controls", () => {
  const result = evaluateCommercialReadiness(readyEvidence());

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.equal(result.checks.length, 4);
});

test("commercial readiness reports unavailable checkout without leaking gate details", () => {
  const evidence = readyEvidence();
  evidence.membership.available = false;
  evidence.membership.status = "unavailable";
  const result = evaluateCommercialReadiness(evidence);

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /not available/i);
  assert.doesNotMatch(JSON.stringify(result), /STRIPE_SECRET_KEY|PLAID_SECRET/);
});
