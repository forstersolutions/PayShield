import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeDockerCoreSmoke } from "../scripts/smoke-core-service.mjs";

test("summarizes Docker core smoke output without exposing service token", () => {
  const result = summarizeDockerCoreSmoke({
    authorizedBalances: {
      body: {
        safeToSpendCents: 145_000,
      },
      response: {
        status: 200,
      },
    },
    cardAuthorization: {
      body: {
        decision: {
          approved: true,
          bucketId: "safe_spending",
        },
        mode: "simulation",
      },
      response: {
        status: 200,
      },
    },
    billPayment: {
      body: {
        decision: {
          accepted: true,
          bucketId: "rent",
          providerStatus: "blocked",
        },
      },
      response: {
        status: 200,
      },
    },
    checks: [
      "Dockerfile.core builds successfully",
      "core container starts with token protection enabled",
    ],
    health: {
      ok: true,
      service: "payshield-core",
    },
    image: "payshield-core:ci-smoke",
    onboarding: {
      body: {
        liveMoney: {
          ok: false,
        },
      },
      response: {
        status: 423,
      },
    },
    unauthorizedBalances: {
      body: {
        error: "Unauthorized",
      },
      response: {
        status: 401,
      },
    },
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.equal(result.safeToSpendCents, 145_000);
  assert.equal(result.authorization.serviceTokenConfigured, true);
  assert.equal(result.authorization.protectedRouteStatusWithoutToken, 401);
  assert.equal(result.authorization.protectedRouteStatusWithToken, 200);
  assert.equal(result.cardAuthorization.approved, true);
  assert.equal(result.billPayment.accepted, true);
  assert.equal(result.billPayment.bucketId, "rent");
  assert.equal(result.billPayment.providerStatus, "blocked");
  assert.equal(result.onboarding.status, 423);
  assert.equal(serialized.includes("core-smoke-"), false);
  assert.equal(serialized.includes("PAYSHIELD_CORE_SERVICE_TOKEN"), false);
});
