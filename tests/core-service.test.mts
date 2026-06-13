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
  "PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
  "PAYSHIELD_COMMERCIAL_PRICE_ID",
  "PAYSHIELD_CORE_API_URL",
  "PAYSHIELD_CORE_DB_CONNECT_TIMEOUT_MS",
  "PAYSHIELD_CORE_SERVICE_TOKEN",
  "PAYSHIELD_LEDGER_DATABASE_URL",
  "PAYSHIELD_LEDGER_SCHEMA_FINGERPRINT",
  "PAYSHIELD_LEDGER_SCHEMA_VERIFIED",
  "PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION",
  "PAYSHIELD_LIVE_MONEY_ENABLED",
  "PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED",
  "PAYSHIELD_REGULATED_COUNSEL_SIGNOFF",
  "PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED",
  "PAYSHIELD_TRANSFER_ENABLED",
  "PAYSHIELD_TOKEN_VAULT_KEY_ID",
  "PLAID_CLIENT_ID",
  "PLAID_SECRET",
  "PLAID_TRANSFER_CLIENT_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
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
    assert.equal(routes.includes("POST /app/bill-payments"), true);
    assert.equal(routes.includes("POST /app/bank-connections"), true);
    assert.equal(routes.includes("GET /app/billing/status"), true);
    assert.equal(routes.includes("POST /commercial/billing-events"), true);
    assert.equal(routes.includes("POST /card/authorize"), true);
    assert.equal(routes.includes("GET /app/operations"), true);
    assert.equal(routes.includes("GET /app/audit/export"), true);
    assert.equal(routes.includes("POST /app/onboarding/start"), true);
    assert.equal(routes.includes("POST /app/paychecks/detect"), true);
    assert.equal(routes.includes("POST /app/transfers"), true);
  });
});

test("core operations endpoint exposes household money-control records", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/api/app/operations");
    const balances = body.balances as Record<string, unknown>;
    const operations = body.operations as Record<string, unknown[]>;
    const statusCards = body.statusCards as Array<Record<string, unknown>>;
    const timeline = body.timeline as Array<Record<string, unknown>>;

    assert.equal(response.status, 200);
    assert.equal(body.service, "payshield-household-operations");
    assert.equal(balances.safeToSpendCents, 145_000);
    assert.equal(balances.protectedCents, 155_000);
    assert.equal(Array.isArray(operations.journalEntries), true);
    assert.equal(
      statusCards.some((card) => card.key === "protected_transfer"),
      true,
    );
    assert.equal(timeline[0]?.status, "posted");
  });
});

test("core audit export packages ledger and operations for support handoff", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/api/app/audit/export");
    const ledger = body.ledger as Record<string, unknown>;
    const support = body.support as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.service, "payshield-audit-export");
    assert.equal(body.exportVersion, "payshield-household-audit-v1");
    assert.equal(ledger.source, "core_control_model");
    assert.equal(Array.isArray(ledger.entries), true);
    assert.equal(support.contact, "support@graystontechnologies.com");
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

test("core postgres gate requires verified ledger schema version", async () => {
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgres://payshield:secret@example.invalid:5432/ledger";

  await withCoreServer(async (baseUrl) => {
    const urlOnly = await getJson(baseUrl, "/health");
    const urlOnlyReadiness = urlOnly.body.readiness as Record<string, unknown>;
    const urlOnlyGates = urlOnlyReadiness.gates as Array<
      Record<string, unknown>
    >;
    const postgresGate = urlOnlyGates.find(
      (gate) => gate.id === "postgres_ledger",
    );

    assert.equal(urlOnlyReadiness.postgresConfigured, true);
    assert.equal(urlOnlyReadiness.postgresSchemaVerified, false);
    assert.equal(urlOnlyReadiness.postgresSchemaVersion, "0005");
    assert.equal(postgresGate?.ok, false);

    process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED = "true";
    process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION = "0002";

    const staleVersion = await getJson(baseUrl, "/health");
    const staleReadiness = staleVersion.body.readiness as Record<
      string,
      unknown
    >;
    const staleGates = staleReadiness.gates as Array<Record<string, unknown>>;

    assert.equal(
      staleGates.find((gate) => gate.id === "postgres_ledger")?.ok,
      false,
    );

    process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION = "0005";

    const verified = await getJson(baseUrl, "/health");
    const verifiedReadiness = verified.body.readiness as Record<
      string,
      unknown
    >;
    const verifiedGates = verifiedReadiness.gates as Array<
      Record<string, unknown>
    >;

    assert.equal(verifiedReadiness.postgresConfigured, true);
    assert.equal(verifiedReadiness.postgresSchemaVerified, true);
    assert.equal(
      verifiedGates.find((gate) => gate.id === "postgres_ledger")?.ok,
      true,
    );
  });
});

test("core commercial billing event intake is idempotent", async () => {
  await withCoreServer(async (baseUrl) => {
    const payload = {
      event: {
        data: {
          object: {
            customer: "cus_test",
            id: "cs_test_paid",
            subscription: "sub_test",
          },
        },
        id: "evt_core_paid",
        type: "checkout.session.completed",
      },
      providerName: "stripe",
      summary: {
        accessStatus: "active",
        amountPaidCents: 1900,
        checkoutSessionId: "cs_test_paid",
        customerId: "cus_test",
        eventId: "evt_core_paid",
        eventType: "checkout.session.completed",
        handled: true,
        subscriptionId: "sub_test",
        subscriptionStatus: "complete",
        userId: "user_demo_001",
      },
    };
    const first = await getJson(
      baseUrl,
      "/api/commercial/billing-events",
      jsonPost(payload),
    );
    const replay = await getJson(
      baseUrl,
      "/api/commercial/billing-events",
      jsonPost(payload),
    );

    assert.equal(first.response.status, 200);
    assert.equal(first.body.accepted, true);
    assert.equal(first.body.accessStatus, "active");
    assert.equal(first.body.householdId, "household_demo_001");
    assert.equal(first.body.persistence, "memory");
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.duplicate, true);

    const status = await getJson(baseUrl, "/api/app/billing/status");
    const commercialAccess = status.body.commercialAccess as Record<string, unknown>;

    assert.equal(status.response.status, 200);
    assert.equal(status.body.service, "payshield-billing-status");
    assert.equal(commercialAccess.state, "active");
    assert.equal(commercialAccess.providerSubscriptionId, "sub_test");
  });
});

test("core bank connection route records Plaid rail readiness", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/bank-connections",
      jsonPost({
        accountId: "acc_test",
        accountMask: "1234",
        accountName: "Household checking",
        institutionName: "Test Bank",
        itemId: "item_test",
        providerName: "plaid",
        tokenSecretRef: "vault://plaid/item_test",
      }),
    );
    const readiness = body.readiness as Record<string, unknown>;
    const bankConnection = body.bankConnection as Record<string, unknown>;
    const auditPersistence = body.auditPersistence as Record<string, unknown>;
    const persistence = body.persistence as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(readiness.bankLinkReady, true);
    assert.equal(bankConnection.status, "connected");
    assert.equal(auditPersistence.persistence, "memory");
    assert.equal(persistence.persistence, "memory");
  });
});

test("core bank connection route scopes records to forwarded household identity", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/bank-connections",
      jsonPost(
        {
          accountId: "acc_household",
          institutionName: "Household Bank",
          itemId: "item_household",
          providerName: "plaid",
          tokenSecretRef: "vault://plaid/item_household",
        },
        {
          headers: {
            "x-payshield-auth-mode": "clerk",
            "x-payshield-user-email": "real-household@example.com",
            "x-payshield-user-id": "user_clerk_household",
            "x-payshield-user-name": "Real Household",
          },
        },
      ),
    );
    const bankConnection = body.bankConnection as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(bankConnection.userId, "user_clerk_household");
    assert.equal(bankConnection.householdId, "household_user_clerk_household");
    assert.equal(bankConnection.institutionName, "Household Bank");
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
    assert.equal(body.persisted, false);
    assert.equal((body.persistence as Record<string, unknown>).persistence, "memory");
    assert.equal(body.protectedCents, 70_000);
    assert.equal(body.profilePersistence, "core_service_model");
    assert.equal(body.profileSource, "core_control_model");
    assert.equal(body.safeToSpendPreviewCents, 230_000);
    assert.equal(buckets[0]?.priority, 10);
    assert.equal(buckets[1]?.id, "custom_childcare");
    assert.equal(
      body.safeSpendRule,
      "Safe to Spend is computed only after protected buckets fund.",
    );
  });
});

test("core bucket profile route fails closed when durable persistence fails", async () => {
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgres://payshield:secret@127.0.0.1:1/ledger";
  process.env.PAYSHIELD_CORE_DB_CONNECT_TIMEOUT_MS = "100";

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
        ],
      }),
    );
    const persistence = body.persistence as Record<string, unknown>;

    assert.equal(response.status, 503);
    assert.equal(body.error, "Bucket profile could not be persisted.");
    assert.equal(persistence.persistence, "postgres_error");
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
    const approvedPersistence = approved.body.decisionPersistence as Record<
      string,
      unknown
    >;
    const approvedJournal = approved.body.journalPersistence as Record<
      string,
      unknown
    >;

    assert.equal(approved.response.status, 200);
    assert.equal(approved.body.mode, "simulation");
    assert.equal(approvedDecision.approved, true);
    assert.equal(approvedDecision.bucketId, "safe_spending");
    assert.equal(approvedPersistence.persistence, "memory");
    assert.equal(approvedJournal.persistence, "memory");

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
    const declinedPersistence = declined.body.decisionPersistence as Record<
      string,
      unknown
    >;
    const declinedJournal = declined.body.journalPersistence as Record<
      string,
      unknown
    >;

    assert.equal(declined.response.status, 200);
    assert.equal(declinedDecision.approved, false);
    assert.equal(declinedDecision.code, "insufficient_safe_spend");
    assert.equal(declinedPersistence.persistence, "memory");
    assert.equal(declinedJournal.persistence, "not_posted");
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
    const decisionPersistence = body.decisionPersistence as Record<
      string,
      unknown
    >;
    const journalPersistence = body.journalPersistence as Record<
      string,
      unknown
    >;

    assert.equal(response.status, 200);
    assert.equal(body.mode, "simulation");
    assert.equal(decisionPersistence.persistence, "memory");
    assert.equal(journalPersistence.persistence, "memory");
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
    assert.equal(
      (payeeResult.body.persistence as Record<string, unknown>).persistence,
      "memory",
    );

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

test("core payee route accepts custom protected bucket controls", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/payees",
      jsonPost({
        allowedBucketId: "custom_childcare",
        maxCents: 125_000,
        name: "Childcare center",
      }),
    );
    const payee = body.payee as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(payee.allowedBucketId, "custom_childcare");
    assert.equal(payee.id, "payee_modeled_childcare_center");
    assert.equal(payee.status, "provider_pending");
  });
});

test("core payee route fails closed when durable persistence fails", async () => {
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgres://payshield:secret@127.0.0.1:1/ledger";
  process.env.PAYSHIELD_CORE_DB_CONNECT_TIMEOUT_MS = "100";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/payees",
      jsonPost({
        allowedBucketId: "rent",
        maxCents: 95_000,
        name: "New landlord",
      }),
    );
    const persistence = body.persistence as Record<string, unknown>;

    assert.equal(response.status, 503);
    assert.equal(body.error, "Payee could not be persisted.");
    assert.equal(persistence.persistence, "postgres_error");
  });
});

test("core paycheck detection posts bucket split before safe spend", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/paychecks/detect",
      jsonPost({
        amountCents: 300_000,
        employerName: "Acme Payroll",
        idempotencyKey: "core-paycheck-detect",
        receivedAt: "2026-07-01T12:00:00.000Z",
      }),
    );
    const auditPersistence = body.auditPersistence as Record<string, unknown>;
    const entry = body.ledgerEntry as Record<string, unknown>;
    const journalPersistence = body.journalPersistence as Record<
      string,
      unknown
    >;

    assert.equal(response.status, 200);
    assert.equal(auditPersistence.persistence, "memory");
    assert.equal(journalPersistence.persistence, "memory");
    assert.equal(body.protectedCents, 155_000);
    assert.equal(body.safeToSpendCents, 145_000);
    assert.equal(entry.type, "paycheck_deposit");
  });
});

test("core transfer route validates bucket funds and provider status", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/transfers",
      jsonPost({
        amountCents: 25_000,
        destinationPayeeId: "payee_abc_apartments",
        idempotencyKey: "core-transfer-rent",
        sourceBucketId: "rent",
      }),
    );
    const auditPersistence = body.auditPersistence as Record<string, unknown>;
    const providerTransfer = body.providerTransfer as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(auditPersistence.persistence, "memory");
    assert.equal(providerTransfer.status, "blocked");

    const rejected = await getJson(
      baseUrl,
      "/api/app/transfers",
      jsonPost({
        amountCents: 999_999,
        destinationPayeeId: "payee_abc_apartments",
        sourceBucketId: "rent",
      }),
    );

    assert.equal(rejected.response.status, 400);
  });
});

test("core money operations fail closed when configured ledger persistence fails", async () => {
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgres://payshield:secret@127.0.0.1:1/ledger";
  process.env.PAYSHIELD_CORE_DB_CONNECT_TIMEOUT_MS = "100";

  await withCoreServer(async (baseUrl) => {
    const paycheck = await getJson(
      baseUrl,
      "/api/app/paychecks/detect",
      jsonPost({
        amountCents: 300_000,
        employerName: "Acme Payroll",
        idempotencyKey: "core-paycheck-db-fail",
      }),
    );
    const transfer = await getJson(
      baseUrl,
      "/api/app/transfers",
      jsonPost({
        amountCents: 25_000,
        destinationPayeeId: "payee_abc_apartments",
        idempotencyKey: "core-transfer-db-fail",
        sourceBucketId: "rent",
      }),
    );

    assert.equal(paycheck.response.status, 503);
    assert.equal(
      paycheck.body.error,
      "Operational controls could not be loaded from durable core storage.",
    );
    assert.equal(
      (paycheck.body.bucketPersistence as Record<string, unknown>).persistence,
      "postgres_error",
    );
    assert.equal(transfer.response.status, 503);
    assert.equal(
      transfer.body.error,
      "Operational controls could not be loaded from durable core storage.",
    );
    assert.equal(
      (transfer.body.bucketPersistence as Record<string, unknown>).persistence,
      "postgres_error",
    );
  });
});

test("core bill payment route schedules approved payee from protected bucket", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/bill-payments",
      jsonPost({
        amountCents: 50_000,
        idempotencyKey: "core-bill-rent",
        memo: "July rent",
        payeeId: "payee_abc_apartments",
        scheduledFor: "2026-07-01",
      }),
    );
    const decision = body.decision as Record<string, unknown>;
    const decisionPersistence = body.decisionPersistence as Record<
      string,
      unknown
    >;
    const providerBillPayment = body.providerBillPayment as Record<
      string,
      unknown
    >;
    const journalPersistence = body.journalPersistence as Record<
      string,
      unknown
    >;

    assert.equal(response.status, 200);
    assert.equal(decision.accepted, true);
    assert.equal(decision.code, "scheduled");
    assert.equal(decision.bucketId, "rent");
    assert.equal(decisionPersistence.persistence, "memory");
    assert.equal(journalPersistence.persistence, "memory");
    assert.equal(providerBillPayment.status, "blocked");
    assert.equal(Array.isArray(body.ledgerEntries), true);
  });
});

test("core bill payment route rejects invalid payees and malformed dates", async () => {
  await withCoreServer(async (baseUrl) => {
    const invalidDate = await getJson(
      baseUrl,
      "/api/app/bill-payments",
      jsonPost({
        amountCents: 50_000,
        payeeId: "payee_abc_apartments",
        scheduledFor: "July 1",
      }),
    );
    const unapproved = await getJson(
      baseUrl,
      "/api/app/bill-payments",
      jsonPost({
        amountCents: 50_000,
        payeeId: "payee_missing",
        scheduledFor: "2026-07-01",
      }),
    );
    const decision = unapproved.body.decision as Record<string, unknown>;
    const decisionPersistence = unapproved.body.decisionPersistence as Record<
      string,
      unknown
    >;

    assert.equal(invalidDate.response.status, 400);
    assert.equal(unapproved.response.status, 400);
    assert.equal(decision.accepted, false);
    assert.equal(decision.code, "payee_not_allowed");
    assert.equal(decisionPersistence.persistence, "memory");
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
    const blockedOperations = await getJson(baseUrl, "/api/app/operations");

    assert.equal(blocked.response.status, 401);
    assert.equal(blocked.body.error, "Unauthorized");
    assert.equal(blockedOperations.response.status, 401);

    const authorized = await getJson(baseUrl, "/api/app/balances", {
      headers: {
        authorization: "Bearer core-test-token",
      },
    });
    const authorizedOperations = await getJson(baseUrl, "/api/app/operations", {
      headers: {
        authorization: "Bearer core-test-token",
      },
    });

    assert.equal(authorized.response.status, 200);
    assert.equal(authorized.body.safeToSpendCents, 145_000);
    assert.equal(authorizedOperations.response.status, 200);
    assert.equal(authorizedOperations.body.service, "payshield-household-operations");
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
