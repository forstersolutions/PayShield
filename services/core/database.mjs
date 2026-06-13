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
