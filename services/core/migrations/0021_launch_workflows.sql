-- Atomic household plans and durable account-closure processing.

CREATE TABLE household_protection_plan_events (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT REFERENCES app_users(id),
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE INDEX household_protection_plan_events_household_created_idx
  ON household_protection_plan_events(household_id, created_at DESC);

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'closing', 'closed'));

ALTER TABLE account_closure_requests
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (processing_attempts >= 0),
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_by TEXT,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX account_closure_requests_processing_idx
  ON account_closure_requests(status, next_attempt_at, requested_at)
  WHERE status IN (
    'requested',
    'identity_review',
    'provider_shutdown',
    'retention_hold'
  );
