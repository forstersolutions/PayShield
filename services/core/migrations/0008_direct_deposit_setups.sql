-- Durable paycheck-routing setup records.
-- Store only masked direct-deposit instruction metadata; raw account and
-- routing numbers stay with the approved provider when live rails exist.

CREATE TABLE IF NOT EXISTS direct_deposit_setups (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES app_users(id),
  provider_name TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_account_id TEXT,
  account_name TEXT NOT NULL,
  account_last4 TEXT NOT NULL,
  routing_last4 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'provider_pending', 'ready', 'blocked')),
  provider_status TEXT NOT NULL CHECK (provider_status IN ('gated', 'sandbox', 'live')),
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS direct_deposit_setups_household_status_idx
  ON direct_deposit_setups(household_id, status, created_at DESC);

ALTER TABLE money_rail_events
  DROP CONSTRAINT IF EXISTS money_rail_events_rail_check;

ALTER TABLE money_rail_events
  ADD CONSTRAINT money_rail_events_rail_check
  CHECK (rail IN ('bank_link', 'transaction_sync', 'transfer', 'provider_webhook', 'direct_deposit'));
