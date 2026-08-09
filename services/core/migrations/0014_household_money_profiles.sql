-- Durable household paycheck profile used to drive bank linking, paycheck
-- detection, protected bucket funding, and preferred release checks.
-- This table stores user-entered setup metadata only. Bank tokens remain in
-- provider_token_secrets and money movement records remain in their own tables.

CREATE TABLE IF NOT EXISTS household_money_profiles (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT REFERENCES app_users(id),
  employer_name TEXT NOT NULL,
  expected_frequency TEXT NOT NULL CHECK (
    expected_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'unknown')
  ),
  next_payday DATE,
  paycheck_amount_cents BIGINT NOT NULL CHECK (paycheck_amount_cents >= 0),
  requested_transfer_cents BIGINT NOT NULL DEFAULT 0 CHECK (requested_transfer_cents >= 0),
  preferred_transfer_bucket_id TEXT,
  preferred_payee_id TEXT,
  bank_connection_id TEXT REFERENCES bank_connections(id),
  detection_rule_id TEXT REFERENCES paycheck_detection_rules(id),
  source TEXT NOT NULL DEFAULT 'app_profile' CHECK (
    source IN ('app_profile', 'onboarding', 'support_review')
  ),
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id)
);

CREATE TABLE IF NOT EXISTS household_money_profile_events (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT REFERENCES app_users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('upserted')),
  before_profile JSONB,
  after_profile JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE INDEX household_money_profiles_household_updated_idx
  ON household_money_profiles(household_id, updated_at DESC);

CREATE INDEX household_money_profile_events_household_created_idx
  ON household_money_profile_events(household_id, created_at DESC);
