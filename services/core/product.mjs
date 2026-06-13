import {
  databaseConfigured,
  loadBucketProfile,
  loadPayees,
  persistBucketProfile,
  persistBankConnection,
  persistBillPaymentSchedule,
  persistCardAuthorizationDecision,
  persistCommercialBillingEvent,
  persistJournalEntry,
  persistMoneyRailEvent,
  persistPayee,
  persistPaycheckDetection,
  persistTransferIntent,
  persistUnlockRequest,
} from "./database.mjs";

const serviceName = "payshield-core";
export const coreLedgerSchemaVersion = "0005";

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

  return {
    ok: true,
    readiness,
    routes: [
      "GET /app/me",
      "GET /app/balances",
      "GET /app/buckets",
      "POST /app/buckets",
      "POST /app/bank-connections",
      "POST /app/bill-payments",
      "POST /commercial/billing-events",
      "POST /app/onboarding/start",
      "POST /app/payees",
      "POST /app/paychecks/detect",
      "POST /app/transfers",
      "POST /app/unlocks",
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
        "Live money is blocked until provider, ledger, auth, counsel, disclosure, and operations gates are complete.",
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
      authorizationMode: readiness.liveMoneyReady ? "provider_gateway" : "simulation",
      cardLast4: readiness.liveMoneyReady ? "9244" : "----",
      status: readiness.liveMoneyReady ? "live" : "gated",
    },
    directDeposit: {
      accountLast4: readiness.liveMoneyReady ? "4421" : "----",
      accountName: "PayShield protected paycheck account",
      providerStatus: readiness.liveMoneyReady ? "live" : "gated",
      routingLast4: readiness.liveMoneyReady ? "0210" : "----",
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
    checkoutSessionId: safeString(summary.checkoutSessionId, 160) || null,
    customerId: safeString(summary.customerId, 160) || null,
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
  const persistence = await persistCommercialBillingEvent(
    {
      accessStatus: record.accessStatus,
      customerId: record.customerId,
      eventId,
      eventType,
      payload: {
        event,
        summary: record,
      },
      providerName,
      subscriptionId: record.subscriptionId,
    },
    env,
  );

  if (persistence.persistence === "postgres_error") {
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

  if (persistence.persistence === "postgres_error") {
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

export function getProfile(env = process.env, actorInput = demoUser) {
  const actor = normalizeActor(actorInput);
  const snapshot = createNeobankSnapshot(undefined, env, {}, actor);

  return {
    auth: {
      authMode: "core_service",
      userId: snapshot.user.id,
    },
    householdId: snapshot.householdId,
    kycStatus: snapshot.user.kycStatus,
    profile: {
      access: snapshot.user.profileAccess,
      audience: "US households",
      release: "commercial_control_profile",
    },
    readiness: snapshot.readiness,
    user: snapshot.user,
  };
}

export async function getBalances(env = process.env, actorInput = demoUser) {
  const actor = normalizeActor(actorInput);
  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const book = createDemoLedgerBook(300_000, controls.buckets);
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
      protectedCents: snapshot.buckets
        .filter((bucket) => bucket.id !== "safe_spending")
        .reduce((sum, bucket) => sum + bucket.availableCents, 0),
      readiness: snapshot.readiness,
      safeToSpendCents: safeSpend?.availableCents ?? 0,
    },
    status: 200,
  };
}

export async function getBucketProfile(env = process.env, actorInput = demoUser) {
  const actor = normalizeActor(actorInput);
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

export function startOnboarding(env = process.env, actorInput = demoUser) {
  const readiness = getCoreReadiness(env, { coreOnline: true });
  const liveGate = assertLiveMoneyReady(readiness);
  const blocked = providerBlockedResult(readiness);
  const actor = normalizeActor(actorInput);

  return {
    body: {
      card: {
        cardLast4: blocked ? "----" : "9244",
        providerCardId: blocked ? "card-provider-contract-required" : "card-live",
        status: blocked ? "blocked" : "issued",
      },
      customer: {
        providerCustomerId: blocked ? "provider-contract-required" : "provider-customer-live",
        status: blocked ? "blocked" : "created",
      },
      directDeposit: {
        accountLast4: blocked ? "----" : "4421",
        accountName: "PayShield protected paycheck account",
        providerStatus: blocked ? "gated" : "live",
        routingLast4: blocked ? "----" : "0210",
      },
      financialAccount: {
        providerAccountId: blocked ? "financial-account-provider-contract-required" : "financial-account-live",
        status: blocked ? "blocked" : "opened",
      },
      kyc: {
        providerApplicationId: blocked ? "kyc-provider-contract-required" : "kyc-provider-application-live",
        status: blocked ? "blocked" : "started",
      },
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

function getMoneyRailReadiness(env = process.env) {
  const neobank = getCoreReadiness(env, { coreOnline: true });
  const plaidConfigured = envPresent(env, "PLAID_CLIENT_ID") && envPresent(env, "PLAID_SECRET");
  const transferConfigured =
    envTrue(env, "PAYSHIELD_TRANSFER_ENABLED") &&
    (envPresent(env, "PLAID_TRANSFER_CLIENT_ID") ||
      envPresent(env, "PAYSHIELD_BAAS_API_KEY") ||
      plaidConfigured);
  const tokenVaultConfigured =
    envPresent(env, "PAYSHIELD_TOKEN_VAULT_KEY_ID") ||
    envPresent(env, "PAYSHIELD_BAAS_API_KEY");

  return {
    bankLinkReady: plaidConfigured && tokenVaultConfigured,
    detectionMode: plaidConfigured ? "plaid_transactions_sync" : "manual_or_provider_webhook",
    paycheckDetectionReady: plaidConfigured && tokenVaultConfigured,
    liveMoneyReady: neobank.liveMoneyReady,
    missing: [
      ...(plaidConfigured ? [] : ["PLAID_CLIENT_ID", "PLAID_SECRET"]),
      ...(transferConfigured
        ? []
        : ["PAYSHIELD_TRANSFER_ENABLED plus transfer/BaaS credentials"]),
      ...(plaidConfigured && !tokenVaultConfigured
        ? ["PAYSHIELD_TOKEN_VAULT_KEY_ID or BaaS token vault"]
        : []),
    ],
    plaidConfigured,
    plaidEnv: env.PLAID_ENV?.trim() || "sandbox",
    tokenVaultConfigured,
    transferConfigured,
    transferReady: neobank.liveMoneyReady && transferConfigured,
  };
}

function persistenceFailed(result) {
  return result?.persistence === "postgres_error";
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
  const actor = actorFromPayload(payload);
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

  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const book = new LedgerBook();
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
        employerName,
        idempotencyKey: entry.idempotencyKey,
        journalEntryId: entry.id,
      },
      providerEventId: `paycheck:${entry.idempotencyKey}`,
      providerName: readiness.plaidConfigured ? "plaid" : "payshield",
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
        mode: getMoneyRailReadiness(env).detectionMode,
        receivedAt: entry.metadata?.receivedAt,
      },
      ledgerEntry: entry,
      journalPersistence,
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
  const actor = actorFromPayload(payload);
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

  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const book = createDemoLedgerBook(300_000, controls.buckets);
  const balances = buildBucketBalances(book, controls.buckets);
  const sourceBucket = balances.find(
    (bucket) => bucket.id === payload.sourceBucketId,
  );

  if (!sourceBucket || amountCents > sourceBucket.availableCents) {
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
  const providerTransfer = {
    providerTransferId:
      readiness.liveMoneyReady && readiness.transferConfigured
        ? "transfer-provider-live"
        : "transfer-provider-contract-required",
    status:
      readiness.liveMoneyReady && readiness.transferConfigured
        ? "created"
        : "blocked",
  };
  const transferStatus = providerTransfer.status === "created" ? "submitted" : "blocked";
  const persistence = await persistTransferIntent(
    {
      amountCents,
      destinationPayeeId,
      householdId: actor.householdId,
      idempotencyKey,
      providerName: readiness.transferConfigured ? env.PAYSHIELD_BAAS_PROVIDER || "configured_rail" : null,
      providerStatus: providerTransfer.status,
      providerTransferId: providerTransfer.providerTransferId,
      sourceBucketId: payload.sourceBucketId,
      status: transferStatus,
    },
    env,
  );

  if (persistenceFailed(persistence)) {
    return {
      body: {
        error: "Transfer intent could not be persisted.",
        persistence,
        readiness,
        service: "payshield-transfer-intents",
      },
      status: 503,
    };
  }

  const auditPersistence = await persistMoneyRailEvent(
    {
      eventType: "transfer_intent_created",
      householdId: actor.householdId,
      payload: {
        amountCents,
        destinationPayeeId,
        idempotencyKey,
        providerTransfer,
        sourceBucketId: payload.sourceBucketId,
      },
      providerEventId: `transfer:${idempotencyKey}`,
      providerName: readiness.transferConfigured ? env.PAYSHIELD_BAAS_PROVIDER || "configured_rail" : "payshield",
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
        idempotencyKey,
        controlPersistence: {
          bucketProfile: controls.bucketPersistence,
          payees: controls.payeePersistence,
        },
        providerStatus: providerTransfer.status,
        readiness,
        sourceBucketId: payload.sourceBucketId,
      },
      message:
        providerTransfer.status === "created"
          ? "Protected transfer created with the configured provider."
          : "Transfer intent validated. Provider execution remains locked until approved money-rail credentials are active.",
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
  const actor = actorFromPayload(payload);
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

  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const idempotencyKey =
    cleanText(payload?.idempotencyKey, 120) ||
    `bill-${payeeId}-${amountCents}-${scheduledFor}`;
  const memo = cleanText(payload?.memo, 120) || undefined;
  const book = createDemoLedgerBook(300_000, controls.buckets);
  const decision = scheduleBillPayment(book, controls.payees, {
    amountCents,
    idempotencyKey,
    memo,
    payeeId,
    scheduledFor,
  });
  const readiness = getCoreReadiness(env, { coreOnline: true });
  const providerBillPayment = decision.accepted
    ? {
        providerBillPaymentId: readiness.liveMoneyReady
          ? "bill-pay-live"
          : "bill-pay-provider-contract-required",
        status: readiness.liveMoneyReady ? "created" : "blocked",
      }
    : {
        providerBillPaymentId: "bill-pay-not-scheduled",
        status: "blocked",
      };
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
      message: decision.accepted
        ? "Bill payment scheduled in the protected bucket model. Provider execution requires active money-movement controls."
        : "Bill payment was not scheduled.",
      mode: "simulation",
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
  const actor = actorFromPayload(payload);
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

  const book = createDemoLedgerBook(300_000, controls.buckets);
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
      journalPersistence,
      message: "Recovery plan created. Provider execution requires active money-movement controls.",
      mode: "simulation",
      readiness: getCoreReadiness(env, { coreOnline: true }),
      result,
    },
    status: 200,
  };
}

export async function authorizeCard(payload, env = process.env) {
  const actor = actorFromPayload(payload);
  const amountCents = toIntegerCents(payload?.amountCents, { min: 1 });

  if (amountCents === null) {
    return {
      body: {
        error: "Provide integer amountCents.",
      },
      status: 400,
    };
  }

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

  if (readiness.liveMoneyReady) {
    return {
      body: {
        decision: {
          approved: false,
          approvedAmountCents: 0,
          code: "live_money_gated",
          reason:
            "No live provider adapter is configured. Use the PayShield ledger decision path before enabling card gateway responses.",
        },
        mode: "provider_gateway",
        readiness,
      },
      status: 200,
    };
  }

  const controls = await loadOperationalControls(env, actor);

  if (controls.error) {
    return controls.error;
  }

  const book = createDemoLedgerBook(300_000, controls.buckets);
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
      providerStatus: "simulation",
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
      ledgerEntries: book.allEntries(),
      mode: "simulation",
      readiness,
      service: "payshield-card-authorization",
    },
    status: 200,
  };
}

export function handleProviderWebhook(payload, env = process.env) {
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
  const blocked = providerBlockedResult(readiness);

  if (blocked) {
    return {
      body: {
        accepted: true,
        mode: "blocked",
        readiness,
        reason: blocked.reason,
        service: "payshield-provider-webhook",
      },
      status: 202,
    };
  }

  return {
    body: {
      accepted: true,
      mode: "processed",
      readiness,
      service: "payshield-provider-webhook",
    },
    status: 202,
  };
}
