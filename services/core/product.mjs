import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { importJWK, jwtVerify } from "jose";
import {
  applyBillPaymentLifecycle,
  applyCardAuthorizationLifecycle,
  applyTransferLifecycle,
  claimPlaidSyncJobs,
  completePlaidSyncJob,
  databaseConfigured,
  enqueuePlaidSyncJob,
  failPlaidSyncJob,
  cancelBillPaymentSchedule,
  loadCardAuthorizationDecision,
  loadBillPaymentSchedule,
  loadActiveBankConnectionForHousehold,
  loadActivePaycheckDetectionRules,
  loadOperationalAudit,
  loadBankConnectionForProvider,
  loadBucketProfile,
  loadHouseholdMoneyProfile,
  loadHouseholdJournalEntries,
  loadPaycheckDetection,
  loadPayees,
  loadProviderCardActor,
  loadProviderOnboardingState,
  loadProviderTokenSecret,
  persistBucketProfile,
  persistBankConnection,
  persistBankConnectionSyncState,
  persistBillPaymentSchedule,
  persistCardAuthorizationDecision,
  persistCommercialBillingEvent,
  persistCommercialCheckoutIntent,
  persistDirectDepositSetup,
  persistHouseholdMoneyProfile,
  persistHouseholdIdentity,
  persistMoneyRailEvent,
  persistPayee,
  persistPaycheckDetection,
  persistPaycheckDetectionRule,
  persistProductionGateEvidence,
  persistProviderOnboardingState,
  persistProviderTokenSecret,
  persistReconciliationException,
  persistTransferIntent,
  persistUnlockRequest,
  resolveReconciliationExceptionRecord,
  updateBillPaymentProviderStatus,
  updateDirectDepositSetupProviderStatus,
  updateProviderKycApplicationStatus,
  updateProviderCardStatus,
  updatePayeeControl,
  updatePayeeProviderStatus,
  updateTransferIntentProviderStatus,
} from "./database.mjs";

const serviceName = "payshield-core";
export const coreLedgerSchemaVersion = "0019";
const trustedPaycheckDetection = Symbol("trustedPaycheckDetection");
const trustedPlaidWebhookSync = Symbol("trustedPlaidWebhookSync");
const plaidVerificationKeyCache = new Map();

class PlaidVerificationUnavailableError extends Error {
  constructor() {
    super("plaid_verification_unavailable");
    this.name = "PlaidVerificationUnavailableError";
  }
}
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
    description: "BaaS/card provider callbacks require signed webhook ingress.",
    env: "PAYSHIELD_PROVIDER_WEBHOOK_SECRET",
    id: "provider_webhook_signing",
    kind: "present",
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
    description: "Frontend authentication has been verified for account access.",
    id: "clerk_auth",
    kind: "frontend_auth_verified",
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
  billPaymentCancel: "/bill-payments/cancel",
  cardAuthorization: "/card-authorizations",
  cardIssue: "/cards",
  cardStatus: "/cards/status",
  customer: "/customers",
  directDeposit: "/direct-deposit-instructions",
  financialAccount: "/financial-accounts",
  kyc: "/kyc/applications",
  payeeEnrollment: "/payees/enroll",
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
      billPaymentCancel: cleanProviderPath(env.PAYSHIELD_BAAS_BILL_PAYMENT_CANCEL_PATH, providerEndpointDefaults.billPaymentCancel),
      cardAuthorization: cleanProviderPath(env.PAYSHIELD_BAAS_CARD_AUTHORIZATION_PATH, providerEndpointDefaults.cardAuthorization),
      cardIssue: cleanProviderPath(env.PAYSHIELD_BAAS_CARD_ISSUE_PATH, providerEndpointDefaults.cardIssue),
      cardStatus: cleanProviderPath(env.PAYSHIELD_BAAS_CARD_STATUS_PATH, providerEndpointDefaults.cardStatus),
      customer: cleanProviderPath(env.PAYSHIELD_BAAS_CUSTOMER_PATH, providerEndpointDefaults.customer),
      directDeposit: cleanProviderPath(env.PAYSHIELD_BAAS_DIRECT_DEPOSIT_PATH, providerEndpointDefaults.directDeposit),
      financialAccount: cleanProviderPath(env.PAYSHIELD_BAAS_FINANCIAL_ACCOUNT_PATH, providerEndpointDefaults.financialAccount),
      kyc: cleanProviderPath(env.PAYSHIELD_BAAS_KYC_PATH, providerEndpointDefaults.kyc),
      payeeEnrollment: cleanProviderPath(
        env.PAYSHIELD_BAAS_PAYEE_ENROLLMENT_PATH,
        providerEndpointDefaults.payeeEnrollment,
      ),
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

const maxProviderAdapterResponseBytes = 256 * 1024;

async function readBoundedProviderResponseText(response, operation) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      byteLength += value.byteLength;

      if (byteLength > maxProviderAdapterResponseBytes) {
        await reader.cancel().catch(() => {});
        throw new ProviderAdapterError(
          `Provider ${operation} response is too large.`,
        );
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

async function readProviderJsonPayload(response, operation) {
  const text = await readBoundedProviderResponseText(response, operation);

  if (!text) {
    return {};
  }

  try {
    const payload = JSON.parse(text);

    return safeObject(payload);
  } catch {
    if (!response.ok) {
      return {};
    }

    throw new ProviderAdapterError(
      `Provider ${operation} did not return a valid JSON response.`,
    );
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
        ...(safeString(body?.idempotencyKey, 180)
          ? { "x-idempotency-key": safeString(body.idempotencyKey, 180) }
          : {}),
        "x-payshield-provider": config.providerName,
        "x-payshield-provider-operation": operation,
      },
      method: "POST",
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch {
    throw new ProviderAdapterError(
      `Provider ${operation} request could not be completed.`,
    );
  }

  const payload = await readProviderJsonPayload(response, operation);

  if (!response.ok) {
    throw new ProviderAdapterError(
      `Provider ${operation} rejected the request.`,
    );
  }

  return payload;
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
      code: "provider_request_failed",
      error:
        "The banking service could not complete this request. Try again or contact support.",
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
      databaseConfigured(env) &&
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

  if (definition.kind === "frontend_auth_verified") {
    return envTrue(env, "PAYSHIELD_FRONTEND_AUTH_VERIFIED");
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
    mode: liveMoneyReady ? "live" : providerConfigured ? "sandbox" : "setup",
    postgresConfigured: databaseConfigured(env),
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
      "GET /app/money-profile",
      "GET /app/audit/export",
      "POST /app/buckets",
      "POST /app/control-plan",
      "POST /app/money-profile",
      "POST /token-vault/plaid",
      "POST /plaid/webhooks",
      "POST /app/bank-link/token",
      "POST /app/bank-link/exchange",
      "GET /app/bank-connections",
      "POST /app/bank-connections",
      "POST /app/bill-payments",
      "POST /app/billing/checkout",
      "POST /app/bill-payments/cancel",
      "POST /app/card/status",
      "POST /app/direct-deposit",
      "POST /commercial/billing-events",
      "POST /app/onboarding/start",
      "POST /app/payees",
      "POST /app/payees/verify",
      "PATCH /app/payees",
      "DELETE /app/payees",
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
              ? `Household identity requires durable ledger storage before ${operation}.`
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

function reserveProtectedTransfer(book, input) {
  const existing = book.findByIdempotencyKey(input.idempotencyKey);

  if (existing) {
    if (existing.type !== "transfer_reservation") {
      throw new Error(
        `Idempotency key ${input.idempotencyKey} is already used for ${existing.type}.`,
      );
    }

    assertSameIdempotentPayload(existing, {
      amountCents: input.amountCents,
      destinationPayeeId: input.destinationPayeeId,
      sourceBucketId: input.sourceBucketId,
    });
    return existing;
  }

  return book.createEntry({
    idempotencyKey: input.idempotencyKey,
    lines: [
      {
        accountId: bucketAccount(input.sourceBucketId),
        amountCents: input.amountCents,
      },
      {
        accountId: "liability:transfer_pending",
        amountCents: -input.amountCents,
      },
    ],
    memo: `Protected transfer: ${input.destinationPayeeName}`,
    metadata: {
      amountCents: input.amountCents,
      destinationPayeeId: input.destinationPayeeId,
      destinationPayeeName: input.destinationPayeeName,
      sourceBucketId: input.sourceBucketId,
    },
    type: "transfer_reservation",
  });
}

export function reverseBillPaymentReservation(book, originalEntry, input) {
  const existing = book.findByIdempotencyKey(input.idempotencyKey);

  if (existing) {
    if (
      existing.type !== "reversal" ||
      existing.reversedEntryId !== input.reversedEntryId
    ) {
      throw new Error(
        `Idempotency key ${input.idempotencyKey} is already used for another ledger operation.`,
      );
    }

    return existing;
  }

  if (!originalEntry || originalEntry.type !== "bill_payment") {
    throw new Error("The original bill payment ledger entry was not found.");
  }

  return book.createEntry({
    idempotencyKey: input.idempotencyKey,
    lines: originalEntry.lines.map((line) => ({
      accountId: line.accountId,
      amountCents: line.amountCents * -1,
    })),
    memo: `Canceled bill payment: ${originalEntry.memo || "scheduled payment"}`,
    metadata: {
      amountCents: metadataNumber(originalEntry, "amountCents"),
      cancellationReason: input.reason,
      originalIdempotencyKey: originalEntry.idempotencyKey,
      scheduleId: input.scheduleId,
    },
    reversedEntryId: input.reversedEntryId,
    type: "reversal",
  });
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
    payees:
      payeePersistence.persistence === "postgres"
        ? payeePersistence.payees || []
        : neobankPayees,
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

async function loadHouseholdLedger(env = process.env, actorInput = demoUser, controls = {}) {
  const actor = normalizeActor(actorInput);
  const [operationalAudit, journalPersistence] = await Promise.all([
    loadOperationalAudit(actor.householdId, env),
    loadHouseholdJournalEntries(actor.householdId, env),
  ]);

  if (
    persistenceFailed(operationalAudit) ||
    persistenceFailed(journalPersistence)
  ) {
    return {
      error: {
        body: {
          error: "Operational ledger records could not be loaded from durable core storage.",
          journalPersistence,
          operationalAudit,
          readiness: getCoreReadiness(env, { coreOnline: true }),
          service: "payshield-household-ledger",
        },
        status: 503,
      },
    };
  }

  const durableAudit = operationalAudit.audit ?? emptyOperationalAudit();

  if (journalPersistence.persistence === "postgres") {
    return {
      book: replayJournalEntries(journalPersistence.entries),
      durableAudit,
      ledgerSource: journalPersistence.entries.length
        ? "postgres_journal"
        : "postgres_empty",
      journalPersistence,
      operationalAudit,
    };
  }

  return {
    book: createDemoLedgerBook(300_000, controls.buckets || neobankBuckets),
    durableAudit,
    journalPersistence,
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

  if (persistence.persistence === "ownership_conflict") {
    return {
      body: {
        accepted: false,
        conflict: persistence.conflict || null,
        error:
          "Bank connection already belongs to a different PayShield household.",
        persistence: {
          persisted: false,
          persistence: persistence.persistence,
          persistenceReason: persistence.persistenceReason,
        },
        readiness,
        service: "payshield-bank-connections",
      },
      status: 409,
    };
  }

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
      bankConnection: persistence.bankConnection || connection,
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

export async function getBankConnections(env = process.env, actorInput = demoUser) {
  const actorResolution = await resolveActorIdentity(
    env,
    actorInput,
    "bank connection lookup",
  );

  if (!actorResolution.ok) {
    return actorResolution.result;
  }

  const actor = actorResolution.actor;
  const operationalAudit = await loadOperationalAudit(actor.householdId, env);

  if (persistenceFailed(operationalAudit)) {
    return {
      body: {
        error: "Bank connections could not be loaded from durable core storage.",
        operationalAudit,
        service: "payshield-bank-connections",
      },
      status: 503,
    };
  }

  const audit = operationalAudit.audit ?? emptyOperationalAudit();

  return {
    body: {
      bankConnections: audit.bankConnections,
      count: audit.bankConnections.length,
      persistence: {
        auditFound: operationalAudit.auditFound,
        persisted: operationalAudit.auditFound,
        persistence: operationalAudit.persistence,
        persistenceReason:
          operationalAudit.persistenceReason ||
          (operationalAudit.auditFound
            ? "Loaded from durable core storage."
            : "No connected bank sources are recorded for this household yet."),
      },
      readiness: getMoneyRailReadiness(env),
      service: "payshield-bank-connections",
    },
    status: 200,
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
            ? "Household identity requires durable ledger storage before this operation can continue."
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
  const storeBilling = mobileStoreBillingConfigured(env);
  const checkoutStarted =
    checkoutIntent &&
    ["created", "payment_link", "requested"].includes(checkoutIntent.status);

  return {
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    checkoutIntentId: checkoutIntent?.idempotencyKey ?? null,
    checkoutIntentStatus: checkoutIntent?.status ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    mode: storeBilling
      ? "app_store"
      : env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL?.trim()
        ? "payment_link"
        : env.STRIPE_SECRET_KEY?.trim()
          ? "checkout"
          : "not_configured",
    priceLabel: env.PAYSHIELD_COMMERCIAL_PRICE_LABEL?.trim() || "$19/month",
    providerCustomerId: subscription?.providerCustomerId ?? null,
    providerCheckoutId: checkoutIntent?.providerCheckoutId ?? null,
    providerName: subscription?.providerName ?? (storeBilling ? "revenuecat" : "stripe"),
    providerSubscriptionId: subscription?.providerSubscriptionId ?? null,
    readyForCheckout: configured,
    state:
      subscription?.accessStatus ??
      (checkoutStarted ? "checkout_started" : configured ? "ready" : "needs_setup"),
    subscriptionStatus: subscription?.subscriptionStatus ?? null,
  };
}

function mobileStoreBillingConfigured(env) {
  return Boolean(
    envTrue(env, "PAYSHIELD_MOBILE_STORE_BILLING_ENABLED") &&
      (env.PAYSHIELD_REVENUECAT_ENTITLEMENT_ID?.trim() || "payshield_pro"),
  );
}

function commercialBillingConfigured(env) {
  return Boolean(
    mobileStoreBillingConfigured(env) ||
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
        `npm run smoke:deploy -- ${siteUrl}`,
        `npm run production:routes -- ${siteUrl}`,
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
const controlPlanPayeeStatuses = new Set([
  "approved",
  "modeled",
  "provider_pending",
]);
const controlPlanBucketIdPattern =
  /^(rent|vehicle|insurance|kids|vacation|emergency|safe_spending|custom_[a-z0-9_]{1,64})$/;

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

function controlPlanIntegerCents(value, fallback = 0) {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount)) {
    return fallback;
  }

  return Math.max(0, Math.min(2_000_000, amount));
}

function controlPlanBucketId(value) {
  const id = cleanText(value, 80);

  return controlPlanBucketIdPattern.test(id) ? id : null;
}

function normalizeControlPlanBuckets(value, fallback = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const buckets = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const id = controlPlanBucketId(item.id);
      const protection = protectionValues.has(item.protection) ? item.protection : null;

      if (!id || !protection) {
        return null;
      }

      const targetCents = controlPlanIntegerCents(item.targetCents);
      const availableCents = controlPlanIntegerCents(item.availableCents, targetCents);
      const fundedCents = controlPlanIntegerCents(item.fundedCents, availableCents);

      return {
        availableCents,
        due: cleanText(item.due, 48) || "Every check",
        fundedCents,
        id,
        name: cleanText(item.name, 80) || "Protected bucket",
        payeeId: cleanText(item.payeeId, 120) || undefined,
        priority: Number.isFinite(item.priority)
          ? Math.max(1, Math.round(item.priority))
          : 999,
        protection,
        shortCents: controlPlanIntegerCents(
          item.shortCents,
          Math.max(0, targetCents - fundedCents),
        ),
        targetCents,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.priority - right.priority);
  const protectedCount = buckets.filter((bucket) => bucket.id !== "safe_spending").length;

  if (!protectedCount) {
    return fallback;
  }

  if (buckets.some((bucket) => bucket.id === "safe_spending")) {
    return buckets;
  }

  return [
    ...buckets,
    {
      availableCents: 0,
      due: "Remainder",
      fundedCents: 0,
      id: "safe_spending",
      name: "Safe to Spend",
      priority: 1000,
      protection: "spendable",
      shortCents: 0,
      targetCents: 0,
    },
  ];
}

function normalizeControlPlanPayees(value, fallback = [], buckets = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const bucketIds = new Set(buckets.map((bucket) => bucket.id));
  const payees = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const allowedBucketId = controlPlanBucketId(item.allowedBucketId);
      const status = cleanText(item.status, 40);

      if (
        !allowedBucketId ||
        !bucketIds.has(allowedBucketId) ||
        !controlPlanPayeeStatuses.has(status)
      ) {
        return null;
      }

      return {
        allowedBucketId,
        id: cleanText(item.id, 120) || `payee_${allowedBucketId}`,
        maxCents: controlPlanIntegerCents(item.maxCents),
        name: cleanText(item.name, 80) || "Approved payee",
        status,
      };
    })
    .filter(Boolean);

  return payees.length ? payees : fallback;
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
  const planBuckets = normalizeControlPlanBuckets(record.buckets, buckets);
  const planPayees = normalizeControlPlanPayees(record.payees, payees, planBuckets);
  const bucketIds = new Set(planBuckets.map((bucket) => bucket.id));
  const preferredBucket = controlPlanBucketId(record.preferredTransferBucketId);
  const defaultBucket = defaultControlTransferBucket(planBuckets, planPayees);
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
      buckets: planBuckets,
      employerName: cleanText(record.employerName, 80) || "Payroll deposit",
      expectedFrequency: normalizeControlPlanFrequency(record.expectedFrequency),
      payees: planPayees,
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
    shortfallCents: planBuckets.reduce((sum, bucket) => sum + bucket.shortCents, 0),
  };
}

function buildHouseholdControlFundingSchedule(allocation) {
  const protectedSchedule = allocation.buckets.map((bucket, index) => {
    const status =
      bucket.projectedFundingCents >= bucket.targetCents
        ? "funded"
        : bucket.projectedFundingCents > 0
          ? "partial"
          : "waiting";

    return {
      amountCents: bucket.projectedFundingCents,
      bucketId: bucket.bucketId,
      due: bucket.due,
      key: `bucket:${bucket.bucketId}`,
      label: bucket.name,
      protection: bucket.protection,
      sequence: index + 1,
      shortCents: bucket.shortCents,
      status,
      targetCents: bucket.targetCents,
      type: "protected_bucket",
    };
  });

  return [
    ...protectedSchedule,
    {
      amountCents: allocation.projectedSafeToSpendCents,
      bucketId: "safe_spending",
      due: "Remainder",
      key: "safe_to_spend",
      label: "Safe to Spend",
      protection: "spendable",
      sequence: protectedSchedule.length + 1,
      shortCents: 0,
      status: "safe_to_spend",
      targetCents: 0,
      type: "safe_to_spend",
    },
  ];
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
  const planBuckets = planInput.buckets;
  const planPayees = planInput.payees;
  const allocation = buildHouseholdControlAllocation(
    planBuckets,
    planInput.paycheckAmountCents,
  );
  const fundingSchedule = buildHouseholdControlFundingSchedule(allocation);
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
    buckets: planBuckets,
    moneyRails: body.moneyRails,
    payees: planPayees,
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
        planBuckets === buckets && body.controls?.bucketPersistence?.persistence === "postgres"
          ? "durable"
          : planBuckets === buckets
            ? "customizable_now"
            : "workspace_profile",
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
      fundingSchedule,
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
        bucketPersistence:
          planBuckets === buckets
            ? (body.controls?.bucketPersistence?.persistence ?? "memory")
            : "workspace_profile",
        ledger: body.ledger.source,
        payeePersistence:
          planPayees === payees
            ? (body.controls?.payeePersistence?.persistence ?? "memory")
            : "workspace_profile",
      },
      summary: {
        approvedPayeeCount: planPayees.filter((payee) => payee.status === "approved").length,
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
        shortfallCents: allocation.shortfallCents,
        totalStepCount: operatingSteps.length,
      },
      support: body.support,
      transferPlan,
    },
    status: 200,
  };
}

function cleanProfileDate(value) {
  const raw = cleanText(value, 24);

  if (!raw) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return null;
  }

  const date = new Date(`${raw}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === raw
    ? raw
    : null;
}

function normalizeHouseholdMoneyProfileInput(payload = {}) {
  const record = safeObject(payload);
  const errors = [];
  const employerName = cleanText(record.employerName, 80) || "Payroll deposit";
  const expectedFrequency = normalizedPaycheckRuleFrequency(
    record.expectedFrequency,
  );
  const paycheckAmountCents = toIntegerCents(record.paycheckAmountCents, {
    max: 2_000_000,
    min: 10_000,
  });
  const requestedTransferCents = toIntegerCents(
    record.requestedTransferCents ?? 0,
    {
      max: 500_000,
      min: 0,
    },
  );
  const nextPayday = cleanProfileDate(record.nextPayday);

  if (paycheckAmountCents === null) {
    errors.push("paycheckAmountCents must be integer cents from 10000 to 2000000.");
  }

  if (requestedTransferCents === null) {
    errors.push("requestedTransferCents must be integer cents from 0 to 500000.");
  }

  if (record.nextPayday && !nextPayday) {
    errors.push("nextPayday must use YYYY-MM-DD.");
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
      bankConnectionId: cleanText(record.bankConnectionId, 120) || null,
      detectionRuleId: cleanText(record.detectionRuleId, 120) || null,
      employerName,
      expectedFrequency,
      idempotencyKey: cleanText(record.idempotencyKey, 120),
      metadata: {
        configuredFrom: "payshield_app",
        profileVersion: 1,
      },
      nextPayday,
      paycheckAmountCents: paycheckAmountCents ?? 300_000,
      preferredPayeeId: cleanText(record.preferredPayeeId, 120) || null,
      preferredTransferBucketId:
        cleanText(record.preferredTransferBucketId, 120) || null,
      requestedTransferCents: requestedTransferCents ?? 0,
      source: "app_profile",
    },
    ok: true,
  };
}

function profileToControlPlanInput(profile) {
  return {
    employerName: profile.employerName,
    expectedFrequency: profile.expectedFrequency,
    paycheckAmountCents: profile.paycheckAmountCents,
    preferredPayeeId: profile.preferredPayeeId,
    preferredTransferBucketId: profile.preferredTransferBucketId,
    requestedTransferCents: profile.requestedTransferCents,
    ruleName: `${profile.employerName || "Primary"} paycheck`,
  };
}

function defaultHouseholdMoneyProfile() {
  return {
    bankConnectionId: null,
    detectionRuleId: null,
    employerName: "Payroll deposit",
    expectedFrequency: "biweekly",
    idempotencyKey: null,
    nextPayday: null,
    paycheckAmountCents: 300_000,
    preferredPayeeId: neobankPayees[0]?.id ?? null,
    preferredTransferBucketId: "rent",
    requestedTransferCents: 25_000,
    source: "core_control_model",
  };
}

async function ensureDurableBucketProfile(actorInput, env = process.env) {
  const actor = normalizeActor(actorInput);
  const existing = await loadBucketProfile(actor.householdId, env);

  if (persistenceFailed(existing)) {
    return {
      ok: false,
      persistence: existing,
    };
  }

  if (existing.persistence === "postgres" && existing.profileFound) {
    return {
      buckets: existing.profile,
      ok: true,
      persistence: existing,
      seeded: false,
    };
  }

  if (existing.persistence === "memory") {
    return {
      buckets: neobankBuckets.filter(
        (bucket) => bucket.id !== "safe_spending",
      ),
      ok: true,
      persistence: existing,
      seeded: false,
    };
  }

  const buckets = neobankBuckets.filter(
    (bucket) => bucket.id !== "safe_spending",
  );
  const persistence = await persistBucketProfile(
    {
      actorUserId: actor.id,
      betaAccessStatus: actor.profileAccess,
      buckets,
      clerkSubject: actor.clerkSubject,
      householdId: actor.householdId,
      idempotencyKey: `default-bucket-profile:${actor.householdId}`,
      kycStatus: actor.kycStatus,
      userEmail: actor.email,
      userName: actor.name,
    },
    env,
  );

  return {
    buckets,
    ok:
      persistence.persistence === "postgres" &&
      persistence.persisted === true,
    persistence,
    seeded: true,
  };
}

function bucketProfileRequiredResult(profileSetup, service) {
  return {
    body: {
      code: "bucket_profile_required",
      error: "Your protected buckets could not be prepared. Try again before continuing.",
      persistence: profileSetup.persistence,
      service,
    },
    status: 503,
  };
}

export async function getHouseholdMoneyProfile(
  env = process.env,
  actorInput = demoUser,
) {
  const actorResolution = await resolveActorIdentity(
    env,
    actorInput,
    "household money profile lookup",
  );

  if (!actorResolution.ok) {
    return actorResolution.result;
  }

  const actor = actorResolution.actor;
  const persistence = await loadHouseholdMoneyProfile(actor.householdId, env);

  if (persistenceFailed(persistence)) {
    return {
      body: {
        error: "Household money profile could not be loaded from durable core controls.",
        persistence,
        readiness: getCoreReadiness(env, { coreOnline: true }),
        service: "payshield-household-money-profile",
      },
      status: 503,
    };
  }

  const profile = persistence.profileFound
    ? persistence.profile
    : defaultHouseholdMoneyProfile();
  const controlPlan = await getHouseholdControlPlan(
    env,
    actor,
    profileToControlPlanInput(profile),
  );

  return {
    body: {
      controlPlan: controlPlan.status === 200 ? controlPlan.body : null,
      household: {
        authMode: actor.authMode,
        email: actor.email,
        householdId: actor.householdId,
        name: actor.name,
        userId: actor.id,
      },
      message: persistence.profileFound
        ? "Household money profile loaded from durable core controls."
        : "Household money profile loaded from the core control model.",
      persisted: Boolean(persistence.profileFound),
      persistence,
      profile,
      profilePersistence: persistence.profileFound
        ? "durable_core"
        : "core_service_model",
      service: "payshield-household-money-profile",
    },
    status: 200,
  };
}

export async function saveHouseholdMoneyProfile(payload, env = process.env) {
  const actor = actorFromPayload(payload);
  const normalized = normalizeHouseholdMoneyProfileInput(payload);

  if (!normalized.ok) {
    return {
      body: {
        errors: normalized.errors,
        service: "payshield-household-money-profile",
      },
      status: 400,
    };
  }

  const profileInput = normalized.input;
  const profileSetup = await ensureDurableBucketProfile(actor, env);

  if (!profileSetup.ok) {
    return bucketProfileRequiredResult(
      profileSetup,
      "payshield-household-money-profile",
    );
  }

  const persistence = await persistHouseholdMoneyProfile(
    {
      actorUserId: actor.id,
      betaAccessStatus: actor.profileAccess,
      clerkSubject: actor.clerkSubject,
      householdId: actor.householdId,
      kycStatus: actor.kycStatus,
      userEmail: actor.email,
      userName: actor.name,
      ...profileInput,
    },
    env,
  );

  if (persistence.persistence === "control_conflict") {
    return {
      body: {
        code: persistence.code,
        error:
          "Choose an active bucket, approved destination, and household-owned account settings.",
        persistence,
        service: "payshield-household-money-profile",
      },
      status: 409,
    };
  }

  if (persistenceFailed(persistence)) {
    return {
      body: {
        error: "Household money profile could not be persisted.",
        persistence,
        readiness: getCoreReadiness(env, { coreOnline: true }),
        service: "payshield-household-money-profile",
      },
      status: 503,
    };
  }

  const persisted = persistence.persistence === "postgres";
  const profile = persistence.profile || profileInput;
  const controlPlan = await getHouseholdControlPlan(
    env,
    actor,
    profileToControlPlanInput(profile),
  );

  return {
    body: {
      controlPlan: controlPlan.status === 200 ? controlPlan.body : null,
      message: persisted
        ? "Household money profile saved to durable core controls."
        : "Household money profile validated by the core control model.",
      persisted,
      persistence,
      profile,
      profilePersistence: persisted ? "durable_core" : "core_service_model",
      service: "payshield-household-money-profile",
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

function buildOperatingCockpit(
  env,
  snapshot,
  commercialAccess,
  moneyRails,
  protectedCents,
  safeToSpendCents,
  activationPlan,
  revenueAndRails,
) {
  const railsByKey = new Map(revenueAndRails.rails.map((rail) => [rail.key, rail]));
  const stageByKey = new Map(
    activationPlan.stages.map((stage) => [stage.key, stage]),
  );
  const priceLabel = commercialAccess.priceLabel || "$19/month";
  const commercialReady = commercialActivationReady(env, commercialAccess);
  const transactionRail = railsByKey.get("transaction_sync");
  const moneyMovementStage = stageByKey.get("money_movement");
  const cardControlStage = stageByKey.get("card_control");
  const lanes = [
    {
      blockers: commercialActivationMissing(env),
      canRunNow: commercialAccess.readyForCheckout,
      key: "revenue",
      label: "Charge household",
      ownerAction:
        "Configure Stripe checkout, webhook signing, and core activation.",
      primaryEndpoint: "POST /api/app/billing/checkout",
      ready: commercialReady,
      state: commercialReady
        ? "paid_access_active"
        : commercialAccess.readyForCheckout
          ? "checkout_available"
          : "stripe_setup_required",
      userAction: `Subscribe at ${priceLabel}`,
      value: priceLabel,
    },
    {
      blockers: uniqueList(railsByKey.get("bank_connection")?.blockers ?? []),
      canRunNow: moneyRails.bankLinkReady,
      key: "bank_connection",
      label: "Connect bank",
      ownerAction:
        "Open Plaid Link and vault the provider token outside the browser.",
      primaryEndpoint: "POST /api/app/bank-link/token",
      ready: moneyRails.bankLinkReady,
      state:
        railsByKey.get("bank_connection")?.state ??
        (moneyRails.bankLinkReady ? "ready" : "setup_needed"),
      userAction: "Connect external funding source",
      value: moneyRails.plaidEnv || "plaid",
    },
    {
      blockers: uniqueList(transactionRail?.blockers ?? []),
      canRunNow: moneyRails.transactionSyncReady,
      key: "transaction_sync",
      label: "Sync activity",
      ownerAction:
        "Use linked-bank transaction sync to find payroll-like deposits.",
      primaryEndpoint: "POST /api/app/paychecks/sync",
      ready: moneyRails.transactionSyncReady,
      state:
        transactionRail?.state ??
        (moneyRails.transactionSyncReady ? "ready" : "setup_needed"),
      userAction: "Sync linked-bank activity",
      value: moneyRails.detectionMode,
    },
    {
      blockers: uniqueList(
        stageByKey.get("paycheck_detection")?.requiredGates ?? [],
      ),
      canRunNow:
        moneyRails.paycheckDetectionReady || moneyRails.transactionSyncReady,
      key: "paycheck_detection",
      label: "Detect paycheck",
      ownerAction:
        "Turn payroll deposits into balanced protected-bucket journal entries.",
      primaryEndpoint: "POST /api/app/paychecks/detect",
      ready: moneyRails.paycheckDetectionReady,
      state: stageByKey.get("paycheck_detection")?.status ?? "setup_needed",
      userAction: "Run paycheck detection",
      value: `${Math.round(
        (protectedCents / Math.max(1, protectedCents + safeToSpendCents)) * 100,
      )}% protected`,
    },
    {
      blockers: [],
      canRunNow: true,
      key: "protection_rules",
      label: "Protect funds",
      ownerAction:
        "Customize buckets, payees, due cadence, priorities, and unlock rules.",
      primaryEndpoint: "POST /api/app/buckets",
      ready: true,
      state: snapshot.readiness.postgresSchemaVerified ? "durable" : "control_model",
      userAction: "Save bucket profile",
      value: `${protectedCents} protected cents`,
    },
    {
      blockers: uniqueList(moneyMovementStage?.requiredGates ?? []),
      canRunNow: true,
      key: "money_movement",
      label: "Move protected funds",
      ownerAction:
        "Validate bucket balance, payee approval, and provider handoff before release.",
      primaryEndpoint: "POST /api/app/transfers",
      ready: moneyRails.transferReady,
      state: moneyMovementStage?.status ?? "intent_validation_active",
      userAction: "Create transfer intent",
      value: moneyRails.transferReady ? "provider ready" : "intent validation",
    },
    {
      blockers: uniqueList(cardControlStage?.requiredGates ?? []),
      canRunNow: true,
      key: "card_control",
      label: "Control spending",
      ownerAction:
        "Approve only Safe to Spend and configured biller exceptions.",
      primaryEndpoint: "POST /api/card/authorize",
      ready: snapshot.readiness.liveMoneyReady,
      state: cardControlStage?.status ?? "ledger_decisions_active",
      userAction: "Check card swipe",
      value: `${safeToSpendCents} safe cents`,
    },
  ];
  const nextLane =
    lanes.find((lane) => !lane.ready) ??
    lanes.find((lane) => lane.canRunNow) ??
    lanes[0];

  return {
    blockerCount: lanes.reduce(
      (total, lane) => total + lane.blockers.length,
      0,
    ),
    headline: "Charge -> connect -> detect -> protect -> move",
    lanes,
    mode: snapshot.readiness.liveMoneyReady ? "live_money" : "credential_gated",
    moneySummary: {
      priceLabel,
      protectedCents,
      safeToSpendCents,
      totalCents: protectedCents + safeToSpendCents,
    },
    nextAction: {
      blockers: nextLane.blockers,
      canRunNow: nextLane.canRunNow,
      key: nextLane.key,
      label: nextLane.label,
      ownerAction: nextLane.ownerAction,
      primaryEndpoint: nextLane.primaryEndpoint,
      state: nextLane.state,
      userAction: nextLane.userAction,
    },
    proof: {
      activationEndpoint: "/api/app/activation",
      auditEndpoint: "/api/app/audit/export",
      operationsEndpoint: "/api/app/operations",
      supportContact: "support@graystontechnologies.com",
    },
    readyLaneCount: lanes.filter((lane) => lane.ready).length,
    service: "payshield-operating-cockpit",
    totalLaneCount: lanes.length,
  };
}

function buildCommercialOperatingState(
  env,
  snapshot,
  commercialAccess,
  moneyRails,
  protectedCents,
  safeToSpendCents,
) {
  const liveMoneyMissing = missingCoreGates(snapshot.readiness);
  const revenueBlockers = commercialActivationMissing(env);
  const bankBlockers = uniqueList(
    moneyRails.missing.filter(
      (gate) =>
        gate.includes("PLAID") ||
        gate.includes("TOKEN_VAULT") ||
        gate.includes("token vault"),
    ),
  );
  const detectionBlockers = uniqueList(
    moneyRails.missing.filter(
      (gate) =>
        gate.includes("PLAID") ||
        gate.includes("TOKEN_VAULT") ||
        gate.includes("PROVIDER_WEBHOOK"),
    ),
  );
  const movementBlockers = uniqueList([
    ...moneyRails.missing.filter(
      (gate) =>
        gate.includes("TRANSFER") ||
        gate.includes("transfer") ||
        gate.includes("PAYSHIELD_BAAS"),
    ),
    ...moneyRails.providerAdapterMissing,
    ...liveMoneyMissing,
  ]);
  const commercialReady = commercialActivationReady(env, commercialAccess);
  const rails = [
    {
      blockers: revenueBlockers,
      canRunNow: commercialAccess.readyForCheckout,
      endpoint: "POST /api/app/billing/checkout",
      key: "revenue",
      label: "Collect household subscription",
      ownerSwitch: "Stripe Checkout + webhook + core paid-access activation",
      provider: "Stripe",
      ready: commercialReady,
      state: commercialReady
        ? "paid_access_active"
        : commercialAccess.readyForCheckout
          ? "payment_collection_ready"
          : "stripe_setup_required",
      userOutcome:
        "Household payment creates the commercial access record that unlocks money workflows.",
    },
    {
      blockers: bankBlockers,
      canRunNow: moneyRails.bankLinkReady,
      endpoint: "POST /api/app/bank-link/token",
      key: "bank_connection",
      label: "Connect the household bank",
      ownerSwitch: "Plaid credentials + signed token vault + encrypted custody",
      provider: "Plaid Link",
      ready: moneyRails.bankLinkReady,
      state: moneyRails.bankLinkReady
        ? "bank_link_ready"
        : moneyRails.plaidConfigured
          ? "token_custody_needed"
          : "plaid_setup_required",
      userOutcome:
        "User-approved bank connection is exchanged for a server-side token custody reference.",
    },
    {
      blockers: detectionBlockers,
      canRunNow:
        moneyRails.paycheckDetectionReady || moneyRails.transactionSyncReady,
      endpoint: "POST /api/app/paychecks/sync",
      key: "paycheck_detection",
      label: "Detect payroll and split buckets",
      ownerSwitch: "Payroll rules + Plaid sync/provider events + durable ledger",
      provider:
        moneyRails.detectionMode === "plaid_transactions_sync"
          ? "Plaid Transactions"
          : "Provider events",
      ready: moneyRails.paycheckDetectionReady,
      state: moneyRails.paycheckDetectionReady
        ? "automatic_detection_ready"
        : moneyRails.transactionSyncReady
          ? "sync_ready_rule_gate"
          : "detection_setup_required",
      userOutcome:
        "Income posts to the ledger, funds protected buckets first, then computes Safe to Spend.",
    },
    {
      blockers: [],
      canRunNow: true,
      endpoint: "POST /api/app/buckets",
      key: "protection_rules",
      label: "Customize protected buckets",
      ownerSwitch: "Bucket targets + priority + payees + unlock rules",
      provider: "PayShield ledger",
      ready: true,
      state: snapshot.readiness.postgresSchemaVerified
        ? "durable_controls_ready"
        : "editable_control_model",
      userOutcome:
        "Households define exactly which obligations get protected before spending.",
    },
    {
      blockers: movementBlockers,
      canRunNow: moneyRails.transferReady,
      endpoint: "POST /api/app/transfers",
      key: "money_movement",
      label: "Move only approved protected money",
      ownerSwitch: "Transfer/BaaS provider + live-money evidence gates",
      provider: "BaaS or transfer adapter",
      ready: moneyRails.transferReady,
      state: moneyRails.transferReady
        ? "provider_handoff_ready"
        : moneyRails.transferConfigured
          ? "live_gates_needed"
          : "intent_validation_only",
      userOutcome:
        "Provider handoff is created only after bucket balance and destination checks pass.",
    },
    {
      blockers: liveMoneyMissing,
      canRunNow: snapshot.readiness.liveMoneyReady,
      endpoint: "POST /api/card/authorize",
      key: "card_control",
      label: "Approve only Safe to Spend",
      ownerSwitch: "Card gateway + live-money evidence gates",
      provider: "Card authorization gateway",
      ready: snapshot.readiness.liveMoneyReady,
      state: snapshot.readiness.liveMoneyReady
        ? "gateway_ready"
        : "ledger_decision_path_ready",
      userOutcome:
        "Card swipes approve from Safe to Spend or an approved biller bucket, then decline everything else.",
    },
  ];
  const nextRail = rails.find((rail) => !rail.ready) ?? rails[0];

  return {
    activeRailCount: rails.filter((rail) => rail.ready).length,
    headline: "Subscribe -> connect bank -> detect paycheck -> protect -> release",
    mode: snapshot.readiness.liveMoneyReady
      ? "live_money_operating"
      : commercialAccess.readyForCheckout
        ? "revenue_ready_provider_gated"
        : "commercial_setup_required",
    moneySummary: {
      priceLabel: commercialAccess.priceLabel,
      protectedCents,
      safeToSpendCents,
      totalCents: protectedCents + safeToSpendCents,
    },
    nextRail: {
      blockers: nextRail.blockers,
      endpoint: nextRail.endpoint,
      key: nextRail.key,
      label: nextRail.label,
      ownerSwitch: nextRail.ownerSwitch,
      state: nextRail.state,
    },
    rails,
    revenueModel: {
      billingProvider: "Stripe",
      checkoutEndpoint: "POST /api/app/billing/checkout",
      checkoutMode: commercialAccess.mode,
      canActivatePaidAccess: commercialReady,
      canCollectPayment: commercialAccess.readyForCheckout,
      priceLabel: commercialAccess.priceLabel,
      publicCheckoutEndpoint: "POST /api/public/billing/checkout",
      webhookEndpoint: "/api/app/billing/webhook",
    },
    service: "payshield-commercial-operating-state",
    totalRailCount: rails.length,
  };
}

function buildGuidedMoneyFlow(
  snapshot,
  commercialAccess,
  moneyRails,
  protectedCents,
  safeToSpendCents,
  env,
) {
  const liveMoneyMissing = missingCoreGates(snapshot.readiness);
  const revenueBlockers = commercialActivationMissing(env);
  const bankBlockers = uniqueList(
    moneyRails.missing.filter(
      (gate) =>
        gate.includes("PLAID") ||
        gate.includes("TOKEN_VAULT") ||
        gate.includes("token vault"),
    ),
  );
  const detectionBlockers = uniqueList(
    moneyRails.missing.filter(
      (gate) =>
        gate.includes("PLAID") ||
        gate.includes("TOKEN_VAULT") ||
        gate.includes("PROVIDER_WEBHOOK"),
    ),
  );
  const coreLedgerBlockers = liveMoneyMissing.filter((gate) =>
    ["postgres_ledger", "dedicated_backend", "core_service_auth"].includes(gate),
  );
  const movementBlockers = uniqueList([
    ...moneyRails.missing.filter(
      (gate) =>
        gate.includes("TRANSFER") ||
        gate.includes("transfer") ||
        gate.includes("PAYSHIELD_BAAS"),
    ),
    ...moneyRails.providerAdapterMissing,
    ...liveMoneyMissing,
  ]);
  const commercialReady = commercialActivationReady(env, commercialAccess);
  const steps = [
    {
      blockers: revenueBlockers,
      canRunNow: commercialAccess.readyForCheckout,
      endpoint: "POST /api/app/billing/checkout",
      evidence:
        "Checkout session, signed webhook event, and durable paid-access record.",
      key: "commercial_access",
      label: "Earn",
      ownerAction:
        "Set Stripe Checkout, webhook signing, and core activation so paid access is recorded automatically.",
      primaryAction: "Start checkout",
      ready: commercialReady,
      runMode: commercialReady
        ? "live_revenue"
        : commercialAccess.readyForCheckout
          ? "payment_collection"
          : "setup_required",
      status: commercialReady
        ? "paid_access_active"
        : commercialAccess.readyForCheckout
          ? "checkout_ready"
          : "stripe_setup_required",
      title: "Charge the household",
      userOutcome:
        "PayShield can collect the household subscription before private money controls open.",
      uiTarget: "money-operations",
    },
    {
      blockers: bankBlockers,
      canRunNow: moneyRails.bankLinkReady,
      endpoint: "POST /api/app/bank-link/token",
      evidence:
        "Plaid Link token, public-token exchange, masked account, and token vault reference.",
      key: "bank_connection",
      label: "Connect",
      ownerAction:
        "Configure Plaid, token-vault handoff, webhook signing, and encrypted custody.",
      primaryAction: "Connect bank",
      ready: moneyRails.bankLinkReady,
      runMode: moneyRails.bankLinkReady ? "provider_live" : "setup_required",
      status: moneyRails.bankLinkReady
        ? "bank_link_ready"
        : moneyRails.plaidConfigured
          ? "token_custody_needed"
          : "plaid_setup_required",
      title: "Connect the funding source",
      userOutcome:
        "The household authorizes the external account PayShield will inspect for income and release rules.",
      uiTarget: "money-operations",
    },
    {
      blockers: uniqueList([...liveMoneyMissing, ...movementBlockers]),
      canRunNow: snapshot.readiness.liveMoneyReady,
      endpoint: "POST /api/app/direct-deposit",
      evidence:
        "Provider account opening record, masked routing instructions, and household routing status.",
      key: "direct_deposit",
      label: "Route",
      ownerAction:
        "Connect the account/card provider before direct-deposit instructions are shown to households.",
      primaryAction: "Set paycheck routing",
      ready: snapshot.readiness.liveMoneyReady,
      runMode: snapshot.readiness.liveMoneyReady ? "provider_live" : "provider_gate",
      status: snapshot.readiness.liveMoneyReady
        ? "routing_ready"
        : "provider_activation_required",
      title: "Route paychecks into PayShield",
      userOutcome:
        "Payroll lands inside the controlled account path before ordinary spending can reach it.",
      uiTarget: "money-operations",
    },
    {
      blockers: uniqueList([...detectionBlockers, ...coreLedgerBlockers]),
      canRunNow:
        moneyRails.transactionSyncReady || moneyRails.paycheckDetectionReady,
      endpoint: "POST /api/app/paychecks/sync",
      evidence:
        "Saved payroll rule, synced transaction cursor, provider event, and idempotent detection record.",
      key: "transaction_sync",
      label: "Detect",
      ownerAction:
        "Wire Plaid transaction sync and durable core storage so payroll activity becomes paycheck detections.",
      primaryAction: "Sync bank activity",
      ready: moneyRails.transactionSyncReady,
      runMode: moneyRails.transactionSyncReady
        ? "provider_live"
        : "setup_required",
      status: moneyRails.transactionSyncReady
        ? "sync_ready"
        : moneyRails.bankLinkReady
          ? "core_storage_needed"
          : "bank_link_needed",
      title: "Recognize payroll deposits",
      userOutcome:
        "Provider activity is converted into paycheck events PayShield can split into protected buckets.",
      uiTarget: "money-operations",
    },
    {
      blockers: uniqueList([...detectionBlockers, ...coreLedgerBlockers]),
      canRunNow: moneyRails.paycheckDetectionReady,
      endpoint: "POST /api/app/paychecks/detect",
      evidence:
        "Balanced journal entry, bucket funding record, and recalculated Safe to Spend.",
      key: "paycheck_detection",
      label: "Split",
      ownerAction:
        "Activate signed provider events and durable ledger writes before automatic paycheck splits run.",
      primaryAction: "Run paycheck split",
      ready: moneyRails.paycheckDetectionReady,
      runMode: moneyRails.paycheckDetectionReady ? "ledger_live" : "core_gate",
      status: moneyRails.paycheckDetectionReady
        ? "automatic_detection_ready"
        : moneyRails.transactionSyncReady
          ? "rule_gate"
          : "core_required",
      title: "Split income before spending",
      userOutcome:
        "Rent, vehicle, insurance, and custom obligations fund before Safe to Spend is updated.",
      uiTarget: "money-operations",
    },
    {
      blockers: [],
      canRunNow: true,
      endpoint: "POST /api/app/buckets",
      evidence:
        "Bucket profile, priority order, payee assignments, unlock rules, and audit export.",
      key: "protected_buckets",
      label: "Protect",
      ownerAction:
        "Let the household customize buckets, targets, due cadence, payees, and release controls.",
      primaryAction: "Edit buckets",
      ready: true,
      runMode: snapshot.readiness.postgresSchemaVerified
        ? "durable_controls"
        : "control_model",
      status: snapshot.readiness.postgresSchemaVerified
        ? "durable_controls_ready"
        : "customizable_now",
      title: "Customize protected buckets",
      userOutcome:
        "The household decides exactly what gets protected before everyday spending.",
      uiTarget: "bucket-studio",
    },
    {
      blockers: movementBlockers,
      canRunNow: moneyRails.transferReady,
      endpoint: "POST /api/app/transfers",
      evidence:
        "Transfer intent, approved payee, source bucket validation, provider handoff, and reconciliation record.",
      key: "protected_transfer",
      label: "Release",
      ownerAction:
        "Configure the transfer/BaaS adapter and live-money gates before provider movement executes.",
      primaryAction: "Create transfer intent",
      ready: moneyRails.transferReady,
      runMode: moneyRails.transferReady ? "provider_live" : "intent_gate",
      status: moneyRails.transferReady
        ? "provider_handoff_ready"
        : moneyRails.transferConfigured
          ? "live_gates_needed"
          : "intent_validation_only",
      title: "Release only approved money",
      userOutcome:
        "Protected funds move only to approved destinations after bucket and provider checks pass.",
      uiTarget: "money-operations",
    },
    {
      blockers: liveMoneyMissing,
      canRunNow: snapshot.readiness.liveMoneyReady,
      endpoint: "POST /api/card/authorize",
      evidence:
        "Authorization request, Safe-to-Spend decision, approved biller exception, and audit record.",
      key: "card_control",
      label: "Spend",
      ownerAction:
        "Attach the card gateway only after provider, ledger, counsel, and runbook gates pass.",
      primaryAction: "Check card swipe",
      ready: snapshot.readiness.liveMoneyReady,
      runMode: snapshot.readiness.liveMoneyReady ? "gateway_live" : "ledger_gate",
      status: snapshot.readiness.liveMoneyReady
        ? "gateway_ready"
        : "ledger_decision_path_ready",
      title: "Approve only Safe to Spend",
      userOutcome:
        "Every card decision is answered from Safe to Spend or an approved bill-only bucket.",
      uiTarget: "card-authorization",
    },
  ];
  const nextStep = steps.find((step) => !step.ready) ?? steps[0];
  const readyStepCount = steps.filter((step) => step.ready).length;
  const availableNowCount = steps.filter((step) => step.canRunNow).length;

  return {
    headline: "Pay -> connect -> route -> detect -> protect -> release",
    mode: snapshot.readiness.liveMoneyReady
      ? "live_money_flow"
      : commercialAccess.readyForCheckout
        ? "revenue_ready_provider_gated"
        : "setup_to_revenue",
    nextStep: {
      blockers: nextStep.blockers,
      canRunNow: nextStep.canRunNow,
      endpoint: nextStep.endpoint,
      key: nextStep.key,
      label: nextStep.label,
      primaryAction: nextStep.primaryAction,
      runMode: nextStep.runMode,
      status: nextStep.status,
      title: nextStep.title,
      uiTarget: nextStep.uiTarget,
    },
    progress: {
      availableNowCount,
      blockedStepCount: steps.filter((step) => step.blockers.length > 0).length,
      percent: Math.round((readyStepCount / Math.max(1, steps.length)) * 100),
      readyStepCount,
      totalStepCount: steps.length,
    },
    service: "payshield-guided-money-flow",
    steps,
    summary:
      "One guided operating path collects revenue, links the funding source, identifies payroll, funds protected buckets first, and releases only approved money.",
    totals: {
      priceLabel: commercialAccess.priceLabel,
      protectedCents,
      safeToSpendCents,
      totalCents: protectedCents + safeToSpendCents,
    },
  };
}

function buildActivationRunway(
  snapshot,
  commercialAccess,
  moneyRails,
  protectedCents,
  safeToSpendCents,
  guidedMoneyFlow,
  env,
) {
  const guidedStepByKey = new Map(
    guidedMoneyFlow.steps.map((step) => [step.key, step]),
  );
  const priceLabel = commercialAccess.priceLabel || "$19/month";
  const coreGateMissing = missingCoreGates(snapshot.readiness);
  const durableEvidenceReady =
    snapshot.readiness.postgresSchemaVerified &&
    snapshot.readiness.backendConfigured &&
    moneyRails.transactionSyncReady;
  const liveDecisionReady =
    snapshot.readiness.liveMoneyReady && moneyRails.transferReady;
  const milestones = [
    {
      blockers: commercialActivationMissing(env),
      canRunNow: commercialAccess.readyForCheckout,
      customerOutcome:
        "The household pays for access before private money controls unlock.",
      endpoint: "POST /api/app/billing/checkout",
      key: "first_revenue",
      label: "Earn",
      operatorOutcome:
        "Stripe checkout, webhook signing, and core activation create the paid-access record.",
      primaryAction: "Start checkout",
      proofArtifacts: [
        "checkout_intent",
        "signed_stripe_webhook",
        "commercial_access_record",
      ],
      ready: commercialActivationReady(env, commercialAccess),
      revenueImpact: `Starts ${priceLabel} household revenue.`,
      setupAction:
        "Configure Stripe secret, price or payment link, webhook secret, and core service auth.",
      title: "Collect the first paid household",
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
      customerOutcome:
        "The household links the external account PayShield will inspect for income.",
      endpoint: "POST /api/app/bank-link/token",
      key: "first_bank_connection",
      label: "Connect",
      operatorOutcome:
        "Plaid Link exchanges the public token and stores only server-side custody references in app records.",
      primaryAction: "Connect bank",
      proofArtifacts: [
        "link_token",
        "public_token_exchange",
        "token_vault_reference",
      ],
      ready: moneyRails.bankLinkReady,
      revenueImpact:
        "Turns a paid signup into an account that can reach paycheck protection.",
      setupAction:
        "Configure Plaid credentials, signed token-vault handoff, and encrypted token custody.",
      title: "Connect the funding source",
    },
    {
      blockers: uniqueList([
        ...moneyRails.missing.filter(
          (gate) =>
            gate.includes("PLAID") ||
            gate.includes("TOKEN_VAULT") ||
            gate.includes("PROVIDER_WEBHOOK"),
        ),
        ...coreGateMissing.filter((gate) =>
          ["postgres_ledger", "dedicated_backend", "core_service_auth"].includes(
            gate,
          ),
        ),
      ]),
      canRunNow:
        moneyRails.paycheckDetectionReady || moneyRails.transactionSyncReady,
      customerOutcome:
        "Payroll activity becomes a paycheck event before Safe to Spend changes.",
      endpoint: "POST /api/app/paychecks/sync",
      key: "first_detected_paycheck",
      label: "Detect",
      operatorOutcome:
        "Transaction sync, provider events, and idempotency keys create a durable detection record.",
      primaryAction: "Sync bank activity",
      proofArtifacts: [
        "paycheck_rule",
        "transaction_sync_cursor",
        "idempotent_detection_record",
      ],
      ready: moneyRails.paycheckDetectionReady,
      revenueImpact:
        "Creates the first visible protection moment after a household pays.",
      setupAction:
        "Configure transaction sync, provider webhook signing, durable core storage, and detection rules.",
      title: "Recognize payroll automatically",
    },
    {
      blockers: [],
      canRunNow: true,
      customerOutcome:
        "The household chooses protected categories, target amounts, priorities, payees, and unlock rules.",
      endpoint: "POST /api/app/buckets",
      key: "first_protection_profile",
      label: "Protect",
      operatorOutcome:
        "Bucket profiles define what must be funded before ordinary spending updates.",
      primaryAction: "Edit buckets",
      proofArtifacts: [
        "bucket_profile",
        "payee_assignments",
        "safe_to_spend_preview",
      ],
      ready: true,
      revenueImpact:
        "Gives the product its immediate value even before live provider movement opens.",
      setupAction:
        "No provider setup required for configuration; durable ledger evidence requires the core database.",
      title: "Customize the protection rules",
    },
    {
      blockers: durableEvidenceReady
        ? []
        : uniqueList(
            ["postgres_ledger", "dedicated_backend", "core_service_auth"].filter(
              (gate) => coreGateMissing.includes(gate),
            ),
          ),
      canRunNow: durableEvidenceReady,
      customerOutcome:
        "A paycheck split is provable, reversible, and auditable without mutating posted journal entries.",
      endpoint: "GET /api/app/audit/export",
      key: "first_audit_proof",
      label: "Prove",
      operatorOutcome:
        "Postgres ledger, core auth, and sync events prove every balance and exception path.",
      primaryAction: "Export audit",
      proofArtifacts: [
        "balanced_journal_entry",
        "bucket_balance_snapshot",
        "audit_export",
      ],
      ready: durableEvidenceReady,
      revenueImpact:
        "Creates support, compliance, and household trust evidence for retention.",
      setupAction:
        "Deploy the always-on core, verify Postgres schema 0019, and require durable storage.",
      title: "Prove the ledger evidence",
    },
    {
      blockers: liveDecisionReady
        ? []
        : uniqueList([
            ...moneyRails.providerAdapterMissing,
            ...moneyRails.missing.filter(
              (gate) =>
                gate.includes("TRANSFER") ||
                gate.includes("transfer") ||
                gate.includes("PAYSHIELD_BAAS"),
            ),
            ...coreGateMissing,
          ]),
      canRunNow: liveDecisionReady,
      customerOutcome:
        "Approved transfers and card decisions release only Safe to Spend or assigned bill money.",
      endpoint: "POST /api/card/authorize",
      key: "first_live_decision",
      label: "Release",
      operatorOutcome:
        "Provider adapter, card gateway, counsel approvals, runbooks, and ledger checks answer live-money decisions.",
      primaryAction: "Check card swipe",
      proofArtifacts: [
        "safe_to_spend_authorization",
        "approved_biller_exception",
        "provider_reconciliation_record",
      ],
      ready: liveDecisionReady,
      revenueImpact:
        "Completes the product promise households pay for: protected money cannot be casually spent.",
      setupAction:
        "Configure the BaaS/card provider, transfer adapter, sponsor approvals, counsel signoff, runbooks, and live-money gate.",
      title: "Authorize real-world release",
    },
  ];
  const nextMilestone =
    milestones.find((milestone) => !milestone.ready) ?? milestones[0];
  const readyMilestoneCount = milestones.filter((milestone) => milestone.ready).length;
  const runnableMilestoneCount = milestones.filter(
    (milestone) => milestone.canRunNow,
  ).length;

  return {
    customerPath: [
      "Pay for access",
      "Connect funding source",
      "Confirm paycheck rules",
      "Customize buckets and payees",
      "Review Safe to Spend",
      "Release only approved money",
    ],
    headline: "Collect revenue, connect money, prove protection.",
    milestones,
    mode: liveDecisionReady
      ? "live_decision_ready"
      : commercialAccess.readyForCheckout
        ? "selling_with_provider_setup"
        : "setup_to_first_payment",
    nextMilestone: {
      blockers: nextMilestone.blockers,
      canRunNow: nextMilestone.canRunNow,
      endpoint: nextMilestone.endpoint,
      key: nextMilestone.key,
      label: nextMilestone.label,
      primaryAction: nextMilestone.primaryAction,
      revenueImpact: nextMilestone.revenueImpact,
      setupAction: nextMilestone.setupAction,
      title: nextMilestone.title,
    },
    ownerPath: [
      "Configure Stripe and core access activation",
      "Turn on Clerk household identity",
      "Configure Plaid and token custody",
      "Verify Postgres ledger schema 0019",
      "Connect BaaS/card provider adapter",
      "Record counsel, sponsor, and runbook approvals before live money",
    ],
    proof: {
      activationEndpoint: "/api/app/activation",
      auditEndpoint: "/api/app/audit/export",
      healthEndpoint: "/api/health",
      operationsEndpoint: "/api/app/operations",
      productionStatusCommand:
        "npm run smoke:deploy -- https://payshield-lime.vercel.app && npm run production:routes -- https://payshield-lime.vercel.app",
      requiredBeforeLiveMoney: uniqueList([
        ...coreGateMissing,
        ...moneyRails.providerAdapterMissing,
        ...moneyRails.missing,
      ]),
    },
    progress: {
      blockedMilestoneCount: milestones.filter(
        (milestone) => milestone.blockers.length > 0,
      ).length,
      percent: Math.round(
        (readyMilestoneCount / Math.max(1, milestones.length)) * 100,
      ),
      readyMilestoneCount,
      runnableMilestoneCount,
      totalMilestoneCount: milestones.length,
    },
    service: "payshield-activation-runway",
    syncedWithGuidedFlow: {
      nextGuidedStep: guidedMoneyFlow.nextStep.key,
      protectedBucketStatus:
        guidedStepByKey.get("protected_buckets")?.status ?? "unknown",
      releaseStatus:
        guidedStepByKey.get("protected_transfer")?.status ?? "unknown",
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
  const safeToSpendCents = safeSpend?.availableCents ?? 0;
  const activationPlan = buildActivationPlan(
    env,
    snapshot,
    commercialAccess,
    moneyRails,
  );
  const revenueAndRails = buildRevenueAndRails(
    env,
    snapshot,
    commercialAccess,
    moneyRails,
    protectedCents,
    safeToSpendCents,
  );
  const operatingCockpit = buildOperatingCockpit(
    env,
    snapshot,
    commercialAccess,
    moneyRails,
    protectedCents,
    safeToSpendCents,
    activationPlan,
    revenueAndRails,
  );
  const commercialOperatingState = buildCommercialOperatingState(
    env,
    snapshot,
    commercialAccess,
    moneyRails,
    protectedCents,
    safeToSpendCents,
  );
  const guidedMoneyFlow = buildGuidedMoneyFlow(
    snapshot,
    commercialAccess,
    moneyRails,
    protectedCents,
    safeToSpendCents,
    env,
  );
  const activationRunway = buildActivationRunway(
    snapshot,
    commercialAccess,
    moneyRails,
    protectedCents,
    safeToSpendCents,
    guidedMoneyFlow,
    env,
  );

  return {
    body: {
      balances: {
        protectedCents,
        safeToSpendCents,
        totalCents: protectedCents + safeToSpendCents,
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
        authMode: actor.authMode,
        clerkSubject: actor.clerkSubject,
        email: actor.email,
        householdId: actor.householdId,
        kycStatus: actor.kycStatus,
        name: actor.name,
        profileAccess: actor.profileAccess,
        userId: actor.id,
      },
      commercialAccess,
      activationPlan,
      activationRunway,
      commercialOperatingState,
      guidedMoneyFlow,
      revenueAndRails,
      operatingCockpit,
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
      commercialOperatingState: body.commercialOperatingState,
      guidedMoneyFlow: body.guidedMoneyFlow,
      moneyRails: body.moneyRails,
      operatingCockpit: body.operatingCockpit,
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
        `npm run smoke:deploy -- ${siteUrl}`,
        `npm run production:routes -- ${siteUrl}`,
        'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:verify',
      ],
    },
    service: "payshield-activation-console",
    support: body.support,
    activationRunway: body.activationRunway,
    commercialOperatingState: body.commercialOperatingState,
    guidedMoneyFlow: body.guidedMoneyFlow,
    operatingCockpit: body.operatingCockpit,
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
      activationRunway: body.activationRunway,
      commercialAccess: body.commercialAccess,
      commercialOperatingState: body.commercialOperatingState,
      guidedMoneyFlow: body.guidedMoneyFlow,
      revenueAndRails: body.revenueAndRails,
      operatingCockpit: body.operatingCockpit,
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
  const snapshot = createNeobankSnapshot(new LedgerBook(), env, {}, actor);
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
    const ledger = await loadHouseholdLedger(env, actor, { buckets });

    if (ledger.error) {
      return ledger.error;
    }

    return {
      body: {
        buckets: buildBucketBalances(ledger.book, buckets),
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

    if (persistence.persistence === "control_conflict") {
      const blockedNames = (persistence.blockedBuckets || [])
        .map((bucket) => bucket.name)
        .filter(Boolean)
        .join(", ");

      return {
        body: {
          blockedBuckets: persistence.blockedBuckets || [],
          buckets: profile,
          error: blockedNames
            ? `Move funds and finish or reassign active controls before removing ${blockedNames}.`
            : "Move funds and finish or reassign active controls before removing this bucket.",
          persistence,
          protectedCents,
          readiness: getCoreReadiness(env, { coreOnline: true }),
          service: "payshield-bucket-controls",
        },
        status: 409,
      };
    }

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

function directDepositInstructionsFromSetup(setup = {}) {
  return {
    accountLast4: setup.accountLast4 || "----",
    accountName: setup.accountName || "PayShield protected paycheck account",
    providerStatus: setup.providerStatus || "gated",
    routingLast4: setup.routingLast4 || "----",
  };
}

function directDepositSetupMatchesInput(
  existingSetup = {},
  requestedSetup = {},
  { allowBlockedUpgrade = false } = {},
) {
  if (allowBlockedUpgrade && existingSetup.status === "blocked") {
    return true;
  }

  for (const key of [
    "providerName",
    "providerAccountId",
    "providerCustomerId",
  ]) {
    if (existingSetup[key] && requestedSetup[key] && existingSetup[key] !== requestedSetup[key]) {
      return false;
    }
  }

  return true;
}

function directDepositSetupCanResumeProvider(setup = {}) {
  return ["blocked", "provider_pending", "requested"].includes(setup.status);
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

function normalizedProviderKycStatus(value) {
  const status = safeString(value, 40).toLowerCase();

  if (["approved", "verified", "complete", "completed", "passed"].includes(status)) {
    return "approved";
  }

  if (["rejected", "denied", "failed", "declined"].includes(status)) {
    return "rejected";
  }

  if (["manual_review", "review", "under_review"].includes(status)) {
    return "manual_review";
  }

  if (["expired", "abandoned"].includes(status)) {
    return "expired";
  }

  if (["submitted", "pending", "provider_pending", "started"].includes(status)) {
    return status === "pending" ? "provider_pending" : status;
  }

  return "started";
}

function appKycStatus(providerStatus) {
  if (providerStatus === "approved") {
    return "approved";
  }

  if (providerStatus === "rejected" || providerStatus === "expired") {
    return "rejected";
  }

  if (providerStatus === "manual_review") {
    return "manual_review";
  }

  return providerStatus === "submitted" ? "submitted" : "provider_pending";
}

async function providerStartKyc(
  env,
  actor,
  providerCustomerId,
  idempotencyKey = `kyc:${actor.id}`,
) {
  const payload = await providerAdapterRequest(
    env,
    "startKyc",
    getProviderAdapterConfig(env).endpoints.kyc,
    {
      email: actor.email,
      idempotencyKey,
      name: actor.name,
      providerCustomerId,
      userId: actor.id,
    },
  );

  const status = normalizedProviderKycStatus(
    payload?.status || payload?.kycStatus || payload?.applicationStatus,
  );
  const hostedVerification = safeObject(payload?.hostedVerification);
  const verificationUrl = cleanProviderHostedUrl(
    payload?.verificationUrl ||
      payload?.applicationUrl ||
      payload?.onboardingUrl ||
      payload?.redirectUrl ||
      payload?.url ||
      hostedVerification.url,
    env,
  );

  if (["started", "provider_pending"].includes(status) && !verificationUrl) {
    throw new ProviderAdapterError(
      "Provider KYC response did not include a secure verification URL.",
    );
  }

  return {
    expiresAt: cleanProviderHostedExpiry(
      payload?.expiresAt ||
        payload?.expiration ||
        payload?.verificationExpiresAt ||
        hostedVerification.expiresAt,
    ),
    providerApplicationId: requireProviderField(
      payload,
      ["providerApplicationId", "applicationId"],
      "Provider KYC response did not include an application id.",
    ),
    providerRequestId: providerRequestId(payload) || undefined,
    status,
    verificationUrl: verificationUrl || null,
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
    status: ["active", "restricted", "suspended", "closed"].includes(
      safeString(payload?.status, 40).toLowerCase(),
    )
      ? safeString(payload.status, 40).toLowerCase()
      : "opened",
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
    status: ["active", "frozen", "closed"].includes(
      safeString(payload?.status, 40).toLowerCase(),
    )
      ? safeString(payload.status, 40).toLowerCase()
      : "issued",
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

function cleanProviderHostedUrl(value, env) {
  const raw = safeString(value, 2_000);

  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    const localHttp =
      url.protocol === "http:" &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname) &&
      env.VERCEL_ENV !== "production";

    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !localHttp)
    ) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function cleanProviderHostedExpiry(value) {
  const raw = safeString(value, 80);

  if (!raw) {
    return null;
  }

  const timestamp = Date.parse(raw);

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizedProviderPayeeStatus(value) {
  const status = safeString(value, 40).toLowerCase();

  if (["approved", "active", "verified", "complete", "completed"].includes(status)) {
    return "approved";
  }

  if (["rejected", "denied", "failed", "declined"].includes(status)) {
    return "rejected";
  }

  return "provider_pending";
}

async function providerStartPayeeEnrollment(env, input) {
  const payload = await providerAdapterRequest(
    env,
    "startPayeeVerification",
    getProviderAdapterConfig(env).endpoints.payeeEnrollment,
    input,
  );
  const providerPayeeId = requireProviderField(
    payload,
    ["providerPayeeId", "payeeId"],
    "Provider payee response did not include a payee id.",
  );
  const status = normalizedProviderPayeeStatus(
    payload?.status || payload?.verificationStatus,
  );
  const enrollmentUrl = cleanProviderHostedUrl(
    payload?.enrollmentUrl || payload?.verificationUrl || payload?.url,
    env,
  );

  if (status === "provider_pending" && !enrollmentUrl) {
    throw new ProviderAdapterError(
      "Provider payee response did not include a secure enrollment URL.",
    );
  }

  return {
    enrollmentUrl: enrollmentUrl || null,
    providerPayeeId,
    status,
  };
}

async function providerCancelBillPayment(env, input) {
  const payload = await providerAdapterRequest(
    env,
    "cancelBillPayment",
    getProviderAdapterConfig(env).endpoints.billPaymentCancel,
    input,
  );
  const status = safeString(payload?.status, 40).toLowerCase();

  if (status && !["canceled", "cancelled"].includes(status)) {
    throw new ProviderAdapterError(
      "Provider did not confirm the bill payment cancellation.",
    );
  }

  return {
    providerBillPaymentId: input.providerBillPaymentId,
    status: "canceled",
  };
}

async function providerSetCardStatus(env, input) {
  const payload = await providerAdapterRequest(
    env,
    "updateCardStatus",
    getProviderAdapterConfig(env).endpoints.cardStatus,
    input,
  );
  const status = safeString(payload?.status, 40).toLowerCase();

  if (status !== input.status) {
    throw new ProviderAdapterError(
      "Provider did not confirm the requested card status.",
    );
  }

  return {
    providerCardId: input.providerCardId,
    status,
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
  const profileSetup = await ensureDurableBucketProfile(actor, env);

  if (!profileSetup.ok) {
    return bucketProfileRequiredResult(
      profileSetup,
      "payshield-direct-deposit-setup",
    );
  }

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
    status: liveGate.ok ? "provider_pending" : "blocked",
    userId: actor.id,
  };
  let persistence = await persistDirectDepositSetup(setup, env);

  if (persistenceFailed(persistence)) {
    return {
      body: {
        directDeposit,
        error:
          "Direct deposit setup could not be persisted before provider execution.",
        liveMoney: liveGate,
        persistence,
        readiness,
        service: "payshield-direct-deposit-setup",
      },
      status: 503,
    };
  }

  let persistedSetup = persistence.setup || setup;
  let replayedReadySetup = false;

  if (
    persistence.replayed &&
    !directDepositSetupMatchesInput(persistedSetup, setup, {
      allowBlockedUpgrade: liveGate.ok,
    })
  ) {
    return {
      body: {
        error:
          "Direct deposit setup idempotency key already belongs to a different provider account.",
        liveMoney: liveGate,
        persistence,
        readiness,
        service: "payshield-direct-deposit-setup",
        setup: persistedSetup,
      },
      status: 409,
    };
  }

  directDeposit = directDepositInstructionsFromSetup(persistedSetup);

  if (liveGate.ok) {
    if (persistence.replayed && persistedSetup.status === "ready") {
      replayedReadySetup = true;
    } else {
      if (!directDepositSetupCanResumeProvider(persistedSetup)) {
        return {
          body: {
            error:
              "Direct deposit setup cannot resume provider execution from its durable status.",
            liveMoney: liveGate,
            persistence,
            readiness,
            service: "payshield-direct-deposit-setup",
            setup: persistedSetup,
          },
          status: 409,
        };
      }

      if (persistence.replayed && persistedSetup.status !== "provider_pending") {
        const pendingPersistence =
          await updateDirectDepositSetupProviderStatus(
            {
              ...setup,
              metadata: {
                liveMoneyReady: readiness.liveMoneyReady,
                resumedAt: new Date().toISOString(),
                source: "payshield_app",
              },
              status: "provider_pending",
            },
            env,
          );

        if (persistenceFailed(pendingPersistence)) {
          return {
            body: {
              error:
                "Direct deposit setup could not be marked pending before provider execution.",
              liveMoney: liveGate,
              persistence: pendingPersistence,
              readiness,
              service: "payshield-direct-deposit-setup",
              setup: persistedSetup,
            },
            status: 503,
          };
        }

        persistence = pendingPersistence;
        persistedSetup = persistence.setup || {
          ...setup,
          status: "provider_pending",
        };
        directDeposit = directDepositInstructionsFromSetup(persistedSetup);
      }

      try {
        directDeposit = await providerCreateDirectDepositInstructions(
          env,
          providerAccountId,
        );
      } catch (error) {
        const failurePersistence =
          await updateDirectDepositSetupProviderStatus(
            {
              ...setup,
              accountLast4: directDeposit.accountLast4,
              accountName: directDeposit.accountName,
              metadata: {
                failureCode: "provider_adapter_error",
                failedAt: new Date().toISOString(),
                liveMoneyReady: readiness.liveMoneyReady,
                source: "payshield_app",
              },
              providerStatus: directDeposit.providerStatus,
              routingLast4: directDeposit.routingLast4,
              status: "blocked",
            },
            env,
          );
        const exceptionPersistence = await recordMoneyRailProviderException(
          {
            actor,
            error,
            idempotencyKey,
            operation: "createDirectDepositInstructions",
            rail: "direct_deposit",
          },
          env,
        );
        const result = providerErrorResult(
          error,
          "payshield-direct-deposit-setup",
        );

        return {
          body: {
            ...result.body,
            exceptionPersistence,
            failurePersistence,
            liveMoney: liveGate,
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

      persistence = await updateDirectDepositSetupProviderStatus(
        {
          ...setup,
          accountLast4: directDeposit.accountLast4,
          accountName: directDeposit.accountName,
          metadata: {
            liveMoneyReady: readiness.liveMoneyReady,
            providerCompletedAt: new Date().toISOString(),
            source: "payshield_app",
          },
          providerStatus: directDeposit.providerStatus,
          routingLast4: directDeposit.routingLast4,
          status: "ready",
        },
        env,
      );

      if (persistenceFailed(persistence)) {
        return {
          body: {
            directDeposit,
            error:
              "Provider direct-deposit instructions were created but the durable setup could not be updated.",
            liveMoney: liveGate,
            persistence,
            readiness,
            service: "payshield-direct-deposit-setup",
          },
          status: 503,
        };
      }

      persistedSetup = persistence.setup || {
        ...setup,
        accountLast4: directDeposit.accountLast4,
        accountName: directDeposit.accountName,
        providerStatus: directDeposit.providerStatus,
        routingLast4: directDeposit.routingLast4,
        status: "ready",
      };
    }
  }

  const setupStatus = liveGate.ok ? "ready" : persistedSetup.status;
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
        status: setupStatus,
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
      message: replayedReadySetup
        ? "Direct deposit setup replayed from the durable provider instructions without another provider request."
        : liveGate.ok
          ? "Paycheck routing instructions are ready for the configured provider account."
          : "Paycheck routing setup recorded. Provider activation is required before live instructions are released.",
      persisted: persistence.persistence === "postgres",
      persistence,
      readiness,
      service: "payshield-direct-deposit-setup",
      setup: persistedSetup,
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
  const profileSetup = await ensureDurableBucketProfile(actor, env);

  if (!profileSetup.ok) {
    return bucketProfileRequiredResult(
      profileSetup,
      "payshield-provider-onboarding",
    );
  }

  const providerName =
    getProviderAdapterConfig(env).providerName || "payshield";

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

  if (blocked) {
    return {
      body: {
        card,
        customer,
        directDeposit,
        financialAccount,
        kyc,
        liveMoney: liveGate,
        message:
          "Account setup is unavailable until the required banking services are active.",
        profileAccess: actor.profileAccess,
      },
      status: 423,
    };
  }

  const persistenceInput = (state = {}) => ({
    actorUserId: actor.id,
    betaAccessStatus: actor.profileAccess,
    clerkSubject: actor.clerkSubject,
    householdId: actor.householdId,
    kycStatus: state.kyc
      ? appKycStatus(state.kyc.status)
      : actor.kycStatus,
    providerName,
    userEmail: actor.email,
    userName: actor.name,
    ...state,
  });
  const current = await loadProviderOnboardingState(
    actor.householdId,
    providerName,
    env,
  );

  if (persistenceFailed(current) || !current.state) {
    return {
      body: {
        error: "Account setup state could not be loaded.",
        liveMoney: liveGate,
        persistence: current,
        readiness,
        service: "payshield-provider-onboarding",
      },
      status: 503,
    };
  }

  ({ card, customer, directDeposit, financialAccount, kyc } = current.state);

  try {
    if (!customer) {
      customer = await providerCreateCustomer(env, actor);
      const persistedCustomer = await persistProviderOnboardingState(
        persistenceInput({ customer }),
        env,
      );

      if (persistenceFailed(persistedCustomer) || !persistedCustomer.state) {
        return {
          body: {
            error: "Customer setup could not be saved.",
            liveMoney: liveGate,
            persistence: persistedCustomer,
            readiness,
            service: "payshield-provider-onboarding",
          },
          status: 503,
        };
      }

      ({ card, customer, directDeposit, financialAccount, kyc } =
        persistedCustomer.state);
    }

    const hostedVerificationExpired = Boolean(
      kyc?.expiresAt && Date.parse(kyc.expiresAt) <= Date.now(),
    );
    const hostedVerificationMissing = Boolean(
      kyc &&
        ["started", "provider_pending"].includes(kyc.status) &&
        !kyc.verificationUrl,
    );
    const restartIdentityVerification = Boolean(
      kyc?.status === "expired" ||
        hostedVerificationExpired ||
        hostedVerificationMissing,
    );

    if (!kyc || restartIdentityVerification) {
      const startedKyc = await providerStartKyc(
        env,
        actor,
        customer.providerCustomerId,
        restartIdentityVerification
          ? `kyc:${actor.id}:restart:${kyc?.providerApplicationId || "missing"}`
          : `kyc:${actor.id}`,
      );
      const persistedKyc = await persistProviderOnboardingState(
        persistenceInput({
          kyc: {
            ...startedKyc,
            providerCustomerId: customer.providerCustomerId,
          },
        }),
        env,
      );

      if (persistenceFailed(persistedKyc) || !persistedKyc.state) {
        return {
          body: {
            error: "Identity verification state could not be saved.",
            liveMoney: liveGate,
            persistence: persistedKyc,
            readiness,
            service: "payshield-provider-onboarding",
          },
          status: 503,
        };
      }

      ({ card, customer, directDeposit, financialAccount, kyc } =
        persistedKyc.state);
    }

    if (kyc.status === "rejected" || kyc.status === "expired") {
      return {
        body: {
          card,
          customer,
          directDeposit,
          financialAccount,
          kyc,
          liveMoney: liveGate,
          message:
            kyc.status === "expired"
              ? "Identity verification expired. Start a new review to continue."
              : "Identity verification needs support review before setup can continue.",
          profileAccess: actor.profileAccess,
          service: "payshield-provider-onboarding",
        },
        status: 409,
      };
    }

    if (kyc.status !== "approved") {
      return {
        body: {
          card,
          customer,
          directDeposit,
          financialAccount,
          kyc,
          liveMoney: liveGate,
          message: "Identity verification is in progress.",
          profileAccess: actor.profileAccess,
          service: "payshield-provider-onboarding",
        },
        status: 202,
      };
    }

    if (!financialAccount) {
      const openedAccount = await providerOpenFinancialAccount(
        env,
        customer.providerCustomerId,
      );
      const persistedAccount = await persistProviderOnboardingState(
        persistenceInput({
          financialAccount: {
            ...openedAccount,
            providerCustomerId: customer.providerCustomerId,
          },
        }),
        env,
      );

      if (persistenceFailed(persistedAccount) || !persistedAccount.state) {
        return {
          body: {
            error: "Account state could not be saved.",
            liveMoney: liveGate,
            persistence: persistedAccount,
            readiness,
            service: "payshield-provider-onboarding",
          },
          status: 503,
        };
      }

      ({ card, customer, directDeposit, financialAccount, kyc } =
        persistedAccount.state);
    }

    if (!directDeposit || directDeposit.status !== "ready") {
      const directDepositResult = await createDirectDepositSetup(
        {
          __payshieldActor: actor,
          idempotencyKey: `onboarding-direct-deposit-${actor.householdId}`,
          providerAccountId: financialAccount.providerAccountId,
          providerCustomerId: customer.providerCustomerId,
          providerName,
        },
        env,
      );

      if (directDepositResult.status >= 400) {
        return directDepositResult;
      }

      directDeposit =
        directDepositResult.body.setup ||
        directDepositResult.body.directDeposit ||
        directDeposit;
    }

    if (!card) {
      const issuedCard = await providerIssueCard(
        env,
        actor,
        financialAccount.providerAccountId,
      );
      const persistedCard = await persistProviderOnboardingState(
        persistenceInput({
          card: {
            ...issuedCard,
            providerAccountId: financialAccount.providerAccountId,
          },
        }),
        env,
      );

      if (persistenceFailed(persistedCard) || !persistedCard.state) {
        return {
          body: {
            error: "Card state could not be saved.",
            liveMoney: liveGate,
            persistence: persistedCard,
            readiness,
            service: "payshield-provider-onboarding",
          },
          status: 503,
        };
      }

      ({ card, customer, directDeposit, financialAccount, kyc } =
        persistedCard.state);
    }
  } catch (error) {
    const exceptionPersistence = await recordMoneyRailProviderException(
      {
        actor,
        amountCents: null,
        error,
        idempotencyKey: `onboarding:${actor.id}`,
        operation: "startOnboarding",
        rail: "provider_onboarding",
      },
      env,
    );
    const result = providerErrorResult(error, "payshield-provider-onboarding");

    return {
      body: {
        ...result.body,
        exceptionPersistence,
        liveMoney: liveGate,
        readiness,
      },
      status: persistenceFailed(exceptionPersistence) ? 503 : result.status,
    };
  }

  return {
    body: {
      card,
      customer,
      directDeposit,
      financialAccount,
      kyc,
      liveMoney: liveGate,
      message: "Account and card setup are complete.",
      profileAccess: actor.profileAccess,
      service: "payshield-provider-onboarding",
    },
    status: 200,
  };
}

export async function setCardStatus(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const status = cleanText(payload?.status, 40).toLowerCase();

  if (!["active", "frozen"].includes(status)) {
    return {
      body: { error: "Card status must be active or frozen." },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "card controls",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;
  const providerName = getProviderAdapterConfig(env).providerName;
  const current = await loadProviderOnboardingState(
    actor.householdId,
    providerName,
    env,
  );

  if (
    persistenceFailed(current) ||
    current.persistence !== "postgres" ||
    !current.state
  ) {
    return {
      body: {
        error: "Card controls are unavailable.",
        persistence: current,
        service: "payshield-card-controls",
      },
      status: 503,
    };
  }

  const card = current.state.card;

  if (!card) {
    return {
      body: {
        error: "No issued card was found.",
        service: "payshield-card-controls",
      },
      status: 404,
    };
  }

  if (card.status === "closed") {
    return {
      body: {
        error: "A closed card cannot be reactivated.",
        service: "payshield-card-controls",
      },
      status: 409,
    };
  }

  if (card.status === status) {
    return {
      body: {
        card,
        message: status === "frozen" ? "Card is already frozen." : "Card is already active.",
        replayed: true,
      },
      status: 200,
    };
  }

  const idempotencyKey =
    cleanText(payload?.idempotencyKey, 120) ||
    `card-status:${card.providerCardId}:${status}`;
  let providerCard;

  try {
    providerCard = await providerSetCardStatus(env, {
      idempotencyKey,
      providerCardId: card.providerCardId,
      status,
    });
  } catch (error) {
    const exceptionPersistence = await recordMoneyRailProviderException(
      {
        actor,
        amountCents: null,
        error,
        idempotencyKey,
        operation: "updateCardStatus",
        rail: "card",
      },
      env,
    );
    const result = providerErrorResult(error, "payshield-card-controls");

    return {
      body: {
        ...result.body,
        exceptionPersistence,
      },
      status: persistenceFailed(exceptionPersistence) ? 503 : result.status,
    };
  }

  const persistence = await updateProviderCardStatus(
    {
      householdId: actor.householdId,
      providerCardId: card.providerCardId,
      status: providerCard.status,
      userId: actor.id,
    },
    env,
  );

  if (persistenceFailed(persistence) || !persistence.found) {
    const exceptionPersistence = await recordMoneyRailProviderException(
      {
        actor,
        amountCents: null,
        error: new Error(
          "Provider card status changed but the local card record did not update.",
        ),
        idempotencyKey: `card-status-commit:${card.providerCardId}:${status}`,
        operation: "updateCardStatus",
        rail: "card",
      },
      env,
    );

    return {
      body: {
        error: "Card status changed but could not be confirmed locally.",
        exceptionPersistence,
        persistence,
        service: "payshield-card-controls",
      },
      status: 503,
    };
  }

  return {
    body: {
      card: persistence.card,
      message: status === "frozen" ? "Card frozen." : "Card activated.",
      persistence,
    },
    status: 200,
  };
}

function payeeIdForHousehold(householdId, name) {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "payee";
  const digest = createHash("sha256")
    .update(`${householdId}:${slug}`)
    .digest("hex")
    .slice(0, 32);

  return `payee_${digest}`;
}

async function beginPayeeVerification(actor, payee, idempotencyKey, env) {
  const providerName = getProviderAdapterConfig(env).providerName;
  const enrollment = await providerStartPayeeEnrollment(env, {
    allowedBucketId: payee.allowedBucketId,
    idempotencyKey,
    maxCents: payee.maxCents,
    name: payee.name,
    payeeId: payee.id,
    userId: actor.id,
  });
  const persistence = await updatePayeeProviderStatus(
    {
      householdId: actor.householdId,
      idempotencyKey: `payee-enrollment:${idempotencyKey}`,
      payeeId: payee.id,
      providerName,
      providerPayeeId: enrollment.providerPayeeId,
      status: enrollment.status,
      userId: actor.id,
    },
    env,
  );

  if (persistenceFailed(persistence) || !persistence.found) {
    throw new ProviderAdapterError(
      "Payee verification started but could not be confirmed locally.",
    );
  }

  return {
    ...enrollment,
    payee: persistence.payee,
    persistence,
  };
}

export async function startPayeeVerification(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const payeeId = cleanText(payload?.payeeId, 120);

  if (!payeeId) {
    return {
      body: { error: "Provide payeeId." },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "payment destination verification",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;
  const providerConfig = getProviderAdapterConfig(env);

  if (!providerConfig.ok) {
    return {
      body: {
        code: "payee_verification_unavailable",
        error: "Payment destination verification is temporarily unavailable.",
        service: "payshield-payees",
      },
      status: 423,
    };
  }

  const lookup = await loadPayees(actor.householdId, env);

  if (persistenceFailed(lookup) || lookup.persistence !== "postgres") {
    return {
      body: {
        error: "Payment destinations are unavailable.",
        persistence: lookup,
        service: "payshield-payees",
      },
      status: 503,
    };
  }

  const payee = lookup.payees?.find((candidate) => candidate.id === payeeId);

  if (!payee) {
    return {
      body: {
        error: "Payment destination was not found.",
        service: "payshield-payees",
      },
      status: 404,
    };
  }

  if (payee.status === "approved") {
    return {
      body: {
        message: "Payment destination is ready.",
        payee,
        replayed: true,
      },
      status: 200,
    };
  }

  const idempotencyKey =
    cleanText(payload?.idempotencyKey, 120) ||
    `payee-verify:${payee.id}:${payee.allowedBucketId}:${payee.maxCents}`;

  try {
    const verification = await beginPayeeVerification(
      actor,
      payee,
      idempotencyKey,
      env,
    );

    return {
      body: {
        enrollmentUrl: verification.enrollmentUrl,
        message:
          verification.status === "approved"
            ? "Payment destination is ready."
            : "Continue with secure destination verification.",
        payee: verification.payee,
        persistence: verification.persistence,
        status: verification.status,
      },
      status: 200,
    };
  } catch (error) {
    const exceptionPersistence = await recordMoneyRailProviderException(
      {
        actor,
        amountCents: payee.maxCents,
        error,
        idempotencyKey,
        operation: "startPayeeVerification",
        payeeId,
        rail: "bill_payment",
        sourceBucketId: payee.allowedBucketId,
      },
      env,
    );
    const result = providerErrorResult(error, "payshield-payees");

    return {
      body: {
        ...result.body,
        exceptionPersistence,
        payee,
      },
      status: persistenceFailed(exceptionPersistence) ? 503 : result.status,
    };
  }
}

export async function createPayee(payload, env = process.env) {
  let actor = actorFromPayload(payload);
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

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "bill payment destinations",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;
  const profileSetup = await ensureDurableBucketProfile(actor, env);

  if (!profileSetup.ok) {
    return bucketProfileRequiredResult(profileSetup, "payshield-payees");
  }

  const readiness = getCoreReadiness(env, { coreOnline: true });
  const status = "provider_pending";
  const payee = {
    allowedBucketId: payload.allowedBucketId,
    id: payeeIdForHousehold(actor.householdId, name),
    maxCents,
    name,
    status,
  };
  const idempotencyKey =
    cleanText(payload?.idempotencyKey, 120) ||
    `payee-create:${payee.id}:${maxCents}`;
  const persistence = await persistPayee(
    {
      actorUserId: actor.id,
      allowedBucketId: payee.allowedBucketId,
      betaAccessStatus: actor.profileAccess,
      clerkSubject: actor.clerkSubject,
      householdId: actor.householdId,
      id: payee.id,
      idempotencyKey,
      kycStatus: actor.kycStatus,
      maxCents,
      name,
      status,
      userEmail: actor.email,
      userName: actor.name,
    },
    env,
  );

  if (persistence.persistence === "control_conflict") {
    return {
      body: {
        code: persistence.code,
        error: "Save and select an active protected bucket before adding this destination.",
        payee,
        persistence,
        readiness,
        service: "payshield-payees",
      },
      status: 409,
    };
  }

  if (persistenceFailed(persistence)) {
    return {
      body: {
        error: "Payment destination could not be saved.",
        payee,
        persistence,
        readiness,
        service: "payshield-payees",
      },
      status: 503,
    };
  }

  const persisted = persistence.persistence === "postgres";
  let verification = null;

  if (persisted && getProviderAdapterConfig(env).ok) {
    try {
      verification = await beginPayeeVerification(
        actor,
        persistence.payee || payee,
        `payee-verify:${idempotencyKey}`,
        env,
      );
    } catch (error) {
      await recordMoneyRailProviderException(
        {
          actor,
          amountCents: maxCents,
          error,
          idempotencyKey,
          operation: "startPayeeVerification",
          payeeId: payee.id,
          rail: "bill_payment",
          sourceBucketId: payee.allowedBucketId,
        },
        env,
      );
    }
  }

  return {
    body: {
      enrollmentUrl: verification?.enrollmentUrl || null,
      message: verification
        ? verification.status === "approved"
          ? "Payment destination is ready."
          : "Payment destination saved. Continue with secure verification."
        : persisted
          ? "Payment destination saved. Verification is pending."
          : "Payment destination prepared. Durable storage is required before verification.",
      payee: verification?.payee || persistence.payee || payee,
      persisted,
      persistence,
      readiness,
      verificationStatus:
        verification?.status || (persisted ? "provider_pending" : "local"),
    },
    status: 200,
  };
}

export async function updatePayee(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const payeeId = cleanText(payload?.payeeId, 120);
  const name = cleanText(payload?.name, 80);
  const maxCents = toIntegerCents(payload?.maxCents, { min: 1 });

  if (
    !payeeId ||
    !name ||
    !isBucketId(payload?.allowedBucketId) ||
    payload.allowedBucketId === "safe_spending" ||
    maxCents === null
  ) {
    return {
      body: {
        error:
          "Provide payeeId, name, a protected allowedBucketId, and integer maxCents.",
      },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "bill payment destinations",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;
  const persistence = await updatePayeeControl(
    {
      action: "update",
      actorUserId: actor.id,
      allowedBucketId: payload.allowedBucketId,
      betaAccessStatus: actor.profileAccess,
      clerkSubject: actor.clerkSubject,
      householdId: actor.householdId,
      idempotencyKey:
        cleanText(payload?.idempotencyKey, 120) ||
        `payee-update:${payeeId}:${payload.allowedBucketId}:${maxCents}`,
      kycStatus: actor.kycStatus,
      maxCents,
      name,
      payeeId,
      userEmail: actor.email,
      userName: actor.name,
    },
    env,
  );

  if (persistence.persistence === "control_conflict") {
    return {
      body: {
        code: persistence.code,
        error: "Select an active protected bucket before updating this destination.",
        persistence,
        service: "payshield-payees",
      },
      status: 409,
    };
  }

  if (persistenceFailed(persistence) || persistence.persistence !== "postgres") {
    return {
      body: {
        error: "Payment destination could not be updated.",
        persistence,
        service: "payshield-payees",
      },
      status: 503,
    };
  }

  if (!persistence.found) {
    return {
      body: {
        error: "Payment destination was not found.",
        service: "payshield-payees",
      },
      status: 404,
    };
  }

  return {
    body: {
      message: "Payment destination updated.",
      payee: persistence.payee,
      persistence,
    },
    status: 200,
  };
}

export async function archivePayee(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const payeeId = cleanText(payload?.payeeId, 120);

  if (!payeeId) {
    return {
      body: { error: "Provide payeeId." },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "bill payment destinations",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;
  const persistence = await updatePayeeControl(
    {
      action: "archive",
      actorUserId: actor.id,
      betaAccessStatus: actor.profileAccess,
      clerkSubject: actor.clerkSubject,
      householdId: actor.householdId,
      idempotencyKey:
        cleanText(payload?.idempotencyKey, 120) ||
        `payee-archive:${payeeId}`,
      kycStatus: actor.kycStatus,
      payeeId,
      userEmail: actor.email,
      userName: actor.name,
    },
    env,
  );

  if (persistence.persistence === "control_conflict") {
    return {
      body: {
        blockers: persistence.blockers,
        code: persistence.code,
        error:
          "Finish or reassign scheduled payments and preferred transfer settings before removing this destination.",
        persistence,
        service: "payshield-payees",
      },
      status: 409,
    };
  }

  if (persistenceFailed(persistence) || persistence.persistence !== "postgres") {
    return {
      body: {
        error: "Payment destination could not be removed.",
        persistence,
        service: "payshield-payees",
      },
      status: 503,
    };
  }

  if (!persistence.found) {
    return {
      body: {
        error: "Payment destination was not found.",
        service: "payshield-payees",
      },
      status: 404,
    };
  }

  return {
    body: {
      message: "Payment destination removed.",
      payeeId,
      persistence,
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
  const plaidWebhookConfigured = Boolean(cleanPlaidWebhookUrl(env));
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
    plaidWebhookConfigured &&
    vault.custodyReady &&
    neobank.backendConfigured &&
    neobank.postgresSchemaVerified;

  return {
    bankLinkReady: plaidConfigured && plaidWebhookConfigured && vault.custodyReady,
    detectionMode: plaidConfigured
      ? "plaid_transactions_sync"
      : "core_detection_required",
    paycheckDetectionReady:
      plaidConfigured && plaidWebhookConfigured && vault.custodyReady,
    liveMoneyReady: neobank.liveMoneyReady,
    missing: [
      ...(plaidConfigured ? [] : ["PLAID_CLIENT_ID", "PLAID_SECRET"]),
      ...(plaidConfigured && !plaidWebhookConfigured
        ? ["PLAID_WEBHOOK_URL"]
        : []),
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
    ],
    plaidConfigured,
    plaidEnv: env.PLAID_ENV?.trim() || "sandbox",
    plaidWebhookConfigured,
    plaidWebhookVerificationReady:
      plaidConfigured && plaidWebhookConfigured,
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

function cleanPlaidWebhookUrl(env = process.env) {
  const value = env.PLAID_WEBHOOK_URL?.trim();

  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname) &&
      env.NODE_ENV !== "production" &&
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

function plaidTimeoutMs(env = process.env) {
  const parsed = Number(env.PAYSHIELD_PLAID_TIMEOUT_MS);

  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 15_000
    ? parsed
    : 8_000;
}

async function plaidRequest(env, path, body) {
  let response;

  try {
    response = await fetch(`${plaidBaseUrl(env)}${path}`, {
      body: JSON.stringify({
        client_id: env.PLAID_CLIENT_ID?.trim() || "",
        secret: env.PLAID_SECRET?.trim() || "",
        ...body,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(plaidTimeoutMs(env)),
    });
  } catch {
    throw new Error("plaid_request_failed");
  }
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error("plaid_request_failed");
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

function decodeJwtSection(value) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function plaidVerificationKey(env, keyId) {
  const cached = plaidVerificationKeyCache.get(keyId);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (cached && cached.expiresAt > nowSeconds) {
    return cached.key;
  }

  let response;

  try {
    response = await plaidRequest(env, "/webhook_verification_key/get", {
      key_id: keyId,
    });
  } catch {
    throw new PlaidVerificationUnavailableError();
  }
  const jwk = response?.key;

  if (
    !jwk ||
    jwk.alg !== "ES256" ||
    jwk.crv !== "P-256" ||
    jwk.kid !== keyId ||
    jwk.kty !== "EC" ||
    jwk.use !== "sig" ||
    typeof jwk.x !== "string" ||
    typeof jwk.y !== "string"
  ) {
    throw new Error("invalid_plaid_verification_key");
  }

  const providerExpiry = Number(jwk.expired_at);
  const expiresAt = Number.isFinite(providerExpiry) && providerExpiry > 0
    ? Math.min(providerExpiry, nowSeconds + 86_400)
    : nowSeconds + 86_400;

  if (expiresAt <= nowSeconds) {
    throw new Error("expired_plaid_verification_key");
  }

  const key = await importJWK(jwk, "ES256");

  if (plaidVerificationKeyCache.size >= 8) {
    plaidVerificationKeyCache.delete(plaidVerificationKeyCache.keys().next().value);
  }

  plaidVerificationKeyCache.set(keyId, { expiresAt, key });
  return key;
}

async function verifyPlaidWebhookSignature(payload, env) {
  const rawBody =
    typeof payload.__payshieldProviderRawBody === "string"
      ? payload.__payshieldProviderRawBody.slice(0, 64 * 1024)
      : "";
  const token = safeString(payload.__payshieldPlaidVerification, 4096);

  if (!envPresent(env, "PLAID_CLIENT_ID") || !envPresent(env, "PLAID_SECRET")) {
    return {
      error: "Plaid webhook verification is not configured.",
      mode: "plaid_verification_unavailable",
      ok: false,
      status: 503,
    };
  }

  if (!rawBody || !token) {
    return {
      error: "Plaid webhook requires a signed raw body.",
      mode: "missing_plaid_signature",
      ok: false,
      status: 401,
    };
  }

  const sections = token.split(".");
  const header = sections.length === 3 ? decodeJwtSection(sections[0]) : null;
  const keyId = safeString(header?.kid, 160);

  if (!header || header.alg !== "ES256" || !keyId) {
    return {
      error: "Plaid webhook signature header is invalid.",
      mode: "invalid_plaid_signature_header",
      ok: false,
      status: 401,
    };
  }

  try {
    const key = await plaidVerificationKey(env, keyId);
    const verified = await jwtVerify(token, key, {
      algorithms: ["ES256"],
      clockTolerance: 5,
      maxTokenAge: "5 min",
    });
    const issuedAt = Number(verified.payload.iat);
    const claimedHash = safeString(
      verified.payload.request_body_sha256,
      128,
    ).toLowerCase();
    const actualHash = createHash("sha256").update(rawBody).digest("hex");
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (
      !Number.isInteger(issuedAt) ||
      issuedAt > nowSeconds + 5 ||
      nowSeconds - issuedAt > 300 ||
      !compareHexDigest(actualHash, claimedHash)
    ) {
      return {
        error: "Plaid webhook signature claims are invalid.",
        mode: "invalid_plaid_signature_claims",
        ok: false,
        status: 401,
      };
    }

    return {
      mode: "verified_plaid",
      ok: true,
    };
  } catch (error) {
    if (error instanceof PlaidVerificationUnavailableError) {
      return {
        error: "Plaid webhook verification is temporarily unavailable.",
        mode: "plaid_verification_unavailable",
        ok: false,
        status: 503,
      };
    }

    return {
      error: "Plaid webhook signature could not be verified.",
      mode: "invalid_plaid_signature",
      ok: false,
      status: 401,
    };
  }
}

async function verifyProviderWebhookSignature(
  payload,
  env = process.env,
  readiness,
  moneyReadiness,
) {
  if (
    payload.__payshieldProviderSource === "plaid" ||
    payload.__payshieldPlaidVerification
  ) {
    return verifyPlaidWebhookSignature(payload, env);
  }

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
  const platform = safeString(payload.platform, 20).toLowerCase();
  const isAndroid = platform === "android";
  const androidPackageName =
    safeString(env.PAYSHIELD_ANDROID_PACKAGE_NAME, 180) ||
    "com.graystontechnologies.payshield";
  const requestedAndroidPackageName = safeString(payload.androidPackageName, 180);
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

  if (
    isAndroid &&
    (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(
      androidPackageName,
    ) ||
      (requestedAndroidPackageName &&
        requestedAndroidPackageName !== androidPackageName))
  ) {
    return {
      body: {
        error: "Android package identity is not configured for PayShield Plaid Link.",
        service: "payshield-bank-link-token",
      },
      status: 400,
    };
  }

  const plaidPayload = await plaidRequest(env, "/link/token/create", {
    android_package_name: isAndroid ? androidPackageName : undefined,
    client_name: "PayShield",
    country_codes: cleanList(env.PLAID_COUNTRY_CODES, ["US"]),
    language: "en",
    products: cleanList(env.PLAID_PRODUCTS, ["auth", "transactions"]),
    redirect_uri: isAndroid
      ? undefined
      : env.PLAID_REDIRECT_URI?.trim() || undefined,
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
  let trustedBankConnection = null;

  if (payload[trustedPlaidWebhookSync] === true) {
    const providerItemId = safeString(payload.providerItemId, 240);

    if (!providerItemId) {
      return {
        body: {
          error: "Plaid webhook did not identify a linked bank item.",
          service: "payshield-paycheck-transaction-sync",
        },
        status: 400,
      };
    }

    const lookup = await loadBankConnectionForProvider(
      {
        providerAccountId: null,
        providerItemId,
        providerName: "plaid",
      },
      env,
    );

    if (persistenceFailed(lookup)) {
      return {
        body: {
          error: "Linked bank ownership could not be loaded for webhook sync.",
          service: "payshield-paycheck-transaction-sync",
        },
        status: 503,
      };
    }

    if (!lookup.bankConnection) {
      return {
        body: {
          error: "Plaid webhook could not be matched to a linked bank account.",
          service: "payshield-paycheck-transaction-sync",
        },
        status: 404,
      };
    }

    trustedBankConnection = lookup.bankConnection;
    actor = normalizeActor({
      householdId: trustedBankConnection.householdId,
      userId: trustedBankConnection.userId,
    });
  }

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
  const bankConnectionLookup = trustedBankConnection
    ? {
        bankConnection: trustedBankConnection,
        persisted: true,
        persistence: "postgres",
      }
    : await loadActiveBankConnectionForHousehold(
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
  } catch {
    const reason = "Bank transaction sync could not be completed.";
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
        [trustedPaycheckDetection]: true,
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

export async function processPlaidSyncJobs(
  env = process.env,
  { limit = 2, workerId = env.HOSTNAME || "payshield-core" } = {},
) {
  const claimed = await claimPlaidSyncJobs({ limit, workerId }, env);

  if (persistenceFailed(claimed)) {
    return {
      claimed: 0,
      completed: 0,
      failed: 0,
      persistence: claimed,
    };
  }

  let completed = 0;
  let failed = 0;

  for (const job of claimed.jobs || []) {
    const result = await syncLinkedBankPaychecks(
      {
        [trustedPlaidWebhookSync]: true,
        maxPages: 20,
        providerEventId: `${job.providerEventId}:sync`,
        providerItemId: job.providerItemId,
      },
      env,
    );
    let retryable = result.status >= 500 || result.status === 404;

    if (result.status < 400) {
      const completion = await completePlaidSyncJob(
        { id: job.id, workerId },
        env,
      );

      if (!persistenceFailed(completion) && completion.updated) {
        completed += 1;
        continue;
      }

      retryable = true;
    }

    const failure = await failPlaidSyncJob(
      {
        errorCode: retryable ? "sync_temporarily_unavailable" : "sync_blocked",
        id: job.id,
        retryable,
        workerId,
      },
      env,
    );

    if (!persistenceFailed(failure) && failure.updated) {
      failed += 1;
    }
  }

  return {
    claimed: claimed.jobs?.length || 0,
    completed,
    failed,
    persistence: {
      persisted: true,
      persistence: "postgres",
    },
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
          "Production gate evidence requires durable ledger storage and schema 0019 before approvals can be recorded.",
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

function paycheckReplayMatchesInput(existingDetection, input) {
  const existingProviderTransactionId =
    existingDetection.providerTransactionId || null;
  const inputProviderTransactionId = input.providerTransactionId || null;

  return (
    existingDetection.amountCents === input.amountCents &&
    existingDetection.employerName === input.employerName &&
    (!existingProviderTransactionId ||
      !inputProviderTransactionId ||
      existingProviderTransactionId === inputProviderTransactionId)
  );
}

function replayedPaycheckDetectionBody({
  existingDetection,
  readiness,
}) {
  const detection = {
    amountCents: existingDetection.amountCents,
    employerName: existingDetection.employerName,
    idempotencyKey: existingDetection.idempotencyKey,
    matchedRule: existingDetection.detectionRuleId
      ? {
          id: existingDetection.detectionRuleId,
          ruleName: null,
        }
      : null,
    mode: readiness.detectionMode,
    providerTransactionId: existingDetection.providerTransactionId,
    receivedAt: existingDetection.receivedAt,
    ruleLookup: {
      persistence: "durable_replay",
      ruleCount: null,
    },
  };

  return {
    detection,
    journalPersistence: existingDetection.journalEntryId
      ? {
          persisted: true,
          persistence: "postgres",
          postgresId: existingDetection.journalEntryId,
          replayed: true,
        }
      : {
          persisted: false,
          persistence: "not_linked",
          persistenceReason:
            "Replayed paycheck detection has no linked journal entry.",
          replayed: true,
        },
    ledger: {
      entryCount: null,
      source: "durable_paycheck_detection_replay",
    },
    message:
      "Paycheck detection replayed from the original durable detection without recomputing bucket splits.",
    persistence: {
      detection: existingDetection,
      persisted: true,
      persistence: "postgres",
      postgresId: existingDetection.id,
      replayed: true,
    },
    readiness,
    service: "payshield-paycheck-detection",
  };
}

export async function detectPaycheck(payload, env = process.env) {
  const durableProviderEvidenceRequired =
    databaseConfigured(env) ||
    env.NODE_ENV === "production" ||
    env.VERCEL_ENV === "production" ||
    envTrue(env, "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE") ||
    envTrue(env, "PAYSHIELD_LIVE_MONEY_ENABLED");

  if (
    durableProviderEvidenceRequired &&
    payload?.[trustedPaycheckDetection] !== true
  ) {
    return {
      body: {
        error:
          "Paycheck posting requires a verified bank sync or signed provider event.",
        service: "payshield-paycheck-detection",
      },
      status: 403,
    };
  }

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
  const profileSetup = await ensureDurableBucketProfile(actor, env);

  if (!profileSetup.ok) {
    return bucketProfileRequiredResult(
      profileSetup,
      "payshield-paycheck-detection",
    );
  }

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
  const providerTransactionId =
    cleanText(payload?.providerTransactionId, 120) || null;
  const paycheckInput = {
    amountCents,
    employerName,
    idempotencyKey:
      cleanText(payload?.idempotencyKey, 120) ||
      `paycheck-${employerName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}-${amountCents}`,
    providerAccountId,
    providerEventId: cleanText(payload?.providerEventId, 120) || null,
    providerItemId,
    providerName,
    providerTransactionId,
    receivedAt: cleanText(payload?.receivedAt, 32) || new Date().toISOString(),
  };
  const readiness = getMoneyRailReadiness(env);
  const replayLookup = await loadPaycheckDetection(
    {
      householdId: actor.householdId,
      idempotencyKey: paycheckInput.idempotencyKey,
      providerTransactionId: paycheckInput.providerTransactionId,
    },
    env,
  );

  if (persistenceFailed(replayLookup)) {
    return {
      body: {
        error: "Paycheck detection replay lookup failed.",
        readiness,
        replayLookup,
        service: "payshield-paycheck-detection",
      },
      status: 503,
    };
  }

  if (replayLookup.found) {
    if (!paycheckReplayMatchesInput(replayLookup.detection, paycheckInput)) {
      return {
        body: {
          error:
            "Paycheck detection idempotency key or provider transaction already belongs to a different deposit payload.",
          readiness,
          replayLookup,
          service: "payshield-paycheck-detection",
        },
        status: 409,
      };
    }

    return {
      body: replayedPaycheckDetectionBody({
        existingDetection: replayLookup.detection,
        readiness,
      }),
      status: 200,
    };
  }

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

  let book =
    ledger.ledgerSource === "control_model" ? new LedgerBook() : ledger.book;
  let entry = postPaycheckDeposit(book, controls.buckets, {
    amountCents,
    employerName,
    idempotencyKey: paycheckInput.idempotencyKey,
    receivedAt: paycheckInput.receivedAt,
  });
  let journalPersistence = {
    persisted: false,
    persistence: "pending_paycheck_detection",
    persistenceReason:
      "Paycheck split journal entry will be persisted atomically with the detection claim.",
  };

  if (!entry) {
    return {
      body: {
        error:
          "Paycheck detection did not produce a ledger entry for atomic persistence.",
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
      buckets: controls.buckets,
      detectionRuleId: ruleMatch.rule?.id || null,
      employerName,
      householdId: actor.householdId,
      idempotencyKey: entry.idempotencyKey,
      journalEntry: entry,
      providerEventId: paycheckInput.providerEventId,
      providerTransactionId: paycheckInput.providerTransactionId,
      receivedAt: entry.metadata?.receivedAt,
      status: "split_posted",
    },
    env,
  );

  if (persistence.persistence === "control_conflict") {
    return {
      body: {
        code: persistence.code,
        error:
          "Your protected bucket rules changed before this paycheck could be posted. Refresh and try again.",
        persistence,
        readiness,
        service: "payshield-paycheck-detection",
      },
      status: 409,
    };
  }

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

  journalPersistence = persistence.journalPersistence || journalPersistence;

  if (persistence.replayed && persistence.detection) {
    if (!paycheckReplayMatchesInput(persistence.detection, paycheckInput)) {
      return {
        body: {
          error:
            "Paycheck detection idempotency key or provider transaction already belongs to a different deposit payload.",
          journalPersistence,
          persistence,
          readiness,
          service: "payshield-paycheck-detection",
        },
        status: 409,
      };
    }

    return {
      body: replayedPaycheckDetectionBody({
        existingDetection: persistence.detection,
        readiness,
      }),
      status: 200,
    };
  }

  if (persistence.journalEntry) {
    const priorEntries = book
      .allEntries()
      .filter(
        (candidate) =>
          candidate.idempotencyKey !== persistence.journalEntry.idempotencyKey,
      );

    entry = persistence.journalEntry;
    book = new LedgerBook([...priorEntries, entry]);
  }

  const balances = buildBucketBalances(book, controls.buckets);
  const safeToSpendCents =
    balances.find((bucket) => bucket.id === "safe_spending")?.availableCents ??
    0;
  const protectedCents = balances
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.availableCents, 0);

  const auditPersistence = await persistMoneyRailEvent(
    {
      eventType: "paycheck_detected",
      householdId: actor.householdId,
      payload: {
        amountCents,
        detectionRuleId: ruleMatch.rule?.id || null,
        employerName,
        idempotencyKey: entry.idempotencyKey,
        journalEntryId: journalPersistence.postgresId || entry.id,
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
        persistence.recoveryAllocations?.length
          ? "Paycheck split completed and scheduled bucket recovery was applied."
          : "Paycheck detected and split by bucket priority before Safe to Spend is computed.",
      persistence,
      protectedCents,
      recoveryAllocations: persistence.recoveryAllocations || [],
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

  if (!readiness.liveMoneyReady || !readiness.transferConfigured) {
    return {
      body: {
        code: "protected_transfer_unavailable",
        error: "Protected transfers are temporarily unavailable.",
        readiness,
        service: "payshield-transfer-intents",
      },
      status: 423,
    };
  }

  const idempotencyKey =
    cleanText(payload?.idempotencyKey, 120) ||
    `transfer-${payload.sourceBucketId}-${destinationPayeeId}-${amountCents}`;
  const providerName = env.PAYSHIELD_BAAS_PROVIDER || "configured_rail";

  if (
    !destinationPayee.providerPayeeId ||
    destinationPayee.providerName !== providerName
  ) {
    return {
      body: {
        code: "destination_verification_required",
        error: "Verify this payment destination before moving protected money.",
        service: "payshield-transfer-intents",
      },
      status: 409,
    };
  }

  const reservationEntry = reserveProtectedTransfer(book, {
    amountCents,
    destinationPayeeId,
    destinationPayeeName: destinationPayee.name,
    idempotencyKey,
    sourceBucketId: payload.sourceBucketId,
  });
  const liveProviderExecution = true;
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
      journalEntry: reservationEntry,
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
  const journalPersistence = persistence.journalPersistence || {
    persisted: false,
    persistence: "not_posted",
    persistenceReason: "Transfer reservation was not posted.",
  };

  if (persistence.persistence === "control_conflict") {
    return {
      body: {
        code: persistence.code,
        error:
          persistence.code === "insufficient_bucket_funds"
            ? "The bucket balance changed before this transfer could be reserved."
            : persistence.code === "bucket_not_active"
              ? "This protected bucket is no longer active. Refresh and choose another bucket."
              : "The payment destination changed before this transfer could be reserved.",
        persistence,
        readiness,
        service: "payshield-transfer-intents",
      },
      status: 409,
    };
  }

  if (persistenceFailed(persistence) || persistenceFailed(journalPersistence)) {
    return {
      body: {
        error: "Transfer intent could not be persisted before provider execution.",
        persistence,
        journalPersistence,
        readiness,
        service: "payshield-transfer-intents",
      },
      status: 503,
    };
  }

  const resumePendingProviderExecution =
    liveProviderExecution &&
    persistence.replayed &&
    persistence.status === "provider_pending" &&
    !persistence.providerTransferId;

  if (liveProviderExecution && persistence.replayed && !resumePendingProviderExecution) {
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
          "Transfer intent already exists. PayShield will not replay provider execution after a durable terminal or blocked status.",
        destinationPayee,
        persistence,
        journalPersistence,
        providerTransfer: {
          providerTransferId:
            persistence.providerTransferId || "durable-intent-replayed",
          status: persistence.providerStatus || "replayed",
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
        providerPayeeId: destinationPayee.providerPayeeId,
        idempotencyKey,
        sourceBucketId: payload.sourceBucketId,
      });
    } catch (error) {
      const failurePersistence = await applyTransferLifecycle(
        {
          failureCode: "provider_adapter_error",
          householdId: actor.householdId,
          idempotencyKey,
          providerEventId: `adapter-failure:${idempotencyKey}`,
          providerName,
          providerStatus: "failed",
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
          journalPersistence,
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
        balances: buildBucketBalances(book, controls.buckets),
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
      balances: buildBucketBalances(book, controls.buckets),
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
        providerTransfer.status === "created" && resumePendingProviderExecution
          ? "Pending transfer intent resumed with the configured provider."
          : providerTransfer.status === "created"
          ? "Protected transfer created with the configured provider."
          : "Transfer intent validated. Provider execution remains locked until approved money-rail credentials are active.",
      destinationPayee,
      persistence,
      journalPersistence,
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
  const readiness = getCoreReadiness(env, { coreOnline: true });
  const liveGate = assertLiveMoneyReady(readiness);

  if (!liveGate.ok) {
    return {
      body: {
        code: "bill_payment_unavailable",
        error: "Bill payments are temporarily unavailable.",
        liveMoney: liveGate,
        service: "payshield-bill-payments",
      },
      status: 423,
    };
  }

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
  const payee = controls.payees.find((candidate) => candidate.id === payeeId);
  const providerName = getProviderAdapterConfig(env).providerName;

  if (
    decision.accepted &&
    payee &&
    (!payee.providerPayeeId || payee.providerName !== providerName)
  ) {
    return {
      body: {
        code: "destination_verification_required",
        error: "Verify this payment destination before scheduling a payment.",
        service: "payshield-bill-payments",
      },
      status: 409,
    };
  }

  const liveProviderExecution =
    decision.accepted && Boolean(payee);
  let providerBillPayment = decision.accepted
    ? {
        providerBillPaymentId: "bill-pay-provider-contract-required",
        status: "blocked",
      }
    : {
        providerBillPaymentId: "bill-pay-not-scheduled",
        status: "blocked",
      };

  const postedEntry = decision.accepted
    ? book.findByIdempotencyKey(idempotencyKey)
    : null;
  let decisionPersistence = await persistBillPaymentSchedule(
    {
      amountCents,
      bucketId: decision.bucketId || null,
      decisionCode: decision.code,
      householdId: actor.householdId,
      idempotencyKey,
      journalEntry: postedEntry,
      memo: memo || null,
      payeeId,
      providerName,
      providerBillPaymentId: liveProviderExecution
        ? null
        : providerBillPayment.providerBillPaymentId,
      providerStatus: liveProviderExecution ? "submitted" : "blocked",
      reason: decision.reason,
      scheduledFor,
      status: decision.accepted ? "scheduled" : "rejected",
    },
    env,
  );
  const journalPersistence = decisionPersistence.journalPersistence || {
    persisted: false,
    persistence: "not_posted",
    persistenceReason: "Rejected bill payments do not create ledger entries.",
  };

  if (decisionPersistence.persistence === "control_conflict") {
    return {
      body: {
        code: decisionPersistence.code,
        error:
          decisionPersistence.code === "insufficient_bucket_funds"
            ? "The bucket balance changed before this payment could be reserved."
            : decisionPersistence.code === "bucket_not_active"
              ? "This protected bucket is no longer active. Refresh and choose another bucket."
              : "The payment destination changed before this payment could be reserved.",
        decisionPersistence,
        readiness,
        service: "payshield-bill-payments",
      },
      status: 409,
    };
  }

  if (
    persistenceFailed(decisionPersistence) ||
    persistenceFailed(journalPersistence)
  ) {
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

  const resumePendingBillPaymentProviderExecution =
    liveProviderExecution &&
    decisionPersistence.replayed &&
    decisionPersistence.status === "scheduled" &&
    decisionPersistence.providerStatus === "submitted" &&
    !decisionPersistence.providerBillPaymentId;

  if (
    liveProviderExecution &&
    decisionPersistence.replayed &&
    !resumePendingBillPaymentProviderExecution
  ) {
    providerBillPayment = {
      providerBillPaymentId:
        decisionPersistence.providerBillPaymentId ||
        "durable-bill-payment-replayed",
      status: decisionPersistence.providerStatus || "replayed",
    };

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
        message:
          "Bill payment schedule already exists. PayShield will not replay provider execution after a durable terminal or blocked status.",
        mode: "core_ledger",
        providerBillPayment,
        readiness,
      },
      status: 200,
    };
  }

  if (liveProviderExecution && payee) {
    try {
      providerBillPayment = await providerCreateBillPayment(env, {
        amountCents,
        bucketId: decision.bucketId,
        idempotencyKey,
        memo: memo || null,
        payee,
        providerPayeeId: payee.providerPayeeId,
        scheduledFor,
      });
    } catch (error) {
      const reversalEntry = reverseBillPaymentReservation(book, postedEntry, {
        idempotencyKey: `bill-provider-failure:${decisionPersistence.postgresId}`,
        reason: "Payment submission failed.",
        reversedEntryId: journalPersistence.postgresId,
        scheduleId: decisionPersistence.postgresId,
      });
      const failurePersistence = await cancelBillPaymentSchedule(
        {
          householdId: actor.householdId,
          providerStatus: "failed",
          reason: "Payment submission failed; reserved funds were released.",
          reversalEntry,
          scheduleId: decisionPersistence.postgresId,
          userId: actor.id,
        },
        env,
      );
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
          balances: buildBucketBalances(book, controls.buckets),
          decisionPersistence,
          exceptionPersistence,
          failurePersistence,
          journalPersistence,
          readiness,
        },
        status:
          persistenceFailed(failurePersistence) ||
          persistenceFailed(exceptionPersistence)
            ? 503
            : result.status,
      };
    }

    decisionPersistence = await updateBillPaymentProviderStatus(
      {
        householdId: actor.householdId,
        idempotencyKey,
        providerBillPaymentId: providerBillPayment.providerBillPaymentId,
        providerStatus: "created",
        status: "submitted",
      },
      env,
    );

    if (persistenceFailed(decisionPersistence)) {
      return {
        body: {
          decision,
          decisionPersistence,
          error:
            "Provider bill payment was created but the durable schedule status could not be updated.",
          journalPersistence,
          providerBillPayment,
          readiness,
          service: "payshield-bill-payments",
        },
        status: 503,
      };
    }
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
        ? providerBillPayment.status === "created" &&
          resumePendingBillPaymentProviderExecution
          ? "Pending bill payment schedule resumed with the configured provider."
          : providerBillPayment.status === "created"
            ? "Bill payment submitted with the configured provider."
            : "Bill payment scheduled in the protected bucket model. Provider execution requires active money-movement controls."
        : "Bill payment was not scheduled.",
      mode: "core_ledger",
      providerBillPayment,
      readiness,
    },
    status: decision.accepted ? 200 : 400,
  };
}

export async function cancelBillPayment(payload, env = process.env) {
  let actor = actorFromPayload(payload);
  const scheduleId = cleanText(payload?.scheduleId, 160);
  const reason =
    cleanText(payload?.reason, 140) || "Canceled by the household";

  if (!scheduleId) {
    return {
      body: { error: "Provide scheduleId." },
      status: 400,
    };
  }

  const paidAccess = await requireActivePaidAccess(
    env,
    actor,
    "scheduled bill cancellation",
  );

  if (!paidAccess.ok) {
    return paidAccess.result;
  }

  actor = paidAccess.actor;
  const scheduleLookup = await loadBillPaymentSchedule(
    { householdId: actor.householdId, scheduleId },
    env,
  );

  if (
    persistenceFailed(scheduleLookup) ||
    scheduleLookup.persistence !== "postgres"
  ) {
    return {
      body: {
        error: "Scheduled payment records are unavailable.",
        persistence: scheduleLookup,
        service: "payshield-bill-payments",
      },
      status: 503,
    };
  }

  const schedule = scheduleLookup.schedule;

  if (!schedule) {
    return {
      body: {
        error: "Scheduled payment was not found.",
        service: "payshield-bill-payments",
      },
      status: 404,
    };
  }

  if (schedule.status === "canceled") {
    return {
      body: {
        message: "Scheduled payment is already canceled.",
        replayed: true,
        schedule,
      },
      status: 200,
    };
  }

  if (!["scheduled", "blocked", "submitted"].includes(schedule.status)) {
    return {
      body: {
        error: "This payment can no longer be canceled.",
        schedule,
        service: "payshield-bill-payments",
      },
      status: 409,
    };
  }

  const hasProviderPayment =
    Boolean(schedule.providerBillPaymentId) &&
    ["created", "submitted"].includes(schedule.providerStatus);
  let providerCancellation = null;

  if (hasProviderPayment) {
    try {
      providerCancellation = await providerCancelBillPayment(env, {
        idempotencyKey: `bill-cancel-provider:${schedule.id}`,
        providerBillPaymentId: schedule.providerBillPaymentId,
        reason,
      });
    } catch (error) {
      const exceptionPersistence = await recordMoneyRailProviderException(
        {
          actor,
          amountCents: schedule.amountCents,
          error,
          idempotencyKey: `bill-cancel-provider:${schedule.id}`,
          operation: "cancelBillPayment",
          payeeId: schedule.payeeId,
          rail: "bill_payment",
        },
        env,
      );
      const result = providerErrorResult(error, "payshield-bill-payments");

      return {
        body: {
          ...result.body,
          exceptionPersistence,
          message:
            "The payment remains scheduled because cancellation was not confirmed.",
        },
        status: persistenceFailed(exceptionPersistence) ? 503 : result.status,
      };
    }
  }

  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const ledger = await loadHouseholdLedger(env, actor, controls);

  if (ledger.error) {
    return ledger.error;
  }

  const book = ledger.book;
  const originalEntry =
    book.allEntries().find((entry) => entry.id === schedule.journalEntryId) ||
    book.findByIdempotencyKey(schedule.idempotencyKey);

  if (!originalEntry) {
    const exceptionPersistence = await recordMoneyRailProviderException(
      {
        actor,
        amountCents: schedule.amountCents,
        error: new Error("Scheduled payment ledger reservation was not found."),
        idempotencyKey: `bill-cancel-ledger:${schedule.id}`,
        operation: "cancelBillPayment",
        payeeId: schedule.payeeId,
        rail: "bill_payment",
      },
      env,
    );

    return {
      body: {
        error:
          "The payment could not be released because its ledger reservation is unavailable.",
        exceptionPersistence,
        service: "payshield-bill-payments",
      },
      status: 503,
    };
  }

  const reversalEntry = reverseBillPaymentReservation(book, originalEntry, {
    idempotencyKey: `bill-cancel:${schedule.id}`,
    reason,
    reversedEntryId: schedule.journalEntryId || originalEntry.id,
    scheduleId: schedule.id,
  });
  const cancellationPersistence = await cancelBillPaymentSchedule(
    {
      householdId: actor.householdId,
      providerStatus: "canceled",
      reason,
      reversalEntry,
      scheduleId: schedule.id,
      userId: actor.id,
    },
    env,
  );

  if (
    persistenceFailed(cancellationPersistence) ||
    !cancellationPersistence.canceled
  ) {
    const exceptionPersistence = providerCancellation
      ? await recordMoneyRailProviderException(
          {
            actor,
            amountCents: schedule.amountCents,
            error: new Error(
              "Provider cancellation succeeded but the local cancellation did not commit.",
            ),
            idempotencyKey: `bill-cancel-commit:${schedule.id}`,
            operation: "cancelBillPayment",
            payeeId: schedule.payeeId,
            rail: "bill_payment",
          },
          env,
        )
      : null;

    return {
      body: {
        cancellationPersistence,
        error: cancellationPersistence.terminal
          ? "This payment can no longer be canceled."
          : "Payment cancellation could not be committed.",
        exceptionPersistence,
        service: "payshield-bill-payments",
      },
      status: cancellationPersistence.terminal ? 409 : 503,
    };
  }

  return {
    body: {
      balances: buildBucketBalances(book, controls.buckets),
      cancellation: cancellationPersistence.schedule,
      ledger: {
        entryCount: book.allEntries().length,
        source: ledger.ledgerSource,
      },
      message: "Scheduled payment canceled and reserved funds released.",
      providerCancellation,
    },
    status: 200,
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
  const readiness = getCoreReadiness(env, { coreOnline: true });
  const liveGate = assertLiveMoneyReady(readiness);

  if (!liveGate.ok) {
    return {
      body: {
        code: "protected_unlock_unavailable",
        error: "Protected money access is temporarily unavailable.",
        liveMoney: liveGate,
        service: "payshield-unlocks",
      },
      status: 423,
    };
  }

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

  if (amountCents > book.bucketAvailable(input.bucketId)) {
    return {
      body: {
        error: "Amount exceeds the selected bucket balance.",
        service: "payshield-unlocks",
      },
      status: 400,
    };
  }

  const result = unlockProtectedFunds(book, input);
  const postedEntry = book.findByIdempotencyKey(input.idempotencyKey);

  if (!postedEntry) {
    return {
      body: {
        error: "Unlock did not produce a ledger entry.",
        readiness,
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
      journalEntry: postedEntry,
      reason: input.reason,
      recoveryChecks: result.recoveryChecks,
      recoveryPerCheckCents: result.recoveryPerCheckCents,
      status: "posted",
      unlockMode: input.mode,
      unlockedCents: result.unlockedCents,
    },
    env,
  );

  if (decisionPersistence.persistence === "control_conflict") {
    return {
      body: {
        code: decisionPersistence.code,
        error:
          decisionPersistence.code === "bucket_not_active"
            ? "This protected bucket is no longer active. Refresh and choose another bucket."
            : "The bucket balance changed before protected money could be moved.",
        decisionPersistence,
        readiness,
        service: "payshield-unlocks",
      },
      status: 409,
    };
  }

  if (persistenceFailed(decisionPersistence)) {
    return {
      body: {
        decisionPersistence,
        error: "Unlock request could not be persisted.",
        readiness,
        result,
        service: "payshield-unlocks",
      },
      status: 503,
    };
  }
  const journalPersistence = decisionPersistence.journalPersistence;

  if (persistenceFailed(journalPersistence)) {
    return {
      body: {
        decisionPersistence,
        error: "Unlock ledger entry could not be persisted.",
        journalPersistence,
        readiness,
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
      message: "Protected money moved to Safe to Spend. Your recovery plan is active.",
      mode: "core_ledger",
      readiness,
      result,
    },
    status: 200,
  };
}

function cardReplayMatchesInput(existingDecision, input) {
  return (
    existingDecision.amountCents === input.amountCents &&
    (existingDecision.merchantCategoryCode || null) ===
      (input.merchantCategoryCode || null) &&
    existingDecision.merchantName === input.merchantName &&
    (existingDecision.payeeId || null) === (input.payeeId || null)
  );
}

function replayedCardDecisionBody({
  existingDecision,
  readiness,
}) {
  const decision = {
    approved: existingDecision.approved,
    approvedAmountCents: existingDecision.approvedAmountCents,
    bucketId: existingDecision.bucketId || "safe_spending",
    code: existingDecision.decisionCode,
    reason: existingDecision.reason,
  };

  return {
    decision,
    decisionPersistence: {
      decision: existingDecision,
      persisted: true,
      persistence: "postgres",
      postgresId: existingDecision.id,
      replayed: true,
    },
    journalPersistence: existingDecision.journalEntryId
      ? {
          persisted: true,
          persistence: "postgres",
          postgresId: existingDecision.journalEntryId,
          replayed: true,
        }
      : {
          persisted: false,
          persistence: "not_posted",
          persistenceReason:
            "Replayed declined card authorization did not create a ledger entry.",
          replayed: true,
        },
    ledger: {
      entryCount: null,
      source: "durable_card_decision_replay",
    },
    message:
      "Card authorization replayed from the original durable decision without recomputing spendable funds.",
    mode: readiness.liveMoneyReady ? "provider_gateway" : "core_ledger",
    readiness,
    service: "payshield-card-authorization",
  };
}

export async function authorizeCard(payload, env = process.env) {
  const readiness = getCoreReadiness(env, { coreOnline: true });
  const providerSignature = await verifyProviderWebhookSignature(
    payload,
    env,
    readiness,
    getMoneyRailReadiness(env),
  );

  if (!providerSignature.ok) {
    return {
      body: {
        approved: false,
        error: providerSignature.error,
        mode: "blocked",
        providerAuthorizationAuthenticity: providerSignature.mode,
        readiness,
        service: "payshield-card-authorization",
      },
      status: providerSignature.status,
    };
  }

  const configuredProviderName = getProviderAdapterConfig(env).providerName;
  const providerName =
    safeString(payload?.providerName, 40).toLowerCase() ||
    safeString(payload?.provider, 40).toLowerCase() ||
    configuredProviderName ||
    "payshield";
  const providerCardId = providerField(payload, [
    "providerCardId",
    "cardId",
    "cardToken",
    "card_token",
  ]);
  const providerAuthorizationId = providerField(payload, [
    "providerAuthorizationId",
    "authorizationId",
    "transactionToken",
    "transaction_token",
    "idempotencyKey",
  ]);
  const durableProviderDecision =
    databaseConfigured(env) || providerSignature.mode === "verified";
  let actor = actorFromPayload(payload);
  let providerCard = null;

  if (durableProviderDecision) {
    if (!providerCardId || !providerAuthorizationId) {
      return {
        body: {
          approved: false,
          error:
            "Signed card authorizations require provider card and authorization identifiers.",
          mode: "blocked",
          readiness,
          service: "payshield-card-authorization",
        },
        status: 400,
      };
    }

    const cardActor = await loadProviderCardActor(
      { providerCardId, providerName },
      env,
    );

    if (persistenceFailed(cardActor)) {
      return {
        body: {
          approved: false,
          error: "Issued-card ownership could not be verified.",
          mode: "blocked",
          persistence: cardActor,
          readiness,
          service: "payshield-card-authorization",
        },
        status: 503,
      };
    }

    if (cardActor.persistence !== "postgres") {
      return {
        body: {
          approved: false,
          error:
            "Issued-card ownership requires durable account records before authorization.",
          mode: "blocked",
          persistence: cardActor,
          readiness,
          service: "payshield-card-authorization",
        },
        status: 503,
      };
    }

    if (!cardActor.actor || !cardActor.card) {
      return {
        body: {
          approved: false,
          decision: {
            approved: false,
            approvedAmountCents: 0,
            code: "card_not_found",
            reason: "The card is not active for a PayShield household.",
          },
          mode: "blocked",
          readiness,
          service: "payshield-card-authorization",
        },
        status: 404,
      };
    }

    actor = normalizeActor(cardActor.actor);
    providerCard = cardActor.card;
  }

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
      cleanText(providerAuthorizationId, 120) ||
      `card-auth-${cleanText(payload?.merchantName, 120) || "merchant"}-${amountCents}`,
    merchantCategoryCode: typeof payload?.merchantCategoryCode === "string" ? cleanText(payload.merchantCategoryCode, 20) : undefined,
    merchantName: cleanText(payload?.merchantName, 120) || "Unknown merchant",
    payeeId: typeof payload?.payeeId === "string" ? cleanText(payload.payeeId, 120) : undefined,
  };

  const replayLookup = await loadCardAuthorizationDecision(
    {
      householdId: actor.householdId,
      idempotencyKey: input.idempotencyKey,
    },
    env,
  );

  if (persistenceFailed(replayLookup)) {
    return {
      body: {
        error: "Card authorization replay lookup failed.",
        replayLookup,
        readiness,
        service: "payshield-card-authorization",
      },
      status: 503,
    };
  }

  if (replayLookup.found) {
    if (!cardReplayMatchesInput(replayLookup.decision, input)) {
      return {
        body: {
          error:
            "Card authorization idempotency key already belongs to a different authorization payload.",
          replayLookup,
          readiness,
          service: "payshield-card-authorization",
        },
        status: 409,
      };
    }

    return {
      body: replayedCardDecisionBody({
        existingDecision: replayLookup.decision,
        readiness,
      }),
      status: 200,
    };
  }

  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const ledger = await loadHouseholdLedger(env, actor, controls);

  if (ledger.error) {
    return ledger.error;
  }

  const book = ledger.book;
  const cardAvailable =
    !providerCard || ["issued", "active"].includes(providerCard.status);
  const decision = cardAvailable
    ? authorizeCardTransaction(book, controls.payees, input)
    : {
        approved: false,
        approvedAmountCents: 0,
        bucketId: "safe_spending",
        code: "card_unavailable",
        reason: "This card cannot be used in its current state.",
      };
  const postedEntry = decision.approved
    ? book.findByIdempotencyKey(input.idempotencyKey)
    : null;
  let journalPersistence = postedEntry
    ? {
        persisted: false,
        persistence: "pending_card_decision",
        persistenceReason:
          "Approved card journal entry will be persisted atomically with the card decision.",
      }
    : {
        persisted: false,
        persistence: "not_posted",
        persistenceReason:
          "Declined card authorizations do not create ledger entries.",
      };

  if (decision.approved && !postedEntry) {
    return {
      body: {
        decision,
        error:
          "Approved card authorization did not produce a ledger entry for atomic persistence.",
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
      journalEntry: postedEntry || null,
      merchantCategoryCode: input.merchantCategoryCode || null,
      merchantName: input.merchantName,
      payeeId: input.payeeId || null,
      providerAuthorizationId: providerAuthorizationId || null,
      providerCardId: providerCard?.providerCardId || null,
      providerName,
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

  if (decisionPersistence.controlConflict) {
    const persistedDecision = decisionPersistence.decision;

    return {
      body: {
        decision: {
          approved: false,
          approvedAmountCents: 0,
          bucketId: persistedDecision.bucketId,
          code: persistedDecision.decisionCode,
          reason: persistedDecision.reason,
        },
        decisionPersistence,
        journalPersistence: {
          persisted: false,
          persistence: "not_posted",
          persistenceReason:
            "The durable balance check declined this authorization.",
          replayed: false,
        },
        mode: readiness.liveMoneyReady ? "provider_gateway" : "core_ledger",
        readiness,
        service: "payshield-card-authorization",
      },
      status: 200,
    };
  }

  journalPersistence =
    decisionPersistence.journalPersistence || journalPersistence;

  if (decisionPersistence.replayed && decisionPersistence.decision) {
    if (!cardReplayMatchesInput(decisionPersistence.decision, input)) {
      return {
        body: {
          decision,
          decisionPersistence,
          error:
            "Card authorization idempotency key already belongs to a different authorization payload.",
          journalPersistence,
          readiness,
          service: "payshield-card-authorization",
        },
        status: 409,
      };
    }

    return {
      body: replayedCardDecisionBody({
        existingDecision: decisionPersistence.decision,
        readiness,
      }),
      status: 200,
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
    .update(JSON.stringify(redactProviderWebhookPayload(payload || {})))
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

function providerKycUpdateFromPayload(payload) {
  const eventType = safeString(
    payload?.eventType || payload?.webhook_code || payload?.type,
    120,
  ).toLowerCase();
  const candidates = [
    payload,
    safeObject(payload?.data),
    safeObject(payload?.data?.object),
    safeObject(payload?.application),
    safeObject(payload?.customer),
  ];
  let providerApplicationId = "";
  let providerCustomerId = "";
  let rawStatus = "";
  let failureReason = "";

  for (const candidate of candidates) {
    providerApplicationId ||= providerField(candidate, [
      "providerApplicationId",
      "applicationId",
      "application_id",
      "kycId",
      "kyc_id",
    ]);
    providerCustomerId ||= providerField(candidate, [
      "providerCustomerId",
      "customerId",
      "customer_id",
    ]);
    rawStatus ||= providerField(candidate, [
      "kycStatus",
      "kyc_status",
      "applicationStatus",
      "application_status",
      "verificationStatus",
      "verification_status",
      "status",
    ]);
    failureReason ||= providerField(candidate, [
      "failureReason",
      "failure_reason",
      "reason",
    ]);
  }

  const hasKycSignal =
    /kyc|identity|verification|due_diligence/.test(eventType) ||
    Boolean(
      providerApplicationId &&
        candidates.some((candidate) =>
          [
            "kycStatus",
            "kyc_status",
            "applicationStatus",
            "application_status",
            "verificationStatus",
            "verification_status",
          ].some((field) => safeString(candidate?.[field], 40)),
        ),
    );

  if (
    !hasKycSignal ||
    (!providerApplicationId && !providerCustomerId) ||
    !rawStatus
  ) {
    return null;
  }

  return {
    failureReason: failureReason || null,
    providerApplicationId: providerApplicationId || null,
    providerCustomerId: providerCustomerId || null,
    status: normalizedProviderKycStatus(rawStatus),
  };
}

const providerMoneyLifecycleTypes = new Map([
  ["bill_payment.canceled", ["bill_payment", "canceled"]],
  ["bill_payment.cancelled", ["bill_payment", "canceled"]],
  ["bill_payment.failed", ["bill_payment", "failed"]],
  ["bill_payment.reversed", ["bill_payment", "reversed"]],
  ["bill_payment.settled", ["bill_payment", "settled"]],
  ["card_authorization.expired", ["card", "expired"]],
  ["card_authorization.reversed", ["card", "reversed"]],
  ["card_authorization.settled", ["card", "settled"]],
  ["card_transaction.reversed", ["card", "reversed"]],
  ["card_transaction.settled", ["card", "settled"]],
  ["transfer.canceled", ["transfer", "canceled"]],
  ["transfer.cancelled", ["transfer", "canceled"]],
  ["transfer.failed", ["transfer", "failed"]],
  ["transfer.reversed", ["transfer", "reversed"]],
  ["transfer.settled", ["transfer", "settled"]],
]);

function normalizedProviderEventType(payload) {
  return safeString(
    payload?.eventType || payload?.webhook_code || payload?.type,
    120,
  )
    .toLowerCase()
    .replace(/bill[- ]payment/g, "bill_payment")
    .replace(/card[- ]authorization/g, "card_authorization")
    .replace(/card[- ]transaction/g, "card_transaction")
    .replace(/[/:\s]+/g, ".")
    .replace(/_(canceled|cancelled|expired|failed|reversed|settled)$/, ".$1");
}

function providerLifecycleCandidates(payload) {
  const data = safeObject(payload?.data);

  return [
    safeObject(data.object),
    safeObject(payload?.billPayment),
    safeObject(payload?.bill_payment),
    safeObject(payload?.transfer),
    safeObject(payload?.cardAuthorization),
    safeObject(payload?.card_authorization),
    safeObject(payload?.cardTransaction),
    safeObject(payload?.card_transaction),
    data,
    safeObject(payload?.event),
    payload,
  ];
}

function lifecycleField(candidates, fields) {
  for (const candidate of candidates) {
    const value = providerField(candidate, fields);

    if (value) {
      return value;
    }
  }

  return "";
}

function providerLifecycleAmount(candidates) {
  for (const candidate of candidates) {
    for (const field of ["amountCents", "amount_cents", "settledAmountCents", "settled_amount_cents"]) {
      const value = Number(candidate?.[field]);

      if (Number.isSafeInteger(value) && value > 0) {
        return value;
      }
    }

    const amount = Number(candidate?.amount);

    if (Number.isFinite(amount) && amount > 0) {
      const centsValue = Math.round(amount * 100);

      if (Number.isSafeInteger(centsValue) && centsValue > 0) {
        return centsValue;
      }
    }
  }

  return null;
}

function providerLifecycleOccurredAt(candidates) {
  const value = lifecycleField(candidates, [
    "occurredAt",
    "occurred_at",
    "settledAt",
    "settled_at",
    "updatedAt",
    "updated_at",
    "createdAt",
    "created_at",
  ]);
  const parsed = value ? new Date(value) : null;

  return parsed && Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString();
}

function providerMoneyLifecycleFromPayload(payload) {
  const eventType = normalizedProviderEventType(payload);
  const lifecycle = providerMoneyLifecycleTypes.get(eventType);

  if (!lifecycle) {
    return null;
  }

  const [kind, status] = lifecycle;
  const candidates = providerLifecycleCandidates(payload);
  const amountCents = providerLifecycleAmount(candidates);
  const providerBillPaymentId = lifecycleField(candidates, [
    "providerBillPaymentId",
    "billPaymentId",
    "bill_payment_id",
  ]);
  const providerTransferId = lifecycleField(candidates, [
    "providerTransferId",
    "transferId",
    "transfer_id",
  ]);
  const providerAuthorizationId = lifecycleField(candidates, [
    "providerAuthorizationId",
    "authorizationId",
    "authorization_id",
  ]);
  const providerTransactionId = lifecycleField(candidates, [
    "providerTransactionId",
    "transactionId",
    "transaction_id",
  ]);
  const providerReferenceId =
    kind === "bill_payment"
      ? providerBillPaymentId
      : kind === "transfer"
        ? providerTransferId
        : providerAuthorizationId || providerTransactionId;
  const missing = [
    ...(providerReferenceId ? [] : ["provider reference"]),
    ...(status === "settled" && amountCents === null
      ? ["positive integer amountCents"]
      : []),
  ];

  return {
    amountCents,
    eventType,
    failureCode:
      lifecycleField(candidates, ["failureCode", "failure_code", "code"]) ||
      null,
    invalidReason: missing.length
      ? `Provider lifecycle event is missing ${missing.join(" and ")}.`
      : "",
    kind,
    occurredAt: providerLifecycleOccurredAt(candidates),
    providerAuthorizationId: providerAuthorizationId || null,
    providerBillPaymentId: providerBillPaymentId || null,
    providerReferenceId: providerReferenceId || null,
    providerTransactionId: providerTransactionId || null,
    providerTransferId: providerTransferId || null,
    status,
  };
}

async function persistProviderLifecycleException(
  { lifecycle, lifecyclePersistence, providerEventId, providerName },
  env,
) {
  const reasonCode = lifecycle.invalidReason
    ? "invalid_provider_lifecycle_event"
    : !lifecyclePersistence?.found
      ? "provider_money_record_not_found"
      : lifecyclePersistence?.amountMismatch
        ? "provider_money_amount_mismatch"
        : "provider_money_state_conflict";

  return persistReconciliationException(
    {
      householdId: lifecyclePersistence?.householdId || null,
      idempotencyKey: `provider-lifecycle:${providerName}:${providerEventId}:${reasonCode}`,
      metadata: {
        amountCents: lifecycle.amountCents,
        eventType: lifecycle.eventType,
        expectedAmountCents:
          lifecyclePersistence?.expectedAmountCents || null,
        kind: lifecycle.kind,
        providerReferenceId: lifecycle.providerReferenceId,
        receivedAmountCents:
          lifecyclePersistence?.receivedAmountCents || null,
        status: lifecycle.status,
      },
      providerEventId,
      providerName,
      providerTransactionId:
        lifecycle.providerTransactionId || lifecycle.providerReferenceId,
      reasonCode,
      severity: lifecyclePersistence?.amountMismatch ? "critical" : "warning",
      source: "provider_webhook",
      summary:
        lifecycle.invalidReason ||
        lifecyclePersistence?.reason ||
        `A signed ${lifecycle.eventType} event could not be matched to a valid money lifecycle.`,
    },
    env,
  );
}

async function applyProviderMoneyLifecycle(
  lifecycle,
  { env, providerEventId, providerName },
) {
  if (lifecycle.invalidReason) {
    return {
      found: false,
      invalid: true,
      persisted: true,
      persistence: "validation",
    };
  }

  if (lifecycle.kind === "bill_payment") {
    return applyBillPaymentLifecycle(
      {
        amountCents: lifecycle.amountCents,
        failureCode: lifecycle.failureCode,
        occurredAt: lifecycle.occurredAt,
        providerEventId,
        providerName,
        providerReferenceId: lifecycle.providerBillPaymentId,
        status: lifecycle.status,
      },
      env,
    );
  }

  if (lifecycle.kind === "transfer") {
    return applyTransferLifecycle(
      {
        amountCents: lifecycle.amountCents,
        failureCode: lifecycle.failureCode,
        occurredAt: lifecycle.occurredAt,
        providerEventId,
        providerName,
        providerReferenceId: lifecycle.providerTransferId,
        status: lifecycle.status,
      },
      env,
    );
  }

  return applyCardAuthorizationLifecycle(
    {
      amountCents: lifecycle.amountCents,
      occurredAt: lifecycle.occurredAt,
      providerAuthorizationId: lifecycle.providerAuthorizationId,
      providerEventId,
      providerName,
      providerTransactionId: lifecycle.providerTransactionId,
      status: lifecycle.status,
    },
    env,
  );
}

function providerPayeeUpdateFromPayload(payload) {
  const eventType = normalizedProviderEventType(payload);

  if (!eventType.startsWith("payee.")) {
    return null;
  }

  const candidates = providerLifecycleCandidates(payload);
  const eventStatus = eventType.split(".").at(-1);
  const rawStatus = ["approved", "pending", "rejected"].includes(eventStatus)
    ? eventStatus
    : lifecycleField(candidates, [
        "verificationStatus",
        "verification_status",
        "payeeStatus",
        "payee_status",
        "status",
      ]);
  const providerPayeeId = lifecycleField(candidates, [
    "providerPayeeId",
    "payeeId",
    "payee_id",
  ]);

  if (!providerPayeeId || !rawStatus) {
    return {
      eventType,
      invalidReason:
        "Provider payee event is missing a payee reference or verification status.",
      providerPayeeId: providerPayeeId || null,
      status: "provider_pending",
    };
  }

  return {
    eventType,
    invalidReason: "",
    providerPayeeId,
    status: normalizedProviderPayeeStatus(rawStatus),
  };
}

async function persistProviderPayeeException(
  { payeePersistence, payeeUpdate, providerEventId, providerName },
  env,
) {
  const reasonCode = payeeUpdate.invalidReason
    ? "invalid_provider_payee_event"
    : "provider_payee_not_found";

  return persistReconciliationException(
    {
      householdId: payeePersistence?.householdId || null,
      idempotencyKey: `provider-payee:${providerName}:${providerEventId}:${reasonCode}`,
      metadata: {
        eventType: payeeUpdate.eventType,
        providerPayeeId: payeeUpdate.providerPayeeId,
        status: payeeUpdate.status,
      },
      providerEventId,
      providerName,
      providerTransactionId: payeeUpdate.providerPayeeId,
      reasonCode,
      severity: "warning",
      source: "provider_webhook",
      summary:
        payeeUpdate.invalidReason ||
        "A signed payee verification update could not be matched to a payment destination.",
    },
    env,
  );
}

function plaidWebhookRequestsTransactionSync(payload) {
  if (payload.__payshieldProviderSource !== "plaid") {
    return false;
  }

  const webhookType = safeString(payload.webhook_type, 80).toUpperCase();
  const webhookCode = safeString(payload.webhook_code, 120).toUpperCase();

  return (
    webhookType === "TRANSACTIONS" &&
    new Set([
      "DEFAULT_UPDATE",
      "HISTORICAL_UPDATE",
      "INITIAL_UPDATE",
      "SYNC_UPDATES_AVAILABLE",
    ]).has(webhookCode)
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
  const kycUpdate = providerKycUpdateFromPayload(payload);
  let moneyLifecycle = providerMoneyLifecycleFromPayload(payload);
  let payeeUpdate = providerPayeeUpdateFromPayload(payload);
  const configuredProviderName = getProviderAdapterConfig(env)
    .providerName.toLowerCase();

  if (
    moneyLifecycle &&
    (!configuredProviderName || providerName !== configuredProviderName)
  ) {
    moneyLifecycle = {
      ...moneyLifecycle,
      invalidReason: configuredProviderName
        ? `Provider lifecycle event names ${providerName}; expected ${configuredProviderName}.`
        : "Provider lifecycle event arrived before a BaaS provider was configured.",
    };
  }

  if (
    payeeUpdate &&
    (!configuredProviderName || providerName !== configuredProviderName)
  ) {
    payeeUpdate = {
      ...payeeUpdate,
      invalidReason: configuredProviderName
        ? `Provider payee event names ${providerName}; expected ${configuredProviderName}.`
        : "Provider payee event arrived before a BaaS provider was configured.",
    };
  }
  const providerSignature = await verifyProviderWebhookSignature(
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

  if (plaidWebhookRequestsTransactionSync(payload)) {
    const providerItemId = safeString(payload.item_id, 240);

    if (!providerItemId) {
      const exceptionPersistence = await persistReconciliationException(
        {
          householdId: null,
          idempotencyKey: `plaid-sync-item-missing:${providerEventId}`,
          metadata: {
            webhookCode: safeString(payload.webhook_code, 120),
            webhookType: safeString(payload.webhook_type, 80),
          },
          providerEventId,
          providerName: "plaid",
          providerTransactionId: null,
          reasonCode: "plaid_item_id_missing",
          severity: "warning",
          source: "provider_webhook",
          summary:
            "A verified Plaid transaction webhook did not identify a linked item.",
        },
        env,
      );

      if (persistenceFailed(exceptionPersistence)) {
        return {
          body: {
            accepted: false,
            error: "Plaid webhook exception could not be queued.",
            eventPersistence,
            providerEventId,
            service: "payshield-provider-webhook",
          },
          status: 503,
        };
      }

      return {
        body: {
          accepted: true,
          eventPersistence,
          exceptionPersistence,
          mode: "review_required",
          providerEventId,
          service: "payshield-provider-webhook",
        },
        status: 202,
      };
    }

    const syncJobPersistence = await enqueuePlaidSyncJob(
      {
        providerEventId,
        providerItemId,
      },
      env,
    );

    if (persistenceFailed(syncJobPersistence)) {
      return {
        body: {
          accepted: false,
          error: "Linked-bank webhook sync could not be queued.",
          eventPersistence,
          mode: "retry_required",
          providerEventId,
          readiness,
          service: "payshield-provider-webhook",
          syncJobPersistence,
        },
        status: 503,
      };
    }

    return {
      body: {
        accepted: true,
        duplicate: eventPersistence.replayed,
        eventPersistence,
        mode: "plaid_sync_queued",
        providerEventId,
        readiness,
        service: "payshield-provider-webhook",
        syncJob: syncJobPersistence.job,
        syncJobPersistence,
      },
      status: 202,
    };
  }

  if (moneyLifecycle) {
    const lifecyclePersistence = await applyProviderMoneyLifecycle(
      moneyLifecycle,
      { env, providerEventId, providerName },
    );

    if (persistenceFailed(lifecyclePersistence)) {
      return {
        body: {
          accepted: false,
          error: "Provider money lifecycle could not be persisted.",
          eventPersistence,
          lifecyclePersistence,
          providerEventId,
          readiness,
          service: "payshield-provider-webhook",
        },
        status: 503,
      };
    }

    if (
      moneyLifecycle.invalidReason ||
      !lifecyclePersistence.found ||
      lifecyclePersistence.amountMismatch ||
      lifecyclePersistence.conflict
    ) {
      const exceptionPersistence = await persistProviderLifecycleException(
        {
          lifecycle: moneyLifecycle,
          lifecyclePersistence,
          providerEventId,
          providerName,
        },
        env,
      );

      if (persistenceFailed(exceptionPersistence)) {
        return {
          body: {
            accepted: false,
            error: "Provider money exception could not be queued.",
            eventPersistence,
            exceptionPersistence,
            lifecyclePersistence,
            providerEventId,
            readiness,
            service: "payshield-provider-webhook",
          },
          status: 503,
        };
      }

      return {
        body: {
          accepted: true,
          duplicate: eventPersistence.replayed,
          eventPersistence,
          exceptionPersistence,
          lifecycle: moneyLifecycle,
          lifecyclePersistence,
          mode: "review_required",
          providerEventId,
          readiness,
          service: "payshield-provider-webhook",
        },
        status: 202,
      };
    }

    return {
      body: {
        accepted: true,
        duplicate: eventPersistence.replayed,
        eventPersistence,
        lifecycle: moneyLifecycle,
        lifecyclePersistence,
        mode: lifecyclePersistence.replayed
          ? "money_lifecycle_replayed"
          : "money_lifecycle_updated",
        providerEventId,
        readiness,
        service: "payshield-provider-webhook",
      },
      status: 202,
    };
  }

  if (payeeUpdate) {
    const payeePersistence = payeeUpdate.invalidReason
      ? {
          found: false,
          invalid: true,
          persisted: true,
          persistence: "validation",
        }
      : await updatePayeeProviderStatus(
          {
            idempotencyKey: `provider-payee:${providerName}:${providerEventId}`,
            providerEventId,
            providerName,
            providerPayeeId: payeeUpdate.providerPayeeId,
            status: payeeUpdate.status,
          },
          env,
        );

    if (persistenceFailed(payeePersistence)) {
      return {
        body: {
          accepted: false,
          error: "Payment destination verification could not be updated.",
          eventPersistence,
          payeePersistence,
          providerEventId,
          readiness,
          service: "payshield-provider-webhook",
        },
        status: 503,
      };
    }

    if (payeeUpdate.invalidReason || !payeePersistence.found) {
      const exceptionPersistence = await persistProviderPayeeException(
        {
          payeePersistence,
          payeeUpdate,
          providerEventId,
          providerName,
        },
        env,
      );

      if (persistenceFailed(exceptionPersistence)) {
        return {
          body: {
            accepted: false,
            error: "Payment destination exception could not be queued.",
            eventPersistence,
            exceptionPersistence,
            payeePersistence,
            providerEventId,
            readiness,
            service: "payshield-provider-webhook",
          },
          status: 503,
        };
      }

      return {
        body: {
          accepted: true,
          duplicate: eventPersistence.replayed,
          eventPersistence,
          exceptionPersistence,
          mode: "review_required",
          payeePersistence,
          providerEventId,
          readiness,
          service: "payshield-provider-webhook",
        },
        status: 202,
      };
    }

    return {
      body: {
        accepted: true,
        duplicate: eventPersistence.replayed,
        eventPersistence,
        mode: "payee_updated",
        payee: payeePersistence.payee,
        payeePersistence,
        providerEventId,
        readiness,
        service: "payshield-provider-webhook",
      },
      status: 202,
    };
  }

  if (kycUpdate) {
    const kycPersistence = await updateProviderKycApplicationStatus(
      {
        ...kycUpdate,
        metadata: {
          providerEventId,
          source: "signed_provider_webhook",
        },
        providerName,
        userKycStatus: appKycStatus(kycUpdate.status),
      },
      env,
    );

    if (persistenceFailed(kycPersistence)) {
      return {
        body: {
          accepted: false,
          error: "Identity verification update could not be persisted.",
          eventPersistence,
          kycPersistence,
          providerEventId,
          readiness,
          service: "payshield-provider-webhook",
        },
        status: 503,
      };
    }

    if (!kycPersistence.updated) {
      const exceptionPersistence = await persistReconciliationException(
        {
          householdId: null,
          idempotencyKey: `provider-kyc-unmatched:${providerName}:${providerEventId}`,
          metadata: {
            providerApplicationId: kycUpdate.providerApplicationId,
            providerCustomerId: kycUpdate.providerCustomerId,
            status: kycUpdate.status,
          },
          providerEventId,
          providerName,
          providerTransactionId: null,
          reasonCode: "provider_kyc_application_not_found",
          severity: "warning",
          source: "provider_webhook",
          summary:
            "A signed identity verification update could not be matched to an onboarding application.",
        },
        env,
      );

      if (persistenceFailed(exceptionPersistence)) {
        return {
          body: {
            accepted: false,
            error: "Unmatched identity verification update could not be queued.",
            eventPersistence,
            exceptionPersistence,
            providerEventId,
            readiness,
            service: "payshield-provider-webhook",
          },
          status: 503,
        };
      }

      return {
        body: {
          accepted: true,
          eventPersistence,
          exceptionPersistence,
          mode: "review_required",
          providerEventId,
          readiness,
          service: "payshield-provider-webhook",
        },
        status: 202,
      };
    }

    return {
      body: {
        accepted: true,
        eventPersistence,
        kyc: kycPersistence.kyc,
        kycPersistence,
        mode: "identity_updated",
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
        [trustedPaycheckDetection]: true,
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
