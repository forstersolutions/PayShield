import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, test } from "node:test";
import { createCoreServer } from "../services/core/server.mjs";

const coreEnvKeys = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "PAYSHIELD_BAAS_API_KEY",
  "PAYSHIELD_BAAS_CONTRACT_APPROVED",
  "PAYSHIELD_BAAS_PROVIDER",
  "PAYSHIELD_CORE_API_URL",
  "PAYSHIELD_CORE_SERVICE_TOKEN",
  "PAYSHIELD_LEDGER_DATABASE_URL",
  "PAYSHIELD_LIVE_MONEY_ENABLED",
  "PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED",
  "PAYSHIELD_REGULATED_COUNSEL_SIGNOFF",
  "PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED",
];

beforeEach(() => {
  for (const key of coreEnvKeys) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of coreEnvKeys) {
    delete process.env[key];
  }
});

async function withCoreServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const server = createCoreServer();

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

async function getJson(baseUrl: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = (await response.json()) as Record<string, unknown>;

  return { body, response };
}

function jsonPost(payload: unknown, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    method: "POST",
  };
}

test("core health exposes product operation routes and fail-closed readiness", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/health");
    const readiness = body.readiness as Record<string, unknown>;
    const routes = body.routes as string[];

    assert.equal(response.status, 200);
    assert.equal(body.service, "payshield-core");
    assert.equal(readiness.liveMoneyReady, false);
    assert.equal(readiness.backendConfigured, true);
    assert.equal(routes.includes("POST /card/authorize"), true);
    assert.equal(routes.includes("POST /app/onboarding/start"), true);
  });
});

test("core balances endpoint mirrors protected paycheck model", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/api/app/balances");

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body.safeToSpendCents, 145_000);
    assert.equal(body.protectedCents, 155_000);
    assert.equal(Array.isArray(body.buckets), true);
  });
});

test("core bucket profile route saves custom protected bucket rules", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/buckets",
      jsonPost({
        action: "replace_profile",
        buckets: [
          {
            due: "1st",
            id: "rent",
            name: "Rent",
            protection: "bill_only",
            targetCents: 50_000,
          },
          {
            due: "Every check",
            id: "custom_childcare",
            name: "Childcare",
            protection: "hard_lock",
            targetCents: 20_000,
          },
        ],
      }),
    );
    const buckets = body.buckets as Array<Record<string, unknown>>;

    assert.equal(response.status, 200);
    assert.equal(body.protectedCents, 70_000);
    assert.equal(buckets[0]?.priority, 10);
    assert.equal(buckets[1]?.id, "custom_childcare");
    assert.equal(
      body.safeSpendRule,
      "Safe to Spend is computed only after protected buckets fund.",
    );
  });
});

test("core card authorization approves safe spend and declines protected overreach", async () => {
  await withCoreServer(async (baseUrl) => {
    const approved = await getJson(
      baseUrl,
      "/api/card/authorize",
      jsonPost({
        amountCents: 8_000,
        idempotencyKey: "core-card-8000",
        merchantName: "Grocery market",
      }),
    );
    const approvedDecision = approved.body.decision as Record<string, unknown>;

    assert.equal(approved.response.status, 200);
    assert.equal(approved.body.mode, "simulation");
    assert.equal(approvedDecision.approved, true);
    assert.equal(approvedDecision.bucketId, "safe_spending");

    const declined = await getJson(
      baseUrl,
      "/api/card/authorize",
      jsonPost({
        amountCents: 180_000,
        idempotencyKey: "core-card-180000",
        merchantName: "Furniture store",
      }),
    );
    const declinedDecision = declined.body.decision as Record<string, unknown>;

    assert.equal(declined.response.status, 200);
    assert.equal(declinedDecision.approved, false);
    assert.equal(declinedDecision.code, "insufficient_safe_spend");
  });
});

test("core unlock route creates a recovery plan without mutating protected rules", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/unlocks",
      jsonPost({
        amountCents: 20_000,
        bucketId: "rent",
        idempotencyKey: "core-unlock-rent",
        mode: "slow_free",
        reason: "Emergency repair",
      }),
    );
    const result = body.result as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.mode, "simulation");
    assert.equal(result.unlockedCents, 20_000);
    assert.equal(result.recoveryPerCheckCents, 10_000);
  });
});

test("core payee and onboarding routes remain provider-gated until live gates pass", async () => {
  await withCoreServer(async (baseUrl) => {
    const payeeResult = await getJson(
      baseUrl,
      "/api/app/payees",
      jsonPost({
        allowedBucketId: "rent",
        maxCents: 95_000,
        name: "New landlord",
      }),
    );
    const payee = payeeResult.body.payee as Record<string, unknown>;

    assert.equal(payeeResult.response.status, 200);
    assert.equal(payee.allowedBucketId, "rent");
    assert.equal(payee.status, "provider_pending");

    const onboarding = await getJson(
      baseUrl,
      "/api/app/onboarding/start",
      jsonPost({}),
    );
    const liveMoney = onboarding.body.liveMoney as Record<string, unknown>;
    const card = onboarding.body.card as Record<string, unknown>;

    assert.equal(onboarding.response.status, 423);
    assert.equal(liveMoney.ok, false);
    assert.equal(card.status, "blocked");
  });
});

test("core provider webhook accepts object events but rejects invalid JSON shapes", async () => {
  await withCoreServer(async (baseUrl) => {
    const accepted = await getJson(
      baseUrl,
      "/api/provider/webhooks",
      jsonPost({
        eventId: "evt_core_demo",
        type: "deposit.posted",
      }),
    );

    assert.equal(accepted.response.status, 202);
    assert.equal(accepted.body.accepted, true);
    assert.equal(accepted.body.mode, "blocked");

    const rejected = await getJson(
      baseUrl,
      "/api/provider/webhooks",
      jsonPost([]),
    );

    assert.equal(rejected.response.status, 400);
    assert.equal(rejected.body.accepted, false);
  });
});

test("core service token protects internal operation routes when configured", async () => {
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-test-token";

  await withCoreServer(async (baseUrl) => {
    const blocked = await getJson(baseUrl, "/api/app/balances");

    assert.equal(blocked.response.status, 401);
    assert.equal(blocked.body.error, "Unauthorized");

    const authorized = await getJson(baseUrl, "/api/app/balances", {
      headers: {
        authorization: "Bearer core-test-token",
      },
    });

    assert.equal(authorized.response.status, 200);
    assert.equal(authorized.body.safeToSpendCents, 145_000);
  });
});

test("core JSON guardrails reject oversized and malformed request bodies", async () => {
  await withCoreServer(async (baseUrl) => {
    const malformed = await fetch(`${baseUrl}/api/card/authorize`, {
      body: "{",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const malformedBody = (await malformed.json()) as Record<string, unknown>;

    assert.equal(malformed.status, 400);
    assert.equal(malformedBody.error, "Request body must be valid JSON.");

    const oversized = await fetch(`${baseUrl}/api/card/authorize`, {
      body: "x".repeat(70 * 1024),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    const oversizedBody = (await oversized.json()) as Record<string, unknown>;

    assert.equal(oversized.status, 413);
    assert.equal(oversizedBody.error, "Request body is too large.");
  });
});
