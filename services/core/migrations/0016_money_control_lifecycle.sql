-- Consumer lifecycle controls for approved billers, scheduled bills, and cards.
-- Raw destination credentials remain with the configured banking provider.

ALTER TABLE payees
  DROP CONSTRAINT IF EXISTS payees_status_check;

ALTER TABLE payees
  ADD CONSTRAINT payees_status_check
  CHECK (status IN ('modeled', 'provider_pending', 'approved', 'archived'));

ALTER TABLE payees
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_payee_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS payees_household_status_updated_idx
  ON payees(household_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS payees_provider_reference_idx
  ON payees(provider_name, provider_payee_id)
  WHERE provider_name IS NOT NULL
    AND provider_payee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payee_control_events (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT REFERENCES app_users(id),
  payee_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'archived')),
  before_payee JSONB,
  after_payee JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payee_control_events_household_created_idx
  ON payee_control_events(household_id, created_at DESC);

ALTER TABLE bill_payment_schedules
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by_user_id TEXT REFERENCES app_users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
