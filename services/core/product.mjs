import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  databaseConfigured,
  loadActiveBankConnectionForHousehold,
  loadActivePaycheckDetectionRules,
  loadOperationalAudit,
  loadBankConnectionForProvider,
  loadBucketProfile,
  loadPayees,
  loadProviderTokenSecret,
  persistBucketProfile,
  persistBankConnection,
  persistBankConnectionSyncState,
  persistBillPaymentSchedule,
  persistCardAuthorizationDecision,
  persistCommercialBillingEvent,
  persistCommercialCheckoutIntent,
  persistDirectDepositSetup,
  persistHouseholdIdentity,
  persistJournalEntry,
  persistMoneyRailEvent,
  persistPayee,
  persistPaycheckDetection,
  persistPaycheckDetectionRule,
  persistProductionGateEvidence,
  persistProviderTokenSecret,
  persistReconciliationException,
  persistTransferIntent,
  persistUnlockRequest,
  resolveReconciliationExceptionRecord,
  updateTransferIntentProviderStatus,
} from "./database.mjs";

const serviceName = "payshield-core";
export const coreLedgerSchemaVersion = "0013";
const productionGateEvidenceScopes = new Set([
  "provider",
  "sponsor_disclosure",
  "counsel",
  "operations",
  "ledger",
  "auth",
  "core",
  "commercial",
  "money_rail",
  "live_money",
]);
const productionGateEvidenceStatuses = new Set([
  "approved",
  "pending",
  "rejected",
  "revoked",
]);
const sensitiveEvidenceRefPattern =
  /(secret|token|password|credential|access[_-]?token)/i;

const gateDefinitions = [
  {
    description: "Signed BaaS/card partner contract is recorded.",
    env: "PAYSHIELD_BAAS_CONTRACT_APPROVED",
    id: "provider_contract",
    kind: "true",
  },
  {
    description: "Provider sandbox/live API credentials are configured.",
    id: "provider_credentials",
    kind: "provider_credentials",
  },
  {
    description: "Configured BaaS/card provider adapter can receive live API calls.",
    id: "provider_adapter",
    kind: "provider_adapter",
  },
  {
    description: "Sponsor-bank and pass-through wording is counsel-approved.",
    env: "PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED",
    id: "sponsor_disclosures",
    kind: "true",
  },
  {
    description: "Counsel has approved regulated product, fee, and UX copy.",
    env: "PAYSHIELD_REGULATED_COUNSEL_SIGNOFF",
    id: "counsel_signoff",
    kind: "true",
  },
  {
    description: "Reg E, dispute, reconciliation, and support runbooks exist.",
    env: "PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED",
    id: "operations_runbooks",
    kind: "true",
  },
  {
    description: "Durable Postgres ledger schema is configured and verified.",
    id: "postgres_ledger",
    kind: "postgres_ledger_verified",
  },
  {
    description: "Always-on regulated core backend is configured.",
    env: "PAYSHIELD_CORE_API_URL",
    id: "dedicated_backend",
    kind: "core_online_or_present",
  },
  {
    description: "Core service token is configured for protected internal operation routes.",
    env: "PAYSHIELD_CORE_SERVICE_TOKEN",
    id: "core_service_auth",
    kind: "present",
  },
  {
    description: "Clerk keys are configured for authenticated app access.",
    id: "clerk_auth",
    kind: "clerk",
  },
];

export const neobankBuckets = [
  {
    due: "1st",
    id: "rent",
    name: "Rent",
    payeeId: "payee_abc_apartments",
    priority: 10,
    protection: "bill_only",
    targetCents: 50_000,
  },
  {
    due: "15th",
    id: "vehicle",
    name: "Vehicle",
    payeeId: "payee_auto_lender",
    priority: 20,
    protection: "bill_only",
    targetCents: 30_000,
  },
  {
    due: "22nd",
    id: "insurance",
    name: "Insurance",
    payeeId: "payee_insurance",
    priority: 30,
    protection: "bill_only",
    targetCents: 50_000,
  },
  {
    due: "Every check",
    id: "kids",
    name: "Kids",
    priority: 40,
    protection: "hard_lock",
    targetCents: 5_000,
  },
  {
    due: "Every check",
    id: "vacation",
    name: "Vacation",
    priority: 50,
    protection: "soft_lock",
    targetCents: 10_000,
  },
  {
    due: "Every check",
    id: "emergency",
    name: "Emergency",
    priority: 60,
    protection: "emergency",
    targetCents: 10_000,
  },
  {
    due: "Remainder",
    id: "safe_spending",
    name: "Safe to Spend",
    priority: 100,
    protection: "spendable",
    targetCents: 0,
  },
];

export const neobankPayees = [
  {
    allowedBucketId: "rent",
    id: "payee_abc_apartments",
    maxCents: 100_000,
    name: "ABC Apartments",
    status: "approved",
  },
  {
    allowedBucketId: "vehicle",
    id: "payee_auto_lender",
    maxCents: 80_000,
    name: "Auto lender",
    status: "approved",
  },
  {
    allowedBucketId: "insurance",
    id: "payee_insurance",
    maxCents: 70_000,
    name: "Insurance carrier",
    status: "approved",
  },
];

export const demoUser = {
  email: "private-household@example.com",
  householdId: "household_demo_001",
  id: "user_demo_001",
  kycStatus: "provider_pending",
  name: "PayShield household",
  profileAccess: "approved",
};

const commercialBillingEvents = new Map();
const commercialCheckoutIntents = new Map();

const protectionValues = new Set([
  "bill_only",
  "emergency",
  "hard_lock",
  "soft_lock",
]);

function envTrue(env, name) {
  return env[name]?.trim().toLowerCase() === "true";
}

function envPresent(env, name) {
  return Boolean(env[name]?.trim());
}

const httpJsonProviderAdapter = "http_json";

const providerEndpointDefaults = {
  billPayment: "/bill-payments",
  cardAuthorization: "/card-authorizations",
  cardIssue: "/cards",
  customer: "/customers",
  directDeposit: "/direct-deposit-instructions",
  financialAccount: "/financial-accounts",
  kyc: "/kyc/applications",
  transfer: "/ach-transfers",
};

function cleanProviderBaseUrl(value, env) {
  if (!value?.trim()) {
    return "";
  }

  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname) &&
      env.VERCEL_ENV !== "production";

    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" && !localHttp)
    ) {
      return "";
    }

    url.pathname = url.pathname.replace(/\/+$/, "");

    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function cleanProviderPath(value, fallback) {
  const path = value?.trim() || fallback;

  if (!path.startsWith("/") || path.includes("://")) {
    return fallback;
  }

  return path.replace(/\/{2,}/g, "/");
}

function providerAdapterTimeoutMs(env) {
  const parsed = Number(env.PAYSHIELD_BAAS_TIMEOUT_MS);

  return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 30_000
    ? parsed
    : 8000;
}

function getProviderAdapterConfig(env = process.env) {
  const adapter = env.PAYSHIELD_BAAS_ADAPTER?.trim().toLowerCase() || "";
  const apiBaseUrl = cleanProviderBaseUrl(env.PAYSHIELD_BAAS_API_BASE_URL, env);
  const apiKeyConfigured = envPresent(env, "PAYSHIELD_BAAS_API_KEY");
  const providerName = env.PAYSHIELD_BAAS_PROVIDER?.trim() || "";
  const missing = [
    ...(adapter === httpJsonProviderAdapter ? [] : ["PAYSHIELD_BAAS_ADAPTER=http_json"]),
    ...(apiBaseUrl ? [] : ["PAYSHIELD_BAAS_API_BASE_URL"]),
    ...(apiKeyConfigured ? [] : ["PAYSHIELD_BAAS_API_KEY"]),
    ...(providerName ? [] : ["PAYSHIELD_BAAS_PROVIDER"]),
  ];

  return {
    adapter,
    apiBaseUrl,
    apiKeyConfigured,
    endpoints: {
      billPayment: cleanProviderPath(env.PAYSHIELD_BAAS_BILL_PAYMENT_PATH, providerEndpointDefaults.billPayment),
      cardAuthorization: cleanProviderPath(env.PAYSHIELD_BAAS_CARD_AUTHORIZATION_PATH, providerEndpointDefaults.cardAuthorization),
      cardIssue: cleanProviderPath(env.PAYSHIELD_BAAS_CARD_ISSUE_PATH, providerEndpointDefaults.cardIssue),
      customer: cleanProviderPath(env.PAYSHIELD_BAAS_CUSTOMER_PATH, providerEndpointDefaults.customer),
      directDeposit: cleanProviderPath(env.PAYSHIELD_BAAS_DIRECT_DEPOSIT_PATH, providerEndpointDefaults.directDeposit),
      financialAccount: cleanProviderPath(env.PAYSHIELD_BAAS_FINANCIAL_ACCOUNT_PATH, providerEndpointDefaults.financialAccount),
      kyc: cleanProviderPath(env.PAYSHIELD_BAAS_KYC_PATH, providerEndpointDefaults.kyc),
      transfer: cleanProviderPath(env.PAYSHIELD_BAAS_TRANSFER_PATH, providerEndpointDefaults.transfer),
    },
    missing,
    ok: missing.length === 0,
    providerName,
    timeoutMs: providerAdapterTimeoutMs(env),
  };
}

function joinProviderPath(baseUrl, path) {
  return new URL(path.replace(/^\/+/, ""), `${baseUrl}/`).toString();
}

class ProviderAdapterError extends Error {
  constructor(message = "Configured provider adapter request failed.") {
    super(message);
    this.name = "ProviderAdapterError";
  }
}

async function providerAdapterRequest(env, operation, path, body) {
  const config = getProviderAdapterConfig(env);

  if (!config.ok) {
    throw new ProviderAdapterError(
      `Provider adapter is missing ${config.missing.join(", ")}.`,
    );
  }

  let response;

  try {
    response = await fetch(joinProviderPath(config.apiBaseUrl, path), {
      body: JSON.stringify({
        ...body,
        operation,
        providerName: config.providerName,
      }),
      cache: "no-store",
      headers: {
        "authorization": `Bearer ${env.PAYSHIELD_BAAS_API_KEY?.trim()}`,
        "content-type": "application/json",
        "x-payshield-provider": config.providerName,
        "x-payshield-provider-operation": operation,
      },
      method: "POST",
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    throw new ProviderAdapterError(
      error instanceof Error
        ? `Provider ${operation} request failed: ${error.message}`
        : `Provider ${operation} request failed.`,
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ProviderAdapterError(
      safeString(payload?.error, 180) ||
        safeString(payload?.message, 180) ||
        `Provider ${operation} request failed with status ${response.status}.`,
    );
  }

  return safeObject(payload);
}

function providerField(payload, fields) {
  for (const field of fields) {
    const value = safeString(payload?.[field], 240);

    if (value) {
      return value;
    }
  }

  return "";
}

function providerRequestId(payload) {
  return providerField(payload, ["providerRequestId", "requestId", "id"]);
}

function requireProviderField(payload, fields, message) {
  const value = providerField(payload, fields);

  if (!value) {
    throw new ProviderAdapterError(message);
  }

  return value;
}

function providerErrorResult(error, service) {
  return {
    body: {
      error:
        error instanceof ProviderAdapterError
          ? error.message
          : "Configured provider adapter request failed.",
      service,
    },
    status: 502,
  };
}

export async function recordMoneyRailProviderException(
  {
    actor,
    amountCents,
    destinationPayeeId = "",
    error,
    idempotencyKey,
    operation,
    payeeId = "",
    rail,
    sourceBucketId = "",
  },
  env = process.env,
) {
  const providerName =
    getProviderAdapterConfig(env).providerName ||
    safeString(env.PAYSHIELD_BAAS_PROVIDER, 80) ||
    "configured_rail";
  const providerError =
    error instanceof ProviderAdapterError
      ? error.message
      : "Configured provider adapter request failed.";

  return persistReconciliationException(
    {
      householdId: actor.householdId,
      idempotencyKey: `money-rail:${rail}:${idempotencyKey}`,
      metadata: {
        amountCents,
        destinationPayeeId: destinationPayeeId || null,
        operation,
        payeeId: payeeId || null,
        providerError: safeString(providerError, 240),
        sourceBucketId: sourceBucketId || null,
      },
      providerEventId: `${rail}:${idempotencyKey}`,
      providerName,
      reasonCode: "provider_adapter_error",
      severity: "critical",
      source: "money_rail",
      summary: `${operation} failed before provider execution was confirmed.`,
    },
    env,
  );
}

function gateOk(definition, env, options) {
  if (definition.kind === "true") {
    return envTrue(env, definition.env);
  }

  if (definition.kind === "present") {
    return envPresent(env, definition.env);
  }

  if (definition.kind === "postgres_ledger_verified") {
    return (
      envPresent(env, "PAYSHIELD_LEDGER_DATABASE_URL") &&
      envTrue(env, "PAYSHIELD_LEDGER_SCHEMA_VERIFIED") &&
      env["PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION"]?.trim() ===
        coreLedgerSchemaVersion
    );
  }

  if (definition.kind === "provider_credentials") {
    return envPresent(env, "PAYSHIELD_BAAS_PROVIDER") && envPresent(env, "PAYSHIELD_BAAS_API_KEY");
  }

  if (definition.kind === "provider_adapter") {
    return getProviderAdapterConfig(env).ok;
  }

  if (definition.kind === "core_online_or_present") {
    return Boolean(options.coreOnline) || envPresent(env, "PAYSHIELD_CORE_API_URL");
  }

  if (definition.kind === "clerk") {
    return envPresent(env, "CLERK_SECRET_KEY") && envPresent(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  return false;
}

export function getCoreReadiness(env = process.env, options = {}) {
  const gates = gateDefinitions.map((definition) => ({
    description: definition.description,
    id: definition.id,
    ok: gateOk(definition, env, options),
  }));
  const liveMoneyReady = envTrue(env, "PAYSHIELD_LIVE_MONEY_ENABLED") && gates.every((gate) => gate.ok);
  const providerConfigured = gates.some((gate) => gate.id === "provider_credentials" && gate.ok);

  return {
    backendConfigured: gates.some((gate) => gate.id === "dedicated_backend" && gate.ok),
    clerkConfigured: gates.some((gate) => gate.id === "clerk_auth" && gate.ok),
    gates,
    liveMoneyReady,
    mode: liveMoneyReady ? "live" : providerConfigured ? "sandbox" : "architecture",
    postgresConfigured: envPresent(env, "PAYSHIELD_LEDGER_DATABASE_URL"),
    postgresSchemaVerified: gates.some((gate) => gate.id === "postgres_ledger" && gate.ok),
    postgresSchemaVersion: coreLedgerSchemaVersion,
    providerConfigured,
    serviceAuthConfigured: envPresent(env, "PAYSHIELD_CORE_SERVICE_TOKEN"),
  };
}

export function getCoreHealth(env = process.env) {
  const readiness = getCoreReadiness(env, { coreOnline: true });
  const moneyRails = getMoneyRailReadiness(env);

  return {
    moneyRails,
    ok: true,
    readiness,
    routes: [
      "GET /app/me",
      "GET /app/activation",
      "GET /app/balances",
      "GET /app/billing/status",
      "GET /app/buckets",
      "GET /app/operations",
      "GET /app/control-plan",
      "GET /app/audit/export",
      "POST /app/buckets",
      "POST /app/control-plan",
      "POST /token-vault/plaid",
      "POST /app/bank-link/token",
      "POST /app/bank-link/exchange",
      "POST /app/bank-connections",
      "POST /app/bill-payments",
      "POST /app/billing/checkout",
      "POST /app/direct-deposit",
      "POST /commercial/billing-events",
      "POST /app/onboarding/start",
      "POST /app/payees",
      "POST /app/paychecks/rules",
      "POST /app/paychecks/detect",
      "POST /app/paychecks/sync",
      "POST /app/transfers",
      "POST /app/unlocks",
      "POST /app/reconciliation/resolve",
      "POST /launch/gate-evidence",
      "POST /card/authorize",
      "POST /provider/webhooks",
    ],
    service: serviceName,
  };
}

export function assertLiveMoneyReady(readiness = getCoreReadiness(process.env, { coreOnline: true })) {
  if (!readiness.liveMoneyReady) {
    return {
      missing: readiness.gates.filter((gate) => !gate.ok).map((gate) => gate.id),
      ok: false,
      readiness,
      reason:
        "Live money is blocked until provider adapter, ledger, auth, counsel, disclosure, and operations gates are complete.",
    };
  }

  return {
    ok: true,
    readiness,
  };
}

function cents(value) {
  if (!Number.isInteger(value)) {
    throw new Error("Money amounts must be integer cents.");
  }

  return value;
}

function bucketAccount(bucketId) {
  return `liability:bucket:${bucketId}`;
}

function entryId(type, idempotencyKey) {
  const cleaned = idempotencyKey.replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 80);
  return `${type}:${cleaned || "entry"}`;
}

function assertBalanced(lines) {
  const total = lines.reduce((sum, line) => sum + line.amountCents, 0);

  if (total !== 0) {
    throw new Error(`Journal entry is not balanced: ${total} cents`);
  }
}

function metadataNumber(entry, key) {
  const value = entry.metadata?.[key];

  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function metadataString(entry, key) {
  const value = entry.metadata?.[key];

  return typeof value === "string" ? value : null;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeString(value, maxLength = 160) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function householdIdForUser(userId) {
  if (userId === demoUser.id) {
    return demoUser.householdId;
  }

  const suffix = userId.replace(/[^A-Za-z0-9:_-]/g, "_").slice(0, 96);

  return `household_${suffix || "user"}`;
}

function allowedProfileAccess(value) {
  return ["approved", "blocked", "pending"].includes(value) ? value : "";
}

function normalizeActor(value = {}) {
  const userId = safeString(value.userId || value.id, 160) || demoUser.id;

  return {
    authMode: safeString(value.authMode, 40) || "demo",
    clerkSubject: safeString(value.clerkSubject, 160) || null,
    email: safeString(value.email, 160) || demoUser.email,
    householdId:
      safeString(value.householdId, 160) || householdIdForUser(userId),
    id: userId,
    kycStatus: safeString(value.kycStatus, 40) || demoUser.kycStatus,
    name: safeString(value.name, 120) || demoUser.name,
    profileAccess:
      allowedProfileAccess(value.profileAccess) || demoUser.profileAccess,
  };
}

function actorFromPayload(payload) {
  return normalizeActor(safeObject(payload?.__payshieldActor));
}

function actorFromIdentity(actor, identity) {
  return normalizeActor({
    ...actor,
    clerkSubject: identity.user?.clerkSubject || actor.clerkSubject,
    email: identity.user?.email || actor.email,
    householdId: identity.householdId,
    id: identity.user?.id || actor.id,
    kycStatus: identity.user?.kycStatus || actor.kycStatus,
    name: identity.user?.name || actor.name,
    profileAccess: identity.profileAccess || actor.profileAccess,
    userId: identity.user?.id || actor.id,
  });
}

async function resolveActorIdentity(env, actorInput, operation) {
  const actor = normalizeActor(actorInput);
  const identityPersistence = await persistHouseholdIdentity(
    {
      actorUserId: actor.id,
      betaAccessStatus: actor.profileAccess,
      clerkSubject: actor.clerkSubject,
      householdId: actor.householdId,
      kycStatus: actor.kycStatus,
      userEmail: actor.email,
      userName: actor.name,
    },
    env,
  );

  if (persistenceFailed(identityPersistence)) {
    return {
      ok: false,
      result: {
        body: {
          code:
            identityPersistence.persistence === "postgres_required"
              ? "postgres_identity_required"
              : "postgres_identity_error",
          error:
            identityPersistence.persistence === "postgres_required"
              ? `Household identity requires PAYSHIELD_LEDGER_DATABASE_URL before ${operation}.`
              : `Household identity could not be persisted before ${operation}.`,
          identityPersistence,
          readiness: getCoreReadiness(env, { coreOnline: true }),
          service: "payshield-household-identity",
        },
        status: 503,
      },
    };
  }

  return {
    actor: actorFromIdentity(actor, identityPersistence.identity),
    identityPersistence,
    ok: true,
  };
}

function bucketIdFromAccount(accountId) {
  const prefix = "liability:bucket:";

  return accountId.startsWith(prefix) ? accountId.slice(prefix.length) : null;
}

function bucketLineAmount(entry, direction) {
  const line = entry.lines.find((candidate) => {
    if (!candidate.accountId.startsWith("liability:bucket:")) {
      return false;
    }

    return direction === "debit" ? candidate.amountCents > 0 : candidate.amountCents < 0;
  });

  if (!line) {
    return null;
  }

  return {
    amountCents: Math.abs(line.amountCents),
    bucketId: bucketIdFromAccount(line.accountId),
  };
}

function assertSameIdempotentPayload(existing, expected) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (expectedValue === undefined) {
      continue;
    }

    if (existing.metadata?.[key] !== expectedValue) {
      throw new Error(
        `Idempotency key ${existing.idempotencyKey} already belongs to a different ${existing.type} payload.`,
      );
    }
  }
}

class LedgerBook {
  constructor(initialEntries = []) {
    this.entries = new Map();

    for (const entry of initialEntries) {
      this.post(entry);
    }
  }

  allEntries() {
    return [...this.entries.values()];
  }

  findByIdempotencyKey(idempotencyKey) {
    return this.allEntries().find((entry) => entry.idempotencyKey === idempotencyKey);
  }

  has(idempotencyKey) {
    return Boolean(this.findByIdempotencyKey(idempotencyKey));
  }

  post(entry) {
    assertBalanced(entry.lines);

    if (this.has(entry.idempotencyKey)) {
      return this.findByIdempotencyKey(entry.idempotencyKey);
    }

    this.entries.set(entry.id, entry);
    return entry;
  }

  createEntry(input) {
    return this.post({
      createdAt: new Date().toISOString(),
      id: entryId(input.type, input.idempotencyKey),
      idempotencyKey: input.idempotencyKey,
      lines: input.lines,
      memo: input.memo,
      metadata: input.metadata,
      reversedEntryId: input.reversedEntryId,
      type: input.type,
    });
  }

  balance(accountId) {
    return this.allEntries().reduce((sum, entry) => {
      const accountTotal = entry.lines
        .filter((line) => line.accountId === accountId)
        .reduce((lineSum, line) => lineSum + line.amountCents, 0);

      return sum + accountTotal;
    }, 0);
  }

  bucketAvailable(bucketId) {
    return Math.max(0, -this.balance(bucketAccount(bucketId)));
  }
}

function buildBucketBalances(book, buckets) {
  return buckets.map((bucket) => {
    const availableCents = book.bucketAvailable(bucket.id);
    const fundedCents = Math.min(bucket.targetCents, availableCents);

    return {
      ...bucket,
      availableCents,
      fundedCents,
      shortCents: Math.max(0, bucket.targetCents - availableCents),
    };
  });
}

function postPaycheckDeposit(book, buckets, input) {
  if (book.has(input.idempotencyKey)) {
    return book.findByIdempotencyKey(input.idempotencyKey);
  }

  let remaining = cents(input.amountCents);
  const sortedBuckets = [...buckets].sort((a, b) => a.priority - b.priority);
  const lines = [
    {
      accountId: "asset:program_cash",
      amountCents: input.amountCents,
    },
  ];

  for (const bucket of sortedBuckets) {
    if (bucket.id === "safe_spending") {
      continue;
    }

    const funded = Math.min(bucket.targetCents, Math.max(0, remaining));

    if (funded > 0) {
      lines.push({
        accountId: bucketAccount(bucket.id),
        amountCents: -funded,
      });
      remaining -= funded;
    }
  }

  if (remaining > 0) {
    lines.push({
      accountId: bucketAccount("safe_spending"),
      amountCents: -remaining,
    });
  }

  return book.createEntry({
    idempotencyKey: input.idempotencyKey,
    lines,
    memo: `Paycheck deposit from ${input.employerName}`,
    metadata: {
      amountCents: input.amountCents,
      employerName: input.employerName,
      receivedAt: input.receivedAt,
    },
    type: "paycheck_deposit",
  });
}

function createDemoLedgerBook(amountCents = 300_000, buckets = neobankBuckets) {
  const book = new LedgerBook();

  postPaycheckDeposit(book, buckets, {
    amountCents,
    employerName: "Payroll deposit",
    idempotencyKey: `demo-paycheck-${amountCents}`,
    receivedAt: "2026-06-12T12:00:00.000Z",
  });

  return book;
}

function authorizeCardTransaction(book, payees, input) {
  const payee = input.payeeId ? payees.find((candidate) => candidate.id === input.payeeId) : null;
  const bucketId = payee?.allowedBucketId ?? "safe_spending";
  const available = book.bucketAvailable(bucketId);
  const approvedByPayee =
    !input.payeeId || Boolean(payee && payee.status === "approved" && input.amountCents <= payee.maxCents);
  const existing = book.findByIdempotencyKey(input.idempotencyKey);

  if (existing) {
    if (existing.type !== "card_authorization") {
      throw new Error(`Idempotency key ${input.idempotencyKey} is already used for ${existing.type}.`);
    }

    assertSameIdempotentPayload(existing, {
      amountCents: input.amountCents,
      merchantCategoryCode: input.merchantCategoryCode ?? null,
      merchantName: input.merchantName,
      payeeId: input.payeeId ?? null,
    });

    const bucketLine = bucketLineAmount(existing, "debit");

    return {
      approved: true,
      approvedAmountCents: metadataNumber(existing, "amountCents") ?? bucketLine?.amountCents ?? 0,
      bucketId: metadataString(existing, "bucketId") ?? bucketLine?.bucketId ?? bucketId,
      code: "approved",
      reason: "Duplicate authorization replayed from the original ledger entry.",
    };
  }

  if (!approvedByPayee) {
    return {
      approved: false,
      approvedAmountCents: 0,
      bucketId,
      code: "payee_not_allowed",
      reason: "This merchant is not approved for the requested protected bucket.",
    };
  }

  if (input.amountCents > available) {
    return {
      approved: false,
      approvedAmountCents: 0,
      bucketId,
      code: "insufficient_safe_spend",
      reason:
        bucketId === "safe_spending"
          ? "Safe-to-spend does not cover this purchase."
          : "The approved bucket does not have enough protected funds.",
    };
  }

  const decision = {
    approved: true,
    approvedAmountCents: input.amountCents,
    bucketId,
    code: "approved",
    reason:
      bucketId === "safe_spending"
        ? "Purchase fits the safe-to-spend balance."
        : "Approved payee can draw from the protected bucket.",
  };

  book.createEntry({
    idempotencyKey: input.idempotencyKey,
    lines: [
      {
        accountId: bucketAccount(bucketId),
        amountCents: input.amountCents,
      },
      {
        accountId: "liability:card_settlement",
        amountCents: -input.amountCents,
      },
    ],
    memo: `Card authorization: ${input.merchantName}`,
    metadata: {
      amountCents: input.amountCents,
      bucketId,
      merchantCategoryCode: input.merchantCategoryCode ?? null,
      merchantName: input.merchantName,
      payeeId: input.payeeId ?? null,
    },
    type: "card_authorization",
  });

  return decision;
}

function scheduleBillPayment(book, payees, input) {
  const payee = payees.find((candidate) => candidate.id === input.payeeId);
  const bucketId = payee?.allowedBucketId;
  const existing = book.findByIdempotencyKey(input.idempotencyKey);

  if (existing) {
    if (existing.type !== "bill_payment") {
      throw new Error(`Idempotency key ${input.idempotencyKey} is already used for ${existing.type}.`);
    }

    assertSameIdempotentPayload(existing, {
      amountCents: input.amountCents,
      payeeId: input.payeeId,
      scheduledFor: input.scheduledFor,
    });

    return {
      accepted: true,
      amountCents: metadataNumber(existing, "amountCents") ?? input.amountCents,
      bucketId: metadataString(existing, "bucketId") ?? bucketLineAmount(existing, "debit")?.bucketId ?? bucketId,
      code: "scheduled",
      payeeId: input.payeeId,
      providerStatus: "blocked",
      reason: "Duplicate bill payment replayed from the original ledger entry.",
      scheduledFor: metadataString(existing, "scheduledFor") ?? input.scheduledFor,
    };
  }

  if (!payee || payee.status !== "approved" || !bucketId) {
    return {
      accepted: false,
      amountCents: 0,
      code: "payee_not_allowed",
      payeeId: input.payeeId,
      providerStatus: "blocked",
      reason: "Bill payments require an approved protected-bucket payee.",
    };
  }

  if (input.amountCents > payee.maxCents) {
    return {
      accepted: false,
      amountCents: 0,
      bucketId,
      code: "amount_exceeds_payee_limit",
      payeeId: input.payeeId,
      providerStatus: "blocked",
      reason: "The scheduled payment exceeds the approved payee limit.",
      scheduledFor: input.scheduledFor,
    };
  }

  if (input.amountCents > book.bucketAvailable(bucketId)) {
    return {
      accepted: false,
      amountCents: 0,
      bucketId,
      code: "insufficient_bucket_funds",
      payeeId: input.payeeId,
      providerStatus: "blocked",
      reason: "The protected bucket does not have enough funds for this bill.",
      scheduledFor: input.scheduledFor,
    };
  }

  book.createEntry({
    idempotencyKey: input.idempotencyKey,
    lines: [
      {
        accountId: bucketAccount(bucketId),
        amountCents: input.amountCents,
      },
      {
        accountId: "liability:bill_pay_pending",
        amountCents: -input.amountCents,
      },
    ],
    memo: input.memo || `Bill payment: ${payee.name}`,
    metadata: {
      amountCents: input.amountCents,
      bucketId,
      memo: input.memo ?? null,
      payeeId: payee.id,
      payeeName: payee.name,
      scheduledFor: input.scheduledFor,
    },
    type: "bill_payment",
  });

  return {
    accepted: true,
    amountCents: input.amountCents,
    bucketId,
    code: "scheduled",
    payeeId: input.payeeId,
    providerStatus: "blocked",
    reason: "Bill payment fits the approved payee and protected bucket.",
    scheduledFor: input.scheduledFor,
  };
}

function unlockProtectedFunds(book, input) {
  if (input.bucketId === "safe_spending") {
    throw new Error("Safe spending is already unlocked.");
  }

  const existing = book.findByIdempotencyKey(input.idempotencyKey);

  if (existing) {
    if (existing.type !== "bucket_unlock") {
      throw new Error(`Idempotency key ${input.idempotencyKey} is already used for ${existing.type}.`);
    }

    assertSameIdempotentPayload(existing, {
      amountCents: input.amountCents,
      bucketId: input.bucketId,
      mode: input.mode,
    });

    const bucketLine = bucketLineAmount(existing, "debit");
    const unlockedCents = metadataNumber(existing, "amountCents") ?? bucketLine?.amountCents ?? 0;
    const recoveryChecks = metadataNumber(existing, "recoveryChecks") ?? (input.mode === "instant_fixed_fee" ? 1 : 2);

    return {
      recoveryChecks,
      recoveryPerCheckCents: metadataNumber(existing, "recoveryPerCheckCents") ?? Math.ceil(unlockedCents / recoveryChecks),
      unlockedCents,
    };
  }

  const unlockedCents = Math.min(cents(input.amountCents), book.bucketAvailable(input.bucketId));

  if (unlockedCents <= 0) {
    throw new Error("No protected funds are available to unlock.");
  }

  const recoveryChecks = input.mode === "instant_fixed_fee" ? 1 : 2;
  const result = {
    recoveryChecks,
    recoveryPerCheckCents: Math.ceil(unlockedCents / recoveryChecks),
    unlockedCents,
  };

  book.createEntry({
    idempotencyKey: input.idempotencyKey,
    lines: [
      {
        accountId: bucketAccount(input.bucketId),
        amountCents: unlockedCents,
      },
      {
        accountId: bucketAccount("safe_spending"),
        amountCents: -unlockedCents,
      },
    ],
    memo: `Emergency unlock from ${input.bucketId}`,
    metadata: {
      amountCents: unlockedCents,
      bucketId: input.bucketId,
      mode: input.mode,
      reason: input.reason,
      recoveryChecks: result.recoveryChecks,
      recoveryPerCheckCents: result.recoveryPerCheckCents,
    },
    type: "bucket_unlock",
  });

  return result;
}

function createNeobankSnapshot(
  book = createDemoLedgerBook(),
  env = process.env,
  controls = {},
  actorInput = demoUser,
) {
  const readiness = getCoreReadiness(env, { coreOnline: true });
  const buckets = controls.buckets || neobankBuckets;
  const payees = controls.payees || neobankPayees;
  const actor = normalizeActor(actorInput);

  return {
    buckets: buildBucketBalances(book, buckets),
    card: {
      authorizationMode: readiness.liveMoneyReady ? "provider_gateway" : "core_ledger",
      cardLast4: "----",
      status: readiness.liveMoneyReady ? "live" : "gated",
    },
    directDeposit: {
      accountLast4: "----",
      accountName: "PayShield protected paycheck account",
      providerStatus: readiness.liveMoneyReady ? "live" : "gated",
      routingLast4: "----",
    },
    householdId: actor.householdId,
    ledgerEntries: book.allEntries(),
    payees,
    readiness,
    user: actor,
  };
}

function isCustomBucketId(value) {
  return typeof value === "string" && /^custom_[a-z0-9][a-z0-9_]{0,47}$/.test(value);
}

export function isBucketId(value) {
  return (
    typeof value === "string" &&
    (neobankBuckets.some((bucket) => bucket.id === value) || isCustomBucketId(value))
  );
}

function withSafeSpendingBucket(buckets) {
  const safeSpend = neobankBuckets.find((bucket) => bucket.id === "safe_spending");
  const byId = new Map();
  let maxProtectedPriority = 0;

  for (const bucket of buckets) {
    if (bucket.id !== "safe_spending") {
      maxProtectedPriority = Math.max(maxProtectedPriority, bucket.priority);
      byId.set(bucket.id, bucket);
    }
  }

  if (safeSpend) {
    byId.set("safe_spending", {
      ...safeSpend,
      priority: Math.max(safeSpend.priority, maxProtectedPriority + 10),
    });
  }

  return [...byId.values()].sort((a, b) => a.priority - b.priority);
}

function mergePayees(defaultPayees, persistedPayees) {
  const byId = new Map(defaultPayees.map((payee) => [payee.id, payee]));

  for (const payee of persistedPayees || []) {
    byId.set(payee.id, payee);
  }

  return [...byId.values()];
}

async function loadOperationalControls(env = process.env, actorInput = demoUser) {
  const actor = normalizeActor(actorInput);
  const [bucketPersistence, payeePersistence] = await Promise.all([
    loadBucketProfile(actor.householdId, env),
    loadPayees(actor.householdId, env),
  ]);

  if (persistenceFailed(bucketPersistence) || persistenceFailed(payeePersistence)) {
    return {
      error: {
        body: {
          bucketPersistence,
          error: "Operational controls could not be loaded from durable core storage.",
          payeePersistence,
          readiness: getCoreReadiness(env, { coreOnline: true }),
          service: "payshield-operational-controls",
        },
        status: 503,
      },
    };
  }

  const buckets = bucketPersistence.profileFound
    ? withSafeSpendingBucket(bucketPersistence.profile)
    : neobankBuckets;

  return {
    bucketPersistence,
    buckets,
    payeePersistence,
    payees: mergePayees(neobankPayees, payeePersistence.payees),
  };
}

function sortedJournalEntries(entries = []) {
  return [...entries].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || "");
    const rightTime = Date.parse(right.createdAt || "");

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
      return leftTime - rightTime;
    }

    return String(left.id || "").localeCompare(String(right.id || ""));
  });
}

function replayJournalEntries(entries = []) {
  return new LedgerBook(
    sortedJournalEntries(entries).map((entry) => ({
      createdAt: entry.createdAt || new Date().toISOString(),
      id: safeString(entry.id, 160) || entryId(entry.type || "journal", entry.idempotencyKey || "entry"),
      idempotencyKey: safeString(entry.idempotencyKey, 160) || safeString(entry.id, 160),
      lines: Array.isArray(entry.lines)
        ? entry.lines.map((line) => ({
            accountId: safeString(line.accountId, 160),
            amountCents: cents(line.amountCents),
          }))
        : [],
      memo: safeString(entry.memo, 240),
      metadata: safeObject(entry.metadata),
      reversedEntryId: safeString(entry.reversedEntryId, 160) || undefined,
      type: safeString(entry.type, 80) || "paycheck_deposit",
    })),
  );
}

function shouldUseDurableLedger(operationalAudit) {
  return (
    operationalAudit?.persistence === "postgres" &&
    Array.isArray(operationalAudit.audit?.journalEntries) &&
    operationalAudit.audit.journalEntries.length > 0
  );
}

async function loadHouseholdLedger(env = process.env, actorInput = demoUser, controls = {}) {
  const actor = normalizeActor(actorInput);
  const operationalAudit = await loadOperationalAudit(actor.householdId, env);

  if (persistenceFailed(operationalAudit)) {
    return {
      error: {
        body: {
          error: "Operational ledger records could not be loaded from durable core storage.",
          operationalAudit,
          readiness: getCoreReadiness(env, { coreOnline: true }),
          service: "payshield-household-ledger",
        },
        status: 503,
      },
    };
  }

  const durableAudit = operationalAudit.audit ?? emptyOperationalAudit();

  if (shouldUseDurableLedger(operationalAudit)) {
    return {
      book: replayJournalEntries(durableAudit.journalEntries),
      durableAudit,
      ledgerSource: "postgres_journal",
      operationalAudit,
    };
  }

  if (databaseConfigured(env)) {
    return {
      book: new LedgerBook(),
      durableAudit,
      ledgerSource: "postgres_empty",
      operationalAudit,
    };
  }

  return {
    book: createDemoLedgerBook(300_000, controls.buckets || neobankBuckets),
    durableAudit,
    ledgerSource: "control_model",
    operationalAudit,
  };
}

export function replayJournalEntriesForBalances(
  journalEntries = [],
  buckets = neobankBuckets,
) {
  return buildBucketBalances(replayJournalEntries(journalEntries), buckets);
}

function cleanText(value, maxLength = 120) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function toIntegerCents(value, options = {}) {
  const amount = typeof value === "number" ? value : Number(value);
  const min = options.min ?? 0;
  const max = options.max ?? 500_000;

  if (!Number.isInteger(amount) || amount < min || amount > max) {
    return null;
  }

  return amount;
}

function slugify(value) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "custom_bucket"
  );
}

function normalizeBucketProfile(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) {
    return null;
  }

  const seen = new Set();
  const normalized = [];

  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const name = cleanText(item.name, 48);
    const due = cleanText(item.due, 40) || "Every check";
    const targetCents = toIntegerCents(item.targetCents);
    const protection = protectionValues.has(item.protection) ? item.protection : null;

    if (!name || targetCents === null || !protection) {
      return null;
    }

    const requestedId = cleanText(item.id, 48);
    const id = isBucketId(requestedId)
      ? requestedId
      : requestedId.startsWith("custom_")
        ? requestedId
        : `custom_${slugify(requestedId || name)}`;

    if (id === "safe_spending" || seen.has(id)) {
      return null;
    }

    seen.add(id);
    normalized.push({
      due,
      id,
      name,
      priority: (index + 1) * 10,
      protection,
      targetCents,
    });
  }

  return normalized;
}

function providerBlockedResult(readiness) {
  const gate = assertLiveMoneyReady(readiness);

  return gate.ok ? null : gate;
}

function allowedAccessStatus(value) {
  return ["active", "blocked", "canceled", "ignored", "past_due", "pending"].includes(value)
    ? value
    : "pending";
}

function allowedSubscriptionStatus(value) {
  if (value === "complete" || value === "paid") {
    return "active";
  }

  return [
    "active",
    "canceled",
    "ignored",
    "incomplete",
    "incomplete_expired",
    "past_due",
    "paused",
    "trialing",
    "unpaid",
    "unknown",
  ].includes(value)
    ? value
    : "unknown";
}

export async function recordCommercialBillingEvent(payload, env = process.env) {
  const providerName = safeString(payload?.providerName, 40) || "stripe";
  const summary = safeObject(payload?.summary);
  const event = safeObject(payload?.event);
  const eventId = safeString(summary.eventId || event.id, 160);
  const eventType = safeString(summary.eventType || event.type, 120);

  if (!eventId || !eventType) {
    return {
      body: {
        accepted: false,
        error: "Billing event requires eventId and eventType.",
        service: "payshield-commercial-billing",
      },
      status: 400,
    };
  }

  const eventKey = `${providerName}:${eventId}`;
  const existing = commercialBillingEvents.get(eventKey);

  if (existing) {
    return {
      body: {
        ...existing,
        duplicate: true,
        service: "payshield-commercial-billing",
      },
      status: 200,
    };
  }

  const record = {
    accepted: true,
    accessStatus: allowedAccessStatus(summary.accessStatus),
    amountPaidCents:
      Number.isInteger(summary.amountPaidCents) && summary.amountPaidCents >= 0
        ? summary.amountPaidCents
        : null,
    cancelAtPeriodEnd: summary.cancelAtPeriodEnd === true,
    checkoutSessionId: safeString(summary.checkoutSessionId, 160) || null,
    customerEmail: safeString(summary.customerEmail, 160) || null,
    customerId: safeString(summary.customerId, 160) || null,
    currentPeriodEnd: safeString(summary.currentPeriodEnd, 40) || null,
    duplicate: false,
    eventId,
    eventType,
    handled: summary.handled !== false,
    invoiceId: safeString(summary.invoiceId, 160) || null,
    persistenceConfigured: databaseConfigured(env),
    priceId: safeString(summary.priceId, 160) || null,
    providerName,
    subscriptionId: safeString(summary.subscriptionId, 160) || null,
    subscriptionStatus: allowedSubscriptionStatus(summary.subscriptionStatus),
    userId: safeString(summary.userId, 160) || null,
  };
  const householdId = record.userId ? householdIdForUser(record.userId) : null;
  const persistence = await persistCommercialBillingEvent(
    {
      accessStatus: record.accessStatus,
      cancelAtPeriodEnd: record.cancelAtPeriodEnd,
      customerId: record.customerId,
      currentPeriodEnd: record.currentPeriodEnd,
      eventId,
      eventType,
      householdId,
      metadata: {
        amountPaidCents: record.amountPaidCents,
        checkoutSessionId: record.checkoutSessionId,
        customerEmail: record.customerEmail,
        invoiceId: record.invoiceId,
        userId: record.userId,
      },
      payload: {
        event,
        summary: record,
      },
      priceId: record.priceId,
      providerName,
      subscriptionId: record.subscriptionId,
      subscriptionStatus: record.subscriptionStatus,
      userId: record.userId,
      userEmail: record.customerEmail,
    },
    env,
  );

  if (persistenceFailed(persistence)) {
    return {
      body: {
        accepted: false,
        eventId,
        eventType,
        providerName,
        service: "payshield-commercial-billing",
        ...persistence,
      },
      status: 503,
    };
  }

  const body = {
    ...record,
    householdId,
    ...persistence,
    message:
      record.accessStatus === "active"
        ? "Paid access event accepted. Household access can be activated from this billing record."
        : "Billing event accepted.",
    service: "payshield-commercial-billing",
  };

  commercialBillingEvents.set(eventKey, body);

  return {
    body,
    status: 200,
  };
}

export async function recordBankConnection(payload, env = process.env) {
  const readiness = getMoneyRailReadiness(env);
  const actor = actorFromPayload(payload);
  const providerName = safeString(payload?.providerName, 40) || "plaid";
  const providerItemId = safeString(payload?.providerItemId || payload?.itemId, 160);
  const providerAccountId = safeString(payload?.providerAccountId || payload?.accountId, 160);
  const institutionName = safeString(payload?.institutionName, 120) || "Linked institution";
  const tokenSecretRef =
    safeString(payload?.tokenSecretRef, 240) ||
    (readiness.tokenVaultConfigured
      ? `vault://${providerName}/${providerItemId || "pending"}`
      : "requires_core_secret_store");

  if (!providerItemId || !providerAccountId) {
    return {
      body: {
        accepted: false,
        error: "Bank connection requires providerItemId and providerAccountId.",
        readiness,
        service: "payshield-bank-connections",
      },
      status: 400,
    };
  }

  const products = Array.isArray(payload?.products)
    ? payload.products.filter((product) => typeof product === "string")
    : ["auth", "transactions"];
  const connection = {
    accountMask: safeString(payload?.accountMask, 16) || null,
    accountName: safeString(payload?.accountName, 80) || null,
    householdId: actor.householdId,
    institutionName,
    products,
    providerAccountId,
    providerItemId,
    providerName,
    status: readiness.bankLinkReady ? "connected" : "error",
    tokenSecretRef,
    userId: actor.id,
  };
  const persistence = await persistBankConnection(connection, env);

  if (persistenceFailed(persistence)) {
    return {
      body: {
        bankConnection: connection,
        message: "Bank connection could not be persisted.",
        persistence,
        readiness,
        service: "payshield-bank-connections",
      },
      status: 503,
    };
  }

  const auditPersistence = await persistMoneyRailEvent(
    {
      eventType: "bank_connection_recorded",
      householdId: actor.householdId,
      payload: {
        accountMask: connection.accountMask,
        accountName: connection.accountName,
        institutionName: connection.institutionName,
        products: connection.products,
        providerAccountId,
        providerItemId,
        status: connection.status,
        tokenSecretRef,
      },
      providerEventId: `bank_connection:${providerItemId}:${providerAccountId}`,
      providerName,
      rail: "bank_link",
    },
    env,
  );

  if (persistenceFailed(auditPersistence)) {
    return {
      body: {
        auditPersistence,
        bankConnection: connection,
        message: "Bank connection audit event could not be persisted.",
        persistence,
        readiness,
        service: "payshield-bank-connections",
      },
      status: 503,
    };
  }

  return {
    body: {
      auditPersistence,
      bankConnection: connection,
      message: readiness.bankLinkReady
        ? "Bank connection recorded for paycheck detection and transfer handoff."
        : "Bank connection shape recorded, but background detection needs a configured token vault.",
      persistence,
      readiness,
      service: "payshield-bank-connections",
    },
    status: readiness.plaidConfigured ? 200 : 424,
  };
}

export async function getProfile(env = process.env, actorInput = demoUser) {
  const actor = normalizeActor(actorInput);
  const identityPersistence = await persistHouseholdIdentity(
    {
      actorUserId: actor.id,
      betaAccessStatus: actor.profileAccess,
      clerkSubject: actor.clerkSubject,
      householdId: actor.householdId,
      kycStatus: actor.kycStatus,
      userEmail: actor.email,
      userName: actor.name,
    },
    env,
  );

  if (persistenceFailed(identityPersistence)) {
    return {
      body: {
        code:
          identityPersistence.persistence === "postgres_required"
            ? "postgres_identity_required"
            : "postgres_identity_error",
        error:
          identityPersistence.persistence === "postgres_required"
            ? "Household identity requires PAYSHIELD_LEDGER_DATABASE_URL before production, live-money, or durable-core operation."
            : "Household identity could not be persisted.",
        identityPersistence,
        readiness: getCoreReadiness(env, { coreOnline: true }),
        service: "payshield-household-identity",
      },
      status: 503,
    };
  }

  const identity = identityPersistence.identity;
  const user = identity?.user || actor;
  const snapshot = createNeobankSnapshot(undefined, env, {}, user);

  return {
    body: {
      auth: {
        authMode: "core_service",
        userId: snapshot.user.id,
      },
      householdId: snapshot.householdId,
      identityPersistence,
      kycStatus: snapshot.user.kycStatus,
      profile: {
        access: snapshot.user.profileAccess,
        audience: "US households",
        release: "commercial_control_profile",
      },
      readiness: snapshot.readiness,
      user: snapshot.user,
    },
    status: 200,
  };
}

export async function getBalances(env = process.env, actorInput = demoUser) {
  const actorResolution = await resolveActorIdentity(
    env,
    actorInput,
    "balance lookup",
  );

  if (!actorResolution.ok) {
    return actorResolution.result;
  }

  const actor = actorResolution.actor;
  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const ledger = await loadHouseholdLedger(env, actor, controls);

  if (ledger.error) {
    return ledger.error;
  }

  const book = ledger.book;
  const snapshot = createNeobankSnapshot(book, env, controls, actor);
  const safeSpend = snapshot.buckets.find((bucket) => bucket.id === "safe_spending");

  return {
    body: {
      buckets: snapshot.buckets,
      card: snapshot.card,
      directDeposit: snapshot.directDeposit,
      persistence: {
        bucketProfile: controls.bucketPersistence,
        payees: controls.payeePersistence,
      },
      ledger: {
        entryCount: snapshot.ledgerEntries.length,
        source: ledger.ledgerSource,
      },
      protectedCents: snapshot.buckets
        .filter((bucket) => bucket.id !== "safe_spending")
        .reduce((sum, bucket) => sum + bucket.availableCents, 0),
      readiness: snapshot.readiness,
      safeToSpendCents: safeSpend?.availableCents ?? 0,
    },
    status: 200,
  };
}

function emptyOperationalAudit() {
  return {
    bankConnections: [],
    billingEvents: [],
    billPayments: [],
    cardDecisions: [],
    checkoutIntents: [],
    commercialSubscriptions: [],
    directDepositSetups: [],
    journalEntries: [],
    moneyRailEvents: [],
    paycheckDetectionRules: [],
    paycheckDetections: [],
    reconciliationExceptions: [],
    transferIntents: [],
    unlockRequests: [],
  };
}

function normalizeCheckoutIntentStatus(value) {
  return [
    "requested",
    "created",
    "payment_link",
    "provider_error",
    "blocked",
  ].includes(value)
    ? value
    : "requested";
}

function normalizeCheckoutMode(value) {
  return ["checkout", "payment_link", "not_configured"].includes(value)
    ? value
    : "not_configured";
}

export async function recordCommercialCheckoutIntent(payload = {}, env = process.env) {
  const actor = actorFromPayload(payload);
  const readiness = {
    checkoutConfigured: commercialBillingConfigured(env),
    mode: env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL?.trim()
      ? "payment_link"
      : env.STRIPE_SECRET_KEY?.trim()
        ? "checkout"
        : "not_configured",
    priceLabel: env.PAYSHIELD_COMMERCIAL_PRICE_LABEL?.trim() || "$19/month",
  };
  const status = normalizeCheckoutIntentStatus(payload.status);
  const checkoutMode = normalizeCheckoutMode(payload.checkoutMode || readiness.mode);
  const idempotencyKey =
    cleanText(payload.idempotencyKey, 120) ||
    `checkout-${actor.householdId}-${new Date().toISOString().slice(0, 10)}`;
  const now = new Date().toISOString();
  const intent = {
    checkoutMode,
    checkoutUrlPresent: Boolean(payload.checkoutUrlPresent),
    clerkSubject: actor.clerkSubject,
    createdAt: now,
    errorCode: cleanText(payload.errorCode, 80) || null,
    householdId: actor.householdId,
    idempotencyKey,
    metadata: {
      authMode: actor.authMode,
      checkoutConfigured: readiness.checkoutConfigured,
      source: "payshield_app",
      updatedBy: actor.id,
    },
    priceLabel: cleanText(payload.priceLabel, 80) || readiness.priceLabel,
    providerCheckoutId: cleanText(payload.providerCheckoutId, 160) || null,
    providerName: cleanText(payload.providerName, 40).toLowerCase() || "stripe",
    status,
    updatedAt: now,
    userEmail: actor.email,
    userId: actor.id,
    userName: actor.name,
  };
  const persistence = await persistCommercialCheckoutIntent(intent, env);

  if (persistenceFailed(persistence)) {
    return {
      body: {
        error: "Checkout intent could not be persisted.",
        persistence,
        readiness,
        service: "payshield-checkout-intent",
      },
      status: 503,
    };
  }

  const storedIntent = {
    ...checkoutIntentShape(intent),
    ...(persistence.intent || {}),
  };

  commercialCheckoutIntents.set(
    `${actor.householdId}:${idempotencyKey}`,
    {
      ...intent,
      ...storedIntent,
      householdId: actor.householdId,
      updatedAt: now,
    },
  );

  return {
    body: {
      checkoutIntent: storedIntent,
      message:
        status === "created" || status === "payment_link"
          ? "Checkout intent recorded for household paid access."
          : "Checkout intent recorded.",
      persisted: persistence.persistence === "postgres",
      persistence,
      readiness,
      service: "payshield-checkout-intent",
    },
    status: 200,
  };
}

function latestCommercialBillingEvents(householdId) {
  return [...commercialBillingEvents.values()]
    .filter((event) => !householdId || event.householdId === householdId)
    .slice(-25)
    .reverse()
    .map((event) => ({
      accessStatus: event.accessStatus,
      eventType: event.eventType,
      processedAt: null,
      providerCustomerId: event.customerId,
      providerEventId: event.eventId,
      providerName: event.providerName,
      providerSubscriptionId: event.subscriptionId,
    }));
}

function checkoutIntentShape(intent) {
  return {
    checkoutMode: intent.checkoutMode,
    checkoutUrlPresent: Boolean(intent.checkoutUrlPresent),
    createdAt: intent.createdAt || new Date().toISOString(),
    errorCode: intent.errorCode || null,
    id: intent.id || intent.idempotencyKey,
    idempotencyKey: intent.idempotencyKey,
    priceLabel: intent.priceLabel || null,
    providerCheckoutId: intent.providerCheckoutId || null,
    providerName: intent.providerName || "stripe",
    status: intent.status,
    updatedAt: intent.updatedAt || intent.createdAt || new Date().toISOString(),
    userId: intent.userId || null,
  };
}

function latestCommercialCheckoutIntents(householdId) {
  return [...commercialCheckoutIntents.values()]
    .filter((intent) => !householdId || intent.householdId === householdId)
    .sort((left, right) =>
      String(right.updatedAt || right.createdAt || "").localeCompare(
        String(left.updatedAt || left.createdAt || ""),
      ),
    )
    .slice(0, 25)
    .map((intent) => checkoutIntentShape(intent));
}

function latestCheckoutIntent(audit) {
  const intents = audit.checkoutIntents || [];

  return intents[0] || null;
}

function latestCommercialSubscription(audit) {
  const subscriptions = audit.commercialSubscriptions || [];

  if (subscriptions.length > 0) {
    return subscriptions[0];
  }

  const latestEvent = (audit.billingEvents || []).find((event) =>
    ["active", "past_due", "canceled", "pending"].includes(event.accessStatus),
  );

  if (!latestEvent) {
    return null;
  }

  return {
    accessStatus: latestEvent.accessStatus,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    priceId: null,
    providerCustomerId: latestEvent.providerCustomerId,
    providerName: latestEvent.providerName,
    providerSubscriptionId: latestEvent.providerSubscriptionId,
    subscriptionStatus: latestEvent.accessStatus,
    updatedAt: latestEvent.processedAt,
  };
}

function commercialAccessStatus(env, audit) {
  const subscription = latestCommercialSubscription(audit);
  const checkoutIntent = latestCheckoutIntent(audit);
  const configured = commercialBillingConfigured(env);
  const checkoutStarted =
    checkoutIntent &&
    ["created", "payment_link", "requested"].includes(checkoutIntent.status);

  return {
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    checkoutIntentId: checkoutIntent?.idempotencyKey ?? null,
    checkoutIntentStatus: checkoutIntent?.status ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    mode: env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL?.trim()
      ? "payment_link"
      : env.STRIPE_SECRET_KEY?.trim()
        ? "checkout"
        : "not_configured",
    priceLabel: env.PAYSHIELD_COMMERCIAL_PRICE_LABEL?.trim() || "$19/month",
    providerCustomerId: subscription?.providerCustomerId ?? null,
    providerCheckoutId: checkoutIntent?.providerCheckoutId ?? null,
    providerName: subscription?.providerName ?? "stripe",
    providerSubscriptionId: subscription?.providerSubscriptionId ?? null,
    readyForCheckout: configured,
    state:
      subscription?.accessStatus ??
      (checkoutStarted ? "checkout_started" : configured ? "ready" : "needs_setup"),
    subscriptionStatus: subscription?.subscriptionStatus ?? null,
  };
}

function commercialBillingConfigured(env) {
  return Boolean(
    env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL?.trim() ||
      (env.STRIPE_SECRET_KEY?.trim() && env.PAYSHIELD_COMMERCIAL_PRICE_ID?.trim()),
  );
}

function commercialPaidAccessRequired(env) {
  return envTrue(env, "PAYSHIELD_REQUIRE_PAID_ACCESS") || commercialBillingConfigured(env);
}

function activeCommercialAccess(commercialAccess) {
  return commercialAccess.state === "active";
}

async function requireActivePaidAccess(env, actorInput, operation) {
  const actorResolution = await resolveActorIdentity(env, actorInput, operation);

  if (!actorResolution.ok) {
    return actorResolution;
  }

  const actor = actorResolution.actor;

  if (!commercialPaidAccessRequired(env)) {
    return {
      actor,
      identityPersistence: actorResolution.identityPersistence,
      ok: true,
    };
  }

  const operationalAudit = await loadOperationalAudit(actor.householdId, env);

  if (persistenceFailed(operationalAudit)) {
    return {
      ok: false,
      result: {
        body: {
          code: "paid_access_state_unavailable",
          error: "Paid-access records could not be loaded from durable core storage.",
          operationalAudit,
          service: "payshield-paid-access-gate",
        },
        status: 503,
      },
    };
  }

  const durableAudit = operationalAudit.audit ?? emptyOperationalAudit();
  const audit = {
    ...durableAudit,
    billingEvents: durableAudit.billingEvents.length
      ? durableAudit.billingEvents
      : latestCommercialBillingEvents(actor.householdId),
    checkoutIntents: durableAudit.checkoutIntents.length
      ? durableAudit.checkoutIntents
      : latestCommercialCheckoutIntents(actor.householdId),
  };
  const commercialAccess = commercialAccessStatus(env, audit);

  if (activeCommercialAccess(commercialAccess)) {
    return {
      actor,
      commercialAccess,
      identityPersistence: actorResolution.identityPersistence,
      ok: true,
    };
  }

  return {
    ok: false,
    result: {
      body: {
        code: "paid_access_required",
        commercialAccess,
        error: `Paid access must be active before ${operation}.`,
        service: "payshield-paid-access-gate",
      },
      status: 402,
    },
  };
}

function operationTimeline(audit, snapshot) {
  const items = [
    ...audit.checkoutIntents.map((intent) => ({
      amountCents: null,
      at: intent.updatedAt ?? intent.createdAt,
      detail: intent.priceLabel || intent.checkoutMode,
      id: intent.idempotencyKey,
      label: "Checkout intent",
      rail: "billing",
      status: intent.status,
    })),
    ...audit.billingEvents.map((event) => ({
      amountCents: event.amountPaidCents ?? null,
      at: event.processedAt,
      detail: event.accessStatus,
      id: event.providerEventId,
      label: event.eventType,
      rail: "billing",
      status: event.accessStatus,
    })),
    ...audit.bankConnections.map((connection) => ({
      amountCents: null,
      at: connection.updatedAt ?? connection.connectedAt,
      detail: connection.institutionName,
      id: connection.providerAccountId,
      label: "Bank connection",
      rail: "bank_link",
      status: connection.status,
    })),
    ...audit.directDepositSetups.map((setup) => ({
      amountCents: null,
      at: setup.updatedAt ?? setup.createdAt,
      detail: setup.accountName,
      id: setup.idempotencyKey,
      label: "Paycheck routing",
      rail: "direct_deposit",
      status: setup.status,
    })),
    ...audit.paycheckDetections.map((detection) => ({
      amountCents: detection.amountCents,
      at: detection.receivedAt ?? detection.createdAt,
      detail: detection.employerName,
      id: detection.idempotencyKey,
      label: "Paycheck detected",
      rail: "income",
      status: detection.status,
    })),
    ...audit.transferIntents.map((transfer) => ({
      amountCents: transfer.amountCents,
      at: transfer.createdAt,
      detail: `${transfer.sourceBucketId} -> ${transfer.destinationPayeeId}`,
      id: transfer.idempotencyKey,
      label: "Transfer intent",
      rail: "transfer",
      status: transfer.providerStatus,
    })),
    ...audit.billPayments.map((payment) => ({
      amountCents: payment.amountCents,
      at: payment.createdAt,
      detail: payment.payeeId,
      id: `${payment.payeeId}:${payment.scheduledFor}`,
      label: "Bill payment",
      rail: "bill_pay",
      status: payment.status,
    })),
    ...audit.cardDecisions.map((decision) => ({
      amountCents: decision.amountCents,
      at: decision.createdAt,
      detail: decision.merchantName,
      id: `${decision.merchantName}:${decision.amountCents}:${decision.createdAt}`,
      label: "Card decision",
      rail: "card",
      status: decision.approved ? "approved" : decision.decisionCode,
    })),
    ...audit.unlockRequests.map((unlock) => ({
      amountCents: unlock.unlockedCents,
      at: unlock.createdAt,
      detail: unlock.bucketId,
      id: `${unlock.bucketId}:${unlock.createdAt}`,
      label: "Protected unlock",
      rail: "unlock",
      status: unlock.status,
    })),
    ...(audit.reconciliationExceptions || []).map((exception) => ({
      amountCents:
        typeof exception.metadata?.amountCents === "number"
          ? exception.metadata.amountCents
          : null,
      at: exception.lastSeenAt ?? exception.createdAt,
      detail: exception.summary,
      id: exception.id,
      label: "Reconciliation exception",
      rail: "reconciliation",
      status:
        exception.status === "resolved"
          ? "resolved"
          : exception.reasonCode || exception.status,
    })),
  ];

  if (items.length > 0) {
    return items
      .sort((left, right) => String(right.at || "").localeCompare(String(left.at || "")))
      .slice(0, 30);
  }

  return snapshot.ledgerEntries
    .slice(-6)
    .reverse()
    .map((entry) => ({
      amountCents:
        typeof entry.metadata?.amountCents === "number"
          ? entry.metadata.amountCents
          : null,
      at: entry.createdAt,
      detail: entry.memo,
      id: entry.id,
      label: entry.type.replace(/_/g, " "),
      rail: "ledger",
      status: "posted",
    }));
}

function gateState(value) {
  return value ? "ready" : "needs_setup";
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function vercelEnvAddCommand(name) {
  return `npx vercel env add ${name} production`;
}

function buildSetupGroup(input) {
  return {
    ...input,
    setupCommands: input.env.map(vercelEnvAddCommand),
  };
}

function buildActivationSetupGroups(body, siteUrl) {
  return [
    buildSetupGroup({
      checks: [
        `curl -fsS ${siteUrl}/api/health`,
        `curl -fsS ${siteUrl}/api/launch/activation`,
      ],
      endpoint: "POST /api/app/billing/checkout",
      env: [
        "STRIPE_SECRET_KEY",
        "PAYSHIELD_COMMERCIAL_PRICE_ID",
        "PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
        "STRIPE_WEBHOOK_SECRET",
        "PAYSHIELD_CORE_API_URL",
        "PAYSHIELD_CORE_SERVICE_TOKEN",
      ],
      key: "revenue",
      productAction:
        "Collect paid household access before bank link and money controls unlock.",
      ready: body.activationPlan.revenueReady,
      title: "Revenue switch",
      unlocks: "Checkout, billing webhook, and commercial access state.",
    }),
    buildSetupGroup({
      checks: [
        `curl -fsS ${siteUrl}/api/launch/activation`,
        `curl -fsS ${siteUrl}/api/app/me`,
      ],
      endpoint: "GET /api/app/me",
      env: [
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "CLERK_SECRET_KEY",
        "PAYSHIELD_REVIEW_APP_ACCESS_TOKEN",
      ],
      key: "access",
      productAction:
        "Map every signed-in person to one PayShield household before private records open.",
      ready: body.readiness.clerkConfigured,
      title: "Household access",
      unlocks: "Authenticated app entry, household scope, and private support records.",
    }),
    buildSetupGroup({
      checks: [
        `curl -fsS ${siteUrl}/api/launch/activation`,
        "npm run test -- tests/neobank-api.test.mts",
      ],
      endpoint: "POST /api/app/bank-link/token",
      env: [
        "PLAID_ENV",
        "PLAID_CLIENT_ID",
        "PLAID_SECRET",
        "PLAID_PRODUCTS",
        "PLAID_COUNTRY_CODES",
        "PLAID_WEBHOOK_URL",
        "PAYSHIELD_TOKEN_VAULT_KEY_ID",
        "PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL",
        "PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET",
        "PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY",
      ],
      key: "bank_connection",
      productAction:
        "Let households connect an external funding source and vault the provider token outside the browser.",
      ready: body.moneyRails.bankLinkReady,
      title: "Bank connection",
      unlocks: "Plaid Link, public-token exchange, masked account records, and token custody.",
    }),
    buildSetupGroup({
      checks: [
        `curl -fsS ${siteUrl}/api/launch/activation`,
        'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:verify',
      ],
      endpoint:
        "POST /api/app/paychecks/sync + POST /api/app/paychecks/detect",
      env: [
        "PLAID_CLIENT_ID",
        "PLAID_SECRET",
        "PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY",
        "PAYSHIELD_PROVIDER_WEBHOOK_SECRET",
        "PAYSHIELD_LEDGER_DATABASE_URL",
        "PAYSHIELD_LEDGER_SCHEMA_VERIFIED",
        "PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION",
      ],
      key: "paycheck_detection",
      productAction:
        "Turn provider activity into detected deposits, balanced bucket splits, and Safe to Spend updates.",
      ready:
        body.moneyRails.transactionSyncReady ||
        (body.moneyRails.paycheckDetectionReady &&
          body.readiness.postgresSchemaVerified),
      title: "Detection and ledger",
      unlocks:
        "Plaid transaction sync, signed provider events, idempotent payroll detection, and durable journal evidence.",
    }),
    buildSetupGroup({
      checks: [
        `curl -fsS ${siteUrl}/api/launch/activation`,
        "npm run test -- tests/neobank-ledger.test.mts",
      ],
      endpoint: "POST /api/app/transfers",
      env: [
        "PAYSHIELD_TRANSFER_ENABLED",
        "PAYSHIELD_BAAS_PROVIDER",
        "PAYSHIELD_BAAS_ADAPTER",
        "PAYSHIELD_BAAS_API_BASE_URL",
        "PAYSHIELD_BAAS_API_KEY",
      ],
      key: "money_movement",
      productAction:
        "Validate source bucket, approved destination, amount, and provider handoff before funds move.",
      ready: body.moneyRails.transferReady,
      title: "Movement rail",
      unlocks: "Protected transfers, provider execution records, and reconciliation matching.",
    }),
    buildSetupGroup({
      checks: [
        `curl -fsS ${siteUrl}/api/health`,
        "npm run verify",
        `npm run market:status -- ${siteUrl} --expect-site-url ${siteUrl}`,
      ],
      endpoint: "POST /api/card/authorize",
      env: [
        "PAYSHIELD_BAAS_CONTRACT_APPROVED",
        "PAYSHIELD_BAAS_ADAPTER",
        "PAYSHIELD_BAAS_API_BASE_URL",
        "PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED",
        "PAYSHIELD_REGULATED_COUNSEL_SIGNOFF",
        "PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED",
        "PAYSHIELD_LIVE_MONEY_ENABLED",
      ],
      key: "live_control",
      productAction:
        "Open card authorization and live-money decisions only after every regulated gate is recorded.",
      ready: body.readiness.liveMoneyReady,
      title: "Live control gate",
      unlocks: "Safe-to-spend authorization, approved biller exceptions, and release controls.",
    }),
  ];
}

function missingCoreGates(readiness) {
  return readiness.gates.filter((gate) => !gate.ok).map((gate) => gate.id);
}

function commercialActivationMissing(env) {
  const paymentLinkConfigured = Boolean(env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL?.trim());
  const stripeSecretConfigured = envPresent(env, "STRIPE_SECRET_KEY");
  const stripePriceConfigured = envPresent(env, "PAYSHIELD_COMMERCIAL_PRICE_ID");
  const checkoutConfigured =
    paymentLinkConfigured || (stripeSecretConfigured && stripePriceConfigured);
  const missing = [];

  if (!checkoutConfigured) {
    if (!stripeSecretConfigured && !paymentLinkConfigured) {
      missing.push("STRIPE_SECRET_KEY");
    }

    if (!stripePriceConfigured && !paymentLinkConfigured) {
      missing.push("PAYSHIELD_COMMERCIAL_PRICE_ID or PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL");
    }
  }

  if (!envPresent(env, "STRIPE_WEBHOOK_SECRET")) {
    missing.push("STRIPE_WEBHOOK_SECRET");
  }

  if (!envPresent(env, "PAYSHIELD_CORE_SERVICE_TOKEN")) {
    missing.push("PAYSHIELD_CORE_SERVICE_TOKEN");
  }

  if (
    env.VERCEL_ENV === "production" &&
    stripeSecretConfigured &&
    !env.STRIPE_SECRET_KEY.trim().startsWith("sk_live_") &&
    !paymentLinkConfigured
  ) {
    missing.push("Stripe live-mode checkout asset");
  }

  return uniqueList(missing);
}

function commercialActivationReady(env, commercialAccess) {
  return commercialAccess.readyForCheckout && commercialActivationMissing(env).length === 0;
}

const controlPlanFrequencies = new Set([
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "unknown",
]);

function friendlyControlPlanGateLabel(gate) {
  const value = cleanText(gate, 160);

  if (!value) {
    return "Setup gate";
  }

  if (
    value.includes("TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL") ||
    (value.includes("TOKEN_VAULT") && value.includes("PAYSHIELD_CORE_API_URL"))
  ) {
    return "Vault receiver or core service URL";
  }

  if (value === "core_service_auth") {
    return "Core service auth";
  }

  if (value.includes("STRIPE_SECRET_KEY")) {
    return "Stripe API key";
  }

  if (value.includes("STRIPE_WEBHOOK_SECRET")) {
    return "Stripe webhook signing";
  }

  if (value.includes("PAYSHIELD_COMMERCIAL_PRICE_ID")) {
    return "Checkout price or payment link";
  }

  if (value.includes("PAYSHIELD_CORE_API_URL")) {
    return "Core activation service";
  }

  if (value.includes("PAYSHIELD_CORE_SERVICE_TOKEN")) {
    return "Core service auth";
  }

  if (value.includes("live-mode") || value.includes("Stripe live-mode")) {
    return "Live Stripe mode";
  }

  if (value.includes("PLAID_CLIENT_ID") || value.includes("PLAID_SECRET")) {
    return "Plaid credentials";
  }

  if (value.includes("TOKEN_VAULT_ENCRYPTION_KEY")) {
    return "Token custody encryption key";
  }

  if (value.includes("TOKEN_VAULT_WEBHOOK")) {
    return "Signed token-vault handoff";
  }

  if (value.includes("TOKEN_VAULT") || value.includes("token vault")) {
    return "Token vault custody";
  }

  if (value.includes("PROVIDER_WEBHOOK")) {
    return "Provider webhook signing";
  }

  if (value.includes("PAYSHIELD_BAAS_ADAPTER")) {
    return "Provider adapter type";
  }

  if (value.includes("PAYSHIELD_BAAS_API_BASE_URL")) {
    return "Provider adapter URL";
  }

  if (value.includes("PAYSHIELD_BAAS_API_KEY")) {
    return "Provider API key";
  }

  if (value.includes("PAYSHIELD_BAAS_PROVIDER")) {
    return "Provider name";
  }

  if (
    value.includes("TRANSFER") ||
    value.includes("transfer") ||
    value.includes("transfer/BaaS")
  ) {
    return "Transfer rail credentials";
  }

  if (value === "provider_adapter") {
    return "Provider adapter";
  }

  if (value === "provider_contract") {
    return "Provider contract";
  }

  if (value === "provider_credentials") {
    return "Provider credentials";
  }

  if (value === "sponsor_disclosures") {
    return "Approved sponsor disclosures";
  }

  if (value === "counsel_signoff") {
    return "Counsel signoff";
  }

  if (value === "operations_runbooks") {
    return "Operations runbooks";
  }

  if (value === "postgres_ledger") {
    return "Verified Postgres ledger";
  }

  if (value === "dedicated_backend") {
    return "Always-on core backend";
  }

  if (value === "clerk_auth") {
    return "Clerk authentication";
  }

  return value.replace(/^PAYSHIELD_/, "").replace(/_/g, " ").toLowerCase();
}

function uniqueFriendlyControlPlanGates(gates) {
  return uniqueList(gates.map(friendlyControlPlanGateLabel));
}

function controlPlanCents(value, fallback, options = {}) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return toIntegerCents(value, options);
}

function normalizeControlPlanFrequency(value) {
  const frequency = cleanText(value, 20).toLowerCase();

  return controlPlanFrequencies.has(frequency) ? frequency : "biweekly";
}

function protectedControlBuckets(buckets = []) {
  return buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .sort((left, right) => left.priority - right.priority);
}

function controlPayeeForBucket(payees = [], bucketId) {
  return payees.find(
    (payee) => payee.status === "approved" && payee.allowedBucketId === bucketId,
  );
}

function defaultControlTransferBucket(buckets = [], payees = []) {
  return (
    protectedControlBuckets(buckets).find(
      (bucket) =>
        bucket.availableCents > 0 && controlPayeeForBucket(payees, bucket.id),
    ) ?? protectedControlBuckets(buckets)[0]
  );
}

function normalizeHouseholdControlPlanInput(payload, buckets = [], payees = []) {
  const record = safeObject(payload);
  const errors = [];
  const paycheckAmountCents = controlPlanCents(record.paycheckAmountCents, 300_000, {
    max: 2_000_000,
    min: 10_000,
  });
  const requestedTransferCents = controlPlanCents(record.requestedTransferCents, 25_000, {
    max: 500_000,
    min: 0,
  });
  const bucketIds = new Set(buckets.map((bucket) => bucket.id));
  const preferredBucket = cleanText(record.preferredTransferBucketId, 80);
  const defaultBucket = defaultControlTransferBucket(buckets, payees);
  const preferredTransferBucketId =
    preferredBucket && bucketIds.has(preferredBucket)
      ? preferredBucket
      : defaultBucket?.id ?? null;
  const preferredPayeeId = cleanText(record.preferredPayeeId, 120) || null;

  if (paycheckAmountCents === null) {
    errors.push("paycheckAmountCents must be integer cents from 10000 to 2000000.");
  }

  if (requestedTransferCents === null) {
    errors.push("requestedTransferCents must be integer cents from 0 to 500000.");
  }

  if (errors.length > 0) {
    return {
      errors,
      input: null,
      ok: false,
    };
  }

  return {
    errors: [],
    input: {
      employerName: cleanText(record.employerName, 80) || "Payroll deposit",
      expectedFrequency: normalizeControlPlanFrequency(record.expectedFrequency),
      paycheckAmountCents: paycheckAmountCents ?? 300_000,
      preferredPayeeId,
      preferredTransferBucketId,
      requestedTransferCents: requestedTransferCents ?? 25_000,
      ruleName: cleanText(record.ruleName, 80) || "Primary payroll",
    },
    ok: true,
  };
}

function buildHouseholdControlAllocation(buckets, paycheckAmountCents) {
  let remaining = paycheckAmountCents;
  const planBuckets = protectedControlBuckets(buckets).map((bucket) => {
    const targetCents = Number.isInteger(bucket.targetCents) ? bucket.targetCents : 0;
    const availableCents = Number.isInteger(bucket.availableCents)
      ? bucket.availableCents
      : 0;
    const projectedFundingCents = Math.min(targetCents, Math.max(0, remaining));

    remaining -= projectedFundingCents;

    return {
      availableCents,
      bucketId: bucket.id,
      due: bucket.due,
      name: bucket.name,
      priority: bucket.priority,
      projectedFundingCents,
      protection: bucket.protection,
      shortCents: Math.max(0, targetCents - projectedFundingCents),
      targetCents,
    };
  });

  return {
    buckets: planBuckets,
    projectedProtectedCents: planBuckets.reduce(
      (sum, bucket) => sum + bucket.projectedFundingCents,
      0,
    ),
    projectedSafeToSpendCents: Math.max(0, remaining),
  };
}

function buildHouseholdControlTransferPlan({ buckets, moneyRails, payees, planInput }) {
  const selectedBucket =
    buckets.find((bucket) => bucket.id === planInput.preferredTransferBucketId) ??
    defaultControlTransferBucket(buckets, payees);
  const approvedPayees = selectedBucket
    ? payees.filter(
        (payee) =>
          payee.status === "approved" && payee.allowedBucketId === selectedBucket.id,
      )
    : [];
  const selectedPayee =
    approvedPayees.find((payee) => payee.id === planInput.preferredPayeeId) ??
    approvedPayees[0] ??
    null;
  const maxTransferCents =
    selectedBucket && selectedPayee
      ? Math.min(selectedBucket.availableCents, selectedPayee.maxCents)
      : 0;
  const requestedTransferCents = Math.min(
    planInput.requestedTransferCents,
    maxTransferCents,
  );

  return {
    allowedNow:
      requestedTransferCents > 0 &&
      Boolean(selectedBucket) &&
      Boolean(selectedPayee),
    approvedPayeeCount: approvedPayees.length,
    destinationPayeeId: selectedPayee?.id ?? null,
    destinationPayeeName: selectedPayee?.name ?? null,
    endpoint: "POST /api/app/transfers",
    maxTransferCents,
    providerReady: moneyRails.transferReady,
    providerStatus: moneyRails.transferReady
      ? "provider_handoff_ready"
      : "intent_validation_only",
    requestedTransferCents,
    sourceBucketId: selectedBucket?.id ?? null,
    sourceBucketName: selectedBucket?.name ?? null,
  };
}

function controlPlanFromOperations(body, env, payload = {}) {
  const buckets = body.buckets ?? [];
  const payees = body.controls?.payees ?? [];
  const normalized = normalizeHouseholdControlPlanInput(payload, buckets, payees);

  if (!normalized.ok) {
    return {
      body: {
        errors: normalized.errors,
        service: "payshield-household-control-plan",
      },
      status: 400,
    };
  }

  const planInput = normalized.input;
  const allocation = buildHouseholdControlAllocation(
    buckets,
    planInput.paycheckAmountCents,
  );
  const liveMoneyGates = missingCoreGates(body.readiness);
  const bankLinkGates = body.moneyRails.missing.filter(
    (gate) => gate.includes("PLAID") || gate.includes("TOKEN_VAULT"),
  );
  const detectionGates = body.moneyRails.missing.filter(
    (gate) =>
      gate.includes("PLAID") ||
      gate.includes("TOKEN_VAULT") ||
      gate.includes("PROVIDER_WEBHOOK"),
  );
  const transferGates = [
    ...body.moneyRails.missing.filter(
      (gate) =>
        gate.includes("TRANSFER") ||
        gate.includes("transfer") ||
        gate.includes("PAYSHIELD_BAAS"),
    ),
    ...body.moneyRails.providerAdapterMissing,
    ...liveMoneyGates,
  ];
  const paidAccessReady = commercialActivationReady(env, body.commercialAccess);
  const paymentCollectionReady = Boolean(body.commercialAccess.readyForCheckout);
  const transferPlan = buildHouseholdControlTransferPlan({
    buckets,
    moneyRails: body.moneyRails,
    payees,
    planInput,
  });
  const operatingSteps = [
    {
      blockers: uniqueFriendlyControlPlanGates(commercialActivationMissing(env)),
      canRunNow: paymentCollectionReady,
      endpoint: "POST /api/app/billing/checkout",
      key: "revenue_gate",
      ownerAction:
        "Configure Stripe checkout, webhook signing, and core activation storage.",
      ready: paidAccessReady,
      status: paymentCollectionReady
        ? paidAccessReady
          ? "collecting_and_activating"
          : "collecting_activation_pending"
        : "stripe_setup_needed",
      title: "Revenue gate",
      userAction: `Start ${body.commercialAccess.priceLabel} household access.`,
    },
    {
      blockers: uniqueFriendlyControlPlanGates(bankLinkGates),
      canRunNow: body.moneyRails.bankLinkReady,
      endpoint: "POST /api/app/bank-link/token",
      key: "bank_connection",
      ownerAction:
        "Configure Plaid credentials, signed token-vault handoff, and encrypted token custody.",
      ready: body.moneyRails.bankLinkReady,
      status: body.moneyRails.bankLinkReady ? "ready" : "provider_setup_needed",
      title: "Bank connection",
      userAction: "Connect the bank source used for payroll detection.",
    },
    {
      blockers: uniqueFriendlyControlPlanGates(detectionGates),
      canRunNow: true,
      endpoint: "POST /api/app/paychecks/rules",
      key: "paycheck_detection",
      ownerAction:
        "Turn on Plaid transaction sync and provider webhook signing for automatic detection.",
      ready: body.moneyRails.paycheckDetectionReady,
      status: body.moneyRails.paycheckDetectionReady
        ? "automatic"
        : "controlled_rule_ready",
      title: "Paycheck detection",
      userAction: `Save ${planInput.ruleName} for ${planInput.employerName}.`,
    },
    {
      blockers: [],
      canRunNow: true,
      endpoint: "POST /api/app/buckets",
      key: "protected_buckets",
      ownerAction:
        "Confirm bucket targets, priority order, due rules, approved payees, and unlock behavior.",
      ready: true,
      status:
        body.controls?.bucketPersistence?.persistence === "postgres"
          ? "durable"
          : "customizable_now",
      title: "Protected buckets",
      userAction: "Protect obligations before Safe to Spend is calculated.",
    },
    {
      blockers: uniqueFriendlyControlPlanGates(transferGates),
      canRunNow: transferPlan.allowedNow,
      endpoint: "POST /api/app/transfers",
      key: "protected_transfer",
      ownerAction:
        "Configure transfer credentials and live-money gates before provider execution.",
      ready: body.moneyRails.transferReady,
      status: transferPlan.providerStatus,
      title: "Protected transfer",
      userAction:
        transferPlan.sourceBucketName && transferPlan.destinationPayeeName
          ? `Validate ${transferPlan.sourceBucketName} payment to ${transferPlan.destinationPayeeName}.`
          : "Approve a protected-bucket payee before release.",
    },
    {
      blockers: uniqueFriendlyControlPlanGates(liveMoneyGates),
      canRunNow: true,
      endpoint: "POST /api/card/authorize",
      key: "card_control",
      ownerAction:
        "Connect a card gateway after provider, ledger, auth, counsel, and runbook gates pass.",
      ready: body.readiness.liveMoneyReady,
      status: body.readiness.liveMoneyReady
        ? "gateway_ready"
        : "ledger_decision_ready",
      title: "Card control",
      userAction: "Check purchases against Safe to Spend and approved billers.",
    },
  ];
  const nextAction =
    operatingSteps.find((step) => !step.canRunNow) ??
    operatingSteps.find((step) => !step.ready) ??
    operatingSteps[0];

  return {
    body: {
      allocation,
      bankConnection: {
        endpoint: "POST /api/app/bank-link/token",
        linkedSourceCount: body.operations.bankConnections.filter(
          (connection) => connection.status === "connected",
        ).length,
        plaidEnv: body.moneyRails.plaidEnv,
        ready: body.moneyRails.bankLinkReady,
        tokenCustodyReady: body.moneyRails.tokenVaultStoreReady,
      },
      detectionRule: {
        amountRangeCents: {
          max: null,
          min: Math.max(10_000, Math.round(planInput.paycheckAmountCents * 0.6)),
        },
        employerNamePattern: planInput.employerName,
        endpoint: "POST /api/app/paychecks/rules",
        expectedFrequency: planInput.expectedFrequency,
        ruleName: planInput.ruleName,
        syncEndpoint: "POST /api/app/paychecks/sync",
        transactionNamePattern: planInput.employerName,
      },
      generatedAt: new Date().toISOString(),
      household: body.household,
      input: planInput,
      monetization: {
        endpoint: "POST /api/app/billing/checkout",
        paidAccessReady,
        paymentCollectionReady,
        priceLabel: body.commercialAccess.priceLabel,
        status: paidAccessReady
          ? "paid_access_ready"
          : paymentCollectionReady
            ? "payment_collection_ready"
            : "checkout_setup_needed",
      },
      nextAction,
      operatingSteps,
      proof: {
        auditEndpoint: "/api/app/audit/export",
        healthEndpoint: "/api/health",
        operationsEndpoint: "/api/app/operations",
        planEndpoint: "/api/app/control-plan",
      },
      service: "payshield-household-control-plan",
      source: {
        bucketPersistence: body.controls?.bucketPersistence?.persistence ?? "memory",
        ledger: body.ledger.source,
        payeePersistence: body.controls?.payeePersistence?.persistence ?? "memory",
      },
      summary: {
        approvedPayeeCount: payees.filter((payee) => payee.status === "approved").length,
        bucketCount: allocation.buckets.length,
        nextActionKey: nextAction.key,
        paycheckAmountCents: planInput.paycheckAmountCents,
        projectedProtectedCents: allocation.projectedProtectedCents,
        projectedSafeToSpendCents: allocation.projectedSafeToSpendCents,
        protectedTargetCents: allocation.buckets.reduce(
          (sum, bucket) => sum + bucket.targetCents,
          0,
        ),
        readyStepCount: operatingSteps.filter((step) => step.canRunNow).length,
        totalStepCount: operatingSteps.length,
      },
      support: body.support,
      transferPlan,
    },
    status: 200,
  };
}

function buildActivationPlan(env, snapshot, commercialAccess, moneyRails) {
  const coreMissing = missingCoreGates(snapshot.readiness);
  const priceLabel = commercialAccess.priceLabel || "$19/month";
  const stages = [
    {
      actionHref: "#money-operations",
      businessImpact:
        `Collect ${priceLabel} before the household can use bank link, paycheck detection, protected transfers, or card controls.`,
      evidence:
        "Stripe checkout intent, verified webhook event, and active commercial access record.",
      key: "revenue",
      label: "Revenue",
      ownerAction:
        "Configure Stripe checkout, webhook signing, and core activation so paid households unlock automatically.",
      primaryEndpoint: "POST /api/app/billing/checkout",
      ready: commercialActivationReady(env, commercialAccess),
      requiredGates: commercialActivationMissing(env),
      status: commercialActivationReady(env, commercialAccess)
        ? "ready"
        : commercialAccess.readyForCheckout
          ? "activation_needed"
          : "stripe_needed",
      setupChecklist: [
        "Set STRIPE_SECRET_KEY plus PAYSHIELD_COMMERCIAL_PRICE_ID or a live payment link.",
        "Set STRIPE_WEBHOOK_SECRET for /api/app/billing/webhook.",
        "Point PAYSHIELD_CORE_API_URL at the always-on core and set PAYSHIELD_CORE_SERVICE_TOKEN so paid access persists through authenticated core writes.",
      ],
      title: "Charge the household",
      userAction: "Activate paid access",
      verification:
        "Create checkout, complete a Stripe test/live event, then confirm commercialAccess.state is active.",
    },
    {
      actionHref: "#money-operations",
      businessImpact:
        "Turn a paying household into a connected funding source with token custody outside the browser.",
      evidence:
        "Plaid Link token, public-token exchange, masked account metadata, and token vault reference.",
      key: "bank_connection",
      label: "Bank connection",
      ownerAction:
        "Configure Plaid credentials, signed token-vault handoff, and encrypted token custody so users can connect an external account from the app.",
      primaryEndpoint: "POST /api/app/bank-link/token",
      ready: moneyRails.bankLinkReady,
      requiredGates: uniqueList(
        moneyRails.missing.filter(
          (gate) =>
            gate.includes("PLAID") ||
            gate.includes("TOKEN_VAULT") ||
            gate.includes("token vault"),
        ),
      ),
      status: moneyRails.bankLinkReady
        ? "ready"
        : moneyRails.plaidConfigured
          ? "vault_needed"
          : "plaid_needed",
      setupChecklist: [
        "Set PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, and PLAID_PRODUCTS.",
        "Set PAYSHIELD_TOKEN_VAULT_KEY_ID, PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET, and PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY; use PAYSHIELD_CORE_API_URL as the default vault receiver or override with PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL.",
        "Verify /api/app/bank-link/exchange records the masked account and vault reference.",
      ],
      title: "Connect banks",
      userAction: "Connect bank",
      verification:
        "Open Plaid Link, exchange the public token, then confirm bankConnections contains the linked source.",
    },
    {
      actionHref: "#money-operations",
      businessImpact:
        "Convert connected account activity into automatic payroll detection and bucket funding.",
      evidence:
        "Saved paycheck rule, Plaid transaction sync event, balanced ledger entry, and updated Safe to Spend.",
      key: "paycheck_detection",
      label: "Paycheck detection",
      ownerAction:
        "Store detection rules and sync Plaid/provider events so payroll deposits split into buckets automatically.",
      primaryEndpoint: "POST /api/app/paychecks/sync",
      ready: moneyRails.transactionSyncReady || moneyRails.paycheckDetectionReady,
      requiredGates: uniqueList(
        moneyRails.missing.filter(
          (gate) =>
            gate.includes("PLAID") ||
            gate.includes("TOKEN_VAULT") ||
            gate.includes("PROVIDER_WEBHOOK"),
        ),
      ),
      status: moneyRails.paycheckDetectionReady
        ? "automatic"
        : moneyRails.transactionSyncReady
          ? "sync_ready"
          : moneyRails.bankLinkReady
            ? "core_storage_needed"
            : "setup_needed",
      setupChecklist: [
        "Save employer, amount, frequency, and provider account matching rules.",
        "Set Plaid credentials, token-vault encryption, durable Postgres, and provider webhook signing.",
        "Verify duplicate sync/provider events are idempotent and exceptions enter the queue.",
      ],
      title: "Detect paychecks",
      userAction: "Save rule and sync bank activity",
      verification:
        "Run /api/app/paychecks/sync, /api/app/paychecks/detect, or a signed provider webhook and confirm protected buckets fund before Safe to Spend.",
    },
    {
      actionHref: "#bucket-studio",
      businessImpact:
        "Give households configurable protected categories, priorities, payees, and unlock rules before spend happens.",
      evidence:
        "Bucket profile, payee list, target amounts, due rules, and immutable ledger journal.",
      key: "protection_rules",
      label: "Protection rules",
      ownerAction:
        "Use the bucket studio to customize protected categories, priorities, due rules, payees, and unlock behavior.",
      primaryEndpoint: "POST /api/app/buckets",
      ready: true,
      requiredGates: [],
      status: snapshot.readiness.postgresSchemaVerified ? "durable" : "control_model",
      setupChecklist: [
        "Customize protected buckets, targets, priorities, and due cadence.",
        "Assign approved payees and bucket-only bill routes.",
        "Verify journal entries stay balanced and safe-spend excludes protected funds.",
      ],
      title: "Protect the paycheck",
      userAction: "Save bucket profile",
      verification:
        "Save the bucket profile, run a paycheck split, then export the audit packet.",
    },
    {
      actionHref: "#money-operations",
      businessImpact:
        "Release protected money only after PayShield validates the bucket balance and provider handoff state.",
      evidence:
        "Transfer intent, source bucket validation, destination payee, provider status, and audit record.",
      key: "money_movement",
      label: "Money movement",
      ownerAction:
        "Configure transfer/BaaS credentials plus the live-money gates so approved transfers execute after ledger validation.",
      primaryEndpoint: "POST /api/app/transfers",
      ready: moneyRails.transferReady,
      requiredGates: uniqueList([
        ...moneyRails.missing.filter(
          (gate) =>
            gate.includes("TRANSFER") ||
            gate.includes("transfer/BaaS") ||
            gate.includes("PAYSHIELD_BAAS"),
        ),
        ...coreMissing,
      ]),
      status: moneyRails.transferReady
        ? "ready"
        : moneyRails.transferConfigured
          ? "live_gates_needed"
          : "intent_validation_active",
      setupChecklist: [
        "Set PAYSHIELD_TRANSFER_ENABLED plus transfer or BaaS credentials.",
        "Keep PAYSHIELD_LIVE_MONEY_ENABLED off until provider, ledger, auth, counsel, and runbook gates pass.",
        "Verify provider handoff records match settlement and exception queues.",
      ],
      title: "Move protected funds",
      userAction: "Create transfer intent",
      verification:
        "Create a transfer intent, confirm it cannot exceed the bucket balance, then confirm provider execution only opens when live gates pass.",
    },
    {
      actionHref: "#card-authorization",
      businessImpact:
        "Approve ordinary spending only from Safe to Spend while approved billers can draw from assigned buckets.",
      evidence:
        "Authorization request, approved amount, bucket decision, denial reason, and ledger record.",
      key: "card_control",
      label: "Card control",
      ownerAction:
        "Connect a provider gateway so authorization decisions run against Safe to Spend and approved biller buckets.",
      primaryEndpoint: "POST /api/card/authorize",
      ready: snapshot.readiness.liveMoneyReady,
      requiredGates: coreMissing,
      status: snapshot.readiness.liveMoneyReady ? "gateway_ready" : "ledger_decisions_active",
      setupChecklist: [
        "Connect a provider authorization gateway to POST /api/card/authorize.",
        "Map merchant, MCC, payee, and partial-approval metadata into the ledger decision.",
        "Verify overreach declines and approved billers cannot drain unrelated buckets.",
      ],
      title: "Approve only safe spend",
      userAction: "Check card swipe",
      verification:
        "Send safe-spend, protected-overreach, and approved-biller authorization cases and confirm decisions match the ledger.",
    },
  ];
  const nextStage = stages.find((stage) => !stage.ready) ?? stages[0];

  return {
    businessModel: {
      billingProvider: "Stripe",
      priceLabel,
      revenuePath:
        "Checkout -> webhook -> commercial access -> bank link -> paycheck controls.",
      supportContact: "support@graystontechnologies.com",
    },
    generatedAt: new Date().toISOString(),
    liveMoneyReady: snapshot.readiness.liveMoneyReady,
    nextStageKey: nextStage.key,
    readyCount: stages.filter((stage) => stage.ready).length,
    revenueReady: commercialActivationReady(env, commercialAccess),
    stages,
    totalStages: stages.length,
  };
}

function buildRevenueAndRails(
  env,
  snapshot,
  commercialAccess,
  moneyRails,
  protectedCents,
  safeToSpendCents,
) {
  const liveMoneyMissing = missingCoreGates(snapshot.readiness);
  const priceLabel = commercialAccess.priceLabel || "$19/month";

  return {
    operatingSequence: [
      "Collect paid household access",
      "Bind the household identity",
      "Connect the external bank source",
      "Sync linked-bank activity",
      "Route and detect paycheck deposits",
      "Split protected buckets before Safe to Spend",
      "Release funds only through approved transfers, billers, unlocks, or card decisions",
    ],
    rails: [
      {
        blockers: commercialActivationMissing(env),
        canRunNow: commercialActivationReady(env, commercialAccess),
        endpoint: "POST /api/app/billing/checkout",
        key: "revenue",
        label: "Get paid",
        ownerAction: "Configure Stripe Checkout, webhook signing, and core persistence.",
        provider: "Stripe",
        state: commercialActivationReady(env, commercialAccess)
          ? "active"
          : commercialAccess.readyForCheckout
            ? "activation_needed"
            : "stripe_needed",
        userAction: `Subscribe at ${priceLabel}`,
        unlocks: "Commercial access, billing status, and paid money workflows.",
      },
      {
        blockers: uniqueList(
          moneyRails.missing.filter(
            (gate) =>
              gate.includes("PLAID") ||
              gate.includes("TOKEN_VAULT") ||
              gate.includes("token vault"),
          ),
        ),
        canRunNow: moneyRails.bankLinkReady,
        endpoint: "POST /api/app/bank-link/token",
        key: "bank_connection",
        label: "Connect banks",
        ownerAction:
          "Set Plaid credentials, signed token-vault handoff, and encrypted token custody.",
        provider: "Plaid Link",
        state: moneyRails.bankLinkReady
          ? "ready"
          : moneyRails.plaidConfigured
            ? "vault_needed"
            : "plaid_needed",
        userAction: "Launch bank connection",
        unlocks: "Masked funding source, token custody, and provider account mapping.",
      },
      {
        blockers: uniqueList([
          ...moneyRails.missing.filter(
            (gate) =>
              gate.includes("PLAID") ||
              gate.includes("TOKEN_VAULT") ||
              gate.includes("token vault"),
          ),
          ...liveMoneyMissing.filter((gate) =>
            ["postgres_ledger", "dedicated_backend", "core_service_auth"].includes(
              gate,
            ),
          ),
        ]),
        canRunNow: moneyRails.transactionSyncReady,
        endpoint: "POST /api/app/paychecks/sync",
        key: "transaction_sync",
        label: "Sync activity",
        ownerAction:
          "Run Plaid Transactions sync from the core so payroll-like deposits enter the bucket ledger.",
        provider: "Plaid Transactions",
        state: moneyRails.transactionSyncReady
          ? "ready"
          : moneyRails.bankLinkReady
            ? "core_storage_needed"
            : "bank_link_needed",
        userAction: "Sync linked-bank activity",
        unlocks: "Synced transactions, paycheck detections, exceptions, and cursor evidence.",
      },
      {
        blockers: uniqueList(
          moneyRails.missing.filter(
            (gate) =>
              gate.includes("PLAID") ||
              gate.includes("TOKEN_VAULT") ||
              gate.includes("PROVIDER_WEBHOOK"),
          ),
        ),
        canRunNow: moneyRails.transactionSyncReady || moneyRails.paycheckDetectionReady,
        endpoint: "POST /api/app/paychecks/sync",
        key: "paycheck_detection",
        label: "Detect income",
        ownerAction:
          "Configure Plaid/token-vault credentials, sync cursor storage, signed provider events, and durable core storage before paycheck detection runs from the app.",
        provider:
          moneyRails.detectionMode === "plaid_transactions_sync"
            ? "Plaid Transactions"
            : "Provider webhook",
        state: moneyRails.paycheckDetectionReady
          ? "automatic"
          : moneyRails.transactionSyncReady
            ? "sync_ready"
            : moneyRails.bankLinkReady
              ? "core_storage_needed"
              : "setup_needed",
        userAction: "Save payroll rule and sync income",
        unlocks: "Priority bucket funding and a recalculated Safe to Spend balance.",
      },
      {
        blockers: uniqueList([
          ...moneyRails.missing.filter(
            (gate) =>
              gate.includes("TRANSFER") ||
              gate.includes("transfer/BaaS") ||
              gate.includes("PAYSHIELD_BAAS"),
          ),
          ...liveMoneyMissing,
        ]),
        canRunNow: moneyRails.transferReady,
        endpoint: "POST /api/app/transfers",
        key: "money_movement",
        label: "Move funds",
        ownerAction:
          "Set transfer/BaaS credentials, provider approvals, durable ledger, and operating gates.",
        provider: "BaaS or transfer partner",
        state: moneyRails.transferReady
          ? "ready"
          : moneyRails.transferConfigured
            ? "live_gates_needed"
            : "intent_validation_active",
        userAction: "Create protected transfer intent",
        unlocks: "Provider handoff only after bucket balance and payee validation pass.",
      },
      {
        blockers: uniqueList(liveMoneyMissing),
        canRunNow: snapshot.readiness.liveMoneyReady,
        endpoint: "POST /api/card/authorize",
        key: "card_control",
        label: "Control spend",
        ownerAction:
          "Connect the card authorization gateway after provider, counsel, ledger, auth, and runbook gates pass.",
        provider: "Card gateway",
        state: snapshot.readiness.liveMoneyReady
          ? "gateway_ready"
          : "ledger_decisions_active",
        userAction: "Check swipe decision",
        unlocks: "Safe-to-spend approvals, protected-fund declines, and biller exceptions.",
      },
    ],
    summary: {
      bankLinkReady: moneyRails.bankLinkReady,
      detectionMode: moneyRails.detectionMode,
      liveMoneyReady: snapshot.readiness.liveMoneyReady,
      priceLabel,
      protectedCents,
      revenueReady: commercialActivationReady(env, commercialAccess),
      safeToSpendCents,
      transactionSyncReady: moneyRails.transactionSyncReady,
      transferReady: moneyRails.transferReady,
    },
  };
}

async function buildHouseholdOperations(env = process.env, actorInput = demoUser) {
  const actorResolution = await resolveActorIdentity(
    env,
    actorInput,
    "household operations",
  );

  if (!actorResolution.ok) {
    return actorResolution.result;
  }

  const actor = actorResolution.actor;
  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const ledger = await loadHouseholdLedger(env, actor, controls);

  if (ledger.error) {
    return ledger.error;
  }

  const book = ledger.book;
  const snapshot = createNeobankSnapshot(book, env, controls, actor);
  const safeSpend = snapshot.buckets.find((bucket) => bucket.id === "safe_spending");
  const operationalAudit = ledger.operationalAudit;
  const durableAudit = ledger.durableAudit;
  const audit = {
    ...durableAudit,
    billingEvents: durableAudit.billingEvents.length
      ? durableAudit.billingEvents
      : latestCommercialBillingEvents(actor.householdId),
    checkoutIntents: durableAudit.checkoutIntents.length
      ? durableAudit.checkoutIntents
      : latestCommercialCheckoutIntents(actor.householdId),
    journalEntries: durableAudit.journalEntries.length
      ? durableAudit.journalEntries
      : snapshot.ledgerEntries,
  };
  const moneyRails = getMoneyRailReadiness(env);
  const commercialAccess = commercialAccessStatus(env, audit);
  const protectedCents = snapshot.buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.availableCents, 0);

  return {
    body: {
      balances: {
        protectedCents,
        safeToSpendCents: safeSpend?.availableCents ?? 0,
        totalCents: protectedCents + (safeSpend?.availableCents ?? 0),
      },
      buckets: snapshot.buckets,
      card: snapshot.card,
      controls: {
        bucketPersistence: controls.bucketPersistence,
        payeePersistence: controls.payeePersistence,
        payees: controls.payees,
      },
      directDeposit: snapshot.directDeposit,
      generatedAt: new Date().toISOString(),
      household: {
        householdId: actor.householdId,
        kycStatus: actor.kycStatus,
        profileAccess: actor.profileAccess,
        userId: actor.id,
      },
      commercialAccess,
      activationPlan: buildActivationPlan(
        env,
        snapshot,
        commercialAccess,
        moneyRails,
      ),
      revenueAndRails: buildRevenueAndRails(
        env,
        snapshot,
        commercialAccess,
        moneyRails,
        protectedCents,
        safeSpend?.availableCents ?? 0,
      ),
      ledger: {
        durableEntryCount: durableAudit.journalEntries.length,
        entryCount: snapshot.ledgerEntries.length,
        source: ledger.ledgerSource,
      },
      moneyRails,
      operations: audit,
      operationalAudit,
      readiness: snapshot.readiness,
      service: "payshield-household-operations",
      statusCards: [
        {
          key: "paid_access",
          label: "Paid access",
          state: commercialAccess.state,
        },
        {
          key: "bank_connection",
          label: "Bank connection",
          state: audit.bankConnections.some((connection) => connection.status === "connected")
            ? "connected"
            : gateState(moneyRails.bankLinkReady),
        },
        {
          key: "direct_deposit",
          label: "Paycheck routing",
          state: audit.directDepositSetups.length > 0
            ? "recorded"
            : gateState(snapshot.readiness.liveMoneyReady),
        },
        {
          key: "transaction_sync",
          label: "Bank sync",
          state: gateState(moneyRails.transactionSyncReady),
        },
        {
          key: "paycheck_detection",
          label: "Paycheck detection",
          state: audit.paycheckDetections.length > 0 ? "recorded" : gateState(moneyRails.paycheckDetectionReady),
        },
        {
          key: "protected_transfer",
          label: "Protected transfer",
          state: audit.transferIntents.length > 0 ? "recorded" : gateState(moneyRails.transferReady),
        },
        {
          key: "reconciliation",
          label: "Exception queue",
          state: (audit.reconciliationExceptions || []).some(
            (exception) => exception.status === "open",
          )
            ? "open"
            : "clear",
        },
      ],
      support: {
        contact: "support@graystontechnologies.com",
        operator: "Grayston Technologies",
      },
      timeline: operationTimeline(audit, snapshot),
    },
    status: 200,
  };
}

export async function getHouseholdOperations(env = process.env, actorInput = demoUser) {
  return buildHouseholdOperations(env, actorInput);
}

export async function getHouseholdControlPlan(
  env = process.env,
  actorInput = demoUser,
  payload = {},
) {
  const result = await buildHouseholdOperations(env, actorInput);

  if (result.status !== 200) {
    return result;
  }

  return controlPlanFromOperations(result.body, env, payload);
}

function activationPacketFromOperations(body, env = process.env) {
  const remainingGates = uniqueList(
    body.activationPlan.stages.flatMap((stage) => stage.requiredGates),
  );
  const nextStage =
    body.activationPlan.stages.find(
      (stage) => stage.key === body.activationPlan.nextStageKey,
    ) ?? body.activationPlan.stages[0];
  const siteUrl =
    env.NEXT_PUBLIC_SITE_URL?.trim() || "https://payshield-lime.vercel.app";
  const setupGroups = buildActivationSetupGroups(body, siteUrl);

  return {
    activationPlan: body.activationPlan,
    currentState: {
      commercialAccess: body.commercialAccess,
      moneyRails: body.moneyRails,
      readiness: body.readiness,
      revenueAndRails: body.revenueAndRails,
      statusCards: body.statusCards,
    },
    generatedAt: body.generatedAt,
    household: body.household,
    nextAction: {
      actionHref: nextStage.actionHref,
      ownerAction: nextStage.ownerAction,
      primaryEndpoint: nextStage.primaryEndpoint,
      requiredGates: nextStage.requiredGates,
      title: nextStage.title,
      userAction: nextStage.userAction,
      verification: nextStage.verification,
    },
    operatorRunbook: {
      activationEndpoint: "/api/launch/activation",
      appActivationEndpoint: "/api/app/activation",
      auditEndpoint: "/api/app/audit/export",
      healthEndpoint: "/api/health",
      operationsEndpoint: "/api/app/operations",
      remainingGates,
      setupGroups,
      siteUrl,
      authenticatedSmokeCommands: [
        `curl -fsS ${siteUrl}/api/app/activation`,
        `curl -fsS ${siteUrl}/api/app/operations`,
        `curl -fsS ${siteUrl}/api/app/audit/export`,
      ],
      smokeCommands: [
        `curl -fsS ${siteUrl}/api/health`,
        `curl -fsS ${siteUrl}/api/launch/activation`,
        "npm run vercel:env:audit -- --profile commercial",
        `npm run market:status -- ${siteUrl} --expect-site-url ${siteUrl}`,
        'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:verify',
      ],
    },
    service: "payshield-activation-console",
    support: body.support,
    revenueAndRails: body.revenueAndRails,
  };
}

export async function getHouseholdActivation(env = process.env, actorInput = demoUser) {
  const result = await buildHouseholdOperations(env, actorInput);

  if (result.status !== 200) {
    return result;
  }

  return {
    body: activationPacketFromOperations(result.body, env),
    status: 200,
  };
}

export async function getBillingStatus(env = process.env, actorInput = demoUser) {
  const result = await buildHouseholdOperations(env, actorInput);

  if (result.status !== 200) {
    return result;
  }

  return {
    body: {
      commercialAccess: result.body.commercialAccess,
      household: result.body.household,
      readiness: {
        checkoutConfigured: result.body.commercialAccess.readyForCheckout,
        mode: result.body.commercialAccess.mode,
        priceLabel: result.body.commercialAccess.priceLabel,
      },
      service: "payshield-billing-status",
    },
    status: 200,
  };
}

export async function getHouseholdAuditExport(env = process.env, actorInput = demoUser) {
  const result = await buildHouseholdOperations(env, actorInput);

  if (result.status !== 200) {
    return result;
  }

  const body = result.body;

  return {
    body: {
      balances: body.balances,
      buckets: body.buckets,
      card: body.card,
      controls: body.controls,
      directDeposit: body.directDeposit,
      exportVersion: "payshield-household-audit-v1",
      generatedAt: body.generatedAt,
      household: body.household,
      activationPlan: body.activationPlan,
      commercialAccess: body.commercialAccess,
      revenueAndRails: body.revenueAndRails,
      ledger: {
        entries: body.operations.journalEntries,
        entryCount: body.ledger.entryCount,
        source:
          body.ledger.source === "postgres_journal"
            ? "postgres"
            : body.ledger.source === "postgres_empty"
              ? "postgres_empty"
              : "core_control_model",
      },
      moneyRails: body.moneyRails,
      operations: body.operations,
      readiness: body.readiness,
      service: "payshield-audit-export",
      statusCards: body.statusCards,
      support: body.support,
      timeline: body.timeline,
    },
    status: 200,
  };
}

export async function resolveReconciliationException(payload, env = process.env) {
  const actorResolution = await resolveActorIdentity(
    env,
    actorFromPayload(payload),
    "reconciliation resolution",
  );

  if (!actorResolution.ok) {
    return actorResolution.result;
  }

  const actor = actorResolution.actor;
  const exceptionId = cleanText(payload?.exceptionId || payload?.id, 180);
  const idempotencyKey = cleanText(payload?.idempotencyKey, 220);
  const reason =
    cleanText(payload?.reason, 80) || "support_review_complete";
  const resolutionNote = cleanText(
    payload?.resolutionNote || payload?.note,
    500,
  );

  if (!exceptionId && !idempotencyKey) {
    return {
      body: {
        error: "Provide exceptionId or idempotencyKey.",
        service: "payshield-reconciliation-resolution",
      },
      status: 400,
    };
  }

  if (!resolutionNote) {
    return {
      body: {
        error: "Provide a resolutionNote before closing the exception.",
        service: "payshield-reconciliation-resolution",
      },
      status: 400,
    };
  }

  const summary = cleanText(payload?.summary, 500) || null;
  const resolution = await resolveReconciliationExceptionRecord(
    {
      exceptionId,
      householdId: actor.householdId,
      idempotencyKey,
      reason,
      resolvedBy: actor.id,
      resolutionNote,
      summary,
    },
    env,
  );

  if (persistenceFailed(resolution)) {
    return {
      body: {
        error: "Reconciliation exception could not be resolved.",
        resolution,
        service: "payshield-reconciliation-resolution",
      },
      status: 503,
    };
  }

  if (!resolution.found) {
    return {
      body: {
        error: "No matching reconciliation exception was found.",
        resolution,
        service: "payshield-reconciliation-resolution",
      },
      status: 404,
    };
  }

  if (resolution.persistence !== "postgres") {
    return {
      body: {
        error:
          "Resolving reconciliation exceptions requires the dedicated Postgres operations store.",
        resolution,
        service: "payshield-reconciliation-resolution",
      },
      status: 424,
    };
  }

  const auditPersistence = await persistMoneyRailEvent(
    {
      eventType: "reconciliation_exception_resolved",
      householdId: actor.householdId,
      payload: {
        exceptionId: exceptionId || null,
        idempotencyKey: idempotencyKey || null,
        noteRecorded: true,
        reason,
        resolvedBy: actor.id,
      },
      providerEventId: `reconciliation-resolution:${exceptionId || idempotencyKey}`,
      providerName: "payshield",
      rail: "reconciliation",
    },
    env,
  );

  if (persistenceFailed(auditPersistence)) {
    return {
      body: {
        auditPersistence,
        error: "Reconciliation resolution audit event could not be persisted.",
        resolution,
        service: "payshield-reconciliation-resolution",
      },
      status: 503,
    };
  }

  return {
    body: {
      auditPersistence,
      exception: resolution.exception,
      message:
        "Reconciliation exception resolved in the durable operations queue.",
      resolved: true,
      resolution,
      service: "payshield-reconciliation-resolution",
    },
    status: 200,
  };
}

export async function getBucketProfile(env = process.env, actorInput = demoUser) {
  const actorResolution = await resolveActorIdentity(
    env,
    actorInput,
    "bucket profile lookup",
  );

  if (!actorResolution.ok) {
    return actorResolution.result;
  }

  const actor = actorResolution.actor;
  const snapshot = createNeobankSnapshot(undefined, env, {}, actor);
  const persistence = await loadBucketProfile(actor.householdId, env);

  if (persistenceFailed(persistence)) {
    return {
      body: {
        message: "Bucket profile could not be loaded from durable core controls.",
        persistence,
        readiness: snapshot.readiness,
        service: "payshield-bucket-controls",
      },
      status: 503,
    };
  }

  if (persistence.profileFound) {
    const buckets = withSafeSpendingBucket(persistence.profile);
    const book = createDemoLedgerBook(300_000, buckets);

    return {
      body: {
        buckets: buildBucketBalances(book, buckets),
        message: "Household bucket profile loaded from durable core controls.",
        persisted: true,
        persistence,
        profilePersistence: "durable_core",
        profileSource: "postgres",
        readiness: snapshot.readiness,
        templates: [
          "Rent",
          "Mortgage",
          "Utilities",
          "Insurance",
          "Vehicle",
          "Childcare",
          "Debt payoff",
          "Emergency",
          "Taxes",
        ],
      },
      status: 200,
    };
  }

  return {
    body: {
      buckets: snapshot.buckets,
      message: "Household bucket profile loaded from the core control model.",
      persisted: false,
      persistence,
      profilePersistence: "core_service_model",
      profileSource: "core_control_model",
      readiness: snapshot.readiness,
      templates: [
        "Rent",
        "Mortgage",
        "Utilities",
        "Insurance",
        "Vehicle",
        "Childcare",
        "Debt payoff",
        "Emergency",
        "Taxes",
      ],
    },
    status: 200,
  };
}

export async function saveBucketProfile(payload, env = process.env) {
  const actor = actorFromPayload(payload);

  if (payload?.action === "replace_profile") {
    const profile = normalizeBucketProfile(payload.buckets);

    if (!profile) {
      return {
        body: {
          error: "Provide 1-12 protected buckets with name, targetCents, due, and protection.",
        },
        status: 400,
      };
    }

    const protectedCents = profile.reduce((total, bucket) => total + bucket.targetCents, 0);
    const persistence = await persistBucketProfile(
      {
        actorUserId: actor.id,
        betaAccessStatus: actor.profileAccess,
        buckets: profile,
        clerkSubject: actor.clerkSubject,
        householdId: actor.householdId,
        idempotencyKey: cleanText(payload.idempotencyKey, 120),
        kycStatus: actor.kycStatus,
        userEmail: actor.email,
        userName: actor.name,
      },
      env,
    );

    if (persistenceFailed(persistence)) {
      return {
        body: {
          buckets: profile,
          error: "Bucket profile could not be persisted.",
          persistence,
          protectedCents,
          readiness: getCoreReadiness(env, { coreOnline: true }),
          service: "payshield-bucket-controls",
        },
        status: 503,
      };
    }

    const persisted = persistence.persistence === "postgres";

    return {
      body: {
        buckets: profile,
        message:
          persisted
            ? "Bucket profile saved to durable core controls for protected money routing."
            : "Bucket profile validated by the core control model. Durable account sync requires Postgres-backed profile persistence.",
        persisted,
        persistence,
        profilePersistence: persisted ? "durable_core" : "core_service_model",
        profileSource: persisted ? "postgres" : "core_control_model",
        protectedCents,
        readiness: getCoreReadiness(env, { coreOnline: true }),
        safeToSpendPreviewCents: Math.max(0, 300_000 - protectedCents),
        safeSpendRule: "Safe to Spend is computed only after protected buckets fund.",
      },
      status: 200,
    };
  }

  const targetCents = toIntegerCents(payload?.targetCents);

  if (!isBucketId(payload?.bucketId) || targetCents === null) {
    return {
      body: {
        error: "Provide bucketId and integer targetCents.",
      },
      status: 400,
    };
  }

  if (payload.bucketId === "safe_spending") {
    return {
      body: {
        error: "Safe spending is always the paycheck remainder.",
      },
      status: 400,
    };
  }

  const modeledBuckets = neobankBuckets.map((bucket) =>
    bucket.id === payload.bucketId ? { ...bucket, targetCents } : bucket,
  );
  const persistence = await persistBucketProfile(
    {
      actorUserId: actor.id,
      betaAccessStatus: actor.profileAccess,
      buckets: modeledBuckets.filter((bucket) => bucket.id !== "safe_spending"),
      clerkSubject: actor.clerkSubject,
      householdId: actor.householdId,
      idempotencyKey:
        cleanText(payload.idempotencyKey, 120) || `bucket-target-${payload.bucketId}-${targetCents}`,
      kycStatus: actor.kycStatus,
      payees: neobankPayees,
      userEmail: actor.email,
      userName: actor.name,
    },
    env,
  );

  if (persistenceFailed(persistence)) {
    return {
      body: {
        bucket: modeledBuckets.find((bucket) => bucket.id === payload.bucketId),
        error: "Bucket target could not be persisted.",
        persistence,
        readiness: getCoreReadiness(env, { coreOnline: true }),
        service: "payshield-bucket-controls",
      },
      status: 503,
    };
  }

  const persisted = persistence.persistence === "postgres";

  return {
    body: {
      bucket: modeledBuckets.find((bucket) => bucket.id === payload.bucketId),
      message: persisted
        ? "Bucket target saved to durable core controls."
        : "Bucket target validated for the household control model.",
      persisted,
      persistence,
      profilePersistence: persisted ? "durable_core" : "core_service_model",
      profileSource: persisted ? "postgres" : "core_control_model",
      readiness: getCoreReadiness(env, { coreOnline: true }),
    },
    status: 200,
  };
}

function directDepositInstructionsForReadiness(readiness) {
  return {
    accountLast4: "----",
    accountName: "PayShield protected paycheck account",
    providerStatus: readiness.liveMoneyReady ? "live" : "gated",
    routingLast4: "----",
  };
}

function directDepositInstructionsFromProviderPayload(payload) {
  const accountLast4 = safeString(payload?.accountLast4, 4);
  const routingLast4 = safeString(payload?.routingLast4, 4);

  if (!/^\d{4}$/.test(accountLast4) || !/^\d{4}$/.test(routingLast4)) {
    throw new ProviderAdapterError(
      "Provider direct-deposit response did not include masked routing details.",
    );
  }

  return {
    accountLast4,
    accountName:
      safeString(payload?.accountName, 80) ||
      "PayShield protected paycheck account",
    providerStatus: "live",
    routingLast4,
  };
}

async function providerCreateCustomer(env, actor) {
  const payload = await providerAdapterRequest(
    env,
    "createCustomer",
    getProviderAdapterConfig(env).endpoints.customer,
    {
      email: actor.email,
      idempotencyKey: `customer:${actor.id}`,
      name: actor.name,
      userId: actor.id,
    },
  );

  return {
    providerCustomerId: requireProviderField(
      payload,
      ["providerCustomerId", "customerId"],
      "Provider customer response did not include a customer id.",
    ),
    providerRequestId: providerRequestId(payload) || undefined,
    status: "created",
  };
}

async function providerStartKyc(env, actor) {
  const payload = await providerAdapterRequest(
    env,
    "startKyc",
    getProviderAdapterConfig(env).endpoints.kyc,
    {
      email: actor.email,
      idempotencyKey: `kyc:${actor.id}`,
      name: actor.name,
      userId: actor.id,
    },
  );

  return {
    providerApplicationId: requireProviderField(
      payload,
      ["providerApplicationId", "applicationId"],
      "Provider KYC response did not include an application id.",
    ),
    providerRequestId: providerRequestId(payload) || undefined,
    status: "started",
  };
}

async function providerOpenFinancialAccount(env, providerCustomerId) {
  const payload = await providerAdapterRequest(
    env,
    "openFinancialAccount",
    getProviderAdapterConfig(env).endpoints.financialAccount,
    {
      idempotencyKey: `financial-account:${providerCustomerId}`,
      providerCustomerId,
    },
  );

  return {
    providerAccountId: requireProviderField(
      payload,
      ["providerAccountId", "accountId"],
      "Provider account response did not include an account id.",
    ),
    providerRequestId: providerRequestId(payload) || undefined,
    status: "opened",
  };
}

async function providerCreateDirectDepositInstructions(env, providerAccountId) {
  const payload = await providerAdapterRequest(
    env,
    "createDirectDepositInstructions",
    getProviderAdapterConfig(env).endpoints.directDeposit,
    {
      idempotencyKey: `direct-deposit:${providerAccountId}`,
      providerAccountId,
    },
  );

  return directDepositInstructionsFromProviderPayload(payload);
}

async function providerIssueCard(env, actor, providerAccountId) {
  const payload = await providerAdapterRequest(
    env,
    "issueCard",
    getProviderAdapterConfig(env).endpoints.cardIssue,
    {
      idempotencyKey: `card:${actor.id}:${providerAccountId}`,
      providerAccountId,
      userId: actor.id,
    },
  );
  const cardLast4 = safeString(payload?.cardLast4, 4);
  const providerCardId = providerField(payload, ["providerCardId", "cardId"]);

  if (!providerCardId || !/^\d{4}$/.test(cardLast4)) {
    throw new ProviderAdapterError(
      "Provider card response did not include card identifiers.",
    );
  }

  return {
    cardLast4,
    providerCardId,
    status: "issued",
  };
}

async function providerCreateAchTransfer(env, input) {
  const payload = await providerAdapterRequest(
    env,
    "createAchTransfer",
    getProviderAdapterConfig(env).endpoints.transfer,
    input,
  );

  return {
    providerTransferId: requireProviderField(
      payload,
      ["providerTransferId", "transferId"],
      "Provider transfer response did not include a transfer id.",
    ),
    status: "created",
  };
}

async function providerCreateBillPayment(env, input) {
  const payload = await providerAdapterRequest(
    env,
    "createBillPayment",
    getProviderAdapterConfig(env).endpoints.billPayment,
    input,
  );

  return {
    providerBillPaymentId: requireProviderField(
      payload,
      ["providerBillPaymentId", "billPaymentId"],
      "Provider bill-payment response did not include a bill payment id.",
    ),
    status: "created",
  };
}

export function startOnboarding(env = process.env, actorInput = demoUser) {
  return startOnboardingWithPaidAccess(env, actorInput);
}

export async function createDirectDepositSetup(payload = {}, env = process.env) {
  const readiness = getCoreReadiness(env, { coreOnline: true });
  const liveGate = assertLiveMoneyReady(readiness);
  let actor = actorFromPayload(payload);
  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "direct deposit setup",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  const providerName =
    cleanText(payload?.providerName, 40).toLowerCase() ||
    getProviderAdapterConfig(env).providerName ||
    "payshield";
  const providerCustomerId = liveGate.ok
    ? cleanText(payload?.providerCustomerId, 160) || null
    : null;
  const providerAccountId = liveGate.ok
    ? cleanText(payload?.providerAccountId, 160)
    : "financial-account-provider-contract-required";

  if (liveGate.ok && !providerAccountId) {
    return {
      body: {
        error:
          "providerAccountId is required before live direct-deposit instructions can be requested.",
        liveMoney: liveGate,
        readiness,
        service: "payshield-direct-deposit-setup",
      },
      status: 400,
    };
  }

  const idempotencyKey =
    cleanText(payload?.idempotencyKey, 120) ||
    `direct-deposit-${actor.householdId}`;
  let directDeposit = directDepositInstructionsForReadiness(readiness);

  if (liveGate.ok) {
    try {
      directDeposit = await providerCreateDirectDepositInstructions(
        env,
        providerAccountId,
      );
    } catch (error) {
      const result = providerErrorResult(error, "payshield-direct-deposit-setup");

      return {
        body: {
          ...result.body,
          liveMoney: liveGate,
          readiness,
        },
        status: result.status,
      };
    }
  }

  const status = liveGate.ok ? "ready" : "blocked";
  const setup = {
    accountLast4: directDeposit.accountLast4,
    accountName: directDeposit.accountName,
    householdId: actor.householdId,
    idempotencyKey,
    metadata: {
      configuredBy: actor.id,
      liveMoneyReady: readiness.liveMoneyReady,
      source: "payshield_app",
    },
    providerAccountId,
    providerCustomerId,
    providerName,
    providerStatus: directDeposit.providerStatus,
    routingLast4: directDeposit.routingLast4,
    status,
    userId: actor.id,
  };
  const persistence = await persistDirectDepositSetup(setup, env);

  if (persistenceFailed(persistence)) {
    return {
      body: {
        directDeposit,
        error: "Direct deposit setup could not be persisted.",
        liveMoney: liveGate,
        persistence,
        readiness,
        service: "payshield-direct-deposit-setup",
      },
      status: 503,
    };
  }

  const auditPersistence = await persistMoneyRailEvent(
    {
      eventType: "direct_deposit_setup_requested",
      householdId: actor.householdId,
      payload: {
        accountLast4: directDeposit.accountLast4,
        accountName: directDeposit.accountName,
        providerAccountId,
        providerStatus: directDeposit.providerStatus,
        routingLast4: directDeposit.routingLast4,
        status,
      },
      providerEventId: `direct_deposit:${idempotencyKey}`,
      providerName,
      rail: "direct_deposit",
    },
    env,
  );

  if (persistenceFailed(auditPersistence)) {
    return {
      body: {
        auditPersistence,
        directDeposit,
        error: "Direct deposit setup audit event could not be persisted.",
        liveMoney: liveGate,
        persistence,
        readiness,
        service: "payshield-direct-deposit-setup",
      },
      status: 503,
    };
  }

  return {
    body: {
      auditPersistence,
      directDeposit,
      liveMoney: liveGate,
      message: liveGate.ok
        ? "Paycheck routing instructions are ready for the configured provider account."
        : "Paycheck routing setup recorded. Provider activation is required before live instructions are released.",
      persisted: persistence.persistence === "postgres",
      persistence,
      readiness,
      service: "payshield-direct-deposit-setup",
      setup: persistence.setup || setup,
    },
    status: liveGate.ok ? 200 : 423,
  };
}

async function startOnboardingWithPaidAccess(env = process.env, actorInput = demoUser) {
  const readiness = getCoreReadiness(env, { coreOnline: true });
  const liveGate = assertLiveMoneyReady(readiness);
  const blocked = providerBlockedResult(readiness);
  let actor = normalizeActor(actorInput);
  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "provider onboarding",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  let customer = {
    providerCustomerId: "provider-contract-required",
    status: "blocked",
  };
  let kyc = {
    providerApplicationId: "kyc-provider-contract-required",
    status: "blocked",
  };
  let financialAccount = {
    providerAccountId: "financial-account-provider-contract-required",
    status: "blocked",
  };
  let directDeposit = {
    accountLast4: "----",
    accountName: "PayShield protected paycheck account",
    providerStatus: "gated",
    routingLast4: "----",
  };
  let card = {
    cardLast4: "----",
    providerCardId: "card-provider-contract-required",
    status: "blocked",
  };

  if (!blocked) {
    try {
      customer = await providerCreateCustomer(env, actor);
      kyc = await providerStartKyc(env, actor);
      financialAccount = await providerOpenFinancialAccount(
        env,
        customer.providerCustomerId,
      );
      directDeposit = await providerCreateDirectDepositInstructions(
        env,
        financialAccount.providerAccountId,
      );
      card = await providerIssueCard(
        env,
        actor,
        financialAccount.providerAccountId,
      );
    } catch (error) {
      const result = providerErrorResult(error, "payshield-provider-onboarding");

      return {
        body: {
          ...result.body,
          liveMoney: liveGate,
          readiness,
        },
        status: result.status,
      };
    }
  }

  return {
    body: {
      card,
      customer,
      directDeposit,
      financialAccount,
      kyc,
      liveMoney: liveGate,
      message: liveGate.ok
        ? "Onboarding started with the configured provider."
        : "Onboarding is queued. Provider activation is required before account, card, and transfer setup.",
      profileAccess: actor.profileAccess,
    },
    status: liveGate.ok ? 200 : 423,
  };
}

function modeledPayeeId(name) {
  return `payee_modeled_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

export async function createPayee(payload, env = process.env) {
  const actor = actorFromPayload(payload);
  const name = cleanText(payload?.name, 80);
  const maxCents = toIntegerCents(payload?.maxCents, { min: 1 });

  if (!name || !isBucketId(payload?.allowedBucketId) || maxCents === null) {
    return {
      body: {
        error: "Provide name, allowedBucketId, and integer maxCents.",
      },
      status: 400,
    };
  }

  if (payload.allowedBucketId === "safe_spending") {
    return {
      body: {
        error: "Payee controls are for protected buckets.",
      },
      status: 400,
    };
  }

  const readiness = getCoreReadiness(env, { coreOnline: true });
  const status = readiness.liveMoneyReady ? "approved" : "provider_pending";
  const modeledPayee = {
    allowedBucketId: payload.allowedBucketId,
    id: modeledPayeeId(name),
    maxCents,
    name,
    status,
  };
  const persistence = await persistPayee(
    {
      actorUserId: actor.id,
      allowedBucketId: modeledPayee.allowedBucketId,
      betaAccessStatus: actor.profileAccess,
      clerkSubject: actor.clerkSubject,
      householdId: actor.householdId,
      id: modeledPayee.id,
      kycStatus: actor.kycStatus,
      maxCents,
      name,
      status,
      userEmail: actor.email,
      userName: actor.name,
    },
    env,
  );

  if (persistenceFailed(persistence)) {
    return {
      body: {
        error: "Payee could not be persisted.",
        payee: modeledPayee,
        persistence,
        readiness,
        service: "payshield-payees",
      },
      status: 503,
    };
  }

  const persisted = persistence.persistence === "postgres";

  return {
    body: {
      message: persisted
        ? "Payee saved to durable core controls for protected bill routing."
        : "Payee modeled. Provider approval is required before real bill routing.",
      payee: persistence.payee || modeledPayee,
      persisted,
      persistence,
      readiness,
    },
    status: 200,
  };
}

const paycheckRuleStatuses = new Set(["active", "paused", "archived"]);
const paycheckRuleFrequencies = new Set([
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "unknown",
]);

function cleanRulePattern(value, maxLength = 160) {
  const pattern = cleanText(value, maxLength);

  return /[A-Za-z0-9]/.test(pattern) ? pattern : "";
}

function normalizedPaycheckRuleStatus(value) {
  const status = cleanText(value, 20).toLowerCase();

  return paycheckRuleStatuses.has(status) ? status : "active";
}

function normalizedPaycheckRuleFrequency(value) {
  const frequency = cleanText(value, 20).toLowerCase();

  return paycheckRuleFrequencies.has(frequency) ? frequency : "unknown";
}

function modelPaycheckDetectionRule(input) {
  return {
    amountRangeCents: {
      max: input.maximumAmountCents,
      min: input.minimumAmountCents,
    },
    expectedFrequency: input.expectedFrequency,
    id: input.id,
    idempotencyKey: input.idempotencyKey,
    match: {
      employerNamePattern: input.employerNamePattern || null,
      transactionNamePattern: input.transactionNamePattern || null,
    },
    priority: input.priority,
    providerAccountId: input.providerAccountId || null,
    providerItemId: input.providerItemId || null,
    providerName: input.providerName,
    ruleName: input.ruleName,
    status: input.status,
  };
}

function textMatchesRulePattern(text, pattern) {
  if (!pattern) {
    return false;
  }

  return text.toLowerCase().includes(String(pattern).toLowerCase());
}

function paycheckRuleMatches(rule, input) {
  const amountRange = rule.amountRangeCents || {};
  const minimumAmountCents = Number(amountRange.min || 0);
  const maximumAmountCents = Number(amountRange.max || 0);

  if (minimumAmountCents > 0 && input.amountCents < minimumAmountCents) {
    return false;
  }

  if (maximumAmountCents > 0 && input.amountCents > maximumAmountCents) {
    return false;
  }

  if (
    input.providerItemId &&
    rule.providerItemId &&
    input.providerItemId !== rule.providerItemId
  ) {
    return false;
  }

  if (
    input.providerAccountId &&
    rule.providerAccountId &&
    input.providerAccountId !== rule.providerAccountId
  ) {
    return false;
  }

  const match = rule.match || {};
  const patterns = [
    match.employerNamePattern,
    match.transactionNamePattern,
  ].filter(Boolean);

  return patterns.length === 0
    ? true
    : patterns.some((pattern) => textMatchesRulePattern(input.employerName, pattern));
}

async function findMatchingPaycheckRule(input, env = process.env) {
  const lookup = await loadActivePaycheckDetectionRules(
    {
      householdId: input.householdId,
      providerName: input.providerName || "plaid",
    },
    env,
  );

  if (persistenceFailed(lookup)) {
    return {
      error: {
        body: {
          error: "Paycheck detection rules could not be loaded.",
          lookup,
          service: "payshield-paycheck-detection",
        },
        status: 503,
      },
    };
  }

  const rules = lookup.rules || [];

  if (rules.length === 0) {
    return {
      lookup,
      rule: null,
    };
  }

  const rule = rules.find((candidate) => paycheckRuleMatches(candidate, input));

  if (!rule) {
    return {
      error: {
        body: {
          amountCents: input.amountCents,
          employerName: input.employerName,
          error:
            "Paycheck did not match an active payroll rule. Update detection setup before posting the split.",
          lookup,
          ruleCount: rules.length,
          service: "payshield-paycheck-detection",
        },
        status: 409,
      },
    };
  }

  return {
    lookup,
    rule,
  };
}

export async function savePaycheckDetectionRule(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const ruleName = cleanText(payload?.ruleName, 80);
  const employerNamePattern = cleanRulePattern(payload?.employerNamePattern, 100);
  const transactionNamePattern = cleanRulePattern(
    payload?.transactionNamePattern,
    160,
  );
  const minimumAmountCents = toIntegerCents(payload?.minimumAmountCents, {
    max: 2_000_000,
    min: 1,
  });
  const maximumAmountProvided =
    payload?.maximumAmountCents !== undefined &&
    payload?.maximumAmountCents !== null &&
    payload?.maximumAmountCents !== "";
  const maximumAmountCents = maximumAmountProvided
    ? toIntegerCents(payload?.maximumAmountCents, {
        max: 2_000_000,
        min: 1,
      })
    : null;
  const priority = toIntegerCents(payload?.priority ?? 100, {
    max: 1000,
    min: 1,
  });
  const providerName = cleanText(payload?.providerName, 40).toLowerCase() || "plaid";
  const providerItemId = cleanText(payload?.providerItemId, 160);
  const providerAccountId = cleanText(payload?.providerAccountId, 160);
  const status = normalizedPaycheckRuleStatus(payload?.status);
  const expectedFrequency = normalizedPaycheckRuleFrequency(
    payload?.expectedFrequency,
  );

  if (
    !ruleName ||
    (!employerNamePattern && !transactionNamePattern) ||
    minimumAmountCents === null ||
    priority === null ||
    (maximumAmountProvided && maximumAmountCents === null)
  ) {
    return {
      body: {
        error:
          "Provide ruleName, employerNamePattern or transactionNamePattern, minimumAmountCents, and valid optional maximumAmountCents.",
        service: "payshield-paycheck-detection-rules",
      },
      status: 400,
    };
  }

  if (maximumAmountCents !== null && maximumAmountCents <= minimumAmountCents) {
    return {
      body: {
        error: "maximumAmountCents must be greater than minimumAmountCents.",
        service: "payshield-paycheck-detection-rules",
      },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "paycheck detection setup",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  let bankConnectionId = null;

  if (providerItemId) {
    const bankConnection = await loadBankConnectionForProvider(
      {
        providerAccountId: providerAccountId || null,
        providerItemId,
        providerName,
      },
      env,
    );

    if (persistenceFailed(bankConnection)) {
      return {
        body: {
          error: "Bank connection lookup failed for paycheck detection rule.",
          bankConnection,
          service: "payshield-paycheck-detection-rules",
        },
        status: 503,
      };
    }

    bankConnectionId = bankConnection.bankConnection?.id || null;
  }

  const idempotencyKey =
    cleanText(payload?.idempotencyKey, 120) ||
    `paycheck-rule-${slugify(ruleName)}-${providerName}`;
  const rule = {
    bankConnectionId,
    expectedFrequency,
    householdId: actor.householdId,
    id: cleanText(payload?.id, 120) || null,
    idempotencyKey,
    maximumAmountCents,
    minimumAmountCents,
    employerNamePattern,
    metadata: {
      configuredBy: actor.id,
      expectedFrequency,
      source: "payshield_app",
    },
    priority,
    providerAccountId,
    providerItemId,
    providerName,
    ruleName,
    status,
    transactionNamePattern,
  };
  const persistence = await persistPaycheckDetectionRule(rule, env);

  if (persistenceFailed(persistence)) {
    return {
      body: {
        error: "Paycheck detection rule could not be persisted.",
        persistence,
        rule: modelPaycheckDetectionRule(rule),
        service: "payshield-paycheck-detection-rules",
      },
      status: 503,
    };
  }

  const persisted = persistence.persistence === "postgres";

  return {
    body: {
      message: persisted
        ? "Paycheck detection rule saved to durable core controls."
        : "Paycheck detection rule validated. Durable automation requires the Postgres-backed core.",
      persisted,
      persistence,
      rule: persistence.rule || modelPaycheckDetectionRule(rule),
      service: "payshield-paycheck-detection-rules",
    },
    status: 200,
  };
}

function getMoneyRailReadiness(env = process.env) {
  const neobank = getCoreReadiness(env, { coreOnline: true });
  const providerAdapter = getProviderAdapterConfig(env);
  const plaidConfigured = envPresent(env, "PLAID_CLIENT_ID") && envPresent(env, "PLAID_SECRET");
  const vault = tokenVaultReadiness(env);
  const transferConfigured =
    envTrue(env, "PAYSHIELD_TRANSFER_ENABLED") && providerAdapter.ok;
  const tokenVaultConfigured = vault.keyConfigured;
  const providerWebhookSigningConfigured = envPresent(
    env,
    "PAYSHIELD_PROVIDER_WEBHOOK_SECRET",
  );
  const transactionSyncReady =
    plaidConfigured &&
    vault.custodyReady &&
    neobank.backendConfigured &&
    neobank.postgresSchemaVerified;

  return {
    bankLinkReady: plaidConfigured && vault.custodyReady,
    detectionMode: plaidConfigured
      ? "plaid_transactions_sync"
      : "core_detection_required",
    paycheckDetectionReady:
      plaidConfigured && vault.custodyReady && providerWebhookSigningConfigured,
    liveMoneyReady: neobank.liveMoneyReady,
    missing: [
      ...(plaidConfigured ? [] : ["PLAID_CLIENT_ID", "PLAID_SECRET"]),
      ...(transferConfigured
        ? []
        : [
            ...(envTrue(env, "PAYSHIELD_TRANSFER_ENABLED")
              ? []
              : ["PAYSHIELD_TRANSFER_ENABLED"]),
            ...providerAdapter.missing,
          ]),
      ...(plaidConfigured && !vault.keyConfigured
        ? ["PAYSHIELD_TOKEN_VAULT_KEY_ID"]
        : []),
      ...(plaidConfigured && !vault.webhookConfigured
        ? ["PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL"]
        : []),
      ...(plaidConfigured && !vault.webhookSigningConfigured
        ? ["PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET"]
        : []),
      ...(plaidConfigured && vault.webhookReady && !vault.encryptionKeyReady
        ? ["PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY"]
        : []),
      ...(plaidConfigured && vault.custodyReady && !providerWebhookSigningConfigured
        ? ["PAYSHIELD_PROVIDER_WEBHOOK_SECRET"]
        : []),
    ],
    plaidConfigured,
    plaidEnv: env.PLAID_ENV?.trim() || "sandbox",
    providerAdapterConfigured: providerAdapter.ok,
    providerAdapterMissing: providerAdapter.missing,
    providerWebhookSigningConfigured,
    transactionSyncReady,
    tokenVaultConfigured,
    tokenVaultEncryptionConfigured: vault.encryptionKeyConfigured,
    tokenVaultEncryptionReady: vault.encryptionKeyReady,
    tokenVaultHandoffReady: vault.webhookReady,
    tokenVaultWebhookSource: vault.webhookSource,
    tokenVaultStoreReady: vault.custodyReady,
    transferConfigured,
    transferReady: neobank.liveMoneyReady && transferConfigured,
  };
}

function cleanTokenVaultUrl(env = process.env) {
  const value = env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL?.trim();

  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname) &&
      env.VERCEL_ENV !== "production";

    if (url.username || url.password || url.search || url.hash) {
      return "";
    }

    if (url.protocol !== "https:" && !localHttp) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function cleanCoreApiUrl(env = process.env) {
  const value = env.PAYSHIELD_CORE_API_URL?.trim();

  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname) &&
      env.VERCEL_ENV !== "production";

    if (url.username || url.password || url.search || url.hash) {
      return "";
    }

    if (url.protocol !== "https:" && !localHttp) {
      return "";
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function tokenVaultWebhookUrl(env = process.env) {
  const explicit = cleanTokenVaultUrl(env);

  if (explicit) {
    return {
      source: "explicit",
      url: explicit,
    };
  }

  const coreApiUrl = cleanCoreApiUrl(env);

  if (coreApiUrl) {
    return {
      source: "core_service",
      url: `${coreApiUrl}/api/token-vault/plaid`,
    };
  }

  return {
    source: env.PAYSHIELD_CORE_API_URL?.trim()
      ? "core_service_misconfigured"
      : "missing",
    url: "",
  };
}

function tokenVaultEncryptionReadiness(env = process.env) {
  const raw = env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY?.trim() || "";

  if (!raw) {
    return {
      encryptionKeyConfigured: false,
      encryptionKeyReady: false,
    };
  }

  if (raw.startsWith("base64:")) {
    return {
      encryptionKeyConfigured: true,
      encryptionKeyReady:
        Buffer.from(raw.slice("base64:".length), "base64").length === 32,
    };
  }

  return {
    encryptionKeyConfigured: true,
    encryptionKeyReady:
      Buffer.from(raw, "utf8").length === 32 ||
      Buffer.from(raw, "base64").length === 32,
  };
}

function tokenVaultReadiness(env = process.env) {
  const keyId = env.PAYSHIELD_TOKEN_VAULT_KEY_ID?.trim() || "";
  const webhook = tokenVaultWebhookUrl(env);
  const webhookSigningConfigured = envPresent(env, "PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET");
  const encryption = tokenVaultEncryptionReadiness(env);

  return {
    custodyReady:
      Boolean(keyId && webhook.url && webhookSigningConfigured) &&
      encryption.encryptionKeyReady,
    encryptionKeyConfigured: encryption.encryptionKeyConfigured,
    encryptionKeyReady: encryption.encryptionKeyReady,
    keyConfigured: Boolean(keyId),
    keyId,
    webhookConfigured: Boolean(webhook.url),
    webhookReady: Boolean(keyId && webhook.url && webhookSigningConfigured),
    webhookSource: webhook.source,
    webhookSigningConfigured,
    webhookUrl: webhook.url,
  };
}

function cleanList(value, fallback) {
  const parsed = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed?.length ? parsed : fallback;
}

function plaidBaseUrl(env = process.env) {
  const plaidEnv = env.PLAID_ENV?.trim().toLowerCase() || "sandbox";

  if (plaidEnv === "production") {
    return "https://production.plaid.com";
  }

  if (plaidEnv === "development") {
    return "https://development.plaid.com";
  }

  return "https://sandbox.plaid.com";
}

async function plaidRequest(env, path, body) {
  const response = await fetch(`${plaidBaseUrl(env)}${path}`, {
    body: JSON.stringify({
      client_id: env.PLAID_CLIENT_ID?.trim() || "",
      secret: env.PLAID_SECRET?.trim() || "",
      ...body,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload.error_message ||
        payload.error_code ||
        `Plaid request failed with status ${response.status}.`,
    );
  }

  return payload;
}

async function storePlaidAccessToken(env, input) {
  const vault = tokenVaultReadiness(env);
  const secret = env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET?.trim() || "";

  if (!vault.webhookReady || !secret) {
    throw new Error("Token vault handoff is not configured.");
  }

  const body = JSON.stringify({
    accessToken: input.accessToken,
    itemId: input.itemId,
    keyId: vault.keyId,
    providerName: "plaid",
    requestId: input.requestId,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const response = await fetch(vault.webhookUrl, {
    body,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-payshield-signature": `t=${timestamp},v1=${signature}`,
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error("Token vault rejected the Plaid access token.");
  }

  return typeof payload.tokenSecretRef === "string" && payload.tokenSecretRef.trim()
    ? payload.tokenSecretRef.trim().slice(0, 240)
    : `vault://plaid/${input.itemId}`;
}

function secretString(value, maxLength = 2048) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : "";
}

function parseTokenVaultSignature(header) {
  const parts = String(header || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const parsed = Object.fromEntries(
    parts.map((part) => {
      const index = part.indexOf("=");

      return index === -1
        ? [part, ""]
        : [part.slice(0, index), part.slice(index + 1)];
    }),
  );

  return {
    timestamp: parsed.t || "",
    versionOne: parsed.v1 || "",
  };
}

function tokenVaultReplayToleranceSeconds(env = process.env) {
  const parsed = Number(env.PAYSHIELD_TOKEN_VAULT_REPLAY_TOLERANCE_SECONDS);

  return Number.isInteger(parsed) && parsed >= 30 && parsed <= 900
    ? parsed
    : 300;
}

function providerWebhookReplayToleranceSeconds(env = process.env) {
  const parsed = Number(env.PAYSHIELD_PROVIDER_WEBHOOK_REPLAY_TOLERANCE_SECONDS);

  return Number.isInteger(parsed) && parsed >= 30 && parsed <= 900
    ? parsed
    : 300;
}

function compareHexDigest(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function verifyTokenVaultSignature(payload, env = process.env) {
  const secret = env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET?.trim() || "";
  const rawBody =
    typeof payload.__payshieldRawBody === "string"
      ? payload.__payshieldRawBody.slice(0, 64 * 1024)
      : "";
  const signatureHeader = safeString(payload.__payshieldSignature, 320);

  if (!secret) {
    return {
      error: "PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET is required.",
      ok: false,
      status: 503,
    };
  }

  if (!rawBody || !signatureHeader) {
    return {
      error: "Signed token-vault handoff requires a raw body and signature.",
      ok: false,
      status: 401,
    };
  }

  const signature = parseTokenVaultSignature(signatureHeader);
  const timestampSeconds = Number(signature.timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isInteger(timestampSeconds)) {
    return {
      error: "Token-vault signature timestamp is invalid.",
      ok: false,
      status: 401,
    };
  }

  if (
    Math.abs(nowSeconds - timestampSeconds) >
    tokenVaultReplayToleranceSeconds(env)
  ) {
    return {
      error: "Token-vault signature timestamp is outside replay tolerance.",
      ok: false,
      status: 401,
    };
  }

  const expected = createHmac("sha256", secret)
    .update(`${signature.timestamp}.${rawBody}`)
    .digest("hex");

  if (!compareHexDigest(expected, signature.versionOne)) {
    return {
      error: "Token-vault signature is invalid.",
      ok: false,
      status: 401,
    };
  }

  return {
    ok: true,
  };
}

function providerWebhookSignatureRequired(env, readiness, moneyReadiness) {
  return Boolean(
    env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET?.trim() ||
      databaseConfigured(env) ||
      readiness?.liveMoneyReady ||
      (moneyReadiness?.plaidConfigured && moneyReadiness?.tokenVaultStoreReady),
  );
}

function verifyProviderWebhookSignature(
  payload,
  env = process.env,
  readiness,
  moneyReadiness,
) {
  const required = providerWebhookSignatureRequired(env, readiness, moneyReadiness);
  const secret = env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET?.trim() || "";
  const rawBody =
    typeof payload.__payshieldProviderRawBody === "string"
      ? payload.__payshieldProviderRawBody.slice(0, 64 * 1024)
      : "";
  const signatureHeader = safeString(
    payload.__payshieldProviderSignature,
    320,
  );

  if (!required && !secret) {
    return {
      mode: "not_required",
      ok: true,
    };
  }

  if (!secret) {
    return {
      error: "PAYSHIELD_PROVIDER_WEBHOOK_SECRET is required before provider webhooks can affect money controls.",
      mode: "missing_secret",
      ok: false,
      status: 503,
    };
  }

  if (!rawBody || !signatureHeader) {
    return {
      error: "Provider webhook requires a signed raw body.",
      mode: "missing_signature",
      ok: false,
      status: 401,
    };
  }

  const signature = parseTokenVaultSignature(signatureHeader);
  const timestampSeconds = Number(signature.timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isInteger(timestampSeconds)) {
    return {
      error: "Provider webhook signature timestamp is invalid.",
      mode: "invalid_timestamp",
      ok: false,
      status: 401,
    };
  }

  if (
    Math.abs(nowSeconds - timestampSeconds) >
    providerWebhookReplayToleranceSeconds(env)
  ) {
    return {
      error: "Provider webhook signature timestamp is outside replay tolerance.",
      mode: "stale_signature",
      ok: false,
      status: 401,
    };
  }

  const expected = createHmac("sha256", secret)
    .update(`${signature.timestamp}.${rawBody}`)
    .digest("hex");

  if (!compareHexDigest(expected, signature.versionOne)) {
    return {
      error: "Provider webhook signature is invalid.",
      mode: "invalid_signature",
      ok: false,
      status: 401,
    };
  }

  return {
    mode: "verified",
    ok: true,
  };
}

export async function receiveTokenVaultHandoff(payload = {}, env = process.env) {
  const signature = verifyTokenVaultSignature(payload, env);

  if (!signature.ok) {
    return {
      body: {
        accepted: false,
        error: signature.error,
        service: "payshield-token-vault",
      },
      status: signature.status,
    };
  }

  const accessToken = secretString(payload.accessToken, 2048);
  const itemId = safeString(payload.itemId, 160);
  const keyId = safeString(payload.keyId, 160);
  const providerName = safeString(payload.providerName, 40) || "plaid";
  const requestId = safeString(payload.requestId, 160);
  const configuredKeyId = env.PAYSHIELD_TOKEN_VAULT_KEY_ID?.trim() || "";

  if (providerName !== "plaid") {
    return {
      body: {
        accepted: false,
        error: "Token vault receiver currently accepts Plaid token handoffs.",
        service: "payshield-token-vault",
      },
      status: 400,
    };
  }

  if (!accessToken || !itemId || !keyId) {
    return {
      body: {
        accepted: false,
        error: "Token vault handoff requires accessToken, itemId, and keyId.",
        service: "payshield-token-vault",
      },
      status: 400,
    };
  }

  if (!configuredKeyId || keyId !== configuredKeyId) {
    return {
      body: {
        accepted: false,
        error: "Token vault key id does not match the configured key.",
        service: "payshield-token-vault",
      },
      status: 400,
    };
  }

  const persistence = await persistProviderTokenSecret(
    {
      accessToken,
      keyId,
      providerItemId: itemId,
      providerName,
      requestId,
    },
    env,
  );

  if (!persistence.persisted) {
    return {
      body: {
        accepted: false,
        error: "Token vault handoff could not be durably stored.",
        persistence,
        service: "payshield-token-vault",
      },
      status: 503,
    };
  }

  return {
    body: {
      accepted: true,
      eventType: persistence.eventType,
      persistence: {
        persisted: true,
        persistence: persistence.persistence,
        replayed: persistence.replayed,
      },
      providerName,
      requestId,
      service: "payshield-token-vault",
      tokenSecretRef: persistence.tokenSecretRef,
      tokenVaultStatus: "stored",
    },
    status: 200,
  };
}

export async function createBankLinkToken(payload = {}, env = process.env) {
  const readiness = getMoneyRailReadiness(env);
  let actor = actorFromPayload(payload);
  const paidAccess = await requireActivePaidAccess(env, actor, "bank linking");

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  if (!readiness.plaidConfigured || !readiness.tokenVaultStoreReady) {
    return {
      body: {
        error:
          "Bank linking requires Plaid credentials, signed token-vault handoff, and encrypted token custody before users can connect an external account.",
        readiness,
        service: "payshield-bank-link-token",
      },
      status: 424,
    };
  }

  const plaidPayload = await plaidRequest(env, "/link/token/create", {
    client_name: "PayShield",
    country_codes: cleanList(env.PLAID_COUNTRY_CODES, ["US"]),
    language: "en",
    products: cleanList(env.PLAID_PRODUCTS, ["auth", "transactions"]),
    redirect_uri: env.PLAID_REDIRECT_URI?.trim() || undefined,
    transactions: cleanList(env.PLAID_PRODUCTS, ["auth", "transactions"]).includes("transactions")
      ? { days_requested: 180 }
      : undefined,
    user: {
      client_user_id: actor.id,
    },
    webhook: env.PLAID_WEBHOOK_URL?.trim() || undefined,
  });

  return {
    body: {
      expiration: plaidPayload.expiration,
      linkToken: plaidPayload.link_token,
      readiness,
      requestId: plaidPayload.request_id,
      service: "payshield-bank-link-token",
    },
    status: 200,
  };
}

export async function exchangeBankPublicToken(payload = {}, env = process.env) {
  const readiness = getMoneyRailReadiness(env);
  let actor = actorFromPayload(payload);
  const publicToken = safeString(payload.publicToken, 240);

  if (!publicToken) {
    return {
      body: {
        error: "Provide the Plaid public token returned by Link.",
        service: "payshield-bank-link-exchange",
      },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "bank token exchange",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  if (!readiness.plaidConfigured || !readiness.tokenVaultStoreReady) {
    return {
      body: {
        error:
          "Bank link exchange requires Plaid credentials, signed token-vault handoff, and encrypted token custody.",
        readiness,
        service: "payshield-bank-link-exchange",
      },
      status: 424,
    };
  }

  const plaidPayload = await plaidRequest(env, "/item/public_token/exchange", {
    public_token: publicToken,
  });
  const tokenSecretRef = await storePlaidAccessToken(env, {
    accessToken: plaidPayload.access_token,
    itemId: plaidPayload.item_id,
    requestId: plaidPayload.request_id,
  });
  const result = await recordBankConnection(
    {
      __payshieldActor: {
        authMode: actor.authMode,
        email: actor.email,
        name: actor.name,
        userId: actor.id,
      },
      accountId: safeString(payload.accountId, 120) || "selected_account",
      accountMask: safeString(payload.accountMask, 16) || null,
      accountName: safeString(payload.accountName, 80) || null,
      institutionName: safeString(payload.institutionName, 120) || "Linked institution",
      itemId: plaidPayload.item_id,
      products: cleanList(env.PLAID_PRODUCTS, ["auth", "transactions"]),
      providerName: "plaid",
      tokenSecretRef,
    },
    env,
  );

  return {
    body: {
      ...result.body,
      requestId: plaidPayload.request_id,
      service: "payshield-bank-link-exchange",
    },
    status: result.status,
  };
}

function syncPageLimit(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return 3;
  }

  return Math.min(Math.max(parsed, 1), 10);
}

function plaidTransactionSyncCounts(pages) {
  return pages.reduce(
    (counts, page) => ({
      added: counts.added + (Array.isArray(page.added) ? page.added.length : 0),
      modified:
        counts.modified + (Array.isArray(page.modified) ? page.modified.length : 0),
      removed:
        counts.removed + (Array.isArray(page.removed) ? page.removed.length : 0),
    }),
    { added: 0, modified: 0, removed: 0 },
  );
}

function plaidSyncTransactions(pages) {
  return pages.flatMap((page) => [
    ...(Array.isArray(page.added) ? page.added : []),
    ...(Array.isArray(page.modified) ? page.modified : []),
  ]);
}

function plaidRemovedTransactions(pages) {
  return pages.flatMap((page) =>
    Array.isArray(page.removed) ? page.removed : [],
  );
}

function removedTransactionId(transaction, fallback) {
  if (typeof transaction === "string") {
    return safeString(transaction, 160) || fallback;
  }

  return (
    transactionText(transaction, "providerTransactionId", 160) ||
    transactionText(transaction, "provider_transaction_id", 160) ||
    transactionText(transaction, "transactionId", 160) ||
    transactionText(transaction, "transaction_id", 160) ||
    transactionText(transaction, "id", 160) ||
    fallback
  );
}

export async function persistTransactionSyncException({
  actor,
  bankConnection,
  env,
  providerEventId,
  providerName,
  providerTransactionId,
  reason,
  reasonCode,
  severity = "critical",
  status,
}) {
  const idempotencyKey = [
    "money-rail-exception",
    "transaction_sync",
    providerName,
    providerEventId,
    providerTransactionId || reasonCode,
    reasonCode,
  ].join(":");

  return persistReconciliationException(
    {
      householdId: actor?.householdId || bankConnection?.householdId || null,
      idempotencyKey,
      metadata: {
        bankConnectionId: bankConnection?.id || null,
        providerAccountId: bankConnection?.providerAccountId || null,
        providerItemId: bankConnection?.providerItemId || null,
        rail: "transaction_sync",
        status,
      },
      providerEventId,
      providerName,
      providerTransactionId: providerTransactionId || null,
      reasonCode,
      severity,
      source: "money_rail",
      summary: `transaction sync ${status.replace(/_/g, " ")}: ${
        providerTransactionId || "unknown transaction"
      } from ${providerName} event ${providerEventId}. ${reason}`,
    },
    env,
  );
}

export async function syncLinkedBankPaychecks(payload = {}, env = process.env) {
  let actor = actorFromPayload(payload);
  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "linked-bank paycheck sync",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  const readiness = getCoreReadiness(env, { coreOnline: true });
  const moneyReadiness = getMoneyRailReadiness(env);

  if (!moneyReadiness.plaidConfigured || !moneyReadiness.tokenVaultStoreReady) {
    return {
      body: {
        error:
          "Linked-bank paycheck sync requires Plaid credentials, signed token-vault handoff, and encrypted token custody.",
        moneyReadiness,
        readiness,
        service: "payshield-paycheck-transaction-sync",
      },
      status: 424,
    };
  }

  if (!databaseConfigured(env)) {
    return {
      body: {
        code: "postgres_ledger_required",
        error:
          "Linked-bank paycheck sync requires the dedicated Postgres core ledger and bank connection store.",
        moneyReadiness,
        readiness,
        service: "payshield-paycheck-transaction-sync",
      },
      status: 503,
    };
  }

  const providerName = "plaid";
  const bankConnectionLookup = await loadActiveBankConnectionForHousehold(
    {
      bankConnectionId: safeString(payload.bankConnectionId, 160) || null,
      householdId: actor.householdId,
      providerAccountId: safeString(payload.providerAccountId, 160) || null,
      providerName,
    },
    env,
  );

  if (persistenceFailed(bankConnectionLookup)) {
    return {
      body: {
        error: "Active bank connection could not be loaded for transaction sync.",
        lookupPersistence: bankConnectionLookup,
        moneyReadiness,
        readiness,
        service: "payshield-paycheck-transaction-sync",
      },
      status: 503,
    };
  }

  const bankConnection = bankConnectionLookup.bankConnection;

  if (!bankConnection) {
    return {
      body: {
        error:
          "Connect a bank account before running linked-bank paycheck sync.",
        moneyReadiness,
        readiness,
        service: "payshield-paycheck-transaction-sync",
      },
      status: 404,
    };
  }

  const tokenLookup = await loadProviderTokenSecret(
    {
      providerItemId: bankConnection.providerItemId,
      providerName,
      tokenSecretRef: bankConnection.tokenSecretRef,
    },
    env,
  );

  if (persistenceFailed(tokenLookup)) {
    return {
      body: {
        error: "Provider token could not be loaded for transaction sync.",
        moneyReadiness,
        readiness,
        service: "payshield-paycheck-transaction-sync",
        tokenPersistence: tokenLookup,
      },
      status: 503,
    };
  }

  if (!tokenLookup.found || !tokenLookup.accessToken) {
    return {
      body: {
        error:
          "Linked bank token custody is not ready for this bank connection.",
        moneyReadiness,
        readiness,
        service: "payshield-paycheck-transaction-sync",
        tokenPersistence: {
          found: tokenLookup.found === true,
          persistence: tokenLookup.persistence,
          persistenceReason: tokenLookup.persistenceReason || null,
        },
      },
      status:
        tokenLookup.persistence === "token_vault_key_error" ? 503 : 424,
    };
  }

  const maxPages = syncPageLimit(payload.maxPages);
  const startingCursor =
    safeString(payload.cursor, 512) || bankConnection.syncCursor || null;
  const syncAttemptEventId =
    safeString(payload.providerEventId, 160) ||
    stableEventId(providerName, {
      accountId: bankConnection.providerAccountId,
      cursor: startingCursor,
      itemId: bankConnection.providerItemId,
      type: "transactions_sync_attempt",
    });
  const pages = [];
  let cursor = startingCursor;
  let hasMore = true;
  let pageCount = 0;

  try {
    while (hasMore && pageCount < maxPages) {
      const page = await plaidRequest(env, "/transactions/sync", {
        access_token: tokenLookup.accessToken,
        count: 100,
        cursor: cursor || undefined,
      });

      pages.push(page);
      cursor = safeString(page.next_cursor, 512) || cursor;
      hasMore = page.has_more === true;
      pageCount += 1;
    }
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "Plaid transaction sync failed.";
    const exceptionPersistence = await persistTransactionSyncException({
      actor,
      bankConnection,
      env,
      providerEventId: syncAttemptEventId,
      providerName,
      providerTransactionId: null,
      reason,
      reasonCode: "plaid_sync_failed",
      status: "provider_error",
    });

    return {
      body: {
        error: reason,
        exceptionPersistence,
        moneyReadiness,
        readiness,
        service: "payshield-paycheck-transaction-sync",
      },
      status: persistenceFailed(exceptionPersistence) ? 503 : 502,
    };
  }

  const counts = plaidTransactionSyncCounts(pages);
  const requestId =
    safeString(pages.at(-1)?.request_id || pages.at(-1)?.requestId, 160) ||
    null;
  const providerEventId =
    safeString(payload.providerEventId, 160) ||
    stableEventId(providerName, {
      accountId: bankConnection.providerAccountId,
      cursor: startingCursor,
      itemId: bankConnection.providerItemId,
      nextCursor: cursor,
      requestId,
      type: "transactions_sync",
    });
  const syncTransactions = plaidSyncTransactions(pages);
  const providerPayload = {
    account_id: bankConnection.providerAccountId,
    added: syncTransactions,
    bankConnectionId: bankConnection.id,
    eventType: "plaid_transactions_sync",
    item_id: bankConnection.providerItemId,
    providerEventId,
    providerName,
    request_id: requestId,
  };
  const eventPersistence = await persistMoneyRailEvent(
    {
      eventType: "plaid_transactions_sync",
      householdId: actor.householdId,
      payload: redactProviderWebhookPayload({
        ...providerPayload,
        counts,
        hasMore,
        pageCount,
      }),
      providerEventId,
      providerName,
      rail: "transaction_sync",
    },
    env,
  );

  if (persistenceFailed(eventPersistence)) {
    return {
      body: {
        accepted: false,
        error: "Linked-bank transaction sync audit event could not be persisted.",
        eventPersistence,
        moneyReadiness,
        readiness,
        service: "payshield-paycheck-transaction-sync",
      },
      status: 503,
    };
  }

  const removedExceptions = [];
  const removedTransactions = plaidRemovedTransactions(pages);

  for (const [index, transaction] of removedTransactions.entries()) {
    const providerTransactionId = removedTransactionId(
      transaction,
      `${providerEventId}:removed:${index}`,
    );
    const exceptionPersistence = await persistTransactionSyncException({
      actor,
      bankConnection,
      env,
      providerEventId,
      providerName,
      providerTransactionId,
      reason:
        "Plaid reported a removed transaction. Review whether a prior paycheck split must be reversed or corrected before relying on Safe to Spend.",
      reasonCode: "plaid_transaction_removed",
      status: "removed",
    });

    if (persistenceFailed(exceptionPersistence)) {
      return {
        body: {
          accepted: false,
          error: "Removed transaction exception could not be persisted.",
          exceptionPersistence,
          providerEventId,
          readiness,
          service: "payshield-paycheck-transaction-sync",
        },
        status: 503,
      };
    }

    removedExceptions.push({
      exceptionPersistence,
      providerTransactionId,
      status: "removed",
    });
  }

  const detections = extractProviderPaycheckDetections(
    providerPayload,
    providerEventId,
  );
  const processed = [];
  const skipped = [];

  for (const detection of detections) {
    const detectionActor = await actorForProviderDetection(
      providerPayload,
      detection,
      providerName,
      env,
    );

    if (detectionActor.error) {
      return {
        body: {
          accepted: false,
          error: "Bank connection lookup failed for synced transaction.",
          lookupPersistence: detectionActor.error,
          providerEventId,
          readiness,
          service: "payshield-paycheck-transaction-sync",
        },
        status: 503,
      };
    }

    if (detectionActor.missingProviderReference || detectionActor.notFound) {
      const status = detectionActor.missingProviderReference
        ? "missing_provider_reference"
        : "bank_connection_not_found";
      const reason = detectionActor.missingProviderReference
        ? "Synced paycheck transaction must include Plaid item and account identifiers before PayShield can match it to an active bank connection."
        : "Synced transaction could not be matched to an active PayShield bank connection.";
      const exceptionPersistence = await persistProviderWebhookException({
        actor: null,
        detection,
        env,
        providerEventId,
        providerName,
        reason,
        reasonCode: status,
        source: "money_rail",
        status,
      });

      if (persistenceFailed(exceptionPersistence)) {
        return {
          body: {
            accepted: false,
            error: "Transaction sync exception could not be persisted.",
            exceptionPersistence,
            providerEventId,
            readiness,
            service: "payshield-paycheck-transaction-sync",
          },
          status: 503,
        };
      }

      skipped.push({
        amountCents: detection.amountCents,
        employerName: detection.employerName,
        exceptionPersistence,
        providerTransactionId: detection.providerTransactionId,
        reason,
        status,
      });
      continue;
    }

    const result = await detectPaycheck(
      {
        __payshieldActor: {
          householdId: detectionActor.householdId,
          userId: detectionActor.id,
        },
        amountCents: detection.amountCents,
        employerName: detection.employerName,
        idempotencyKey: detection.idempotencyKey,
        providerAccountId: detection.providerAccountId,
        providerEventId: detection.providerEventId,
        providerItemId: detection.itemId,
        providerName,
        providerTransactionId: detection.providerTransactionId,
        receivedAt: detection.receivedAt,
      },
      env,
    );

    if (result.status >= 400) {
      if (result.status < 500) {
        const reason =
          typeof result.body?.error === "string"
            ? result.body.error
            : "Synced paycheck transaction was rejected by paycheck detection controls.";
        const exceptionPersistence = await persistProviderWebhookException({
          actor: detectionActor,
          detection,
          env,
          providerEventId,
          providerName,
          reason,
          reasonCode: "paycheck_detection_rejected",
          source: "money_rail",
          status: "rejected",
        });

        if (persistenceFailed(exceptionPersistence)) {
          return {
            body: {
              accepted: false,
              error: "Transaction sync exception could not be persisted.",
              exceptionPersistence,
              providerEventId,
              readiness,
              service: "payshield-paycheck-transaction-sync",
            },
            status: 503,
          };
        }

        skipped.push({
          amountCents: detection.amountCents,
          employerName: detection.employerName,
          exceptionPersistence,
          providerTransactionId: detection.providerTransactionId,
          reason,
          status: "rejected",
        });
        continue;
      }

      return {
        body: {
          accepted: false,
          detection: {
            amountCents: detection.amountCents,
            employerName: detection.employerName,
            providerTransactionId: detection.providerTransactionId,
          },
          error: "Synced paycheck transaction could not be posted.",
          providerEventId,
          result: result.body,
          service: "payshield-paycheck-transaction-sync",
        },
        status: result.status,
      };
    }

    processed.push({
      amountCents: detection.amountCents,
      employerName: detection.employerName,
      idempotencyKey: detection.idempotencyKey,
      journalEntryId:
        result.body.ledgerEntry?.id ||
        result.body.journalPersistence?.postgresId ||
        null,
      journalReplayed: result.body.journalPersistence?.replayed === true,
      matchedRule: result.body.detection?.matchedRule || null,
      providerTransactionId: detection.providerTransactionId,
      status: result.body.detection?.status || "split_posted",
    });
  }

  const syncPersistence = await persistBankConnectionSyncState(
    {
      bankConnectionId: bankConnection.id,
      householdId: actor.householdId,
      requestId,
      syncCursor: cursor,
      syncedAt: new Date().toISOString(),
    },
    env,
  );

  if (persistenceFailed(syncPersistence)) {
    return {
      body: {
        accepted: false,
        error: "Bank transaction sync cursor could not be persisted.",
        providerEventId,
        readiness,
        service: "payshield-paycheck-transaction-sync",
        syncPersistence,
      },
      status: 503,
    };
  }

  return {
    body: {
      accepted: true,
      bankConnection: {
        accountMask: bankConnection.accountMask,
        accountName: bankConnection.accountName,
        id: bankConnection.id,
        institutionName: bankConnection.institutionName,
        providerAccountId: bankConnection.providerAccountId,
        providerItemId: bankConnection.providerItemId,
        providerName,
      },
      detectionCount: processed.length,
      detections: processed,
      eventPersistence,
      mode: processed.length > 0 ? "processed" : "synced",
      moneyReadiness,
      providerEventId,
      readiness,
      removedExceptionCount: removedExceptions.length,
      removedExceptions,
      service: "payshield-paycheck-transaction-sync",
      skipped,
      skippedCount: skipped.length,
      sync: {
        addedCount: counts.added,
        cursorStored: Boolean(cursor),
        hasMore,
        modifiedCount: counts.modified,
        pageCount,
        removedCount: counts.removed,
        requestId,
      },
      syncPersistence,
    },
    status: 202,
  };
}

function persistenceFailed(result) {
  return ["postgres_error", "postgres_missing", "postgres_required"].includes(
    result?.persistence,
  );
}

function productionGateEvidenceId(gateId, evidenceRef) {
  return `gate_evidence_${createHash("sha256")
    .update(`${gateId}:${evidenceRef}`)
    .digest("hex")
    .slice(0, 32)}`;
}

function parseIsoTimestamp(value, { defaultNow = false } = {}) {
  const raw = cleanText(value, 80);

  if (!raw) {
    return defaultNow ? new Date().toISOString() : null;
  }

  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function recordProductionGateEvidence(payload, env = process.env) {
  const gateId = cleanText(payload?.gateId || payload?.gate_id, 80);
  const scope = cleanText(payload?.scope, 40).toLowerCase();
  const status = cleanText(payload?.status, 40).toLowerCase();
  const evidenceRef = cleanText(
    payload?.evidenceRef || payload?.evidence_ref,
    240,
  );
  const evidenceSummary = cleanText(
    payload?.evidenceSummary || payload?.evidence_summary,
    500,
  );
  const approvedBy = cleanText(payload?.approvedBy || payload?.approved_by, 160);
  const approvedAt =
    status === "approved"
      ? parseIsoTimestamp(payload?.approvedAt || payload?.approved_at, {
          defaultNow: true,
        })
      : parseIsoTimestamp(payload?.approvedAt || payload?.approved_at);
  const expiresAt = parseIsoTimestamp(payload?.expiresAt || payload?.expires_at);

  if (
    !gateId ||
    !/^[a-z0-9_:-]+$/i.test(gateId) ||
    !productionGateEvidenceScopes.has(scope) ||
    !productionGateEvidenceStatuses.has(status) ||
    !evidenceRef ||
    !evidenceSummary
  ) {
    return {
      body: {
        error:
          "Provide gateId, scope, status, evidenceRef, and evidenceSummary for production gate evidence.",
        service: "payshield-production-gate-evidence",
      },
      status: 400,
    };
  }

  if (sensitiveEvidenceRefPattern.test(evidenceRef)) {
    return {
      body: {
        error:
          "Evidence references must be redacted handles or URLs and cannot contain secret, token, password, credential, or access-token material.",
        service: "payshield-production-gate-evidence",
      },
      status: 400,
    };
  }

  if (status === "approved" && (!approvedBy || !approvedAt)) {
    return {
      body: {
        error: "Approved launch gates require approvedBy and a valid approvedAt timestamp.",
        service: "payshield-production-gate-evidence",
      },
      status: 400,
    };
  }

  if (!databaseConfigured(env)) {
    return {
      body: {
        code: "postgres_ledger_required",
        error:
          "Production gate evidence requires PAYSHIELD_LEDGER_DATABASE_URL and schema 0013 before approvals can be recorded.",
        service: "payshield-production-gate-evidence",
      },
      status: 503,
    };
  }

  const persistence = await persistProductionGateEvidence(
    {
      approvedAt,
      approvedBy: status === "approved" ? approvedBy : null,
      evidenceRef,
      evidenceSummary,
      expiresAt,
      gateId,
      id: productionGateEvidenceId(gateId, evidenceRef),
      metadata: safeObject(payload?.metadata),
      scope,
      status,
    },
    env,
  );

  if (persistenceFailed(persistence)) {
    return {
      body: {
        error: "Production gate evidence could not be persisted.",
        persistence,
        service: "payshield-production-gate-evidence",
      },
      status: 503,
    };
  }

  return {
    body: {
      accepted: true,
      evidence: persistence.evidence,
      persisted: true,
      persistence: persistence.persistence,
      service: "payshield-production-gate-evidence",
    },
    status: 200,
  };
}

async function persistOperationalJournal(entry, env = process.env, actorInput = demoUser) {
  const actor = normalizeActor(actorInput);

  return persistJournalEntry(
    {
      betaAccessStatus: actor.profileAccess,
      entry,
      householdId: actor.householdId,
    },
    env,
  );
}

export async function detectPaycheck(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const amountCents = toIntegerCents(payload?.amountCents, {
    max: 2_000_000,
    min: 1,
  });
  const employerName = cleanText(payload?.employerName, 80);

  if (amountCents === null || !employerName) {
    return {
      body: {
        error: "Provide employerName and integer amountCents.",
      },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "paycheck detection",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const ledger = await loadHouseholdLedger(env, actor, controls);

  if (ledger.error) {
    return ledger.error;
  }

  const providerName = cleanText(payload?.providerName, 40).toLowerCase() || "plaid";
  const providerItemId = cleanText(payload?.providerItemId || payload?.itemId, 160);
  const providerAccountId = cleanText(
    payload?.providerAccountId || payload?.accountId,
    160,
  );
  const ruleMatch = await findMatchingPaycheckRule(
    {
      amountCents,
      employerName,
      householdId: actor.householdId,
      providerAccountId,
      providerItemId,
      providerName,
    },
    env,
  );

  if (ruleMatch.error) {
    return ruleMatch.error;
  }

  const book =
    ledger.ledgerSource === "control_model" ? new LedgerBook() : ledger.book;
  const entry = postPaycheckDeposit(book, controls.buckets, {
    amountCents,
    employerName,
    idempotencyKey:
      cleanText(payload?.idempotencyKey, 120) ||
      `paycheck-${employerName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}-${amountCents}`,
    receivedAt: cleanText(payload?.receivedAt, 32) || new Date().toISOString(),
  });
  const balances = buildBucketBalances(book, controls.buckets);
  const safeToSpendCents =
    balances.find((bucket) => bucket.id === "safe_spending")?.availableCents ??
    0;
  const protectedCents = balances
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.availableCents, 0);

  const readiness = getMoneyRailReadiness(env);
  const journalPersistence = await persistOperationalJournal(entry, env, actor);

  if (persistenceFailed(journalPersistence)) {
    return {
      body: {
        error: "Paycheck ledger entry could not be persisted.",
        journalPersistence,
        readiness,
        service: "payshield-paycheck-detection",
      },
      status: 503,
    };
  }

  const persistence = await persistPaycheckDetection(
    {
      amountCents,
      bankConnectionId: ruleMatch.rule?.bankConnectionId || null,
      detectionRuleId: ruleMatch.rule?.id || null,
      employerName,
      householdId: actor.householdId,
      idempotencyKey: entry.idempotencyKey,
      journalEntryId: journalPersistence.postgresId || entry.id,
      providerEventId: cleanText(payload?.providerEventId, 120) || null,
      providerTransactionId: cleanText(payload?.providerTransactionId, 120) || null,
      receivedAt: entry.metadata?.receivedAt,
      status: "split_posted",
    },
    env,
  );
  if (persistenceFailed(persistence)) {
    return {
      body: {
        error: "Paycheck detection could not be persisted.",
        persistence,
        readiness,
        service: "payshield-paycheck-detection",
      },
      status: 503,
    };
  }

  const auditPersistence = await persistMoneyRailEvent(
    {
      eventType: "paycheck_detected",
      householdId: actor.householdId,
      payload: {
        amountCents,
        detectionRuleId: ruleMatch.rule?.id || null,
        employerName,
        idempotencyKey: entry.idempotencyKey,
        journalEntryId: entry.id,
        payrollRuleName: ruleMatch.rule?.ruleName || null,
      },
      providerEventId: `paycheck:${entry.idempotencyKey}`,
      providerName,
      rail: readiness.plaidConfigured ? "transaction_sync" : "provider_webhook",
    },
    env,
  );

  if (persistenceFailed(auditPersistence)) {
    return {
      body: {
        auditPersistence,
        error: "Paycheck detection audit event could not be persisted.",
        persistence,
        readiness,
        service: "payshield-paycheck-detection",
      },
      status: 503,
    };
  }

  return {
    body: {
      auditPersistence,
      balances,
      controlPersistence: {
        bucketProfile: controls.bucketPersistence,
        payees: controls.payeePersistence,
      },
      detection: {
        amountCents,
        employerName,
        matchedRule: ruleMatch.rule
          ? {
              id: ruleMatch.rule.id,
              ruleName: ruleMatch.rule.ruleName,
            }
          : null,
        mode: getMoneyRailReadiness(env).detectionMode,
        receivedAt: entry.metadata?.receivedAt,
        ruleLookup: {
          persistence: ruleMatch.lookup?.persistence || "memory",
          ruleCount: ruleMatch.lookup?.rules?.length || 0,
        },
      },
      ledgerEntry: entry,
      journalPersistence,
      ledger: {
        entryCount: book.allEntries().length,
        source:
          ledger.ledgerSource === "control_model"
            ? "paycheck_event_preview"
            : ledger.ledgerSource,
      },
      message:
        "Paycheck detected and split by bucket priority before Safe to Spend is computed.",
      persistence,
      protectedCents,
      readiness,
      safeToSpendCents,
    },
    status: 200,
  };
}

export async function createTransferIntent(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const amountCents = toIntegerCents(payload?.amountCents, {
    max: 500_000,
    min: 1,
  });
  const destinationPayeeId = cleanText(payload?.destinationPayeeId, 120);

  if (
    amountCents === null ||
    !isBucketId(payload?.sourceBucketId) ||
    !destinationPayeeId
  ) {
    return {
      body: {
        error:
          "Provide sourceBucketId, destinationPayeeId, and integer amountCents.",
      },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "protected transfers",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const ledger = await loadHouseholdLedger(env, actor, controls);

  if (ledger.error) {
    return ledger.error;
  }

  const book = ledger.book;
  const balances = buildBucketBalances(book, controls.buckets);
  const sourceBucket = balances.find(
    (bucket) => bucket.id === payload.sourceBucketId,
  );
  const destinationPayee = controls.payees.find(
    (payee) => payee.id === destinationPayeeId,
  );

  if (sourceBucket?.id === "safe_spending") {
    return {
      body: {
        error: "Protected transfers cannot release Safe to Spend funds.",
        sourceBucket,
      },
      status: 400,
    };
  }

  if (!sourceBucket) {
    return {
      body: {
        error: "Transfer amount exceeds the selected bucket balance.",
        sourceBucket,
      },
      status: 400,
    };
  }

  if (!destinationPayee || destinationPayee.status !== "approved") {
    return {
      body: {
        error:
          "Protected transfers require an approved destination for the selected bucket.",
      },
      status: 400,
    };
  }

  if (destinationPayee.allowedBucketId !== sourceBucket.id) {
    return {
      body: {
        destinationPayee,
        error:
          "Protected transfers can only release to a payee assigned to the source bucket.",
        sourceBucket,
      },
      status: 400,
    };
  }

  if (amountCents > destinationPayee.maxCents) {
    return {
      body: {
        destinationPayee,
        error: "Transfer amount exceeds the approved destination limit.",
      },
      status: 400,
    };
  }

  if (amountCents > sourceBucket.availableCents) {
    return {
      body: {
        error: "Transfer amount exceeds the selected bucket balance.",
        sourceBucket,
      },
      status: 400,
    };
  }

  const readiness = getMoneyRailReadiness(env);
  const idempotencyKey =
    cleanText(payload?.idempotencyKey, 120) ||
    `transfer-${payload.sourceBucketId}-${destinationPayeeId}-${amountCents}`;
  const providerName = readiness.transferConfigured
    ? env.PAYSHIELD_BAAS_PROVIDER || "configured_rail"
    : null;
  const liveProviderExecution =
    readiness.liveMoneyReady && readiness.transferConfigured;
  let providerTransfer = {
    providerTransferId: "transfer-provider-contract-required",
    status: "blocked",
  };
  let transferStatus = "blocked";
  let persistence = await persistTransferIntent(
    {
      amountCents,
      destinationPayeeId,
      householdId: actor.householdId,
      idempotencyKey,
      providerName,
      providerStatus: liveProviderExecution ? "pending" : providerTransfer.status,
      providerTransferId: liveProviderExecution
        ? null
        : providerTransfer.providerTransferId,
      sourceBucketId: payload.sourceBucketId,
      status: liveProviderExecution ? "provider_pending" : transferStatus,
    },
    env,
  );

  if (persistenceFailed(persistence)) {
    return {
      body: {
        error: "Transfer intent could not be persisted before provider execution.",
        persistence,
        readiness,
        service: "payshield-transfer-intents",
      },
      status: 503,
    };
  }

  if (liveProviderExecution && persistence.replayed) {
    return {
      body: {
        intent: {
          amountCents,
          destinationPayeeId,
          destinationPayeeName: destinationPayee.name,
          idempotencyKey,
          controlPersistence: {
            bucketProfile: controls.bucketPersistence,
            payees: controls.payeePersistence,
          },
          providerStatus: "replayed",
          readiness,
          sourceBucketId: payload.sourceBucketId,
        },
        ledger: {
          entryCount: book.allEntries().length,
          source: ledger.ledgerSource,
        },
        message:
          "Transfer intent already exists. PayShield did not replay the provider transfer request.",
        destinationPayee,
        persistence,
        providerTransfer: {
          providerTransferId: "durable-intent-replayed",
          status: "replayed",
        },
        sourceBucket,
      },
      status: 200,
    };
  }

  if (liveProviderExecution) {
    try {
      providerTransfer = await providerCreateAchTransfer(env, {
        amountCents,
        destinationPayeeId,
        idempotencyKey,
        sourceBucketId: payload.sourceBucketId,
      });
    } catch (error) {
      const failurePersistence = await updateTransferIntentProviderStatus(
        {
          failureCode: "provider_adapter_error",
          householdId: actor.householdId,
          idempotencyKey,
          providerStatus: "failed",
          providerTransferId: null,
          status: "failed",
        },
        env,
      );
      const exceptionPersistence = await recordMoneyRailProviderException(
        {
          actor,
          amountCents,
          destinationPayeeId,
          error,
          idempotencyKey,
          operation: "createAchTransfer",
          rail: "transfer",
          sourceBucketId: payload.sourceBucketId,
        },
        env,
      );
      const result = providerErrorResult(error, "payshield-transfer-intents");

      return {
        body: {
          ...result.body,
          exceptionPersistence,
          failurePersistence,
          persistence,
          readiness,
        },
        status:
          persistenceFailed(failurePersistence) ||
          persistenceFailed(exceptionPersistence)
            ? 503
            : result.status,
      };
    }

    transferStatus =
      providerTransfer.status === "created" ? "submitted" : "blocked";
    persistence = await updateTransferIntentProviderStatus(
      {
        householdId: actor.householdId,
        idempotencyKey,
        providerStatus: providerTransfer.status,
        providerTransferId: providerTransfer.providerTransferId,
        status: transferStatus,
      },
      env,
    );

    if (persistenceFailed(persistence)) {
      return {
        body: {
          error:
            "Provider transfer was created but the durable transfer status could not be updated.",
          persistence,
          providerTransfer,
          readiness,
          service: "payshield-transfer-intents",
        },
        status: 503,
      };
    }
  }

  const auditPersistence = await persistMoneyRailEvent(
    {
      eventType: "transfer_intent_created",
      householdId: actor.householdId,
      payload: {
        amountCents,
        destinationPayeeId,
        destinationPayeeName: destinationPayee.name,
        idempotencyKey,
        providerTransfer,
        sourceBucketId: payload.sourceBucketId,
      },
      providerEventId: `transfer:${idempotencyKey}`,
      providerName: providerName || "payshield",
      rail: "transfer",
    },
    env,
  );

  if (persistenceFailed(auditPersistence)) {
    return {
      body: {
        auditPersistence,
        error: "Transfer intent audit event could not be persisted.",
        persistence,
        readiness,
        service: "payshield-transfer-intents",
      },
      status: 503,
    };
  }

  return {
    body: {
      auditPersistence,
      intent: {
        amountCents,
        destinationPayeeId,
        destinationPayeeName: destinationPayee.name,
        idempotencyKey,
        controlPersistence: {
          bucketProfile: controls.bucketPersistence,
          payees: controls.payeePersistence,
        },
        providerStatus: providerTransfer.status,
        readiness,
        sourceBucketId: payload.sourceBucketId,
      },
      ledger: {
        entryCount: book.allEntries().length,
        source: ledger.ledgerSource,
      },
      message:
        providerTransfer.status === "created"
          ? "Protected transfer created with the configured provider."
          : "Transfer intent validated. Provider execution remains locked until approved money-rail credentials are active.",
      destinationPayee,
      persistence,
      providerTransfer,
      sourceBucket,
    },
    status: 200,
  };
}

function cleanScheduledDate(value) {
  const scheduledFor = cleanText(value, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    return "";
  }

  return scheduledFor;
}

export async function createBillPayment(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const amountCents = toIntegerCents(payload?.amountCents, { min: 1 });
  const payeeId = cleanText(payload?.payeeId, 120);
  const scheduledFor = cleanScheduledDate(payload?.scheduledFor);

  if (amountCents === null || !payeeId || !scheduledFor) {
    return {
      body: {
        error: "Provide payeeId, integer amountCents, and scheduledFor as YYYY-MM-DD.",
      },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "bill payment controls",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const ledger = await loadHouseholdLedger(env, actor, controls);

  if (ledger.error) {
    return ledger.error;
  }

  const idempotencyKey =
    cleanText(payload?.idempotencyKey, 120) ||
    `bill-${payeeId}-${amountCents}-${scheduledFor}`;
  const memo = cleanText(payload?.memo, 120) || undefined;
  const book = ledger.book;
  const decision = scheduleBillPayment(book, controls.payees, {
    amountCents,
    idempotencyKey,
    memo,
    payeeId,
    scheduledFor,
  });
  const readiness = getCoreReadiness(env, { coreOnline: true });
  const payee = controls.payees.find((candidate) => candidate.id === payeeId);
  let providerBillPayment = decision.accepted
    ? {
        providerBillPaymentId: "bill-pay-provider-contract-required",
        status: "blocked",
      }
    : {
        providerBillPaymentId: "bill-pay-not-scheduled",
        status: "blocked",
      };

  if (decision.accepted && readiness.liveMoneyReady && payee) {
    try {
      providerBillPayment = await providerCreateBillPayment(env, {
        amountCents,
        idempotencyKey,
        payee,
      });
    } catch (error) {
      const exceptionPersistence = await recordMoneyRailProviderException(
        {
          actor,
          amountCents,
          error,
          idempotencyKey,
          operation: "createBillPayment",
          payeeId,
          rail: "bill_payment",
        },
        env,
      );
      const result = providerErrorResult(error, "payshield-bill-payments");

      return {
        body: {
          ...result.body,
          exceptionPersistence,
          readiness,
        },
        status: persistenceFailed(exceptionPersistence) ? 503 : result.status,
      };
    }
  }

  const postedEntry = decision.accepted
    ? book.findByIdempotencyKey(idempotencyKey)
    : null;
  const journalPersistence = postedEntry
    ? await persistOperationalJournal(postedEntry, env, actor)
    : {
        persisted: false,
        persistence: "not_posted",
        persistenceReason: "Rejected bill payments do not create ledger entries.",
      };

  if (persistenceFailed(journalPersistence)) {
    return {
      body: {
        decision,
        error: "Bill payment ledger entry could not be persisted.",
        journalPersistence,
        readiness,
        service: "payshield-bill-payments",
      },
      status: 503,
    };
  }

  const decisionPersistence = await persistBillPaymentSchedule(
    {
      amountCents,
      bucketId: decision.bucketId || null,
      decisionCode: decision.code,
      householdId: actor.householdId,
      idempotencyKey,
      journalEntryId: journalPersistence.postgresId || null,
      memo: memo || null,
      payeeId,
      providerBillPaymentId: providerBillPayment.providerBillPaymentId,
      providerStatus:
        providerBillPayment.status === "created" ? "created" : "blocked",
      reason: decision.reason,
      scheduledFor,
      status: decision.accepted
        ? providerBillPayment.status === "created"
          ? "submitted"
          : "scheduled"
        : "rejected",
    },
    env,
  );

  if (persistenceFailed(decisionPersistence)) {
    return {
      body: {
        decision,
        decisionPersistence,
        error: "Bill payment decision could not be persisted.",
        journalPersistence,
        readiness,
        service: "payshield-bill-payments",
      },
      status: 503,
    };
  }

  return {
    body: {
      balances: buildBucketBalances(book, controls.buckets),
      controlPersistence: {
        bucketProfile: controls.bucketPersistence,
        payees: controls.payeePersistence,
      },
      decision: {
        ...decision,
        providerStatus: providerBillPayment.status,
      },
      ledgerEntries: book.allEntries(),
      decisionPersistence,
      journalPersistence,
      ledger: {
        entryCount: book.allEntries().length,
        source: ledger.ledgerSource,
      },
      message: decision.accepted
        ? "Bill payment scheduled in the protected bucket model. Provider execution requires active money-movement controls."
        : "Bill payment was not scheduled.",
      mode: "core_ledger",
      providerBillPayment,
      readiness,
    },
    status: decision.accepted ? 200 : 400,
  };
}

function isUnlockMode(value) {
  return value === "slow_free" || value === "instant_fixed_fee";
}

export async function createUnlock(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const amountCents = toIntegerCents(payload?.amountCents, { min: 1, max: 200_000 });
  const reason = cleanText(payload?.reason, 140);

  if (
    amountCents === null ||
    !isBucketId(payload?.bucketId) ||
    payload.bucketId === "safe_spending" ||
    !isUnlockMode(payload?.mode) ||
    !reason
  ) {
    return {
      body: {
        error: "Provide protected bucketId, integer amountCents, mode, and reason.",
      },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "protected bucket unlocks",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  const input = {
    amountCents,
    bucketId: payload.bucketId,
    idempotencyKey: cleanText(payload.idempotencyKey, 120) || `unlock-${payload.bucketId}-${amountCents}`,
    mode: payload.mode,
    reason,
  };
  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const bucket = controls.buckets.find((candidate) => candidate.id === payload.bucketId);

  if (!bucket || bucket.id === "safe_spending") {
    return {
      body: {
        error: "Provide a protected bucket that exists in the household control profile.",
      },
      status: 400,
    };
  }

  const ledger = await loadHouseholdLedger(env, actor, controls);

  if (ledger.error) {
    return ledger.error;
  }

  const book = ledger.book;
  const result = unlockProtectedFunds(book, input);
  const postedEntry = book.findByIdempotencyKey(input.idempotencyKey);
  const journalPersistence = await persistOperationalJournal(postedEntry, env, actor);

  if (persistenceFailed(journalPersistence)) {
    return {
      body: {
        error: "Unlock ledger entry could not be persisted.",
        journalPersistence,
        readiness: getCoreReadiness(env, { coreOnline: true }),
        result,
        service: "payshield-unlocks",
      },
      status: 503,
    };
  }

  const decisionPersistence = await persistUnlockRequest(
    {
      amountCents: input.amountCents,
      bucketId: input.bucketId,
      householdId: actor.householdId,
      idempotencyKey: input.idempotencyKey,
      journalEntryId: journalPersistence.postgresId || null,
      reason: input.reason,
      recoveryChecks: result.recoveryChecks,
      recoveryPerCheckCents: result.recoveryPerCheckCents,
      status: journalPersistence.replayed ? "replayed" : "posted",
      unlockMode: input.mode,
      unlockedCents: result.unlockedCents,
    },
    env,
  );

  if (persistenceFailed(decisionPersistence)) {
    return {
      body: {
        decisionPersistence,
        error: "Unlock request could not be persisted.",
        journalPersistence,
        readiness: getCoreReadiness(env, { coreOnline: true }),
        result,
        service: "payshield-unlocks",
      },
      status: 503,
    };
  }

  return {
    body: {
      balances: buildBucketBalances(book, controls.buckets),
      controlPersistence: {
        bucketProfile: controls.bucketPersistence,
        payees: controls.payeePersistence,
      },
      decisionPersistence,
      ledgerEntries: book.allEntries(),
      ledger: {
        entryCount: book.allEntries().length,
        source: ledger.ledgerSource,
      },
      journalPersistence,
      message: "Recovery plan created. Provider execution requires active money-movement controls.",
      mode: "core_ledger",
      readiness: getCoreReadiness(env, { coreOnline: true }),
      result,
    },
    status: 200,
  };
}

export async function authorizeCard(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const amountCents = toIntegerCents(payload?.amountCents, { min: 1 });

  if (amountCents === null) {
    return {
      body: {
        error: "Provide integer amountCents.",
      },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "card authorization",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;

  const input = {
    amountCents,
    idempotencyKey:
      cleanText(payload?.idempotencyKey, 120) ||
      `card-auth-${cleanText(payload?.merchantName, 120) || "merchant"}-${amountCents}`,
    merchantCategoryCode: typeof payload?.merchantCategoryCode === "string" ? cleanText(payload.merchantCategoryCode, 20) : undefined,
    merchantName: cleanText(payload?.merchantName, 120) || "Unknown merchant",
    payeeId: typeof payload?.payeeId === "string" ? cleanText(payload.payeeId, 120) : undefined,
  };
  const readiness = getCoreReadiness(env, { coreOnline: true });

  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const ledger = await loadHouseholdLedger(env, actor, controls);

  if (ledger.error) {
    return ledger.error;
  }

  const book = ledger.book;
  const decision = authorizeCardTransaction(book, controls.payees, input);
  const postedEntry = decision.approved
    ? book.findByIdempotencyKey(input.idempotencyKey)
    : null;
  const journalPersistence = postedEntry
    ? await persistOperationalJournal(postedEntry, env, actor)
    : {
        persisted: false,
        persistence: "not_posted",
        persistenceReason: "Declined card authorizations do not create ledger entries.",
      };

  if (persistenceFailed(journalPersistence)) {
    return {
      body: {
        decision,
        error: "Card authorization ledger entry could not be persisted.",
        journalPersistence,
        readiness,
        service: "payshield-card-authorization",
      },
      status: 503,
    };
  }

  const decisionPersistence = await persistCardAuthorizationDecision(
    {
      amountCents,
      approved: decision.approved,
      approvedAmountCents: decision.approvedAmountCents,
      bucketId: decision.bucketId || "safe_spending",
      decisionCode: decision.code,
      householdId: actor.householdId,
      idempotencyKey: input.idempotencyKey,
      journalEntryId: journalPersistence.postgresId || null,
      merchantCategoryCode: input.merchantCategoryCode || null,
      merchantName: input.merchantName,
      payeeId: input.payeeId || null,
      providerStatus: readiness.liveMoneyReady
        ? "provider_gateway"
        : "blocked",
      reason: decision.reason,
    },
    env,
  );

  if (persistenceFailed(decisionPersistence)) {
    return {
      body: {
        decision,
        decisionPersistence,
        error: "Card authorization decision could not be persisted.",
        journalPersistence,
        readiness,
        service: "payshield-card-authorization",
      },
      status: 503,
    };
  }

  return {
    body: {
      balances: buildBucketBalances(book, controls.buckets),
      controlPersistence: {
        bucketProfile: controls.bucketPersistence,
        payees: controls.payeePersistence,
      },
      decision,
      decisionPersistence,
      journalPersistence,
      ledger: {
        entryCount: book.allEntries().length,
        source: ledger.ledgerSource,
      },
      ledgerEntries: book.allEntries(),
      mode: readiness.liveMoneyReady ? "provider_gateway" : "core_ledger",
      readiness,
      service: "payshield-card-authorization",
    },
    status: 200,
  };
}

function stableEventId(providerName, payload) {
  const explicit =
    safeString(payload?.providerEventId, 160) ||
    safeString(payload?.eventId, 160) ||
    safeString(payload?.webhookId, 160) ||
    safeString(payload?.webhook_id, 160) ||
    safeString(payload?.requestId, 160) ||
    safeString(payload?.request_id, 160);

  if (explicit) {
    return explicit;
  }

  return `webhook_${providerName}_${createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex")
    .slice(0, 24)}`;
}

function providerNameFromPayload(payload) {
  return (
    safeString(payload?.providerName, 40) ||
    safeString(payload?.provider, 40) ||
    safeString(payload?.source, 40) ||
    "plaid"
  ).toLowerCase();
}

function redactProviderWebhookPayload(value) {
  if (Array.isArray(value)) {
    return value.map(redactProviderWebhookPayload);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /__payshield|access[_-]?token|authorization|credential|password|raw[_-]?body|secret|signature/i.test(key)
        ? "[redacted]"
        : redactProviderWebhookPayload(item),
    ]),
  );
}

function transactionCandidates(payload) {
  const candidates = [
    payload?.transaction,
    payload?.transactions,
    payload?.added,
    payload?.modified,
    payload?.paychecks,
    payload?.data?.transaction,
    payload?.data?.transactions,
    payload?.data?.added,
    payload?.data?.modified,
    payload?.event?.transaction,
    payload?.event?.transactions,
  ];

  return candidates.flatMap((candidate) =>
    Array.isArray(candidate) ? candidate : candidate ? [candidate] : [],
  );
}

function transactionText(transaction, key, maxLength = 160) {
  return safeString(transaction?.[key], maxLength);
}

function nestedTransactionText(transaction, parentKey, key, maxLength = 160) {
  return safeString(transaction?.[parentKey]?.[key], maxLength);
}

function transactionCategoryText(transaction) {
  const raw = [
    transactionText(transaction, "category"),
    Array.isArray(transaction?.category)
      ? transaction.category.filter(Boolean).join(" ")
      : "",
    transactionText(transaction, "categoryId"),
    transactionText(transaction, "transactionType"),
    transactionText(transaction, "type"),
    nestedTransactionText(transaction, "personal_finance_category", "primary"),
    nestedTransactionText(transaction, "personal_finance_category", "detailed"),
    nestedTransactionText(transaction, "personalFinanceCategory", "primary"),
    nestedTransactionText(transaction, "personalFinanceCategory", "detailed"),
  ].join(" ");

  return raw.toLowerCase();
}

function transactionName(transaction) {
  return (
    transactionText(transaction, "employerName", 100) ||
    transactionText(transaction, "employer_name", 100) ||
    transactionText(transaction, "merchantName", 100) ||
    transactionText(transaction, "merchant_name", 100) ||
    transactionText(transaction, "counterpartyName", 100) ||
    transactionText(transaction, "counterparty_name", 100) ||
    transactionText(transaction, "name", 100) ||
    transactionText(transaction, "originalDescription", 100) ||
    transactionText(transaction, "original_description", 100) ||
    transactionText(transaction, "description", 100)
  );
}

function creditDirection(transaction) {
  const text = [
    transactionText(transaction, "direction", 40),
    transactionText(transaction, "amountDirection", 40),
    transactionText(transaction, "amount_direction", 40),
    transactionText(transaction, "transactionType", 40),
    transactionText(transaction, "transaction_type", 40),
  ]
    .join(" ")
    .toLowerCase();

  return /\b(credit|deposit|inflow|income)\b/.test(text);
}

function providerAmountCents(transaction) {
  if (Number.isInteger(transaction?.amountCents)) {
    if (transaction.amountCents < 0) {
      return Math.abs(transaction.amountCents);
    }

    return creditDirection(transaction) ? transaction.amountCents : null;
  }

  if (Number.isInteger(transaction?.amount_cents)) {
    if (transaction.amount_cents < 0) {
      return Math.abs(transaction.amount_cents);
    }

    return creditDirection(transaction) ? transaction.amount_cents : null;
  }

  const amount = Number(transaction?.amount);

  if (!Number.isFinite(amount)) {
    return null;
  }

  if (amount < 0) {
    return Math.round(Math.abs(amount) * 100);
  }

  return creditDirection(transaction) ? Math.round(amount * 100) : null;
}

function incomeSignal(transaction) {
  const category = transactionCategoryText(transaction);
  const name = transactionName(transaction).toLowerCase();

  return /income|payroll|paycheck|salary|wage|direct deposit|direct_deposit|ach credit|ach_credit/.test(
    `${category} ${name}`,
  );
}

function providerTransactionId(transaction, fallback) {
  return (
    transactionText(transaction, "providerTransactionId", 160) ||
    transactionText(transaction, "provider_transaction_id", 160) ||
    transactionText(transaction, "transactionId", 160) ||
    transactionText(transaction, "transaction_id", 160) ||
    transactionText(transaction, "id", 160) ||
    fallback
  );
}

function providerItemId(payload, transaction) {
  return (
    transactionText(transaction, "itemId", 160) ||
    transactionText(transaction, "item_id", 160) ||
    safeString(payload?.itemId, 160) ||
    safeString(payload?.item_id, 160)
  );
}

function providerAccountId(payload, transaction) {
  return (
    transactionText(transaction, "accountId", 160) ||
    transactionText(transaction, "account_id", 160) ||
    safeString(payload?.accountId, 160) ||
    safeString(payload?.account_id, 160)
  );
}

function providerDetectionIdempotencyKey({
  accountId,
  itemId,
  payload,
  providerEventId,
  transactionId,
}) {
  const fallbackTransactionId = `${providerEventId}:transaction:`;
  const hasStableTransactionId =
    transactionId && !transactionId.startsWith(fallbackTransactionId);
  const seed = hasStableTransactionId
    ? {
        accountId,
        itemId,
        providerName: providerNameFromPayload(payload),
        transactionId,
      }
    : {
        providerEventId,
        providerName: providerNameFromPayload(payload),
        transactionId,
      };

  return `provider-txn:${createHash("sha256")
    .update(JSON.stringify(seed))
    .digest("hex")
    .slice(0, 32)}`;
}

function transactionReceivedAt(transaction) {
  return (
    transactionText(transaction, "authorized_datetime", 40) ||
    transactionText(transaction, "datetime", 40) ||
    transactionText(transaction, "dateTime", 40) ||
    transactionText(transaction, "date", 40) ||
    new Date().toISOString()
  );
}

function extractProviderPaycheckDetections(payload, providerEventId) {
  return transactionCandidates(payload)
    .map((transaction, index) => {
      if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
        return null;
      }

      if (transaction.pending === true || transaction.status === "pending") {
        return null;
      }

      const amountCents = providerAmountCents(transaction);
      const employerName = transactionName(transaction);

      if (!amountCents || !employerName || !incomeSignal(transaction)) {
        return null;
      }

      const transactionId = providerTransactionId(
        transaction,
        `${providerEventId}:transaction:${index}`,
      );
      const itemId = providerItemId(payload, transaction);
      const accountId = providerAccountId(payload, transaction);

      return {
        amountCents,
        employerName,
        idempotencyKey: providerDetectionIdempotencyKey({
          accountId,
          itemId,
          payload,
          providerEventId,
          transactionId,
        }),
        itemId,
        providerAccountId: accountId,
        providerEventId,
        providerTransactionId: transactionId,
        receivedAt: transactionReceivedAt(transaction),
      };
    })
    .filter(Boolean);
}

async function actorForProviderDetection(payload, detection, providerName, env) {
  const payloadActor = normalizeActor(safeObject(payload?.__payshieldActor));
  const durableLookupRequired = databaseConfigured(env);

  if (
    durableLookupRequired &&
    (!detection.itemId || !detection.providerAccountId)
  ) {
    return {
      missingProviderReference: true,
    };
  }

  if (!detection.itemId) {
    return payloadActor;
  }

  const lookup = await loadBankConnectionForProvider(
    {
      providerAccountId: detection.providerAccountId,
      providerItemId: detection.itemId,
      providerName,
    },
    env,
  );

  if (persistenceFailed(lookup)) {
    return {
      error: lookup,
    };
  }

  if (!lookup.bankConnection) {
    if (lookup.persistence === "postgres") {
      return {
        notFound: true,
      };
    }

    return payloadActor;
  }

  return normalizeActor({
    householdId: lookup.bankConnection.householdId,
    userId: lookup.bankConnection.userId,
  });
}

async function persistProviderWebhookException({
  actor,
  detection,
  env,
  providerEventId,
  providerName,
  reason,
  reasonCode,
  source = "provider_webhook",
  status,
}) {
  const idempotencyKey = [
    `${source}-exception`,
    providerName,
    providerEventId,
    detection.providerTransactionId || detection.idempotencyKey,
    reasonCode,
  ].join(":");
  const summary = `${status.replace(/_/g, " ")}: ${detection.employerName} transaction ${
    detection.providerTransactionId || "unknown"
  } from ${providerName} event ${providerEventId} could not post.`;

  return persistReconciliationException(
    {
      householdId: actor?.householdId || null,
      idempotencyKey,
      metadata: {
        amountCents: detection.amountCents,
        employerName: detection.employerName,
        providerAccountId: detection.providerAccountId || null,
        providerItemId: detection.itemId || null,
        status,
      },
      providerEventId,
      providerName,
      providerTransactionId: detection.providerTransactionId || null,
      reasonCode,
      severity: status === "rejected" ? "warning" : "critical",
      source,
      summary: `${summary} ${reason}`,
    },
    env,
  );
}

export async function handleProviderWebhook(payload, env = process.env) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      body: {
        accepted: false,
        mode: "blocked",
        reason: "Provider webhook payload must be a JSON object.",
        readiness: getCoreReadiness(env, { coreOnline: true }),
        service: "payshield-provider-webhook",
      },
      status: 400,
    };
  }

  const readiness = getCoreReadiness(env, { coreOnline: true });
  const moneyReadiness = getMoneyRailReadiness(env);
  const providerName = providerNameFromPayload(payload);
  const providerEventId = stableEventId(providerName, payload);
  const detections = extractProviderPaycheckDetections(payload, providerEventId);
  const providerSignature = verifyProviderWebhookSignature(
    payload,
    env,
    readiness,
    moneyReadiness,
  );

  if (!providerSignature.ok) {
    return {
      body: {
        accepted: false,
        error: providerSignature.error,
        mode: "blocked",
        providerEventId,
        providerWebhookAuthenticity: providerSignature.mode,
        readiness,
        service: "payshield-provider-webhook",
      },
      status: providerSignature.status,
    };
  }

  const eventPersistence = await persistMoneyRailEvent(
    {
      eventType:
        safeString(payload.eventType || payload.webhook_code || payload.type, 80) ||
        "provider_webhook",
      householdId: safeString(payload.householdId, 160) || null,
      payload: redactProviderWebhookPayload(payload),
      providerEventId,
      providerName,
      rail: "provider_webhook",
    },
    env,
  );

  if (persistenceFailed(eventPersistence)) {
    return {
      body: {
        accepted: false,
        error: "Provider webhook audit event could not be persisted.",
        eventPersistence,
        readiness,
        service: "payshield-provider-webhook",
      },
      status: 503,
    };
  }

  if (eventPersistence.replayed) {
    return {
      body: {
        accepted: true,
        duplicate: true,
        eventPersistence,
        mode: "replayed",
        providerEventId,
        readiness,
        service: "payshield-provider-webhook",
      },
      status: 202,
    };
  }

  if (detections.length === 0) {
    const blocked = providerBlockedResult(readiness);

    return {
      body: {
        accepted: true,
        detectionCount: 0,
        eventPersistence,
        mode: blocked ? "blocked" : "processed",
        providerEventId,
        readiness,
        reason: blocked
          ? blocked.reason
          : "Provider webhook accepted; no paycheck-like transactions were present.",
        service: "payshield-provider-webhook",
      },
      status: 202,
    };
  }

  if (!moneyReadiness.paycheckDetectionReady) {
    return {
      body: {
        accepted: true,
        detectionCount: 0,
        eventPersistence,
        mode: "blocked",
        moneyReadiness,
        providerEventId,
        readiness,
        reason:
          "Paycheck transaction events require Plaid credentials, signed token-vault handoff, and encrypted token custody.",
        service: "payshield-provider-webhook",
      },
      status: 202,
    };
  }

  const processed = [];
  const skipped = [];

  for (const detection of detections) {
    const actor = await actorForProviderDetection(
      payload,
      detection,
      providerName,
      env,
    );

    if (actor.error) {
      return {
        body: {
          accepted: false,
          error: "Bank connection lookup failed for provider transaction.",
          lookupPersistence: actor.error,
          providerEventId,
          readiness,
          service: "payshield-provider-webhook",
        },
        status: 503,
      };
    }

    if (actor.missingProviderReference) {
      const skip = {
        amountCents: detection.amountCents,
        employerName: detection.employerName,
        providerTransactionId: detection.providerTransactionId,
        reason:
          "Provider paycheck transaction must include provider item and account identifiers before PayShield can match it to an active bank connection.",
        status: "missing_provider_reference",
      };
      const exceptionPersistence = await persistProviderWebhookException({
        actor: null,
        detection,
        env,
        providerEventId,
        providerName,
        reason: skip.reason,
        reasonCode: "missing_provider_reference",
        status: skip.status,
      });

      if (persistenceFailed(exceptionPersistence)) {
        return {
          body: {
            accepted: false,
            error: "Provider webhook exception could not be persisted.",
            exceptionPersistence,
            providerEventId,
            readiness,
            service: "payshield-provider-webhook",
          },
          status: 503,
        };
      }

      skipped.push({
        ...skip,
        exceptionPersistence,
      });
      continue;
    }

    if (actor.notFound) {
      const skip = {
        amountCents: detection.amountCents,
        employerName: detection.employerName,
        providerTransactionId: detection.providerTransactionId,
        reason:
          "Provider transaction could not be matched to an active PayShield bank connection.",
        status: "bank_connection_not_found",
      };
      const exceptionPersistence = await persistProviderWebhookException({
        actor: null,
        detection,
        env,
        providerEventId,
        providerName,
        reason: skip.reason,
        reasonCode: "bank_connection_not_found",
        status: skip.status,
      });

      if (persistenceFailed(exceptionPersistence)) {
        return {
          body: {
            accepted: false,
            error: "Provider webhook exception could not be persisted.",
            exceptionPersistence,
            providerEventId,
            readiness,
            service: "payshield-provider-webhook",
          },
          status: 503,
        };
      }

      skipped.push({
        ...skip,
        exceptionPersistence,
      });
      continue;
    }

    const result = await detectPaycheck(
      {
        __payshieldActor: {
          householdId: actor.householdId,
          userId: actor.id,
        },
        amountCents: detection.amountCents,
        employerName: detection.employerName,
        idempotencyKey: detection.idempotencyKey,
        providerAccountId: detection.providerAccountId,
        providerEventId: detection.providerEventId,
        providerItemId: detection.itemId,
        providerName,
        providerTransactionId: detection.providerTransactionId,
        receivedAt: detection.receivedAt,
      },
      env,
    );

    if (result.status >= 400) {
      if (result.status < 500) {
        const skip = {
          amountCents: detection.amountCents,
          employerName: detection.employerName,
          providerTransactionId: detection.providerTransactionId,
          reason:
            typeof result.body?.error === "string"
              ? result.body.error
              : "Provider paycheck transaction was rejected by paycheck detection controls.",
          status: "rejected",
        };
        const exceptionPersistence = await persistProviderWebhookException({
          actor,
          detection,
          env,
          providerEventId,
          providerName,
          reason: skip.reason,
          reasonCode: "paycheck_detection_rejected",
          status: skip.status,
        });

        if (persistenceFailed(exceptionPersistence)) {
          return {
            body: {
              accepted: false,
              error: "Provider webhook exception could not be persisted.",
              exceptionPersistence,
              providerEventId,
              readiness,
              service: "payshield-provider-webhook",
            },
            status: 503,
          };
        }

        skipped.push({
          ...skip,
          exceptionPersistence,
        });
        continue;
      }

      return {
        body: {
          accepted: false,
          detection,
          error: "Provider paycheck transaction could not be posted.",
          providerEventId,
          result: result.body,
          service: "payshield-provider-webhook",
        },
        status: result.status,
      };
    }

    processed.push({
      amountCents: detection.amountCents,
      employerName: detection.employerName,
      idempotencyKey: detection.idempotencyKey,
      journalEntryId:
        result.body.ledgerEntry?.id ||
        result.body.journalPersistence?.postgresId ||
        null,
      journalReplayed: result.body.journalPersistence?.replayed === true,
      matchedRule: result.body.detection?.matchedRule || null,
      providerTransactionId: detection.providerTransactionId,
      status: result.body.detection?.status || "split_posted",
    });
  }

  return {
    body: {
      accepted: true,
      detectionCount: processed.length,
      detections: processed,
      eventPersistence,
      mode: processed.length > 0 ? "processed" : "blocked",
      moneyReadiness,
      providerEventId,
      readiness,
      reason:
        processed.length > 0
          ? undefined
          : "Provider webhook accepted, but no paycheck transaction could be posted.",
      service: "payshield-provider-webhook",
      skipped,
      skippedCount: skipped.length,
    },
    status: 202,
  };
}
