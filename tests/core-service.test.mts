import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { shouldUpdateCommercialSubscription } from "../services/core/database.mjs";
import { createCoreServer } from "../services/core/server.mjs";
import {
  createBankLinkToken,
  getCoreHealth,
  persistTransactionSyncException,
  recordMoneyRailProviderException,
  replayJournalEntriesForBalances,
} from "../services/core/product.mjs";

const coreEnvKeys = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "PAYSHIELD_BAAS_ADAPTER",
  "PAYSHIELD_BAAS_API_BASE_URL",
  "PAYSHIELD_BAAS_API_KEY",
  "PAYSHIELD_BAAS_CONTRACT_APPROVED",
  "PAYSHIELD_BAAS_PROVIDER",
  "PAYSHIELD_ANDROID_PACKAGE_NAME",
  "PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
  "PAYSHIELD_COMMERCIAL_PRICE_ID",
  "PAYSHIELD_CORE_API_URL",
  "PAYSHIELD_CORE_DB_CONNECT_TIMEOUT_MS",
  "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE",
  "PAYSHIELD_CORE_REQUIRE_SERVICE_TOKEN",
  "PAYSHIELD_CORE_SERVICE_TOKEN",
  "PAYSHIELD_FRONTEND_AUTH_VERIFIED",
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
  "PLAID_WEBHOOK_URL",
  "PGDATABASE",
  "PGHOST",
  "PGPASSWORD",
  "PGPORT",
  "PGSSLMODE",
  "PGUSER",
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

test("core health stays minimal while authenticated readiness fails closed", async () => {
  await withCoreServer(async (baseUrl) => {
    const health = await getJson(baseUrl, "/health");
    const ready = await getJson(baseUrl, "/ready");
    const readiness = ready.body.readiness as Record<string, unknown>;

    assert.equal(health.response.status, 200);
    assert.deepEqual(health.body, {
      ok: true,
      service: "payshield-core",
      status: "healthy",
    });
    assert.equal(ready.response.status, 503);
    assert.equal(ready.body.service, "payshield-core");
    assert.equal(readiness.liveMoneyReady, false);
    assert.equal(readiness.backendConfigured, true);
  });
});

test("core rejects non-object bodies before product handlers", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/app/control-plan",
      {
        body: "null",
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );

    assert.equal(response.status, 400);
    assert.equal(body.error, "Request body must be a JSON object.");
    assert.equal(body.service, "payshield-core");
  });
});

test("core transfer execution persists a durable intent before live provider calls", () => {
  const productSource = readFileSync(
    new URL("../services/core/product.mjs", import.meta.url),
    "utf8",
  );
  const databaseSource = readFileSync(
    new URL("../services/core/database.mjs", import.meta.url),
    "utf8",
  );
  const createTransferStart = productSource.indexOf(
    "export async function createTransferIntent",
  );
  const createTransferEnd = productSource.indexOf(
    "function cleanScheduledDate",
    createTransferStart,
  );

  assert.notEqual(createTransferStart, -1);
  assert.notEqual(createTransferEnd, -1);

  const transferSource = productSource.slice(
    createTransferStart,
    createTransferEnd,
  );
  const persistIndex = transferSource.indexOf("persistTransferIntent(");
  const replayIndex = transferSource.indexOf("persistence.replayed");
  const resumeIndex = transferSource.indexOf("resumePendingProviderExecution");
  const providerIndex = transferSource.indexOf("providerCreateAchTransfer(");
  const statusUpdateIndex = transferSource.indexOf(
    "updateTransferIntentProviderStatus(",
  );

  assert.ok(persistIndex >= 0, "transfer intent must be persisted first");
  assert.ok(providerIndex > persistIndex, "provider call must follow persistence");
  assert.ok(
    replayIndex > persistIndex && replayIndex < providerIndex,
    "duplicate idempotency keys must replay before provider execution",
  );
  assert.ok(
    resumeIndex > persistIndex && resumeIndex < providerIndex,
    "pending durable intents must be classified before provider execution",
  );
  assert.ok(
    statusUpdateIndex > providerIndex,
    "provider results must update the durable intent",
  );
  assert.match(transferSource, /provider_pending/);
  assert.match(
    transferSource,
    /Pending transfer intent resumed with the configured provider/,
  );
  assert.match(
    transferSource,
    /will not replay provider execution after a durable terminal or blocked status/,
  );
  assert.match(transferSource, /persisted before provider execution/);
  assert.match(databaseSource, /WITH inserted AS/);
  assert.match(
    databaseSource,
    /export async function updateTransferIntentProviderStatus/,
  );
  assert.match(databaseSource, /postgres_missing/);
  assert.match(
    databaseSource,
    /WHERE household_id = \$1[\s\S]+AND idempotency_key = \$2/,
  );
});

test("core bill payment execution persists the ledger and schedule before live provider calls", () => {
  const productSource = readFileSync(
    new URL("../services/core/product.mjs", import.meta.url),
    "utf8",
  );
  const databaseSource = readFileSync(
    new URL("../services/core/database.mjs", import.meta.url),
    "utf8",
  );
  const createBillPaymentStart = productSource.indexOf(
    "export async function createBillPayment",
  );
  const createBillPaymentEnd = productSource.indexOf(
    "function isUnlockMode",
    createBillPaymentStart,
  );

  assert.notEqual(createBillPaymentStart, -1);
  assert.notEqual(createBillPaymentEnd, -1);

  const billPaymentSource = productSource.slice(
    createBillPaymentStart,
    createBillPaymentEnd,
  );
  const scheduleIndex = billPaymentSource.indexOf("persistBillPaymentSchedule(");
  const replayIndex = billPaymentSource.indexOf("decisionPersistence.replayed");
  const resumeIndex = billPaymentSource.indexOf(
    "resumePendingBillPaymentProviderExecution",
  );
  const providerIndex = billPaymentSource.indexOf("providerCreateBillPayment(");
  const statusUpdateIndex = billPaymentSource.indexOf(
    "updateBillPaymentProviderStatus(",
  );

  assert.ok(scheduleIndex >= 0, "bill payment must use atomic schedule persistence");
  assert.match(billPaymentSource, /journalEntry: postedEntry/);
  assert.ok(
    providerIndex > scheduleIndex,
    "bill payment provider call must follow durable schedule persistence",
  );
  assert.ok(
    replayIndex > scheduleIndex && replayIndex < providerIndex,
    "duplicate schedules must be classified before provider execution",
  );
  assert.ok(
    resumeIndex > scheduleIndex && resumeIndex < providerIndex,
    "pending bill schedules must be resumable before provider execution",
  );
  assert.ok(
    statusUpdateIndex > providerIndex,
    "provider results must update the durable bill schedule",
  );
  assert.match(
    billPaymentSource,
    /Pending bill payment schedule resumed with the configured provider/,
  );
  assert.match(
    billPaymentSource,
    /will not replay provider execution after a durable terminal or blocked status/,
  );
  assert.match(
    billPaymentSource,
    /Provider bill payment was created but the durable schedule status could not be updated/,
  );
  assert.match(
    databaseSource,
    /export async function persistBillPaymentSchedule[\s\S]+BEGIN[\s\S]+insertJournalEntry\(client[\s\S]+INSERT INTO bill_payment_schedules[\s\S]+COMMIT/,
  );
  assert.match(databaseSource, /persistence: "control_conflict"/);
  assert.match(
    databaseSource,
    /export async function updateBillPaymentProviderStatus/,
  );
  assert.match(databaseSource, /bill_payment_schedules/);
  assert.match(databaseSource, /provider_bill_payment_id/);
});

test("core card authorization replays durable decisions before recomputing funds", () => {
  const productSource = readFileSync(
    new URL("../services/core/product.mjs", import.meta.url),
    "utf8",
  );
  const databaseSource = readFileSync(
    new URL("../services/core/database.mjs", import.meta.url),
    "utf8",
  );
  const authorizeCardStart = productSource.indexOf(
    "export async function authorizeCard",
  );
  const authorizeCardEnd = productSource.indexOf(
    "function stableEventId",
    authorizeCardStart,
  );

  assert.notEqual(authorizeCardStart, -1);
  assert.notEqual(authorizeCardEnd, -1);

  const authorizeCardSource = productSource.slice(
    authorizeCardStart,
    authorizeCardEnd,
  );
  const replayLookupIndex = authorizeCardSource.indexOf(
    "loadCardAuthorizationDecision(",
  );
  const controlsIndex = authorizeCardSource.indexOf("loadOperationalControls(");
  const decisionIndex = authorizeCardSource.indexOf("authorizeCardTransaction(");
  const persistenceIndex = authorizeCardSource.indexOf(
    "persistCardAuthorizationDecision(",
  );
  const writeReplayIndex = authorizeCardSource.indexOf(
    "decisionPersistence.replayed",
  );
  const directJournalIndex = authorizeCardSource.indexOf(
    "persistOperationalJournal(",
  );

  assert.ok(
    replayLookupIndex >= 0,
    "card authorization must check durable replay state",
  );
  assert.ok(
    replayLookupIndex < controlsIndex,
    "card authorization replay lookup must happen before loading controls",
  );
  assert.ok(
    replayLookupIndex < decisionIndex,
    "card authorization replay lookup must happen before recomputing funds",
  );
  assert.ok(
    persistenceIndex > decisionIndex,
    "new card authorization decisions must still persist after local decisioning",
  );
  assert.ok(
    writeReplayIndex > persistenceIndex,
    "card authorization must honor persistence-time replay conflicts",
  );
  assert.equal(
    directJournalIndex,
    -1,
    "card authorization must not post a journal before claiming the card decision idempotency key",
  );
  assert.match(
    authorizeCardSource,
    /journalEntry: postedEntry \|\| null/,
  );
  assert.match(
    productSource,
    /without recomputing spendable funds/,
  );
  assert.match(
    authorizeCardSource,
    /idempotency key already belongs to a different authorization payload/,
  );
  assert.match(
    databaseSource,
    /export async function loadCardAuthorizationDecision/,
  );
  assert.match(authorizeCardSource, /loadProviderCardActor/);
  assert.match(authorizeCardSource, /verifyProviderWebhookSignature/);
  assert.match(databaseSource, /export async function loadProviderCardActor/);
  assert.match(
    databaseSource,
    /UPDATE card_authorization_decisions[\s\S]+SET journal_entry_id/,
  );
  assert.match(databaseSource, /insertJournalEntry\(client/);
  assert.match(databaseSource, /cardAuthorizationDecisionFromRow/);
});

test("core paycheck detection replays durable detections before recomputing splits", () => {
  const productSource = readFileSync(
    new URL("../services/core/product.mjs", import.meta.url),
    "utf8",
  );
  const databaseSource = readFileSync(
    new URL("../services/core/database.mjs", import.meta.url),
    "utf8",
  );
  const detectStart = productSource.indexOf(
    "export async function detectPaycheck",
  );
  const detectEnd = productSource.indexOf(
    "export async function createTransferIntent",
    detectStart,
  );

  assert.notEqual(detectStart, -1);
  assert.notEqual(detectEnd, -1);

  const detectSource = productSource.slice(detectStart, detectEnd);
  const replayLookupIndex = detectSource.indexOf("loadPaycheckDetection(");
  const ruleLookupIndex = detectSource.indexOf("findMatchingPaycheckRule(");
  const ledgerPostIndex = detectSource.indexOf("postPaycheckDeposit(");
  const persistenceIndex = detectSource.indexOf("persistPaycheckDetection(");
  const writeReplayIndex = detectSource.indexOf("persistence.replayed");
  const directJournalIndex = detectSource.indexOf("persistOperationalJournal(");

  assert.ok(
    replayLookupIndex >= 0,
    "paycheck detection must check durable replay state",
  );
  assert.ok(
    replayLookupIndex < ruleLookupIndex,
    "paycheck replay lookup must happen before rule matching",
  );
  assert.ok(
    replayLookupIndex < ledgerPostIndex,
    "paycheck replay lookup must happen before recomputing bucket splits",
  );
  assert.ok(
    persistenceIndex > ledgerPostIndex,
    "new paycheck detections must still persist after split calculation",
  );
  assert.ok(
    writeReplayIndex > persistenceIndex,
    "paycheck detection must honor persistence-time replay conflicts",
  );
  assert.equal(
    directJournalIndex,
    -1,
    "paycheck detection must not post a journal before claiming the detection idempotency key",
  );
  assert.match(detectSource, /journalEntry: entry/);
  assert.match(
    productSource,
    /without recomputing bucket splits/,
  );
  assert.match(
    detectSource,
    /idempotency key or provider transaction already belongs to a different deposit payload/,
  );
  assert.match(
    databaseSource,
    /export async function loadPaycheckDetection/,
  );
  assert.match(
    databaseSource,
    /export async function persistPaycheckDetection[\s\S]+insertJournalEntry\(client[\s\S]+INSERT INTO paycheck_detections/,
  );
  assert.match(
    databaseSource,
    /UPDATE unlock_requests[\s\S]+remaining_recovery_cents/,
  );
  assert.match(databaseSource, /paycheckDetectionFromRow/);
});

test("core bank connections reject provider ownership collisions", () => {
  const productSource = readFileSync(
    new URL("../services/core/product.mjs", import.meta.url),
    "utf8",
  );
  const databaseSource = readFileSync(
    new URL("../services/core/database.mjs", import.meta.url),
    "utf8",
  );
  const recordStart = productSource.indexOf(
    "export async function recordBankConnection",
  );
  const recordEnd = productSource.indexOf(
    "export async function getProfile",
    recordStart,
  );

  assert.notEqual(recordStart, -1);
  assert.notEqual(recordEnd, -1);

  const recordSource = productSource.slice(recordStart, recordEnd);
  const conflictIndex = recordSource.indexOf(
    'persistence.persistence === "ownership_conflict"',
  );
  const auditIndex = recordSource.indexOf("persistMoneyRailEvent(");

  assert.ok(
    conflictIndex >= 0,
    "bank connection route must handle provider ownership conflicts",
  );
  assert.ok(
    conflictIndex < auditIndex,
    "bank connection ownership conflicts must be rejected before audit success is recorded",
  );
  assert.match(
    recordSource,
    /Bank connection already belongs to a different PayShield household/,
  );
  assert.match(recordSource, /status: 409/);
  assert.match(
    databaseSource,
    /WHERE bank_connections\.household_id = EXCLUDED\.household_id/,
  );
  assert.match(
    databaseSource,
    /AND bank_connections\.user_id = EXCLUDED\.user_id/,
  );
  assert.match(databaseSource, /persistence: "ownership_conflict"/);
  assert.match(
    databaseSource,
    /token_secret_ref[\s\S]+RETURNING[\s\S]+token_secret_ref/,
  );
});

test("core direct deposit setup persists before provider execution", () => {
  const productSource = readFileSync(
    new URL("../services/core/product.mjs", import.meta.url),
    "utf8",
  );
  const databaseSource = readFileSync(
    new URL("../services/core/database.mjs", import.meta.url),
    "utf8",
  );
  const setupStart = productSource.indexOf(
    "export async function createDirectDepositSetup",
  );
  const setupEnd = productSource.indexOf(
    "async function startOnboardingWithPaidAccess",
    setupStart,
  );

  assert.notEqual(setupStart, -1);
  assert.notEqual(setupEnd, -1);

  const setupSource = productSource.slice(setupStart, setupEnd);
  const persistIndex = setupSource.indexOf("persistDirectDepositSetup(");
  const providerIndex = setupSource.indexOf(
    "providerCreateDirectDepositInstructions(",
  );
  const replayIndex = setupSource.indexOf("replayedReadySetup");
  const updateIndex = setupSource.indexOf("providerCompletedAt");
  const exceptionIndex = setupSource.indexOf(
    "recordMoneyRailProviderException(",
  );

  assert.ok(
    persistIndex >= 0,
    "direct deposit setup must claim a durable setup record",
  );
  assert.ok(
    persistIndex < providerIndex,
    "direct deposit setup must persist before provider instruction creation",
  );
  assert.ok(
    replayIndex > persistIndex && replayIndex < providerIndex,
    "ready direct deposit setup replays must bypass provider execution",
  );
  assert.ok(
    updateIndex > providerIndex,
    "direct deposit setup must update the durable record after provider execution",
  );
  assert.ok(
    exceptionIndex > providerIndex,
    "direct deposit provider failures must create reconciliation evidence",
  );
  assert.match(
    setupSource,
    /without another provider request/,
  );
  assert.match(
    setupSource,
    /idempotency key already belongs to a different provider account/,
  );
  assert.match(
    databaseSource,
    /export async function updateDirectDepositSetupProviderStatus/,
  );
  assert.match(
    databaseSource,
    /ON CONFLICT \(household_id, idempotency_key\) DO NOTHING/,
  );
  assert.match(databaseSource, /true AS replayed/);
});

test("core token vault custody is deterministic for signed replays", () => {
  const productSource = readFileSync(
    new URL("../services/core/product.mjs", import.meta.url),
    "utf8",
  );
  const databaseSource = readFileSync(
    new URL("../services/core/database.mjs", import.meta.url),
    "utf8",
  );
  const persistStart = databaseSource.indexOf(
    "export async function persistProviderTokenSecret",
  );
  const persistEnd = databaseSource.indexOf(
    "export async function loadPaycheckDetection",
    persistStart,
  );

  assert.notEqual(persistStart, -1);
  assert.notEqual(persistEnd, -1);

  const persistSource = databaseSource.slice(persistStart, persistEnd);
  const eventIdIndex = persistSource.indexOf("const tokenVaultEventId = recordId(");
  const eventInsertIndex = persistSource.indexOf(
    "INSERT INTO provider_token_vault_events",
  );

  assert.match(
    persistSource,
    /SELECT key_id, token_fingerprint_sha256/,
  );
  assert.match(
    persistSource,
    /previousFingerprint === tokenFingerprint && previousKeyId === input\.keyId/,
  );
  assert.match(persistSource, /const tokenVaultEventId = recordId\(/);
  assert.ok(
    eventIdIndex >= 0 && eventIdIndex < eventInsertIndex,
    "token vault event id must be computed before the event insert",
  );
  assert.match(persistSource, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(
    persistSource,
    /ELSE provider_token_secrets\.ciphertext/,
  );
  assert.match(
    persistSource,
    /ELSE provider_token_secrets\.updated_at/,
  );
  assert.equal(
    persistSource.includes("String(Date.now())"),
    false,
    "token vault event ids must not depend on wall-clock time",
  );
  assert.equal(
    persistSource.includes('randomBytes(6).toString("hex")'),
    false,
    "token vault event ids must not use random suffixes",
  );
  assert.match(productSource, /receiveTokenVaultHandoff/);
  assert.match(productSource, /secretString\(payload\.accessToken/);
});

test("core profile route binds authenticated users to a household identity", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/api/app/me", {
      headers: {
        "x-payshield-auth-mode": "clerk",
        "x-payshield-clerk-subject": "clerk_user_identity_001",
        "x-payshield-user-email": "identity@example.com",
        "x-payshield-user-id": "user_identity_001",
        "x-payshield-user-name": "Identity Household",
      },
    });
    const identityPersistence = body.identityPersistence as Record<
      string,
      unknown
    >;
    const identity = identityPersistence.identity as Record<string, unknown>;
    const user = body.user as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.householdId, "household_user_identity_001");
    assert.equal(body.service, undefined);
    assert.equal(identityPersistence.persistence, "memory");
    assert.equal(identityPersistence.persisted, false);
    assert.equal(identity.householdId, "household_user_identity_001");
    assert.equal(user.clerkSubject, "clerk_user_identity_001");
    assert.equal(user.email, "identity@example.com");
    assert.equal(user.id, "user_identity_001");
    assert.equal(user.name, "Identity Household");
    assert.equal((body.auth as Record<string, unknown>).userId, "user_identity_001");
  });
});

test("core profile route fails closed when durable identity storage is required", async () => {
  process.env.PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE = "true";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/api/app/me", {
      headers: {
        "x-payshield-user-id": "user_requires_identity_db",
      },
    });
    const identityPersistence = body.identityPersistence as Record<
      string,
      unknown
    >;

    assert.equal(response.status, 503);
    assert.equal(body.code, "postgres_identity_required");
    assert.equal(body.service, "payshield-household-identity");
    assert.equal(identityPersistence.persistence, "postgres_required");
    assert.match(String(body.error), /durable ledger storage/i);
  });
});

test("core operations endpoint exposes household money-control records", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/api/app/operations");
    const balances = body.balances as Record<string, unknown>;
    const operations = body.operations as Record<string, unknown[]>;
    const statusCards = body.statusCards as Array<Record<string, unknown>>;
    const timeline = body.timeline as Array<Record<string, unknown>>;
    const activationPlan = body.activationPlan as Record<string, unknown>;
    const activationStages = activationPlan.stages as Array<Record<string, unknown>>;
    const activationRunway = body.activationRunway as Record<string, unknown>;
    const runwayMilestones = activationRunway.milestones as Array<
      Record<string, unknown>
    >;
    const commercialOperatingState = body.commercialOperatingState as Record<
      string,
      unknown
    >;
    const revenueAndRails = body.revenueAndRails as Record<string, unknown>;
    const guidedMoneyFlow = body.guidedMoneyFlow as Record<string, unknown>;
    const guidedSteps = guidedMoneyFlow.steps as Array<Record<string, unknown>>;
    const operatingCockpit = body.operatingCockpit as Record<string, unknown>;
    const cockpitLanes = operatingCockpit.lanes as Array<Record<string, unknown>>;
    const nextAction = operatingCockpit.nextAction as Record<string, unknown>;
    const rails = revenueAndRails.rails as Array<Record<string, unknown>>;
    const revenueStage = activationStages.find((stage) => stage.key === "revenue");
    const paycheckStage = activationStages.find(
      (stage) => stage.key === "paycheck_detection",
    );
    const paycheckRail = rails.find((rail) => rail.key === "paycheck_detection");
    const movementRail = rails.find((rail) => rail.key === "money_movement");

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
    assert.equal(activationPlan.nextStageKey, "revenue");
    assert.equal(activationRunway.service, "payshield-activation-runway");
    assert.equal(
      activationRunway.headline,
      "Collect revenue, connect money, prove protection.",
    );
    assert.equal(activationRunway.mode, "setup_to_first_payment");
    assert.equal(
      (activationRunway.nextMilestone as Record<string, unknown>).key,
      "first_revenue",
    );
    assert.equal(
      (activationRunway.progress as Record<string, unknown>).readyMilestoneCount,
      1,
    );
    assert.equal(
      (activationRunway.proof as Record<string, unknown>).supportContact,
      undefined,
    );
    assert.deepEqual(
      runwayMilestones.map((milestone) => milestone.key),
      [
        "first_revenue",
        "first_bank_connection",
        "first_detected_paycheck",
        "first_protection_profile",
        "first_audit_proof",
        "first_live_decision",
      ],
    );
    assert.equal(
      runwayMilestones.some(
        (milestone) =>
          milestone.key === "first_protection_profile" &&
          milestone.ready === true &&
          milestone.canRunNow === true &&
          String(milestone.revenueImpact).includes("immediate value"),
      ),
      true,
    );
    assert.equal(guidedMoneyFlow.service, "payshield-guided-money-flow");
    assert.equal(
      guidedMoneyFlow.headline,
      "Pay -> connect -> route -> detect -> protect -> release",
    );
    assert.equal(guidedMoneyFlow.mode, "setup_to_revenue");
    assert.equal(
      (guidedMoneyFlow.progress as Record<string, unknown>).totalStepCount,
      8,
    );
    assert.equal(
      guidedSteps.some(
        (step) =>
          step.key === "protected_buckets" &&
          step.ready === true &&
          step.endpoint === "POST /api/app/buckets",
      ),
      true,
    );
    assert.equal(
      commercialOperatingState.service,
      "payshield-commercial-operating-state",
    );
    assert.equal(
      commercialOperatingState.headline,
      "Subscribe -> connect bank -> detect paycheck -> protect -> release",
    );
    assert.equal(commercialOperatingState.totalRailCount, 6);
    assert.equal(
      (commercialOperatingState.revenueModel as Record<string, unknown>)
        .publicCheckoutEndpoint,
      "POST /api/public/billing/checkout",
    );
    assert.deepEqual(activationPlan.businessModel, {
      billingProvider: "Stripe",
      priceLabel: "$19/month",
      revenuePath:
        "Checkout -> webhook -> commercial access -> bank link -> paycheck controls.",
      supportContact: "support@graystontechnologies.com",
    });
    assert.equal(
      activationStages.some(
        (stage) =>
          stage.key === "money_movement" &&
          stage.primaryEndpoint === "POST /api/app/transfers" &&
          String(stage.businessImpact).includes("Release protected money") &&
          Array.isArray(stage.setupChecklist) &&
          String(stage.verification).includes("provider execution"),
      ),
      true,
    );
    assert.equal(
      (revenueStage?.requiredGates as string[]).includes(
        "PAYSHIELD_CORE_SERVICE_TOKEN",
      ),
      true,
    );
    assert.equal(paycheckStage?.ready, false);
    assert.equal(paycheckStage?.status, "setup_needed");
    assert.equal(paycheckRail?.canRunNow, false);
    assert.equal(paycheckRail?.state, "setup_needed");
    assert.equal(
      (movementRail?.blockers as string[]).includes(
        "PAYSHIELD_BAAS_ADAPTER=http_json",
      ),
      true,
    );
    assert.equal((revenueAndRails.summary as Record<string, unknown>).priceLabel, "$19/month");
    assert.equal(operatingCockpit.service, "payshield-operating-cockpit");
    assert.equal(
      operatingCockpit.headline,
      "Charge -> connect -> detect -> protect -> move",
    );
    assert.equal(operatingCockpit.mode, "credential_gated");
    assert.equal(operatingCockpit.readyLaneCount, 1);
    assert.equal(operatingCockpit.totalLaneCount, 7);
    assert.equal(nextAction.key, "revenue");
    assert.equal(nextAction.primaryEndpoint, "POST /api/app/billing/checkout");
    assert.equal(
      cockpitLanes.some(
        (lane) =>
          lane.key === "money_movement" &&
          lane.primaryEndpoint === "POST /api/app/transfers" &&
          lane.canRunNow === true,
      ),
      true,
    );
    assert.equal(
      cockpitLanes.some(
        (lane) =>
          lane.key === "card_control" &&
          lane.primaryEndpoint === "POST /api/card/authorize" &&
          lane.ready === false,
      ),
      true,
    );
    assert.equal(
      rails.some(
        (rail) =>
          rail.key === "revenue" &&
          rail.label === "Get paid" &&
          rail.endpoint === "POST /api/app/billing/checkout",
      ),
      true,
    );
    assert.equal(
      rails.some(
        (rail) =>
          rail.key === "money_movement" &&
          rail.provider === "BaaS or transfer partner" &&
          String(rail.unlocks).includes("bucket balance"),
      ),
      true,
    );
  });
});

test("core control-plan endpoint derives a usable household money plan from operations", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/api/app/control-plan");
    const summary = body.summary as Record<string, unknown>;
    const allocation = body.allocation as Record<string, unknown>;
    const buckets = allocation.buckets as Array<Record<string, unknown>>;
    const fundingSchedule = body.fundingSchedule as Array<Record<string, unknown>>;
    const operatingSteps = body.operatingSteps as Array<Record<string, unknown>>;
    const monetization = body.monetization as Record<string, unknown>;
    const transferPlan = body.transferPlan as Record<string, unknown>;
    const proof = body.proof as Record<string, unknown>;
    const source = body.source as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.service, "payshield-household-control-plan");
    assert.equal(summary.paycheckAmountCents, 300_000);
    assert.equal(summary.projectedProtectedCents, 155_000);
    assert.equal(summary.projectedSafeToSpendCents, 145_000);
    assert.equal(summary.shortfallCents, 0);
    assert.equal(summary.readyStepCount, 4);
    assert.equal(source.ledger, "control_model");
    assert.equal(monetization.priceLabel, "$19/month");
    assert.equal(monetization.endpoint, "POST /api/app/billing/checkout");
    assert.equal(
      operatingSteps.some(
        (step) =>
          step.key === "revenue_gate" &&
          step.title === "Revenue gate" &&
          step.endpoint === "POST /api/app/billing/checkout" &&
          (step.blockers as string[]).includes("Stripe API key"),
      ),
      true,
    );
    assert.equal(
      operatingSteps.some(
        (step) =>
          step.key === "bank_connection" &&
          step.endpoint === "POST /api/app/bank-link/token",
      ),
      true,
    );
    assert.equal(
      operatingSteps.some(
        (step) =>
          step.key === "paycheck_detection" &&
          step.endpoint === "POST /api/app/paychecks/rules" &&
          step.canRunNow === true,
      ),
      true,
    );
    assert.equal(
      buckets.some(
        (bucket) =>
          bucket.bucketId === "rent" &&
          bucket.projectedFundingCents === 50_000,
      ),
      true,
    );
    assert.equal(fundingSchedule[0]?.key, "bucket:rent");
    assert.equal(fundingSchedule[0]?.status, "funded");
    assert.equal(fundingSchedule.at(-1)?.key, "safe_to_spend");
    assert.equal(fundingSchedule.at(-1)?.amountCents, 145_000);
    assert.equal(transferPlan.endpoint, "POST /api/app/transfers");
    assert.equal(proof.planEndpoint, "/api/app/control-plan");
    assert.equal(proof.operationsEndpoint, "/api/app/operations");
  });
});

test("core control-plan post validates and regenerates paycheck projections", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/control-plan",
      jsonPost(
        {
          employerName: "Acme Payroll",
          expectedFrequency: "weekly",
          paycheckAmountCents: 220_000,
          requestedTransferCents: 20_000,
          ruleName: "Acme weekly payroll",
        },
        {
          headers: {
            "x-payshield-user-id": "user_control_plan",
          },
        },
      ),
    );
    const summary = body.summary as Record<string, unknown>;
    const detectionRule = body.detectionRule as Record<string, unknown>;
    const household = body.household as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(summary.paycheckAmountCents, 220_000);
    assert.equal(summary.projectedProtectedCents, 155_000);
    assert.equal(summary.projectedSafeToSpendCents, 65_000);
    assert.equal(detectionRule.employerNamePattern, "Acme Payroll");
    assert.equal(detectionRule.ruleName, "Acme weekly payroll");
    assert.equal(household.userId, "user_control_plan");

    const invalid = await getJson(
      baseUrl,
      "/api/app/control-plan",
      jsonPost({
        paycheckAmountCents: 1,
      }),
    );

    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.service, "payshield-household-control-plan");
    assert.equal(Array.isArray(invalid.body.errors), true);
  });
});

test("core money-profile route saves setup and regenerates the household plan", async () => {
  await withCoreServer(async (baseUrl) => {
    const read = await getJson(baseUrl, "/api/app/money-profile");
    const readProfile = read.body.profile as Record<string, unknown>;

    assert.equal(read.response.status, 200);
    assert.equal(read.body.service, "payshield-household-money-profile");
    assert.equal(read.body.persisted, false);
    assert.equal(readProfile.paycheckAmountCents, 300_000);

    const saved = await getJson(
      baseUrl,
      "/api/app/money-profile",
      jsonPost(
        {
          employerName: "Acme Payroll",
          expectedFrequency: "weekly",
          idempotencyKey: "core-money-profile-acme",
          nextPayday: "2026-07-03",
          paycheckAmountCents: 220_000,
          preferredPayeeId: "payee_abc_apartments",
          preferredTransferBucketId: "rent",
          requestedTransferCents: 15_000,
        },
        {
          headers: {
            "x-payshield-user-id": "user_money_profile",
          },
        },
      ),
    );
    const savedProfile = saved.body.profile as Record<string, unknown>;
    const controlPlan = saved.body.controlPlan as Record<string, unknown>;
    const summary = controlPlan.summary as Record<string, unknown>;
    const fundingSchedule = controlPlan.fundingSchedule as Array<
      Record<string, unknown>
    >;

    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.service, "payshield-household-money-profile");
    assert.equal(saved.body.persisted, false);
    assert.equal(savedProfile.employerName, "Acme Payroll");
    assert.equal(savedProfile.nextPayday, "2026-07-03");
    assert.equal(summary.paycheckAmountCents, 220_000);
    assert.equal(summary.projectedSafeToSpendCents, 65_000);
    assert.equal(fundingSchedule.at(-1)?.key, "safe_to_spend");
    assert.equal(fundingSchedule.at(-1)?.amountCents, 65_000);

    const invalid = await getJson(
      baseUrl,
      "/api/app/money-profile",
      jsonPost({
        nextPayday: "July 3",
        paycheckAmountCents: 1,
      }),
    );

    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.service, "payshield-household-money-profile");
  });
});

test("core protected routes fail closed when service token is required but missing", async () => {
  process.env.PAYSHIELD_CORE_REQUIRE_SERVICE_TOKEN = "true";

  await withCoreServer(async (baseUrl) => {
    const health = await getJson(baseUrl, "/health");
    const blocked = await getJson(baseUrl, "/api/app/balances");

    assert.equal(health.response.status, 200);
    assert.equal(health.body.status, "healthy");
    assert.equal(blocked.response.status, 503);
    assert.equal(blocked.body.code, "core_service_token_required");
    assert.equal(blocked.body.service, "payshield-core");
  });
});

test("core activation endpoint exposes operator launch checklist", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/api/app/activation");
    const activationPlan = body.activationPlan as Record<string, unknown>;
    const revenueAndRails = body.revenueAndRails as Record<string, unknown>;
    const activationRunway = body.activationRunway as Record<string, unknown>;
    const guidedMoneyFlow = body.guidedMoneyFlow as Record<string, unknown>;
    const commercialOperatingState = body.commercialOperatingState as Record<
      string,
      unknown
    >;
    const currentState = body.currentState as Record<string, unknown>;
    const nextAction = body.nextAction as Record<string, unknown>;
    const operatorRunbook = body.operatorRunbook as Record<string, unknown>;
    const smokeCommands = operatorRunbook.smokeCommands as string[];
    const authenticatedSmokeCommands =
      operatorRunbook.authenticatedSmokeCommands as string[];
    const setupGroups = operatorRunbook.setupGroups as Array<Record<string, unknown>>;

    assert.equal(response.status, 200);
    assert.equal(body.service, "payshield-activation-console");
    assert.equal(activationPlan.nextStageKey, "revenue");
    assert.equal(activationRunway.service, "payshield-activation-runway");
    assert.equal(guidedMoneyFlow.service, "payshield-guided-money-flow");
    assert.equal(
      commercialOperatingState.service,
      "payshield-commercial-operating-state",
    );
    assert.equal(Array.isArray(revenueAndRails.rails), true);
    assert.equal(nextAction.primaryEndpoint, "POST /api/app/billing/checkout");
    assert.equal(operatorRunbook.activationEndpoint, "/api/launch/activation");
    assert.equal(operatorRunbook.appActivationEndpoint, "/api/app/activation");
    assert.equal(
      smokeCommands.some((command) => command.includes("/api/launch/activation")),
      true,
    );
    assert.equal(
      smokeCommands.some((command) => command.startsWith("npm run smoke:deploy -- ")),
      true,
    );
    assert.equal(
      smokeCommands.some((command) => command.startsWith("npm run production:routes -- ")),
      true,
    );
    assert.equal(
      authenticatedSmokeCommands.some((command) =>
        command.includes("/api/app/activation"),
      ),
      true,
    );
    assert.equal(
      setupGroups.some(
        (group) =>
          group.key === "revenue" &&
          Array.isArray(group.setupCommands) &&
          String((group.setupCommands as string[]).join("\n")).includes(
            "npx vercel env add PAYSHIELD_CORE_SERVICE_TOKEN production",
          ),
      ),
      true,
    );
    assert.equal(
      setupGroups.some(
        (group) =>
          group.key === "money_movement" &&
          Array.isArray(group.setupCommands) &&
          String((group.setupCommands as string[]).join("\n")).includes(
            "npx vercel env add PAYSHIELD_BAAS_API_KEY production",
          ),
      ),
      true,
    );
    assert.equal(
      (currentState.commercialAccess as Record<string, unknown>).state,
      "needs_setup",
    );
    assert.equal(
      (currentState.guidedMoneyFlow as Record<string, unknown>).service,
      "payshield-guided-money-flow",
    );
    assert.equal(
      (currentState.commercialOperatingState as Record<string, unknown>).service,
      "payshield-commercial-operating-state",
    );
  });
});

test("core audit export packages ledger and operations for support handoff", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/api/app/audit/export");
    const ledger = body.ledger as Record<string, unknown>;
    const support = body.support as Record<string, unknown>;
    const activationPlan = body.activationPlan as Record<string, unknown>;
    const activationRunway = body.activationRunway as Record<string, unknown>;
    const guidedMoneyFlow = body.guidedMoneyFlow as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.service, "payshield-audit-export");
    assert.equal(body.exportVersion, "payshield-household-audit-v1");
    assert.equal(ledger.source, "core_control_model");
    assert.equal(Array.isArray(ledger.entries), true);
    assert.equal(support.contact, "support@graystontechnologies.com");
    assert.equal(activationPlan.totalStages, 6);
    assert.equal(activationRunway.service, "payshield-activation-runway");
    assert.equal(guidedMoneyFlow.service, "payshield-guided-money-flow");
  });
});

test("core reconciliation resolution validates and requires durable closeout", async () => {
  await withCoreServer(async (baseUrl) => {
    const missingIdentifier = await getJson(
      baseUrl,
      "/api/app/reconciliation/resolve",
      jsonPost({
        resolutionNote: "Reviewed duplicate provider event.",
      }),
    );

    assert.equal(missingIdentifier.response.status, 400);
    assert.equal(
      missingIdentifier.body.service,
      "payshield-reconciliation-resolution",
    );

    const missingNote = await getJson(
      baseUrl,
      "/api/app/reconciliation/resolve",
      jsonPost({
        exceptionId: "reconciliation_exception_demo",
      }),
    );

    assert.equal(missingNote.response.status, 400);
    assert.match(String(missingNote.body.error), /resolutionNote/);

    const blocked = await getJson(
      baseUrl,
      "/api/app/reconciliation/resolve",
      jsonPost(
        {
          exceptionId: "reconciliation_exception_demo",
          reason: "duplicate_event",
          resolutionNote: "Provider replay was reviewed and no ledger change was needed.",
        },
        {
          headers: {
            "x-payshield-user-id": "support_operator",
          },
        },
      ),
    );
    const resolution = blocked.body.resolution as Record<string, unknown>;

    assert.equal(blocked.response.status, 424);
    assert.equal(blocked.body.service, "payshield-reconciliation-resolution");
    assert.match(String(blocked.body.error), /Postgres operations store/i);
    assert.equal(resolution.persistence, "memory");
  });
});

test("core records money-rail provider failures as reconciliation exceptions", async () => {
  process.env.PAYSHIELD_BAAS_ADAPTER = "http_json";
  process.env.PAYSHIELD_BAAS_API_BASE_URL = "http://127.0.0.1:8999";
  process.env.PAYSHIELD_BAAS_API_KEY = "provider-key";
  process.env.PAYSHIELD_BAAS_PROVIDER = "test-baas";

  const persistence = (await recordMoneyRailProviderException({
    actor: {
      householdId: "household_provider_failure",
      id: "user_provider_failure",
    },
    amountCents: 25_000,
    destinationPayeeId: "payee_abc_apartments",
    error: new Error("Provider transfer failed with status 500."),
    idempotencyKey: "provider-failure-transfer",
    operation: "createAchTransfer",
    rail: "transfer",
    sourceBucketId: "rent",
  })) as {
    exception: Record<string, unknown>;
    persistence: string;
  };
  const exception = persistence.exception;
  const metadata = exception.metadata as Record<string, unknown>;

  assert.equal(persistence.persistence, "memory");
  assert.equal(exception.householdId, "household_provider_failure");
  assert.equal(
    exception.idempotencyKey,
    "money-rail:transfer:provider-failure-transfer",
  );
  assert.equal(exception.providerEventId, "transfer:provider-failure-transfer");
  assert.equal(exception.providerName, "test-baas");
  assert.equal(exception.reasonCode, "provider_adapter_error");
  assert.equal(exception.severity, "critical");
  assert.equal(exception.source, "money_rail");
  assert.equal(exception.status, "open");
  assert.equal(metadata.amountCents, 25_000);
  assert.equal(metadata.destinationPayeeId, "payee_abc_apartments");
  assert.equal(metadata.operation, "createAchTransfer");
  assert.equal(metadata.sourceBucketId, "rent");
});

test("core records transaction-sync removals with a valid reconciliation source", async () => {
  const persistence = (await persistTransactionSyncException({
    actor: {
      householdId: "household_sync_exception",
      id: "user_sync_exception",
    },
    bankConnection: {
      householdId: "household_sync_exception",
      id: "bank_connection_sync_exception",
      providerAccountId: "acc_sync_exception",
      providerItemId: "item_sync_exception",
    },
    env: process.env,
    providerEventId: "evt_transactions_sync_removed",
    providerName: "plaid",
    providerTransactionId: "txn_removed_001",
    reason:
      "Plaid reported a removed transaction that may require ledger review.",
    reasonCode: "plaid_transaction_removed",
    status: "removed",
  })) as {
    exception: Record<string, unknown>;
    persistence: string;
  };
  const exception = persistence.exception;
  const metadata = exception.metadata as Record<string, unknown>;

  assert.equal(persistence.persistence, "memory");
  assert.equal(exception.householdId, "household_sync_exception");
  assert.equal(
    exception.idempotencyKey,
    "money-rail-exception:transaction_sync:plaid:evt_transactions_sync_removed:txn_removed_001:plaid_transaction_removed",
  );
  assert.equal(exception.providerEventId, "evt_transactions_sync_removed");
  assert.equal(exception.providerName, "plaid");
  assert.equal(exception.providerTransactionId, "txn_removed_001");
  assert.equal(exception.reasonCode, "plaid_transaction_removed");
  assert.equal(exception.severity, "critical");
  assert.equal(exception.source, "money_rail");
  assert.equal(metadata.bankConnectionId, "bank_connection_sync_exception");
  assert.equal(metadata.providerAccountId, "acc_sync_exception");
  assert.equal(metadata.providerItemId, "item_sync_exception");
  assert.equal(metadata.rail, "transaction_sync");
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

test("core ledger replay uses posted journal entries as balance source", () => {
  const balances = replayJournalEntriesForBalances([
    {
      createdAt: "2026-06-12T12:00:00.000Z",
      id: "journal_paycheck",
      idempotencyKey: "paycheck-001",
      lines: [
        {
          accountId: "asset:program_cash",
          amountCents: 300_000,
        },
        {
          accountId: "liability:bucket:rent",
          amountCents: -50_000,
        },
        {
          accountId: "liability:bucket:vehicle",
          amountCents: -30_000,
        },
        {
          accountId: "liability:bucket:insurance",
          amountCents: -50_000,
        },
        {
          accountId: "liability:bucket:kids",
          amountCents: -5_000,
        },
        {
          accountId: "liability:bucket:vacation",
          amountCents: -10_000,
        },
        {
          accountId: "liability:bucket:emergency",
          amountCents: -10_000,
        },
        {
          accountId: "liability:bucket:safe_spending",
          amountCents: -145_000,
        },
      ],
      memo: "Paycheck deposit from Acme Payroll",
      metadata: {},
      type: "paycheck_deposit",
    },
    {
      createdAt: "2026-06-12T12:05:00.000Z",
      id: "journal_card",
      idempotencyKey: "card-001",
      lines: [
        {
          accountId: "liability:bucket:safe_spending",
          amountCents: 20_000,
        },
        {
          accountId: "liability:card_settlement",
          amountCents: -20_000,
        },
      ],
      memo: "Card authorization: Grocery",
      metadata: {},
      type: "card_authorization",
    },
  ]) as Array<Record<string, unknown>>;

  const rent = balances.find((bucket) => bucket.id === "rent");
  const safeSpend = balances.find((bucket) => bucket.id === "safe_spending");

  assert.equal(rent?.availableCents, 50_000);
  assert.equal(safeSpend?.availableCents, 125_000);
});

test("core postgres gate requires verified ledger schema version", async () => {
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgres://payshield:secret@example.invalid:5432/ledger";

  await withCoreServer(async (baseUrl) => {
    const urlOnly = await getJson(baseUrl, "/ready");
    const urlOnlyReadiness = urlOnly.body.readiness as Record<string, unknown>;
    const urlOnlyGates = urlOnlyReadiness.gates as Array<
      Record<string, unknown>
    >;
    const postgresGate = urlOnlyGates.find(
      (gate) => gate.id === "postgres_ledger",
    );

    assert.equal(urlOnlyReadiness.postgresConfigured, true);
    assert.equal(urlOnlyReadiness.postgresSchemaVerified, false);
    assert.equal(urlOnlyReadiness.postgresSchemaVersion, "0019");
    assert.equal(postgresGate?.ok, false);

    process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED = "true";
    process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION = "0002";

    const staleVersion = await getJson(baseUrl, "/ready");
    const staleReadiness = staleVersion.body.readiness as Record<
      string,
      unknown
    >;
    const staleGates = staleReadiness.gates as Array<Record<string, unknown>>;

    assert.equal(
      staleGates.find((gate) => gate.id === "postgres_ledger")?.ok,
      false,
    );

    process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION = "0019";

    const verified = await getJson(baseUrl, "/ready");
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

test("core postgres gate accepts secret-injected RDS connection fields", async () => {
  process.env.PGHOST = "ledger.cluster-example.us-east-1.rds.amazonaws.com";
  process.env.PGPORT = "5432";
  process.env.PGDATABASE = "payshield";
  process.env.PGUSER = "payshield_core";
  process.env.PGPASSWORD = "test-password-not-used";
  process.env.PGSSLMODE = "require";
  process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED = "true";
  process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION = "0019";

  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(baseUrl, "/ready");
    const readiness = body.readiness as Record<string, unknown>;
    const gates = readiness.gates as Array<Record<string, unknown>>;

    assert.equal(response.status, 503);
    assert.equal(readiness.postgresConfigured, true);
    assert.equal(readiness.postgresSchemaVerified, true);
    assert.equal(
      gates.find((gate) => gate.id === "postgres_ledger")?.ok,
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

test("core commercial billing ignores unhandled events for subscription state", () => {
  assert.equal(shouldUpdateCommercialSubscription("active"), true);
  assert.equal(shouldUpdateCommercialSubscription("past_due"), true);
  assert.equal(shouldUpdateCommercialSubscription("canceled"), true);
  assert.equal(shouldUpdateCommercialSubscription("pending"), true);
  assert.equal(shouldUpdateCommercialSubscription("blocked"), true);
  assert.equal(shouldUpdateCommercialSubscription("ignored"), false);
});

test("core checkout route records paid-access intent before webhook activation", async () => {
  process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL =
    "https://buy.stripe.com/test_paid_access";
  const checkoutActor = {
    "x-payshield-user-id": "user_checkout_intent_001",
  };

  await withCoreServer(async (baseUrl) => {
    const intent = await getJson(
      baseUrl,
      "/api/app/billing/checkout",
      jsonPost({
        checkoutMode: "payment_link",
        checkoutUrlPresent: true,
        idempotencyKey: "core-checkout-primary",
        priceLabel: "$19/month",
        status: "payment_link",
      }, { headers: checkoutActor }),
    );
    const checkoutIntent = intent.body.checkoutIntent as Record<string, unknown>;

    assert.equal(intent.response.status, 200);
    assert.equal(intent.body.service, "payshield-checkout-intent");
    assert.equal(intent.body.persisted, false);
    assert.equal(checkoutIntent.status, "payment_link");
    assert.equal(checkoutIntent.idempotencyKey, "core-checkout-primary");

    const operations = await getJson(
      baseUrl,
      "/api/app/operations",
      { headers: checkoutActor },
    );
    const commercialAccess = operations.body.commercialAccess as Record<
      string,
      unknown
    >;
    const records = operations.body.operations as Record<string, unknown[]>;
    const timeline = operations.body.timeline as Array<Record<string, unknown>>;

    assert.equal(operations.response.status, 200);
    assert.equal(commercialAccess.state, "checkout_started");
    assert.equal(commercialAccess.checkoutIntentStatus, "payment_link");
    assert.equal(records.checkoutIntents.length, 1);
    assert.equal(
      timeline.some((item) => item.label === "Checkout intent"),
      true,
    );
  });
});

test("core launch gate evidence route requires redacted durable approval records", async () => {
  await withCoreServer(async (baseUrl) => {
    const unsafe = await getJson(
      baseUrl,
      "/api/launch/gate-evidence",
      jsonPost({
        approvedBy: "Grayston Ops",
        evidenceRef: "secret-token-contract",
        evidenceSummary: "Provider contract approval.",
        gateId: "provider_contract",
        scope: "provider",
        status: "approved",
      }),
    );

    assert.equal(unsafe.response.status, 400);
    assert.match(String(unsafe.body.error), /redacted handles/i);

    const missingPostgres = await getJson(
      baseUrl,
      "/api/launch/gate-evidence",
      jsonPost({
        approvedBy: "Grayston Ops",
        evidenceRef: "notion-provider-contract-approval-001",
        evidenceSummary: "Provider contract approval recorded outside PayShield.",
        gateId: "provider_contract",
        scope: "provider",
        status: "approved",
      }),
    );

    assert.equal(missingPostgres.response.status, 503);
    assert.equal(missingPostgres.body.code, "postgres_ledger_required");
    assert.match(String(missingPostgres.body.error), /schema 0019/);
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
      "/api/app/direct-deposit",
      "direct deposit setup",
      jsonPost(
        { idempotencyKey: "core-paid-gate-direct-deposit" },
        { headers: unpaidActor },
      ),
    ],
    [
      "/api/app/paychecks/rules",
      "paycheck detection setup",
      jsonPost(
        {
          employerNamePattern: "ACME PAYROLL",
          minimumAmountCents: 150_000,
          ruleName: "ACME payroll",
        },
        { headers: unpaidActor },
      ),
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
  process.env.PLAID_WEBHOOK_URL = "https://core.payshield.test/plaid/webhooks";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

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

test("core direct deposit route records paycheck routing setup", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/direct-deposit",
      jsonPost({
        idempotencyKey: "core-direct-deposit-primary",
      }),
    );
    const directDeposit = body.directDeposit as Record<string, unknown>;
    const persistence = body.persistence as Record<string, unknown>;
    const setup = body.setup as Record<string, unknown>;

    assert.equal(response.status, 423);
    assert.equal(body.service, "payshield-direct-deposit-setup");
    assert.equal(body.persisted, false);
    assert.equal(directDeposit.providerStatus, "gated");
    assert.equal(directDeposit.accountLast4, "----");
    assert.equal(persistence.persistence, "memory");
    assert.equal(setup.status, "blocked");
    assert.equal(setup.idempotencyKey, "core-direct-deposit-primary");
  });
});

test("core paycheck readiness requires a verified Plaid webhook destination", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";

  await withCoreServer(async (baseUrl) => {
    const missingEncryption = await getJson(baseUrl, "/api/app/operations");
    const missingEncryptionMoneyRails = missingEncryption.body.moneyRails as Record<
      string,
      unknown
    >;
    const missingEncryptionGates = missingEncryptionMoneyRails.missing as string[];

    assert.equal(missingEncryption.response.status, 200);
    assert.equal(missingEncryptionMoneyRails.bankLinkReady, false);
    assert.equal(missingEncryptionMoneyRails.tokenVaultStoreReady, false);
    assert.equal(
      missingEncryptionGates.includes("PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY"),
      true,
    );

    process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef";

    const missingWebhook = await getJson(baseUrl, "/api/app/operations");
    const missingWebhookRails = missingWebhook.body.moneyRails as Record<
      string,
      unknown
    >;
    const missingWebhookGates = missingWebhookRails.missing as string[];

    assert.equal(missingWebhook.response.status, 200);
    assert.equal(missingWebhookRails.bankLinkReady, false);
    assert.equal(missingWebhookRails.paycheckDetectionReady, false);
    assert.equal(
      missingWebhookGates.includes("PLAID_WEBHOOK_URL"),
      true,
    );

    process.env.PLAID_WEBHOOK_URL =
      "https://core.payshield.test/plaid/webhooks";

    process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "provider-secret";

    const signed = await getJson(baseUrl, "/api/app/operations");
    const signedMoneyRails = signed.body.moneyRails as Record<string, unknown>;

    assert.equal(signed.response.status, 200);
    assert.equal(signedMoneyRails.bankLinkReady, true);
    assert.equal(signedMoneyRails.paycheckDetectionReady, true);
    assert.equal(signedMoneyRails.plaidWebhookVerificationReady, true);
    assert.equal(signedMoneyRails.providerWebhookSigningConfigured, true);
  });
});

test("core paycheck detection rule route validates recurring income setup", async () => {
  await withCoreServer(async (baseUrl) => {
    const { body, response } = await getJson(
      baseUrl,
      "/api/app/paychecks/rules",
      jsonPost({
        employerNamePattern: "ACME PAYROLL",
        expectedFrequency: "biweekly",
        idempotencyKey: "core-rule-acme-payroll",
        maximumAmountCents: 250_000,
        minimumAmountCents: 150_000,
        providerName: "plaid",
        ruleName: "ACME payroll",
      }),
    );
    const rule = body.rule as Record<string, unknown>;
    const match = rule.match as Record<string, unknown>;
    const amountRange = rule.amountRangeCents as Record<string, unknown>;
    const persistence = body.persistence as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(body.service, "payshield-paycheck-detection-rules");
    assert.equal(body.persisted, false);
    assert.equal(persistence.persistence, "memory");
    assert.equal(rule.ruleName, "ACME payroll");
    assert.equal(rule.expectedFrequency, "biweekly");
    assert.equal(match.employerNamePattern, "ACME PAYROLL");
    assert.equal(amountRange.min, 150_000);

    const invalid = await getJson(
      baseUrl,
      "/api/app/paychecks/rules",
      jsonPost({
        employerNamePattern: "ACME PAYROLL",
        maximumAmountCents: 150_000,
        minimumAmountCents: 150_000,
        ruleName: "Invalid payroll",
      }),
    );

    assert.equal(invalid.response.status, 400);
    assert.equal(
      invalid.body.error,
      "maximumAmountCents must be greater than minimumAmountCents.",
    );
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
    assert.equal(
      missing.includes("PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL"),
      true,
    );
    assert.equal(missing.includes("PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET"), true);
  });
});

test("core readiness can use the core service URL as the token-vault receiver", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PLAID_WEBHOOK_URL = "https://core.payshield.test/plaid/webhooks";
  process.env.PAYSHIELD_CORE_API_URL = "https://core.payshield.test";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

  await withCoreServer(async () => {
    const body = getCoreHealth(process.env);
    const moneyRails = body.moneyRails as Record<string, unknown>;
    const missing = moneyRails.missing as string[];

    assert.equal(moneyRails.bankLinkReady, true);
    assert.equal(moneyRails.tokenVaultHandoffReady, true);
    assert.equal(moneyRails.tokenVaultStoreReady, true);
    assert.equal(moneyRails.tokenVaultWebhookSource, "core_service");
    assert.equal(
      missing.includes("PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL"),
      false,
    );
  });
});

test("core creates Android Plaid Link tokens only for the PayShield package", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PLAID_WEBHOOK_URL = "https://core.payshield.test/plaid/webhooks";
  process.env.PAYSHIELD_ANDROID_PACKAGE_NAME =
    "com.graystontechnologies.payshield";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL =
    "https://core.payshield.test/token-vault/plaid";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";
  const originalFetch = globalThis.fetch;
  let plaidRequestBody: Record<string, unknown> = {};

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://sandbox.plaid.com/link/token/create");
    plaidRequestBody = JSON.parse(String(init?.body || "{}")) as Record<
      string,
      unknown
    >;

    return Response.json({
      expiration: "2026-08-10T12:00:00Z",
      link_token: "link-sandbox-native",
      request_id: "plaid-request-native",
    });
  };

  try {
    const result = (await createBankLinkToken({
      __payshieldActor: { userId: "user_android_link" },
      androidPackageName: "com.graystontechnologies.payshield",
      platform: "android",
    })) as unknown as { body: Record<string, unknown>; status: number };

    assert.equal(result.status, 200);
    assert.equal(result.body.linkToken, "link-sandbox-native");
    assert.equal(
      plaidRequestBody.android_package_name,
      "com.graystontechnologies.payshield",
    );
    assert.equal(plaidRequestBody.redirect_uri, undefined);

    const mismatch = (await createBankLinkToken({
      __payshieldActor: { userId: "user_android_link" },
      androidPackageName: "com.example.imposter",
      platform: "android",
    })) as unknown as { body: Record<string, unknown>; status: number };

    assert.equal(mismatch.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

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

test("core money-control routes require Postgres when durable storage mode is enabled", async () => {
  process.env.PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE = "true";
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

  await withCoreServer(async (baseUrl) => {
    const profile = await getJson(
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
    const directDeposit = await getJson(
      baseUrl,
      "/api/app/direct-deposit",
      jsonPost({ idempotencyKey: "durable-required-routing" }),
    );
    const moneyProfile = await getJson(
      baseUrl,
      "/api/app/money-profile",
      jsonPost({
        employerName: "Acme Payroll",
        expectedFrequency: "biweekly",
        paycheckAmountCents: 300_000,
        requestedTransferCents: 20_000,
      }),
    );
    const paycheckRule = await getJson(
      baseUrl,
      "/api/app/paychecks/rules",
      jsonPost({
        employerNamePattern: "ACME PAYROLL",
        expectedFrequency: "biweekly",
        maximumAmountCents: 250_000,
        minimumAmountCents: 150_000,
        providerName: "plaid",
        ruleName: "ACME payroll",
      }),
    );
    const paycheckDetection = await getJson(
      baseUrl,
      "/api/app/paychecks/detect",
      jsonPost({
        amountCents: 300_000,
        employerName: "Acme Payroll",
        idempotencyKey: "durable-required-paycheck",
      }),
    );
    const paycheckSync = await getJson(
      baseUrl,
      "/api/app/paychecks/sync",
      jsonPost({
        maxPages: 1,
      }),
    );
    const transfer = await getJson(
      baseUrl,
      "/api/app/transfers",
      jsonPost({
        amountCents: 25_000,
        destinationPayeeId: "payee_abc_apartments",
        idempotencyKey: "durable-required-transfer",
        sourceBucketId: "rent",
      }),
    );
    const bankConnection = await getJson(
      baseUrl,
      "/api/app/bank-connections",
      jsonPost({
        accountId: "acc_durable_required",
        itemId: "item_durable_required",
        providerName: "plaid",
        tokenSecretRef: "vault://plaid/item_durable_required",
      }),
    );

    assert.equal(profile.response.status, 503);
    assert.equal(moneyProfile.response.status, 503);
    assert.equal(directDeposit.response.status, 503);
    assert.equal(paycheckRule.response.status, 503);
    assert.equal(paycheckDetection.response.status, 403);
    assert.match(
      String(paycheckDetection.body.error),
      /verified bank sync or signed provider event/i,
    );
    assert.equal(paycheckSync.response.status, 503);
    assert.equal(transfer.response.status, 503);
    assert.equal(bankConnection.response.status, 503);
    assert.equal(
      (profile.body.persistence as Record<string, unknown>).persistence,
      "postgres_required",
    );
    assert.equal(
      (moneyProfile.body.persistence as Record<string, unknown>).persistence,
      "postgres_required",
    );
    for (const route of [
      directDeposit,
      paycheckRule,
      paycheckSync,
      transfer,
    ]) {
      assert.equal(route.body.code, "postgres_identity_required");
      assert.equal(
        (route.body.identityPersistence as Record<string, unknown>).persistence,
        "postgres_required",
      );
    }
    assert.equal(
      (bankConnection.body.persistence as Record<string, unknown>).persistence,
      "postgres_required",
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
    const approvedPersistence = approved.body.decisionPersistence as Record<
      string,
      unknown
    >;
    const approvedJournal = approved.body.journalPersistence as Record<
      string,
      unknown
    >;

    assert.equal(approved.response.status, 200);
    assert.equal(approved.body.mode, "core_ledger");
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

test("core card authorization requires a valid provider signature when signing is configured", async () => {
  process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "card-provider-secret";

  await withCoreServer(async (baseUrl) => {
    const payload = {
      amountCents: 8_000,
      merchantName: "Grocery market",
      providerAuthorizationId: "auth_signed_001",
      providerCardId: "card_signed_001",
      providerName: "marqeta",
    };
    const unsigned = await getJson(
      baseUrl,
      "/api/card/authorize",
      jsonPost(payload),
    );
    const invalid = await getJson(
      baseUrl,
      "/api/card/authorize",
      jsonPost(payload, {
        headers: {
          "x-payshield-provider-signature": "t=123,v1=bad",
        },
      }),
    );
    const signed = await getJson(
      baseUrl,
      "/api/card/authorize",
      signedProviderJsonPost(payload, "card-provider-secret"),
    );

    assert.equal(unsigned.response.status, 401);
    assert.match(String(unsigned.body.error), /signed raw body/i);
    assert.equal(invalid.response.status, 401);
    assert.match(String(invalid.body.error), /timestamp|signature/i);
    assert.equal(signed.response.status, 503);
    assert.match(String(signed.body.error), /durable account records/i);
  });
});

test("core unlock route refuses to present a release before live controls are ready", async () => {
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
    assert.equal(response.status, 423);
    assert.equal(body.code, "protected_unlock_unavailable");
    assert.equal(body.result, undefined);
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
    assert.match(String(payee.id), /^payee_[a-f0-9]{32}$/);
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
    const persistence = body.identityPersistence as Record<string, unknown>;

    assert.equal(response.status, 503);
    assert.equal(
      body.error,
      "Household identity could not be persisted before bill payment destinations.",
    );
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
    assert.equal(response.status, 423);
    assert.equal(body.code, "protected_transfer_unavailable");

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

    const wrongBucket = await getJson(
      baseUrl,
      "/api/app/transfers",
      jsonPost({
        amountCents: 25_000,
        destinationPayeeId: "payee_abc_apartments",
        sourceBucketId: "vehicle",
      }),
    );

    assert.equal(wrongBucket.response.status, 400);
    assert.equal(
      wrongBucket.body.error,
      "Protected transfers can only release to a payee assigned to the source bucket.",
    );

    const safeSpend = await getJson(
      baseUrl,
      "/api/app/transfers",
      jsonPost({
        amountCents: 25_000,
        destinationPayeeId: "payee_abc_apartments",
        sourceBucketId: "safe_spending",
      }),
    );

    assert.equal(safeSpend.response.status, 400);
    assert.equal(
      safeSpend.body.error,
      "Protected transfers cannot release Safe to Spend funds.",
    );

    const overLimit = await getJson(
      baseUrl,
      "/api/app/transfers",
      jsonPost({
        amountCents: 90_000,
        destinationPayeeId: "payee_auto_lender",
        sourceBucketId: "vehicle",
      }),
    );

    assert.equal(overLimit.response.status, 400);
    assert.equal(
      overLimit.body.error,
      "Transfer amount exceeds the approved destination limit.",
    );
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

    assert.equal(paycheck.response.status, 403);
    assert.equal(
      paycheck.body.error,
      "Paycheck posting requires a verified bank sync or signed provider event.",
    );
    assert.equal(transfer.response.status, 503);
    assert.equal(
      transfer.body.error,
      "Household identity could not be persisted before protected transfers.",
    );
    assert.equal(
      (transfer.body.identityPersistence as Record<string, unknown>).persistence,
      "postgres_error",
    );
  });
});

test("core bill payment route refuses to schedule before live controls are ready", async () => {
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
    assert.equal(response.status, 423);
    assert.equal(body.code, "bill_payment_unavailable");
    assert.equal(body.ledgerEntries, undefined);
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
    assert.equal(invalidDate.response.status, 400);
    assert.equal(unapproved.response.status, 423);
    assert.equal(unapproved.body.code, "bill_payment_unavailable");
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

test("core accepts verified Plaid webhooks without the private app service token", async () => {
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "private-app-token";
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PLAID_WEBHOOK_URL =
    "https://core.payshield.test/plaid/webhooks";
  const originalFetch = globalThis.fetch;
  const keyId = `plaid-test-${Date.now()}`;
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  const payload = {
    environment: "sandbox",
    item_id: "item_verified_plaid",
    webhook_code: "SYNC_UPDATES_AVAILABLE",
    webhook_type: "TRANSACTIONS",
  };
  const rawBody = JSON.stringify(payload);
  const token = await new SignJWT({
    request_body_sha256: createHash("sha256").update(rawBody).digest("hex"),
  })
    .setIssuedAt()
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .sign(privateKey);

  globalThis.fetch = async (input, init) => {
    if (!String(input).endsWith("/webhook_verification_key/get")) {
      return originalFetch(input, init);
    }

    return Response.json({
      key: {
        ...jwk,
        alg: "ES256",
        created_at: Math.floor(Date.now() / 1000) - 60,
        expired_at: null,
        kid: keyId,
        use: "sig",
      },
      request_id: "plaid-verification-request",
    });
  };

  try {
    await withCoreServer(async (baseUrl) => {
      const { body, response } = await getJson(baseUrl, "/plaid/webhooks", {
        body: rawBody,
        headers: {
          "content-type": "application/json",
          "plaid-verification": token,
        },
        method: "POST",
      });

      assert.equal(response.status, 202);
      assert.equal(body.accepted, true);
      assert.equal(body.mode, "plaid_sync_queued");
      assert.equal(body.service, "payshield-provider-webhook");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("core rejects Plaid webhooks when the signed body hash does not match", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  const originalFetch = globalThis.fetch;
  const keyId = `plaid-hash-test-${Date.now()}`;
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  const rawBody = JSON.stringify({
    environment: "sandbox",
    item_id: "item_plaid_hash_mismatch",
    webhook_code: "SYNC_UPDATES_AVAILABLE",
    webhook_type: "TRANSACTIONS",
  });
  const token = await new SignJWT({
    request_body_sha256: "0".repeat(64),
  })
    .setIssuedAt()
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .sign(privateKey);

  globalThis.fetch = async (input, init) => {
    if (!String(input).endsWith("/webhook_verification_key/get")) {
      return originalFetch(input, init);
    }

    return Response.json({
      key: {
        ...jwk,
        alg: "ES256",
        created_at: Math.floor(Date.now() / 1000) - 60,
        expired_at: null,
        kid: keyId,
        use: "sig",
      },
    });
  };

  try {
    await withCoreServer(async (baseUrl) => {
      const { body, response } = await getJson(baseUrl, "/plaid/webhooks", {
        body: rawBody,
        headers: {
          "content-type": "application/json",
          "plaid-verification": token,
        },
        method: "POST",
      });

      assert.equal(response.status, 401);
      assert.equal(body.accepted, false);
      assert.equal(body.providerWebhookAuthenticity, "invalid_plaid_signature_claims");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("core provider webhook posts income transactions into paycheck split flow", async () => {
  process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "private-app-service-token";
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PLAID_WEBHOOK_URL = "https://core.payshield.test/plaid/webhooks";
  process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "provider-webhook-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

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
        {
          account_id: "acc_payroll",
          amount: -25_000,
          date: "2026-06-12",
          item_id: "item_payroll",
          name: "OVERSIZED PAYROLL",
          pending: false,
          personal_finance_category: {
            detailed: "INCOME_WAGES",
            primary: "INCOME",
          },
          transaction_id: "txn_payroll_too_large",
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
    const skipped = body.skipped as Array<Record<string, unknown>>;

    assert.equal(response.status, 202);
    assert.equal(body.accepted, true);
    assert.equal(body.mode, "processed");
    assert.equal(body.detectionCount, 1);
    assert.equal(body.skippedCount, 1);
    assert.equal(eventPersistence.persistence, "memory");
    assert.equal(detections[0]?.amountCents, 187_542);
    assert.equal(detections[0]?.employerName, "ACME PAYROLL");
    assert.match(String(detections[0]?.idempotencyKey), /^provider-txn:/);
    assert.equal(detections[0]?.providerTransactionId, "txn_payroll_001");
    assert.equal(skipped[0]?.providerTransactionId, "txn_payroll_too_large");
    assert.equal(skipped[0]?.status, "rejected");
    assert.equal(
      (skipped[0]?.exceptionPersistence as Record<string, unknown>)
        ?.persistence,
      "memory",
    );
    assert.equal(
      (
        (skipped[0]?.exceptionPersistence as Record<string, unknown>)
          ?.exception as Record<string, unknown>
      )?.reasonCode,
      "paycheck_detection_rejected",
    );
    assert.match(String(skipped[0]?.reason), /amountCents/i);

    const replayPayload = {
      ...payload,
      eventId: "evt_income_sync_retry",
      requestId: "req_income_sync_retry",
    };
    const replay = await getJson(
      baseUrl,
      "/api/provider/webhooks",
      signedProviderJsonPost(replayPayload, "provider-webhook-secret"),
    );
    const replayDetections = replay.body.detections as Array<
      Record<string, unknown>
    >;

    assert.equal(replay.response.status, 202);
    assert.equal(
      replayDetections[0]?.idempotencyKey,
      detections[0]?.idempotencyKey,
    );
  });
});

test("core provider webhook requires signing before linked-bank detection can run", async () => {
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

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
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

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

test("core provider webhook fails closed when durable event persistence is unavailable", async () => {
  process.env.PAYSHIELD_LEDGER_DATABASE_URL =
    "postgres://payshield:payshield@127.0.0.1:1/payshield";
  process.env.PAYSHIELD_CORE_DB_CONNECT_TIMEOUT_MS = "100";
  process.env.PLAID_CLIENT_ID = "plaid-client";
  process.env.PLAID_SECRET = "plaid-secret";
  process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET = "provider-webhook-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID = "vault-key";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL = "http://127.0.0.1/vault";
  process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET = "vault-secret";
  process.env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef";

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

    assert.equal(response.status, 503);
    assert.equal(body.accepted, false);
    assert.match(
      String(body.error),
      /audit event could not be persisted/i,
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
    const blockedReadiness = await getJson(baseUrl, "/ready");

    assert.equal(blocked.response.status, 401);
    assert.equal(blocked.body.error, "Unauthorized");
    assert.equal(blockedOperations.response.status, 401);
    assert.equal(blockedReadiness.response.status, 401);
    assert.equal(blockedReadiness.body.error, "Unauthorized");

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
    const authorizedReadiness = await getJson(baseUrl, "/ready", {
      headers: {
        authorization: "Bearer core-test-token",
      },
    });

    assert.equal(authorized.response.status, 200);
    assert.equal(authorized.body.safeToSpendCents, 145_000);
    assert.equal(authorizedOperations.response.status, 200);
    assert.equal(authorizedOperations.body.service, "payshield-household-operations");
    assert.equal(authorizedReadiness.response.status, 503);
    assert.equal(authorizedReadiness.body.service, "payshield-core");
    assert.equal(
      (authorizedReadiness.body.readiness as Record<string, unknown>)
        .liveMoneyReady,
      false,
    );
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
