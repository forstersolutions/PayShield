import { createHash } from "node:crypto";
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

function centsNumber(value) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : 0;
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

  try {
    const id = recordId("billing_event", input.providerName, input.eventId);
    const result = await pool.query(
      `
        INSERT INTO commercial_billing_events (
          id,
          provider_name,
          provider_event_id,
          event_type,
          provider_customer_id,
          provider_subscription_id,
          access_status,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
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
        input.accessStatus,
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
          provider_event_id,
          provider_transaction_id,
          employer_name,
          amount_cents,
          received_at,
          journal_entry_id,
          idempotency_key,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9, $10)
        ON CONFLICT (household_id, idempotency_key) DO NOTHING
        RETURNING id
      `,
      [
        id,
        input.householdId,
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
