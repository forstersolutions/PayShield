import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
  "PAYSHIELD_REQUIRE_PAID_ACCESS",
  "PAYSHIELD_PROVIDER_WEBHOOK_REPLAY_TOLERANCE_SECONDS",
  "PAYSHIELD_PROVIDER_WEBHOOK_SECRET",
  "PAYSHIELD_REGULATED_COUNSEL_SIGNOFF",
  "PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED",
  "PAYSHIELD_TRANSFER_ENABLED",
  "PAYSHIELD_TOKEN_VAULT_KEY_ID",
  "PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY",
  "PAYSHIELD_TOKEN_VAULT_REPLAY_TOLERANCE_SECONDS",
  "PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET",
  "PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL",
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

function signedJsonPost(
  payload: unknown,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000).toString(),
): RequestInit {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-payshield-signature": `t=${timestamp},v1=${signature}`,
    },
    method: "POST",
  };
}

function signedProviderJsonPost(
  payload: unknown,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000).toString(),
): RequestInit {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-payshield-provider-signature": `t=${timestamp},v1=${signature}`,
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
    assert.equal(routes.includes("POST /token-vault/plaid"), true);
    assert.equal(routes.includes("POST /app/bank-link/token"), true);
    assert.equal(routes.includes("POST /app/bank-link/exchange"), true);
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
    assert.equal(urlOnlyReadiness.postgresSchemaVersion, "0006");
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

    process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION = "0006";

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
    assert.equal(commercialAccess.subscriptionStatus, "active");
  });
});

test("core paid access gates money workflows when commercial billing is configured", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL =
    "https://buy.stripe.com/test_paid_access";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

  const unpaidActor = {
    "x-payshield-user-id": "user_unpaid_001",
  };
  const operations: Array<[string, string, RequestInit]> = [
    [
      "/api/app/onboarding/start",
      "provider onboarding",
      { headers: unpaidActor, method: "POST" },
    ],
    [
      "/api/app/bank-link/token",
      "bank linking",
      jsonPost({ origin: "https://payshield.test" }, { headers: unpaidActor }),
    ],
    [
      "/api/app/paychecks/detect",
      "paycheck detection",
      jsonPost(
        {
          amountCents: 300_000,
          employerName: "Acme Payroll",
          idempotencyKey: "unpaid-paycheck-detect",
        },
        { headers: unpaidActor },
      ),
    ],
    [
      "/api/app/transfers",
      "protected transfers",
      jsonPost(
        {
          amountCents: 25_000,
          destinationPayeeId: "payee_abc_apartments",
          idempotencyKey: "unpaid-transfer-rent",
          sourceBucketId: "rent",
        },
        { headers: unpaidActor },
      ),
    ],
    [
      "/api/app/bill-payments",
      "bill payment controls",
      jsonPost(
        {
          amountCents: 50_000,
          idempotencyKey: "unpaid-bill-rent",
          payeeId: "payee_abc_apartments",
          scheduledFor: "2026-07-01",
        },
        { headers: unpaidActor },
      ),
    ],
    [
      "/api/app/unlocks",
      "protected bucket unlocks",
      jsonPost(
        {
          amountCents: 5_000,
          bucketId: "emergency",
          idempotencyKey: "unpaid-unlock-emergency",
          mode: "slow_free",
          reason: "Temporary cash need",
        },
        { headers: unpaidActor },
      ),
    ],
    [
      "/api/card/authorize",
      "card authorization",
      jsonPost(
        {
          amountCents: 2_500,
          idempotencyKey: "unpaid-card-auth",
          merchantName: "Corner Market",
        },
        { headers: unpaidActor },
      ),
    ],
  ];

  await withCoreServer(async (baseUrl) => {
    for (const [path, operation, init] of operations) {
      const { body, response } = await getJson(baseUrl, path, init);

      assert.equal(response.status, 402, path);
      assert.equal(body.code, "paid_access_required", path);
      assert.equal(
        String(body.error).includes(operation),
        true,
        `${path} should name the gated operation`,
      );
      assert.equal(body.service, "payshield-paid-access-gate", path);
    }
  });
});

test("core active billing event unlocks paid-gated money workflows", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL =
    "https://buy.stripe.com/test_paid_access";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";

  const paidUserId = "user_paid_gate_001";
  const paidActor = {
    "x-payshield-user-id": paidUserId,
  };

  await withCoreServer(async (baseUrl) => {
    const billing = await getJson(
      baseUrl,
      "/api/commercial/billing-events",
      jsonPost({
        event: {
          data: {
            object: {
              customer: "cus_paid_gate",
              id: "cs_paid_gate",
              subscription: "sub_paid_gate",
            },
          },
          id: "evt_paid_gate",
          type: "checkout.session.completed",
        },
        providerName: "stripe",
        summary: {
          accessStatus: "active",
          amountPaidCents: 1900,
          checkoutSessionId: "cs_paid_gate",
          customerId: "cus_paid_gate",
          eventId: "evt_paid_gate",
          eventType: "checkout.session.completed",
          handled: true,
          subscriptionId: "sub_paid_gate",
          subscriptionStatus: "complete",
          userId: paidUserId,
        },
      }),
    );
    const paycheck = await getJson(
      baseUrl,
      "/api/app/paychecks/detect",
      jsonPost(
        {
          amountCents: 300_000,
          employerName: "Acme Payroll",
          idempotencyKey: "paid-paycheck-detect",
        },
        { headers: paidActor },
      ),
    );

    assert.equal(billing.response.status, 200);
    assert.equal(billing.body.accessStatus, "active");
    assert.equal(paycheck.response.status, 200);
    assert.equal(paycheck.body.service, undefined);
    assert.equal(paycheck.body.safeToSpendCents, 145_000);
  });
});

test("core bank connection route records Plaid rail readiness", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";

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

test("core paycheck readiness requires provider webhook signing", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";

  await withCoreServer(async (baseUrl) => {
    const unsigned = await getJson(baseUrl, "/api/app/operations");
    const unsignedMoneyRails = unsigned.body.moneyRails as Record<
      string,
      unknown
    >;
    const unsignedMissing = unsignedMoneyRails.missing as string[];

    assert.equal(unsigned.response.status, 200);
    assert.equal(unsignedMoneyRails.bankLinkReady, true);
    assert.equal(unsignedMoneyRails.paycheckDetectionReady, false);
    assert.equal(
      unsignedMoneyRails.providerWebhookSigningConfigured,
      false,
    );
    assert.equal(
      unsignedMissing.includes("PAYSHIELD_PROVIDER_WEBHOOK_SECRET"),
      true,
    );

    process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "provider-secret";

    const signed = await getJson(baseUrl, "/api/app/operations");
    const signedMoneyRails = signed.body.moneyRails as Record<string, unknown>;

    assert.equal(signed.response.status, 200);
    assert.equal(signedMoneyRails.paycheckDetectionReady, true);
    assert.equal(signedMoneyRails.providerWebhookSigningConfigured, true);
  });
});

test("core bank link token fails closed without signed token vault handoff", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/bank-link/token",
      jsonPost({ origin: "https://payshield.test" }),
    );
    const readiness = body.readiness as Record<string, unknown>;
    const missing = readiness.missing as string[];

    assert.equal(response.status, 424);
    assert.equal(body.service, "payshield-bank-link-token");
    assert.equal(readiness.plaidConfigured, true);
    assert.equal(readiness.tokenVaultConfigured, true);
    assert.equal(readiness.tokenVaultStoreReady, false);
    assert.equal(missing.includes("PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL"), true);
    assert.equal(missing.includes("PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET"), true);
  });
});

test("core token vault receiver rejects unsigned Plaid token handoffs", async () => {
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/token-vault/plaid",
      jsonPost({
        accessToken: "access-sandbox-token",
        itemId: "item_unsigned",
        keyId: "vault-key",
        providerName: "plaid",
        requestId: "req_unsigned",
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(body.service, "payshield-token-vault");
    assert.equal(JSON.stringify(body).includes("access-sandbox-token"), false);
  });
});

test("core token vault receiver rejects stale signatures", async () => {
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/token-vault/plaid",
      signedJsonPost(
        {
          accessToken: "access-sandbox-token",
          itemId: "item_stale",
          keyId: "vault-key",
          providerName: "plaid",
          requestId: "req_stale",
        },
        "vault-secret",
        "100",
      ),
    );

    assert.equal(response.status, 401);
    assert.match(String(body.error), /replay tolerance/);
    assert.equal(JSON.stringify(body).includes("access-sandbox-token"), false);
  });
});

test("core token vault receiver requires durable Postgres custody", async () => {
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/token-vault/plaid",
      signedJsonPost(
        {
          accessToken: "access-sandbox-token",
          itemId: "item_durable",
          keyId: "vault-key",
          providerName: "plaid",
          requestId: "req_durable",
        },
        "vault-secret",
      ),
    );
    const persistence = body.persistence as Record<string, unknown>;

    assert.equal(response.status, 503);
    assert.equal(body.service, "payshield-token-vault");
    assert.equal(persistence.persistence, "postgres_required");
    assert.equal(JSON.stringify(body).includes("access-sandbox-token"), false);
  });
});

test("core bank connection route scopes records to forwarded household identity", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";

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

test("core provider webhook posts income transactions into paycheck split flow", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "provider-webhook-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";

  await withCoreServer(async (baseUrl) => {
    const payload = {
      eventId: "evt_income_sync",
      providerName: "plaid",
      transactions: [
        {
          account_id: "acc_payroll",
          amount: -1875.42,
          date: "2026-06-12",
          item_id: "item_payroll",
          name: "ACME PAYROLL",
          pending: false,
          personal_finance_category: {
            detailed: "INCOME_WAGES",
            primary: "INCOME",
          },
          transaction_id: "txn_payroll_001",
        },
        {
          account_id: "acc_payroll",
          amount: 42.99,
          date: "2026-06-12",
          item_id: "item_payroll",
          name: "Coffee shop",
          pending: false,
          personal_finance_category: {
            detailed: "FOOD_AND_DRINK_COFFEE",
            primary: "FOOD_AND_DRINK",
          },
          transaction_id: "txn_debit_001",
        },
      ],
      type: "transactions.sync",
    };
    const { body, response } = await getJson(
      baseUrl,
      "/api/provider/webhooks",
      signedProviderJsonPost(payload, "provider-webhook-secret"),
    );
    const detections = body.detections as Array<Record<string, unknown>>;
    const eventPersistence = body.eventPersistence as Record<string, unknown>;

    assert.equal(response.status, 202);
    assert.equal(body.accepted, true);
    assert.equal(body.mode, "processed");
    assert.equal(body.detectionCount, 1);
    assert.equal(eventPersistence.persistence, "memory");
    assert.equal(detections[0]?.amountCents, 187_542);
    assert.equal(detections[0]?.employerName, "ACME PAYROLL");
    assert.equal(detections[0]?.providerTransactionId, "txn_payroll_001");
  });
});

test("core provider webhook requires signing before linked-bank detection can run", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/provider/webhooks",
      jsonPost({
        eventId: "evt_unsigned_income_sync",
        providerName: "plaid",
        transactions: [
          {
            account_id: "acc_payroll",
            amount: -1550,
            item_id: "item_payroll",
            name: "Payroll deposit",
            pending: false,
            personal_finance_category: {
              primary: "INCOME",
            },
            transaction_id: "txn_unsigned_payroll",
          },
        ],
      }),
    );

    assert.equal(response.status, 503);
    assert.equal(body.accepted, false);
    assert.match(String(body.error), /PAYSHIELD_PROVIDER_WEBHOOK_SECRET/);
  });
});

test("core provider webhook rejects invalid provider signatures", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "provider-webhook-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/provider/webhooks",
      jsonPost(
        {
          eventId: "evt_bad_signature_income_sync",
          providerName: "plaid",
          transactions: [
            {
              account_id: "acc_payroll",
              amount: -1550,
              item_id: "item_payroll",
              name: "Payroll deposit",
              pending: false,
              personal_finance_category: {
                primary: "INCOME",
              },
              transaction_id: "txn_bad_signature_payroll",
            },
          ],
        },
        {
          headers: {
            "x-payshield-provider-signature": "t=123,v1=bad",
          },
        },
      ),
    );

    assert.equal(response.status, 401);
    assert.equal(body.accepted, false);
    assert.match(String(body.error), /timestamp|signature/i);
  });
});

test("core provider webhook blocks durable income events without provider account references", async () => {
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgres://payshield:payshield@127.0.0.1:1/payshield";
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "provider-webhook-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";

  await withCoreServer(async (baseUrl) => {
    const payload = {
      eventId: "evt_income_missing_provider_refs",
      providerName: "plaid",
      transactions: [
        {
          amount: -1550,
          name: "Payroll deposit",
          pending: false,
          personal_finance_category: {
            detailed: "INCOME_WAGES",
            primary: "INCOME",
          },
          transaction_id: "txn_missing_provider_refs",
        },
      ],
    };
    const { body, response } = await getJson(
      baseUrl,
      "/api/provider/webhooks",
      signedProviderJsonPost(payload, "provider-webhook-secret"),
    );

    assert.equal(response.status, 202);
    assert.equal(body.accepted, true);
    assert.equal(body.mode, "blocked");
    assert.equal(body.detectionCount, 0);
    assert.match(
      String(body.reason),
      /provider item and account identifiers/i,
    );
  });
});

test("core provider webhook blocks income extraction until bank rails are configured", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/provider/webhooks",
      jsonPost({
        eventId: "evt_income_blocked",
        providerName: "plaid",
        transactions: [
          {
            amount: -1200,
            name: "Payroll deposit",
            pending: false,
            personal_finance_category: {
              primary: "INCOME",
            },
            transaction_id: "txn_blocked_payroll",
          },
        ],
      }),
    );
    const moneyReadiness = body.moneyReadiness as Record<string, unknown>;

    assert.equal(response.status, 202);
    assert.equal(body.accepted, true);
    assert.equal(body.mode, "blocked");
    assert.equal(body.detectionCount, 0);
    assert.equal(moneyReadiness.paycheckDetectionReady, false);
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
