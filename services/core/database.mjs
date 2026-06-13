import { createCipheriv, createHash, randomBytes } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

let activePool = null;
let activeDatabaseUrl = "";

function databaseUrl(env = process.env) {
  return env.PAYSHIELD_LEDGER_DATABASE_URL?.trim() || "";
}

function parsePoolNumber(value, fallback, { max, min }) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }

  return parsed;
}

export function databaseConfigured(env = process.env) {
  return Boolean(databaseUrl(env));
}

function recordId(prefix, ...parts) {
  const digest = createHash("sha256")
    .update(parts.filter(Boolean).join(":"))
    .digest("hex")
    .slice(0, 32);

  return `${prefix}_${digest}`;
}

function poolFor(env = process.env) {
  const url = databaseUrl(env);

  if (!url) {
    return null;
  }

  if (!activePool || activeDatabaseUrl !== url) {
    activePool = new Pool({
      connectionTimeoutMillis: parsePoolNumber(
        env.PAYSHIELD_CORE_DB_CONNECT_TIMEOUT_MS,
        2_000,
        { max: 10_000, min: 100 },
      ),
      connectionString: url,
      idleTimeoutMillis: parsePoolNumber(
        env.PAYSHIELD_CORE_DB_IDLE_TIMEOUT_MS,
        30_000,
        { max: 120_000, min: 1_000 },
      ),
      max: parsePoolNumber(env.PAYSHIELD_CORE_DB_POOL_SIZE, 5, {
        max: 20,
        min: 1,
      }),
    });
    activeDatabaseUrl = url;
  }

  return activePool;
}

function persistenceSkipped(kind) {
  return {
    persisted: false,
    persistence: "memory",
    persistenceReason: `${kind} accepted without PAYSHIELD_LEDGER_DATABASE_URL.`,
  };
}

function persistenceFailed(error) {
  return {
    persisted: false,
    persistence: "postgres_error",
    persistenceReason:
      error instanceof Error ? error.message : "Postgres write failed.",
  };
}

function tokenVaultKey(env = process.env) {
  const raw = env.PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY?.trim() || "";

  if (!raw) {
    return {
      error: "PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY is required for token vault custody.",
    };
  }

  if (raw.startsWith("base64:")) {
    const decoded = Buffer.from(raw.slice("base64:".length), "base64");

    return decoded.length === 32
      ? { key: decoded }
      : {
          error:
            "PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY must decode to 32 bytes.",
        };
  }

  const utf8 = Buffer.from(raw, "utf8");

  if (utf8.length === 32) {
    return { key: utf8 };
  }

  const decoded = Buffer.from(raw, "base64");

  return decoded.length === 32
    ? { key: decoded }
    : {
        error:
          "PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY must be 32 UTF-8 bytes or base64:32-byte-material.",
      };
}

function encryptProviderToken(input, env = process.env) {
  const keyMaterial = tokenVaultKey(env);

  if (!keyMaterial.key) {
    return keyMaterial;
  }

  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial.key, nonce);
  const aad = Buffer.from(
    `${input.providerName}:${input.providerItemId}:${input.keyId}`,
    "utf8",
  );

  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([
    cipher.update(input.accessToken, "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm: "aes-256-gcm",
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
  };
}

function centsNumber(value) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
}

function timestampString(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" ? value : null;
}

function redactAuditPayload(value) {
  if (Array.isArray(value)) {
    return value.map(redactAuditPayload);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /secret|token|authorization|password|credential/i.test(key)
        ? "[redacted]"
        : redactAuditPayload(item),
    ]),
  );
}

function bucketFromRow(row) {
  return {
    due: row.due_rule,
    id: row.slug,
    name: row.name,
    ...(row.payee_id ? { payeeId: row.payee_id } : {}),
    priority: Number(row.priority),
    protection: row.protection,
    targetCents: centsNumber(row.target_cents),
  };
}

function bucketIdFromLedgerAccount(accountId) {
  const prefix = "liability:bucket:";

  return typeof accountId === "string" && accountId.startsWith(prefix)
    ? accountId.slice(prefix.length)
    : null;
}

function payeeFromRow(row) {
  return {
    allowedBucketId: row.allowed_bucket_id,
    id: row.id,
    maxCents: centsNumber(row.max_cents),
    name: row.name,
    status: row.status,
  };
}

function paycheckDetectionRuleFromRow(row = {}) {
  return {
    amountRangeCents: {
      max: row.maximum_amount_cents ? centsNumber(row.maximum_amount_cents) : null,
      min: row.minimum_amount_cents ? centsNumber(row.minimum_amount_cents) : null,
    },
    bankConnectionId: row.bank_connection_id || null,
    createdAt: timestampString(row.created_at),
    expectedFrequency: row.expected_frequency || "unknown",
    id: row.id,
    idempotencyKey: row.idempotency_key || null,
    match: {
      employerNamePattern: row.employer_name_pattern || null,
      transactionNamePattern: row.transaction_name_pattern || null,
    },
    priority: Number(row.priority || 100),
    providerAccountId: row.provider_account_id || null,
    providerItemId: row.provider_item_id || null,
    providerName: row.provider_name || "plaid",
    ruleName: row.rule_name,
    status: row.status || "active",
    updatedAt: timestampString(row.updated_at),
  };
}

function directDepositSetupFromRow(row = {}) {
  return {
    accountLast4: row.account_last4 || "----",
    accountName: row.account_name || "PayShield protected paycheck account",
    createdAt: timestampString(row.created_at),
    id: row.id,
    idempotencyKey: row.idempotency_key,
    providerAccountId: row.provider_account_id || null,
    providerCustomerId: row.provider_customer_id || null,
    providerName: row.provider_name || "payshield",
    providerStatus: row.provider_status || "gated",
    routingLast4: row.routing_last4 || "----",
    status: row.status || "blocked",
    updatedAt: timestampString(row.updated_at),
  };
}

function commercialCheckoutIntentFromRow(row = {}) {
  return {
    checkoutMode: row.checkout_mode || "not_configured",
    checkoutUrlPresent: Boolean(row.checkout_url_present),
    createdAt: timestampString(row.created_at),
    errorCode: row.error_code || null,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    priceLabel: row.price_label || null,
    providerCheckoutId: row.provider_checkout_id || null,
    providerName: row.provider_name || "stripe",
    status: row.status || "blocked",
    updatedAt: timestampString(row.updated_at),
    userId: row.user_id || null,
  };
}

function reconciliationExceptionFromRow(row = {}) {
  return {
    createdAt: timestampString(row.created_at),
    householdId: row.household_id || null,
    id: row.id,
    idempotencyKey: row.idempotency_key || null,
    lastSeenAt: timestampString(row.last_seen_at),
    metadata: redactAuditPayload(row.metadata || {}),
    providerEventId: row.provider_event_id || null,
    providerName: row.provider_name || null,
    providerTransactionId: row.provider_transaction_id || null,
    reasonCode: row.reason_code || null,
    resolvedAt: timestampString(row.resolved_at),
    severity: row.severity || "warning",
    source: row.source || "system",
    status: row.status || "open",
    summary: row.summary,
  };
}

function ledgerAccountShape(householdId, accountId) {
  const bucketId = bucketIdFromLedgerAccount(accountId);

  if (bucketId) {
    return {
      accountType: "liability",
      bucketId,
      id: recordId("ledger_bucket", householdId, bucketId),
    };
  }

  if (accountId === "asset:program_cash") {
    return {
      accountType: "asset",
      bucketId: null,
      id: recordId("ledger_asset", householdId, "program_cash"),
    };
  }

  return {
    accountType: accountId.startsWith("asset:") ? "asset" : "liability",
    bucketId: null,
    id: recordId("ledger_account", householdId, accountId),
  };
}

function bucketRuleForProtection(protection) {
  if (protection === "bill_only") {
    return {
      cardScope: "approved_payee",
      unlockPolicy: "support_review",
    };
  }

  if (protection === "emergency") {
    return {
      cardScope: "none",
      unlockPolicy: "instant_allowed",
    };
  }

  if (protection === "spendable") {
    return {
      cardScope: "safe_spend",
      unlockPolicy: "slow_free",
    };
  }

  if (protection === "soft_lock") {
    return {
      cardScope: "none",
      unlockPolicy: "slow_free",
    };
  }

  return {
    cardScope: "none",
    unlockPolicy: "support_review",
  };
}

async function readBucketProfile(client, householdId) {
  const result = await client.query(
    `
      SELECT
        slug,
        name,
        target_cents,
        priority,
        protection,
        due_rule,
        payee_id
      FROM household_buckets
      WHERE household_id = $1
        AND status = 'active'
      ORDER BY priority ASC, created_at ASC
    `,
    [householdId],
  );

  return result.rows.map(bucketFromRow);
}

async function ensureHousehold(client, input) {
  await client.query(
    `
      INSERT INTO households (id, beta_access_status)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE SET
        beta_access_status = EXCLUDED.beta_access_status
    `,
    [input.householdId, input.betaAccessStatus || "approved"],
  );
}

async function ensureHouseholdIdentity(client, input) {
  await ensureHousehold(client, input);

  await client.query(
    `
      INSERT INTO app_users (
        id,
        household_id,
        clerk_subject,
        email,
        name,
        kyc_status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        household_id = EXCLUDED.household_id,
        clerk_subject = COALESCE(EXCLUDED.clerk_subject, app_users.clerk_subject),
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        kyc_status = EXCLUDED.kyc_status
    `,
    [
      input.actorUserId,
      input.householdId,
      input.clerkSubject || null,
      input.userEmail || "private-household@example.com",
      input.userName || "PayShield household",
      input.kycStatus || "provider_pending",
    ],
  );
}

function payeeIdFor(input) {
  if (input.id) {
    return input.id;
  }

  const slug =
    input.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "payee";

  return `payee_modeled_${slug}`;
}

export async function loadPayees(householdId, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return {
      ...persistenceSkipped("payees"),
      payees: null,
      payeesFound: false,
    };
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          allowed_bucket_id,
          name,
          max_cents,
          status
        FROM payees
        WHERE household_id = $1
        ORDER BY created_at ASC, name ASC
      `,
      [householdId],
    );
    const payees = result.rows.map(payeeFromRow);

    return {
      payees,
      payeesFound: payees.length > 0,
      persisted: payees.length > 0,
      persistence: "postgres",
    };
  } catch (error) {
    return {
      ...persistenceFailed(error),
      payees: null,
      payeesFound: false,
    };
  }
}

export async function persistPayee(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("payee");
  }

  let client = null;
  const id = payeeIdFor(input);

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await ensureHouseholdIdentity(client, input);

    const result = await client.query(
      `
        INSERT INTO payees (
          id,
          household_id,
          allowed_bucket_id,
          name,
          max_cents,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          household_id = EXCLUDED.household_id,
          allowed_bucket_id = EXCLUDED.allowed_bucket_id,
          name = EXCLUDED.name,
          max_cents = EXCLUDED.max_cents,
          status = EXCLUDED.status
        RETURNING id, allowed_bucket_id, name, max_cents, status
      `,
      [
        id,
        input.householdId,
        input.allowedBucketId,
        input.name,
        input.maxCents,
        input.status,
      ],
    );

    await client.query("COMMIT");

    return {
      payee: payeeFromRow(result.rows[0]),
      persisted: true,
      persistence: "postgres",
      postgresId: id,
      replayed: false,
    };
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback failures; the original error is more useful.
      }
    }

    return persistenceFailed(error);
  } finally {
    client?.release();
  }
}

async function ensureLedgerAccount(client, householdId, accountId) {
  const shape = ledgerAccountShape(householdId, accountId);

  if (shape.bucketId) {
    const existing = await client.query(
      `
        SELECT id
        FROM ledger_accounts
        WHERE household_id = $1
          AND bucket_id = $2
        LIMIT 1
      `,
      [householdId, shape.bucketId],
    );

    if (existing.rows[0]?.id) {
      return existing.rows[0].id;
    }
  }

  await client.query(
    `
      INSERT INTO ledger_accounts (
        id,
        household_id,
        account_type,
        bucket_id
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        household_id = EXCLUDED.household_id,
        account_type = EXCLUDED.account_type,
        bucket_id = EXCLUDED.bucket_id
    `,
    [shape.id, householdId, shape.accountType, shape.bucketId],
  );

  return shape.id;
}

export async function persistJournalEntry(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("journal entry");
  }

  let client = null;
  const entry = input.entry;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await ensureHousehold(client, input);

    const existing = await client.query(
      `
        SELECT id
        FROM journal_entries
        WHERE household_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [input.householdId, entry.idempotencyKey],
    );

    if (existing.rows[0]?.id) {
      await client.query("COMMIT");

      return {
        persisted: true,
        persistence: "postgres",
        postgresId: existing.rows[0].id,
        replayed: true,
      };
    }

    const entryId = recordId(
      "journal_entry",
      input.householdId,
      entry.type,
      entry.idempotencyKey,
    );
    const accountIds = new Map();

    for (const line of entry.lines) {
      if (!accountIds.has(line.accountId)) {
        accountIds.set(
          line.accountId,
          await ensureLedgerAccount(client, input.householdId, line.accountId),
        );
      }
    }

    await client.query(
      `
        INSERT INTO journal_entries (
          id,
          household_id,
          idempotency_key,
          entry_type,
          memo,
          metadata,
          reversed_entry_id,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz)
      `,
      [
        entryId,
        input.householdId,
        entry.idempotencyKey,
        entry.type,
        entry.memo,
        JSON.stringify(entry.metadata || {}),
        entry.reversedEntryId || null,
        entry.createdAt,
      ],
    );

    for (const line of entry.lines) {
      await client.query(
        `
          INSERT INTO journal_lines (
            journal_entry_id,
            ledger_account_id,
            amount_cents
          )
          VALUES ($1, $2, $3)
        `,
        [entryId, accountIds.get(line.accountId), line.amountCents],
      );
    }

    await client.query("COMMIT");

    return {
      lineCount: entry.lines.length,
      persisted: true,
      persistence: "postgres",
      postgresId: entryId,
      replayed: false,
    };
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback failures; the original error is more useful.
      }
    }

    return persistenceFailed(error);
  } finally {
    client?.release();
  }
}

export async function persistCardAuthorizationDecision(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("card authorization decision");
  }

  let client = null;
  const id = recordId(
    "card_decision",
    input.householdId,
    input.idempotencyKey,
  );

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await ensureHousehold(client, input);

    const result = await client.query(
      `
        INSERT INTO card_authorization_decisions (
          id,
          household_id,
          journal_entry_id,
          idempotency_key,
          merchant_name,
          merchant_category_code,
          payee_id,
          bucket_id,
          amount_cents,
          approved,
          approved_amount_cents,
          decision_code,
          reason,
          provider_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (household_id, idempotency_key) DO NOTHING
        RETURNING id
      `,
      [
        id,
        input.householdId,
        input.journalEntryId || null,
        input.idempotencyKey,
        input.merchantName,
        input.merchantCategoryCode || null,
        input.payeeId || null,
        input.bucketId,
        input.amountCents,
        input.approved,
        input.approvedAmountCents,
        input.decisionCode,
        input.reason,
        input.providerStatus,
      ],
    );

    await client.query("COMMIT");

    return {
      persisted: true,
      persistence: "postgres",
      postgresId: id,
      replayed: result.rowCount === 0,
    };
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback failures; the original error is more useful.
      }
    }

    return persistenceFailed(error);
  } finally {
    client?.release();
  }
}

export async function persistBillPaymentSchedule(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("bill payment schedule");
  }

  let client = null;
  const id = recordId(
    "bill_schedule",
    input.householdId,
    input.idempotencyKey,
  );

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await ensureHousehold(client, input);

    const result = await client.query(
      `
        INSERT INTO bill_payment_schedules (
          id,
          household_id,
          journal_entry_id,
          idempotency_key,
          payee_id,
          bucket_id,
          amount_cents,
          scheduled_for,
          memo,
          decision_code,
          reason,
          provider_bill_payment_id,
          provider_status,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (household_id, idempotency_key) DO NOTHING
        RETURNING id
      `,
      [
        id,
        input.householdId,
        input.journalEntryId || null,
        input.idempotencyKey,
        input.payeeId,
        input.bucketId || null,
        input.amountCents,
        input.scheduledFor || null,
        input.memo || null,
        input.decisionCode,
        input.reason,
        input.providerBillPaymentId || null,
        input.providerStatus,
        input.status,
      ],
    );

    await client.query("COMMIT");

    return {
      persisted: true,
      persistence: "postgres",
      postgresId: id,
      replayed: result.rowCount === 0,
    };
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback failures; the original error is more useful.
      }
    }

    return persistenceFailed(error);
  } finally {
    client?.release();
  }
}

export async function persistUnlockRequest(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("unlock request");
  }

  let client = null;
  const id = recordId(
    "unlock_request",
    input.householdId,
    input.idempotencyKey,
  );

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await ensureHousehold(client, input);

    const result = await client.query(
      `
        INSERT INTO unlock_requests (
          id,
          household_id,
          journal_entry_id,
          idempotency_key,
          bucket_id,
          amount_cents,
          unlocked_cents,
          unlock_mode,
          reason,
          recovery_checks,
          recovery_per_check_cents,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (household_id, idempotency_key) DO NOTHING
        RETURNING id
      `,
      [
        id,
        input.householdId,
        input.journalEntryId || null,
        input.idempotencyKey,
        input.bucketId,
        input.amountCents,
        input.unlockedCents,
        input.unlockMode,
        input.reason,
        input.recoveryChecks,
        input.recoveryPerCheckCents,
        input.status,
      ],
    );

    await client.query("COMMIT");

    return {
      persisted: true,
      persistence: "postgres",
      postgresId: id,
      replayed: result.rowCount === 0,
    };
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback failures; the original error is more useful.
      }
    }

    return persistenceFailed(error);
  } finally {
    client?.release();
  }
}

async function ensurePayees(client, input) {
  for (const payee of input.payees || []) {
    await client.query(
      `
        INSERT INTO payees (
          id,
          household_id,
          allowed_bucket_id,
          name,
          max_cents,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          household_id = EXCLUDED.household_id,
          allowed_bucket_id = EXCLUDED.allowed_bucket_id,
          name = EXCLUDED.name,
          max_cents = EXCLUDED.max_cents,
          status = EXCLUDED.status
      `,
      [
        payee.id,
        input.householdId,
        payee.allowedBucketId,
        payee.name,
        payee.maxCents,
        payee.status,
      ],
    );
  }
}

function profileIdempotencyKey(input) {
  if (input.idempotencyKey) {
    return input.idempotencyKey;
  }

  const digest = createHash("sha256")
    .update(JSON.stringify(input.buckets))
    .digest("hex")
    .slice(0, 32);

  return `bucket-profile:${digest}`;
}

export async function loadBucketProfile(householdId, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return {
      ...persistenceSkipped("bucket profile"),
      profile: null,
      profileFound: false,
    };
  }

  try {
    const result = await pool.query(
      `
        SELECT
          slug,
          name,
          target_cents,
          priority,
          protection,
          due_rule,
          payee_id
        FROM household_buckets
        WHERE household_id = $1
          AND status = 'active'
        ORDER BY priority ASC, created_at ASC
      `,
      [householdId],
    );
    const profile = result.rows.map(bucketFromRow);

    return {
      persisted: profile.length > 0,
      persistence: "postgres",
      profile,
      profileFound: profile.length > 0,
    };
  } catch (error) {
    return {
      ...persistenceFailed(error),
      profile: null,
      profileFound: false,
    };
  }
}

export async function persistBucketProfile(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("bucket profile");
  }

  let client = null;
  const idempotencyKey = profileIdempotencyKey(input);

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    await ensureHouseholdIdentity(client, input);
    await ensurePayees(client, input);

    const replay = await client.query(
      `
        SELECT id, after_profile
        FROM household_bucket_change_events
        WHERE household_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [input.householdId, idempotencyKey],
    );

    if (replay.rows[0]) {
      await client.query("COMMIT");

      return {
        bucketCount: Array.isArray(replay.rows[0].after_profile)
          ? replay.rows[0].after_profile.length
          : 0,
        persisted: true,
        persistence: "postgres",
        postgresId: replay.rows[0].id,
        replayed: true,
      };
    }

    const beforeProfile = await readBucketProfile(client, input.householdId);
    const submittedSlugs = input.buckets.map((bucket) => bucket.id);

    await client.query(
      `
        INSERT INTO ledger_accounts (
          id,
          household_id,
          account_type,
          bucket_id
        )
        VALUES ($1, $2, 'asset', NULL)
        ON CONFLICT (id) DO UPDATE SET
          household_id = EXCLUDED.household_id,
          account_type = EXCLUDED.account_type
      `,
      [recordId("ledger_asset", input.householdId, "program_cash"), input.householdId],
    );

    for (const bucket of input.buckets) {
      const bucketId = recordId("bucket", input.householdId, bucket.id);
      const rule = bucketRuleForProtection(bucket.protection);
      const ruleId = recordId("bucket_rule", bucketId);

      await client.query(
        `
          INSERT INTO household_buckets (
            id,
            household_id,
            slug,
            name,
            target_cents,
            priority,
            protection,
            due_rule,
            payee_id,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
          ON CONFLICT (household_id, slug) DO UPDATE SET
            name = EXCLUDED.name,
            target_cents = EXCLUDED.target_cents,
            priority = EXCLUDED.priority,
            protection = EXCLUDED.protection,
            due_rule = EXCLUDED.due_rule,
            payee_id = EXCLUDED.payee_id,
            status = 'active',
            updated_at = now()
          RETURNING id
        `,
        [
          bucketId,
          input.householdId,
          bucket.id,
          bucket.name,
          bucket.targetCents,
          bucket.priority,
          bucket.protection,
          bucket.due,
          bucket.payeeId || null,
        ],
      );

      await client.query(
        `
          INSERT INTO ledger_accounts (
            id,
            household_id,
            account_type,
            bucket_id
          )
          VALUES ($1, $2, 'liability', $3)
          ON CONFLICT (id) DO UPDATE SET
            household_id = EXCLUDED.household_id,
            account_type = EXCLUDED.account_type,
            bucket_id = EXCLUDED.bucket_id
        `,
        [
          recordId("ledger_bucket", input.householdId, bucket.id),
          input.householdId,
          bucket.id,
        ],
      );

      await client.query(
        `
          INSERT INTO household_bucket_rules (
            id,
            bucket_id,
            card_scope,
            unlock_policy,
            mcc_allowlist,
            merchant_allowlist,
            max_authorization_cents
          )
          VALUES ($1, $2, $3, $4, '[]'::jsonb, '[]'::jsonb, NULL)
          ON CONFLICT (id) DO UPDATE SET
            card_scope = EXCLUDED.card_scope,
            unlock_policy = EXCLUDED.unlock_policy,
            updated_at = now()
        `,
        [ruleId, bucketId, rule.cardScope, rule.unlockPolicy],
      );
    }

    const archived = await client.query(
      `
        UPDATE household_buckets
        SET status = 'archived',
            updated_at = now()
        WHERE household_id = $1
          AND status = 'active'
          AND NOT (slug = ANY($2::text[]))
      `,
      [input.householdId, submittedSlugs],
    );

    const eventId = recordId("bucket_change", input.householdId, idempotencyKey);

    await client.query(
      `
        INSERT INTO household_bucket_change_events (
          id,
          household_id,
          actor_user_id,
          event_type,
          before_profile,
          after_profile,
          idempotency_key
        )
        VALUES ($1, $2, $3, 'updated', $4::jsonb, $5::jsonb, $6)
      `,
      [
        eventId,
        input.householdId,
        input.actorUserId,
        JSON.stringify(beforeProfile),
        JSON.stringify(input.buckets),
        idempotencyKey,
      ],
    );

    await client.query("COMMIT");

    return {
      archivedCount: archived.rowCount,
      bucketCount: input.buckets.length,
      persisted: true,
      persistence: "postgres",
      postgresId: eventId,
      replayed: false,
    };
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback failures; the original error is more useful.
      }
    }

    return persistenceFailed(error);
  } finally {
    client?.release();
  }
}

export async function persistCommercialBillingEvent(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("billing event");
  }

  let client = null;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    if (input.householdId && input.userId) {
      await ensureHouseholdIdentity(client, {
        actorUserId: input.userId,
        betaAccessStatus: input.accessStatus === "active" ? "approved" : "pending",
        householdId: input.householdId,
        userEmail: input.userEmail,
        userName: input.userName,
      });
    } else if (input.householdId) {
      await ensureHousehold(client, {
        betaAccessStatus: input.accessStatus === "active" ? "approved" : "pending",
        householdId: input.householdId,
      });
    }

    const id = recordId("billing_event", input.providerName, input.eventId);
    const result = await client.query(
      `
        INSERT INTO commercial_billing_events (
          id,
          provider_name,
          provider_event_id,
          event_type,
          provider_customer_id,
          provider_subscription_id,
          household_id,
          user_id,
          access_status,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (provider_name, provider_event_id) DO NOTHING
        RETURNING id
      `,
      [
        id,
        input.providerName,
        input.eventId,
        input.eventType,
        input.customerId || null,
        input.subscriptionId || null,
        input.householdId || null,
        input.userId || null,
        input.accessStatus,
        JSON.stringify(input.payload),
      ],
    );

    let subscriptionId = null;

    if (input.householdId && input.subscriptionId && result.rowCount > 0) {
      subscriptionId = recordId(
        "commercial_subscription",
        input.providerName,
        input.subscriptionId,
      );

      await client.query(
        `
          INSERT INTO commercial_subscriptions (
            id,
            household_id,
            user_id,
            provider_name,
            provider_customer_id,
            provider_subscription_id,
            price_id,
            access_status,
            subscription_status,
            current_period_end,
            cancel_at_period_end,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11, $12::jsonb)
          ON CONFLICT (provider_name, provider_subscription_id) DO UPDATE SET
            household_id = EXCLUDED.household_id,
            user_id = EXCLUDED.user_id,
            provider_customer_id = EXCLUDED.provider_customer_id,
            price_id = EXCLUDED.price_id,
            access_status = EXCLUDED.access_status,
            subscription_status = EXCLUDED.subscription_status,
            current_period_end = EXCLUDED.current_period_end,
            cancel_at_period_end = EXCLUDED.cancel_at_period_end,
            metadata = EXCLUDED.metadata,
            updated_at = now()
        `,
        [
          subscriptionId,
          input.householdId,
          input.userId || null,
          input.providerName,
          input.customerId || "unknown",
          input.subscriptionId,
          input.priceId || null,
          input.accessStatus === "ignored" ? "pending" : input.accessStatus,
          input.subscriptionStatus || "unknown",
          input.currentPeriodEnd || null,
          Boolean(input.cancelAtPeriodEnd),
          JSON.stringify(input.metadata || {}),
        ],
      );
    }

    await client.query("COMMIT");

    return {
      persisted: true,
      persistence: "postgres",
      postgresId: id,
      replayed: result.rowCount === 0,
      subscriptionId,
    };
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback failures; the original error is more useful.
      }
    }

    return persistenceFailed(error);
  } finally {
    client?.release();
  }
}

export async function persistCommercialCheckoutIntent(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return {
      ...persistenceSkipped("checkout intent"),
      intent: {
        checkoutMode: input.checkoutMode,
        checkoutUrlPresent: Boolean(input.checkoutUrlPresent),
        errorCode: input.errorCode || null,
        id: input.id,
        idempotencyKey: input.idempotencyKey,
        priceLabel: input.priceLabel || null,
        providerCheckoutId: input.providerCheckoutId || null,
        providerName: input.providerName,
        status: input.status,
        userId: input.userId,
      },
    };
  }

  let client = null;

  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await ensureHouseholdIdentity(client, {
      actorUserId: input.userId,
      betaAccessStatus: "approved",
      clerkSubject: input.clerkSubject,
      householdId: input.householdId,
      userEmail: input.userEmail,
      userName: input.userName,
    });

    const id =
      input.id ||
      recordId("checkout_intent", input.householdId, input.idempotencyKey);
    const result = await client.query(
      `
        INSERT INTO commercial_checkout_intents (
          id,
          household_id,
          user_id,
          provider_name,
          provider_checkout_id,
          checkout_mode,
          checkout_url_present,
          price_label,
          status,
          idempotency_key,
          error_code,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
        ON CONFLICT (household_id, idempotency_key)
        DO UPDATE SET
          provider_name = EXCLUDED.provider_name,
          provider_checkout_id = COALESCE(EXCLUDED.provider_checkout_id, commercial_checkout_intents.provider_checkout_id),
          checkout_mode = EXCLUDED.checkout_mode,
          checkout_url_present = EXCLUDED.checkout_url_present,
          price_label = EXCLUDED.price_label,
          status = EXCLUDED.status,
          error_code = EXCLUDED.error_code,
          metadata = commercial_checkout_intents.metadata || EXCLUDED.metadata,
          updated_at = now()
        RETURNING
          id,
          user_id,
          provider_name,
          provider_checkout_id,
          checkout_mode,
          checkout_url_present,
          price_label,
          status,
          idempotency_key,
          error_code,
          created_at,
          updated_at
      `,
      [
        id,
        input.householdId,
        input.userId,
        input.providerName,
        input.providerCheckoutId || null,
        input.checkoutMode,
        Boolean(input.checkoutUrlPresent),
        input.priceLabel || null,
        input.status,
        input.idempotencyKey,
        input.errorCode || null,
        JSON.stringify(input.metadata || {}),
      ],
    );

    await client.query("COMMIT");

    return {
      intent: commercialCheckoutIntentFromRow(result.rows[0]),
      persisted: true,
      persistence: "postgres",
      postgresId: result.rows[0]?.id ?? id,
    };
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback failures; the original error is more useful.
      }
    }

    return persistenceFailed(error);
  } finally {
    client?.release();
  }
}

export async function persistMoneyRailEvent(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("money rail event");
  }

  try {
    const id = recordId("rail_event", input.providerName, input.providerEventId);
    const result = await pool.query(
      `
        INSERT INTO money_rail_events (
          id,
          household_id,
          provider_name,
          provider_event_id,
          event_type,
          rail,
          payload,
          processed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
        ON CONFLICT (provider_name, provider_event_id) DO NOTHING
        RETURNING id
      `,
      [
        id,
        input.householdId || null,
        input.providerName,
        input.providerEventId,
        input.eventType,
        input.rail,
        JSON.stringify(input.payload),
      ],
    );

    return {
      persisted: true,
      persistence: "postgres",
      postgresId: id,
      replayed: result.rowCount === 0,
    };
  } catch (error) {
    return persistenceFailed(error);
  }
}

export async function persistReconciliationException(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return {
      ...persistenceSkipped("reconciliation exception"),
      exception: reconciliationExceptionFromRow({
        created_at: new Date().toISOString(),
        household_id: input.householdId || null,
        id: input.id || input.idempotencyKey || "memory_exception",
        idempotency_key: input.idempotencyKey || null,
        last_seen_at: new Date().toISOString(),
        metadata: input.metadata || {},
        provider_event_id: input.providerEventId || null,
        provider_name: input.providerName || null,
        provider_transaction_id: input.providerTransactionId || null,
        reason_code: input.reasonCode || null,
        resolved_at: null,
        severity: input.severity || "warning",
        source: input.source || "system",
        status: "open",
        summary: input.summary,
      }),
    };
  }

  try {
    const id =
      input.id ||
      recordId(
        "reconciliation_exception",
        input.idempotencyKey ||
          [
            input.source,
            input.providerName,
            input.providerEventId,
            input.providerTransactionId,
            input.reasonCode,
          ].join(":"),
      );
    const result = await pool.query(
      `
        INSERT INTO reconciliation_exceptions (
          id,
          household_id,
          severity,
          status,
          summary,
          source,
          provider_name,
          provider_event_id,
          provider_transaction_id,
          reason_code,
          metadata,
          idempotency_key,
          last_seen_at,
          resolved_at
        )
        VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9, $10::jsonb, $11, now(), NULL)
        ON CONFLICT (id) DO UPDATE SET
          household_id = COALESCE(EXCLUDED.household_id, reconciliation_exceptions.household_id),
          severity = EXCLUDED.severity,
          status = 'open',
          summary = EXCLUDED.summary,
          source = EXCLUDED.source,
          provider_name = COALESCE(EXCLUDED.provider_name, reconciliation_exceptions.provider_name),
          provider_event_id = COALESCE(EXCLUDED.provider_event_id, reconciliation_exceptions.provider_event_id),
          provider_transaction_id = COALESCE(EXCLUDED.provider_transaction_id, reconciliation_exceptions.provider_transaction_id),
          reason_code = EXCLUDED.reason_code,
          metadata = reconciliation_exceptions.metadata || EXCLUDED.metadata,
          idempotency_key = COALESCE(EXCLUDED.idempotency_key, reconciliation_exceptions.idempotency_key),
          last_seen_at = now(),
          resolved_at = NULL
        RETURNING
          id,
          household_id,
          severity,
          status,
          summary,
          source,
          provider_name,
          provider_event_id,
          provider_transaction_id,
          reason_code,
          metadata,
          idempotency_key,
          created_at,
          last_seen_at,
          resolved_at
      `,
      [
        id,
        input.householdId || null,
        input.severity || "warning",
        String(input.summary || "Reconciliation exception recorded.").slice(0, 500),
        input.source || "system",
        input.providerName || null,
        input.providerEventId || null,
        input.providerTransactionId || null,
        input.reasonCode || null,
        JSON.stringify(redactAuditPayload(input.metadata || {})),
        input.idempotencyKey || null,
      ],
    );

    return {
      exception: reconciliationExceptionFromRow(result.rows[0]),
      persisted: true,
      persistence: "postgres",
      postgresId: result.rows[0]?.id ?? id,
      replayed: false,
    };
  } catch (error) {
    return persistenceFailed(error);
  }
}

export async function persistBankConnection(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("bank connection");
  }

  try {
    const id = recordId(
      "bank_connection",
      input.providerName,
      input.providerItemId,
      input.providerAccountId,
    );
    const result = await pool.query(
      `
        INSERT INTO bank_connections (
          id,
          household_id,
          user_id,
          provider_name,
          provider_item_id,
          provider_account_id,
          institution_name,
          account_name,
          account_mask,
          token_secret_ref,
          products,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
        ON CONFLICT (provider_name, provider_item_id, provider_account_id)
        DO UPDATE SET
          institution_name = EXCLUDED.institution_name,
          account_name = EXCLUDED.account_name,
          account_mask = EXCLUDED.account_mask,
          token_secret_ref = EXCLUDED.token_secret_ref,
          products = EXCLUDED.products,
          status = EXCLUDED.status,
          updated_at = now()
        RETURNING id
      `,
      [
        id,
        input.householdId,
        input.userId,
        input.providerName,
        input.providerItemId,
        input.providerAccountId,
        input.institutionName,
        input.accountName || null,
        input.accountMask || null,
        input.tokenSecretRef,
        JSON.stringify(input.products || []),
        input.status,
      ],
    );

    return {
      persisted: true,
      persistence: "postgres",
      postgresId: result.rows[0]?.id ?? id,
      replayed: false,
    };
  } catch (error) {
    return persistenceFailed(error);
  }
}

export async function loadBankConnectionForProvider(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return {
      bankConnection: null,
      persisted: false,
      persistence: "memory",
      persistenceReason:
        "Bank connection lookup skipped without PAYSHIELD_LEDGER_DATABASE_URL.",
    };
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          household_id,
          user_id,
          provider_name,
          provider_item_id,
          provider_account_id,
          institution_name,
          status
        FROM bank_connections
        WHERE provider_name = $1
          AND provider_item_id = $2
          AND ($3::text IS NULL OR provider_account_id = $3)
          AND status IN ('connected', 'syncing')
        ORDER BY updated_at DESC, connected_at DESC
        LIMIT 1
      `,
      [
        input.providerName,
        input.providerItemId,
        input.providerAccountId || null,
      ],
    );
    const row = result.rows[0];

    return {
      bankConnection: row
        ? {
            householdId: row.household_id,
            id: row.id,
            institutionName: row.institution_name,
            providerAccountId: row.provider_account_id,
            providerItemId: row.provider_item_id,
            providerName: row.provider_name,
            status: row.status,
            userId: row.user_id,
          }
        : null,
      persisted: true,
      persistence: "postgres",
    };
  } catch (error) {
    return persistenceFailed(error);
  }
}

export async function persistProviderTokenSecret(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return {
      persisted: false,
      persistence: "postgres_required",
      persistenceReason:
        "Provider token vault requires PAYSHIELD_LEDGER_DATABASE_URL.",
    };
  }

  const encrypted = encryptProviderToken(input, env);

  if (encrypted.error) {
    return {
      persisted: false,
      persistence: "token_vault_key_error",
      persistenceReason: encrypted.error,
    };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const id = recordId(
      "token_secret",
      input.providerName,
      input.providerItemId,
    );
    const tokenSecretRef = `vault://${input.providerName}/${input.providerItemId}`;
    const tokenFingerprint = createHash("sha256")
      .update(input.accessToken)
      .digest("hex");
    const existing = await client.query(
      `
        SELECT token_fingerprint_sha256
        FROM provider_token_secrets
        WHERE provider_name = $1 AND provider_item_id = $2
        FOR UPDATE
      `,
      [input.providerName, input.providerItemId],
    );
    const previousFingerprint =
      existing.rows[0]?.token_fingerprint_sha256 ?? "";
    const replayed = previousFingerprint === tokenFingerprint;
    const eventType =
      existing.rowCount === 0
        ? "token_stored"
        : replayed
          ? "token_replayed"
          : "token_rotated";

    await client.query(
      `
        INSERT INTO provider_token_secrets (
          id,
          provider_name,
          provider_item_id,
          key_id,
          algorithm,
          ciphertext,
          nonce,
          auth_tag,
          token_fingerprint_sha256,
          request_id,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
        ON CONFLICT (provider_name, provider_item_id)
        DO UPDATE SET
          key_id = EXCLUDED.key_id,
          algorithm = EXCLUDED.algorithm,
          ciphertext = EXCLUDED.ciphertext,
          nonce = EXCLUDED.nonce,
          auth_tag = EXCLUDED.auth_tag,
          token_fingerprint_sha256 = EXCLUDED.token_fingerprint_sha256,
          request_id = EXCLUDED.request_id,
          status = 'active',
          updated_at = now(),
          rotated_at = CASE
            WHEN provider_token_secrets.token_fingerprint_sha256 <> EXCLUDED.token_fingerprint_sha256
            THEN now()
            ELSE provider_token_secrets.rotated_at
          END,
          revoked_at = NULL
      `,
      [
        id,
        input.providerName,
        input.providerItemId,
        input.keyId,
        encrypted.algorithm,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.authTag,
        tokenFingerprint,
        input.requestId || null,
      ],
    );

    await client.query(
      `
        INSERT INTO provider_token_vault_events (
          id,
          provider_name,
          provider_item_id,
          request_id,
          event_type,
          key_id,
          token_secret_ref,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        recordId(
          "token_vault_event",
          input.providerName,
          input.providerItemId,
          input.requestId || "",
          eventType,
          String(Date.now()),
          randomBytes(6).toString("hex"),
        ),
        input.providerName,
        input.providerItemId,
        input.requestId || null,
        eventType,
        input.keyId,
        tokenSecretRef,
        JSON.stringify({
          tokenFingerprintPrefix: tokenFingerprint.slice(0, 12),
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      eventType,
      persisted: true,
      persistence: "postgres",
      postgresId: id,
      replayed,
      tokenSecretRef,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failures; the original error is more useful.
    }

    return persistenceFailed(error);
  } finally {
    client.release();
  }
}

export async function persistPaycheckDetection(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("paycheck detection");
  }

  try {
    const id = recordId(
      "paycheck_detection",
      input.householdId,
      input.idempotencyKey,
    );
    const result = await pool.query(
      `
        INSERT INTO paycheck_detections (
          id,
          household_id,
          bank_connection_id,
          detection_rule_id,
          provider_event_id,
          provider_transaction_id,
          employer_name,
          amount_cents,
          received_at,
          journal_entry_id,
          idempotency_key,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, $11, $12)
        ON CONFLICT (household_id, idempotency_key) DO NOTHING
        RETURNING id
      `,
      [
        id,
        input.householdId,
        input.bankConnectionId || null,
        input.detectionRuleId || null,
        input.providerEventId || null,
        input.providerTransactionId || null,
        input.employerName,
        input.amountCents,
        input.receivedAt,
        input.journalEntryId || null,
        input.idempotencyKey,
        input.status,
      ],
    );

    if (input.detectionRuleId) {
      await pool.query(
        `
          UPDATE paycheck_detection_rules
          SET last_matched_at = now(), updated_at = now()
          WHERE id = $1 AND household_id = $2
        `,
        [input.detectionRuleId, input.householdId],
      );
    }

    return {
      persisted: true,
      persistence: "postgres",
      postgresId: id,
      replayed: result.rowCount === 0,
    };
  } catch (error) {
    return persistenceFailed(error);
  }
}

export async function loadActivePaycheckDetectionRules(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return {
      ...persistenceSkipped("paycheck detection rules"),
      rules: [],
    };
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          rule_name,
          provider_name,
          employer_name_pattern,
          transaction_name_pattern,
          minimum_amount_cents,
          maximum_amount_cents,
          status,
          provider_item_id,
          provider_account_id,
          bank_connection_id,
          expected_frequency,
          priority,
          idempotency_key,
          created_at,
          updated_at
        FROM paycheck_detection_rules
        WHERE household_id = $1
          AND status = 'active'
          AND provider_name = $2
        ORDER BY priority ASC, updated_at DESC, created_at DESC
        LIMIT 50
      `,
      [input.householdId, input.providerName || "plaid"],
    );

    return {
      persisted: true,
      persistence: "postgres",
      rules: result.rows.map((row) => paycheckDetectionRuleFromRow(row)),
    };
  } catch (error) {
    return persistenceFailed(error);
  }
}

export async function persistPaycheckDetectionRule(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return {
      ...persistenceSkipped("paycheck detection rule"),
      rule: {
        amountRangeCents: {
          max: input.maximumAmountCents || null,
          min: input.minimumAmountCents || null,
        },
        expectedFrequency: input.expectedFrequency,
        bankConnectionId: input.bankConnectionId || null,
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
      },
    };
  }

  try {
    const id =
      input.id ||
      recordId(
        "paycheck_detection_rule",
        input.householdId,
        input.idempotencyKey,
      );
    const result = await pool.query(
      `
        INSERT INTO paycheck_detection_rules (
          id,
          household_id,
          rule_name,
          provider_name,
          employer_name_pattern,
          transaction_name_pattern,
          minimum_amount_cents,
          maximum_amount_cents,
          status,
          bank_connection_id,
          provider_item_id,
          provider_account_id,
          expected_frequency,
          priority,
          metadata,
          idempotency_key
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)
        ON CONFLICT (household_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL
        DO UPDATE SET
          rule_name = EXCLUDED.rule_name,
          provider_name = EXCLUDED.provider_name,
          employer_name_pattern = EXCLUDED.employer_name_pattern,
          transaction_name_pattern = EXCLUDED.transaction_name_pattern,
          minimum_amount_cents = EXCLUDED.minimum_amount_cents,
          maximum_amount_cents = EXCLUDED.maximum_amount_cents,
          status = EXCLUDED.status,
          bank_connection_id = EXCLUDED.bank_connection_id,
          provider_item_id = EXCLUDED.provider_item_id,
          provider_account_id = EXCLUDED.provider_account_id,
          expected_frequency = EXCLUDED.expected_frequency,
          priority = EXCLUDED.priority,
          metadata = EXCLUDED.metadata,
          updated_at = now()
        RETURNING
          id,
          rule_name,
          provider_name,
          employer_name_pattern,
          transaction_name_pattern,
          minimum_amount_cents,
          maximum_amount_cents,
          status,
          provider_item_id,
          provider_account_id,
          bank_connection_id,
          expected_frequency,
          priority,
          idempotency_key,
          created_at,
          updated_at
      `,
      [
        id,
        input.householdId,
        input.ruleName,
        input.providerName,
        input.employerNamePattern || null,
        input.transactionNamePattern || null,
        input.minimumAmountCents || null,
        input.maximumAmountCents || null,
        input.status,
        input.bankConnectionId || null,
        input.providerItemId || null,
        input.providerAccountId || null,
        input.expectedFrequency,
        input.priority,
        JSON.stringify(input.metadata || {}),
        input.idempotencyKey,
      ],
    );
    const row = result.rows[0];

    return {
      persisted: true,
      persistence: "postgres",
      postgresId: row?.id ?? id,
      replayed: false,
      rule: paycheckDetectionRuleFromRow(row),
    };
  } catch (error) {
    return persistenceFailed(error);
  }
}

export async function persistDirectDepositSetup(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return {
      ...persistenceSkipped("direct deposit setup"),
      setup: {
        accountLast4: input.accountLast4 || "----",
        accountName: input.accountName,
        id: input.id,
        idempotencyKey: input.idempotencyKey,
        providerAccountId: input.providerAccountId || null,
        providerCustomerId: input.providerCustomerId || null,
        providerName: input.providerName,
        providerStatus: input.providerStatus,
        routingLast4: input.routingLast4 || "----",
        status: input.status,
      },
    };
  }

  try {
    const id =
      input.id ||
      recordId("direct_deposit_setup", input.householdId, input.idempotencyKey);
    const result = await pool.query(
      `
        INSERT INTO direct_deposit_setups (
          id,
          household_id,
          user_id,
          provider_name,
          provider_customer_id,
          provider_account_id,
          account_name,
          account_last4,
          routing_last4,
          status,
          provider_status,
          idempotency_key,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
        ON CONFLICT (household_id, idempotency_key)
        DO UPDATE SET
          provider_name = EXCLUDED.provider_name,
          provider_customer_id = EXCLUDED.provider_customer_id,
          provider_account_id = EXCLUDED.provider_account_id,
          account_name = EXCLUDED.account_name,
          account_last4 = EXCLUDED.account_last4,
          routing_last4 = EXCLUDED.routing_last4,
          status = EXCLUDED.status,
          provider_status = EXCLUDED.provider_status,
          metadata = EXCLUDED.metadata,
          updated_at = now()
        RETURNING
          id,
          provider_name,
          provider_customer_id,
          provider_account_id,
          account_name,
          account_last4,
          routing_last4,
          status,
          provider_status,
          idempotency_key,
          created_at,
          updated_at
      `,
      [
        id,
        input.householdId,
        input.userId,
        input.providerName,
        input.providerCustomerId || null,
        input.providerAccountId || null,
        input.accountName,
        input.accountLast4 || "----",
        input.routingLast4 || "----",
        input.status,
        input.providerStatus,
        input.idempotencyKey,
        JSON.stringify(input.metadata || {}),
      ],
    );
    const row = result.rows[0];

    return {
      persisted: true,
      persistence: "postgres",
      postgresId: row?.id ?? id,
      setup: directDepositSetupFromRow(row),
    };
  } catch (error) {
    return persistenceFailed(error);
  }
}

export async function persistTransferIntent(input, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return persistenceSkipped("transfer intent");
  }

  try {
    const id = recordId("transfer_intent", input.householdId, input.idempotencyKey);
    const result = await pool.query(
      `
        INSERT INTO transfer_intents (
          id,
          household_id,
          source_bucket_id,
          destination_payee_id,
          amount_cents,
          provider_name,
          provider_transfer_id,
          idempotency_key,
          status,
          provider_status,
          failure_code
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (household_id, idempotency_key) DO NOTHING
        RETURNING id
      `,
      [
        id,
        input.householdId,
        input.sourceBucketId,
        input.destinationPayeeId,
        input.amountCents,
        input.providerName || null,
        input.providerTransferId || null,
        input.idempotencyKey,
        input.status,
        input.providerStatus,
        input.failureCode || null,
      ],
    );

    return {
      persisted: true,
      persistence: "postgres",
      postgresId: id,
      replayed: result.rowCount === 0,
    };
  } catch (error) {
    return persistenceFailed(error);
  }
}

export async function loadOperationalAudit(householdId, env = process.env) {
  const pool = poolFor(env);

  if (!pool) {
    return {
      ...persistenceSkipped("operational audit"),
      audit: null,
      auditFound: false,
    };
  }

  try {
    const [
      bankConnections,
      checkoutIntents,
      directDepositSetups,
      paycheckDetectionRules,
      commercialSubscriptions,
      billingEvents,
      paycheckDetections,
      transferIntents,
      billPayments,
      cardDecisions,
      unlockRequests,
      railEvents,
      reconciliationExceptions,
      journalEntries,
    ] = await Promise.all([
      pool.query(
        `
          SELECT
            provider_name,
            provider_item_id,
            provider_account_id,
            institution_name,
            account_name,
            account_mask,
            products,
            status,
            created_at,
            updated_at
          FROM bank_connections
          WHERE household_id = $1
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 25
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            id,
            user_id,
            provider_name,
            provider_checkout_id,
            checkout_mode,
            checkout_url_present,
            price_label,
            status,
            idempotency_key,
            error_code,
            created_at,
            updated_at
          FROM commercial_checkout_intents
          WHERE household_id = $1
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 25
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            id,
            provider_name,
            provider_customer_id,
            provider_account_id,
            account_name,
            account_last4,
            routing_last4,
            status,
            provider_status,
            idempotency_key,
            created_at,
            updated_at
          FROM direct_deposit_setups
          WHERE household_id = $1
          ORDER BY created_at DESC
          LIMIT 25
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            id,
            rule_name,
            provider_name,
            employer_name_pattern,
            transaction_name_pattern,
            minimum_amount_cents,
            maximum_amount_cents,
            status,
            provider_item_id,
            provider_account_id,
            expected_frequency,
            priority,
            idempotency_key,
            created_at,
            updated_at
          FROM paycheck_detection_rules
          WHERE household_id = $1
          ORDER BY priority ASC, updated_at DESC, created_at DESC
          LIMIT 25
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            provider_name,
            provider_customer_id,
            provider_subscription_id,
            user_id,
            price_id,
            access_status,
            subscription_status,
            current_period_end,
            cancel_at_period_end,
            created_at,
            updated_at
          FROM commercial_subscriptions
          WHERE household_id = $1
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 10
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            provider_name,
            provider_event_id,
            event_type,
            provider_customer_id,
            provider_subscription_id,
            user_id,
            access_status,
            processed_at
          FROM commercial_billing_events
          WHERE household_id = $1
          ORDER BY processed_at DESC
          LIMIT 25
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            bank_connection_id,
            detection_rule_id,
            provider_event_id,
            provider_transaction_id,
            employer_name,
            amount_cents,
            received_at,
            journal_entry_id,
            idempotency_key,
            status,
            created_at
          FROM paycheck_detections
          WHERE household_id = $1
          ORDER BY created_at DESC
          LIMIT 25
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            source_bucket_id,
            destination_payee_id,
            amount_cents,
            provider_name,
            provider_transfer_id,
            idempotency_key,
            status,
            provider_status,
            failure_code,
            created_at
          FROM transfer_intents
          WHERE household_id = $1
          ORDER BY created_at DESC
          LIMIT 25
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            payee_id,
            bucket_id,
            amount_cents,
            scheduled_for,
            memo,
            decision_code,
            reason,
            provider_bill_payment_id,
            provider_status,
            status,
            created_at
          FROM bill_payment_schedules
          WHERE household_id = $1
          ORDER BY created_at DESC
          LIMIT 25
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            merchant_name,
            merchant_category_code,
            payee_id,
            bucket_id,
            amount_cents,
            approved,
            approved_amount_cents,
            decision_code,
            reason,
            provider_status,
            created_at
          FROM card_authorization_decisions
          WHERE household_id = $1
          ORDER BY created_at DESC
          LIMIT 25
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            bucket_id,
            amount_cents,
            unlocked_cents,
            unlock_mode,
            reason,
            recovery_checks,
            recovery_per_check_cents,
            status,
            created_at
          FROM unlock_requests
          WHERE household_id = $1
          ORDER BY created_at DESC
          LIMIT 25
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            provider_name,
            provider_event_id,
            event_type,
            rail,
            payload,
            processed_at,
            created_at
          FROM money_rail_events
          WHERE household_id = $1
          ORDER BY processed_at DESC, created_at DESC
          LIMIT 50
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            id,
            household_id,
            severity,
            status,
            summary,
            source,
            provider_name,
            provider_event_id,
            provider_transaction_id,
            reason_code,
            metadata,
            idempotency_key,
            created_at,
            last_seen_at,
            resolved_at
          FROM reconciliation_exceptions
          WHERE household_id = $1 OR household_id IS NULL
          ORDER BY last_seen_at DESC, created_at DESC
          LIMIT 50
        `,
        [householdId],
      ),
      pool.query(
        `
          SELECT
            journal_entries.id,
            journal_entries.idempotency_key,
            journal_entries.entry_type,
            journal_entries.memo,
            journal_entries.metadata,
            journal_entries.reversed_entry_id,
            journal_entries.created_at,
            json_agg(
              json_build_object(
                'accountType', ledger_accounts.account_type,
                'bucketId', ledger_accounts.bucket_id,
                'amountCents', journal_lines.amount_cents
              )
              ORDER BY journal_lines.id ASC
            ) AS lines
          FROM journal_entries
          JOIN journal_lines
            ON journal_lines.journal_entry_id = journal_entries.id
          JOIN ledger_accounts
            ON ledger_accounts.id = journal_lines.ledger_account_id
          WHERE journal_entries.household_id = $1
          GROUP BY journal_entries.id
          ORDER BY journal_entries.created_at DESC
          LIMIT 50
        `,
        [householdId],
      ),
    ]);

    const accountIdForLine = (line) => {
      if (line.bucketId) {
        return `liability:bucket:${line.bucketId}`;
      }

      return line.accountType === "asset"
        ? "asset:program_cash"
        : "liability:card_settlement";
    };

    const audit = {
      bankConnections: bankConnections.rows.map((row) => ({
        accountMask: row.account_mask,
        accountName: row.account_name,
        connectedAt: timestampString(row.created_at),
        institutionName: row.institution_name,
        products: Array.isArray(row.products) ? row.products : [],
        providerAccountId: row.provider_account_id,
        providerItemId: row.provider_item_id,
        providerName: row.provider_name,
        status: row.status,
        tokenSecretStatus: "redacted",
        updatedAt: timestampString(row.updated_at),
      })),
      billingEvents: billingEvents.rows.map((row) => ({
        accessStatus: row.access_status,
        eventType: row.event_type,
        processedAt: timestampString(row.processed_at),
        providerCustomerId: row.provider_customer_id,
        providerEventId: row.provider_event_id,
        providerName: row.provider_name,
        providerSubscriptionId: row.provider_subscription_id,
        userId: row.user_id,
      })),
      commercialSubscriptions: commercialSubscriptions.rows.map((row) => ({
        accessStatus: row.access_status,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        createdAt: timestampString(row.created_at),
        currentPeriodEnd: timestampString(row.current_period_end),
        priceId: row.price_id,
        providerCustomerId: row.provider_customer_id,
        providerName: row.provider_name,
        providerSubscriptionId: row.provider_subscription_id,
        subscriptionStatus: row.subscription_status,
        updatedAt: timestampString(row.updated_at),
        userId: row.user_id,
      })),
      checkoutIntents: checkoutIntents.rows.map((row) =>
        commercialCheckoutIntentFromRow(row),
      ),
      directDepositSetups: directDepositSetups.rows.map((row) =>
        directDepositSetupFromRow(row),
      ),
      billPayments: billPayments.rows.map((row) => ({
        amountCents: centsNumber(row.amount_cents),
        bucketId: row.bucket_id,
        createdAt: timestampString(row.created_at),
        decisionCode: row.decision_code,
        memo: row.memo,
        payeeId: row.payee_id,
        providerBillPaymentId: row.provider_bill_payment_id,
        providerStatus: row.provider_status,
        reason: row.reason,
        scheduledFor: timestampString(row.scheduled_for) ?? row.scheduled_for,
        status: row.status,
      })),
      cardDecisions: cardDecisions.rows.map((row) => ({
        amountCents: centsNumber(row.amount_cents),
        approved: Boolean(row.approved),
        approvedAmountCents: centsNumber(row.approved_amount_cents),
        bucketId: row.bucket_id,
        createdAt: timestampString(row.created_at),
        decisionCode: row.decision_code,
        merchantCategoryCode: row.merchant_category_code,
        merchantName: row.merchant_name,
        payeeId: row.payee_id,
        providerStatus: row.provider_status,
        reason: row.reason,
      })),
      journalEntries: journalEntries.rows.map((row) => ({
        createdAt: timestampString(row.created_at),
        id: row.id,
        idempotencyKey: row.idempotency_key,
        lines: (row.lines || []).map((line) => ({
          accountId: accountIdForLine(line),
          amountCents: centsNumber(line.amountCents),
        })),
        memo: row.memo,
        metadata: redactAuditPayload(row.metadata || {}),
        reversedEntryId: row.reversed_entry_id,
        type: row.entry_type,
      })),
      moneyRailEvents: railEvents.rows.map((row) => ({
        createdAt: timestampString(row.created_at),
        eventType: row.event_type,
        payload: redactAuditPayload(row.payload || {}),
        processedAt: timestampString(row.processed_at),
        providerEventId: row.provider_event_id,
        providerName: row.provider_name,
        rail: row.rail,
      })),
      reconciliationExceptions: reconciliationExceptions.rows.map((row) =>
        reconciliationExceptionFromRow(row),
      ),
      paycheckDetectionRules: paycheckDetectionRules.rows.map((row) =>
        paycheckDetectionRuleFromRow(row),
      ),
      paycheckDetections: paycheckDetections.rows.map((row) => ({
        amountCents: centsNumber(row.amount_cents),
        bankConnectionId: row.bank_connection_id,
        createdAt: timestampString(row.created_at),
        detectionRuleId: row.detection_rule_id,
        employerName: row.employer_name,
        idempotencyKey: row.idempotency_key,
        journalEntryId: row.journal_entry_id,
        providerEventId: row.provider_event_id,
        providerTransactionId: row.provider_transaction_id,
        receivedAt: timestampString(row.received_at),
        status: row.status,
      })),
      transferIntents: transferIntents.rows.map((row) => ({
        amountCents: centsNumber(row.amount_cents),
        createdAt: timestampString(row.created_at),
        destinationPayeeId: row.destination_payee_id,
        failureCode: row.failure_code,
        idempotencyKey: row.idempotency_key,
        providerName: row.provider_name,
        providerStatus: row.provider_status,
        providerTransferId: row.provider_transfer_id,
        sourceBucketId: row.source_bucket_id,
        status: row.status,
      })),
      unlockRequests: unlockRequests.rows.map((row) => ({
        amountCents: centsNumber(row.amount_cents),
        bucketId: row.bucket_id,
        createdAt: timestampString(row.created_at),
        reason: row.reason,
        recoveryChecks: Number(row.recovery_checks),
        recoveryPerCheckCents: centsNumber(row.recovery_per_check_cents),
        status: row.status,
        unlockMode: row.unlock_mode,
        unlockedCents: centsNumber(row.unlocked_cents),
      })),
    };

    const auditCount = Object.values(audit).reduce(
      (total, records) => total + (Array.isArray(records) ? records.length : 0),
      0,
    );

    return {
      audit,
      auditFound: auditCount > 0,
      persisted: true,
      persistence: "postgres",
    };
  } catch (error) {
    return {
      ...persistenceFailed(error),
      audit: null,
      auditFound: false,
    };
  }
}
