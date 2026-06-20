import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeDockerCoreSmoke } from "../scripts/smoke-core-service.mjs";

test("summarizes Docker core smoke output without exposing service token", () => {
  const result = summarizeDockerCoreSmoke({
    authorizedBalances: {
      body: {
        identityPersistence: {
          persistence: "postgres_required",
        },
      },
      response: {
        status: 503,
      },
    },
    cardAuthorization: {
      body: {
        identityPersistence: {
          persistence: "postgres_required",
        },
      },
      response: {
        status: 503,
      },
    },
    billPayment: {
      body: {
        identityPersistence: {
          persistence: "postgres_required",
        },
      },
      response: {
        status: 503,
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
        identityPersistence: {
          persistence: "postgres_required",
        },
      },
      response: {
        status: 503,
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
  assert.equal(result.safeToSpendCents, null);
  assert.equal(result.durableStorage.required, true);
  assert.equal(result.durableStorage.status, 503);
  assert.equal(result.authorization.serviceTokenConfigured, true);
  assert.equal(result.authorization.protectedRouteStatusWithoutToken, 401);
  assert.equal(result.authorization.protectedRouteStatusWithToken, 503);
  assert.equal(result.cardAuthorization.approved, false);
  assert.equal(result.cardAuthorization.persistence, "postgres_required");
  assert.equal(result.billPayment.accepted, false);
  assert.equal(result.billPayment.persistence, "postgres_required");
  assert.equal(result.onboarding.status, 503);
  assert.equal(serialized.includes("core-smoke-"), false);
  assert.equal(serialized.includes("PAYSHIELD_CORE_SERVICE_TOKEN"), false);
});
