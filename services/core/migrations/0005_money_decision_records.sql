-- Durable operational decision records for support, dispute, and
-- reconciliation workflows. Journals record posted money movement; these
-- tables record the business decision around card auths, bill schedules, and
-- protected-fund unlocks, including declined/rejected outcomes.

CREATE TABLE card_authorization_decisions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  journal_entry_id TEXT REFERENCES journal_entries(id),
  idempotency_key TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_category_code TEXT,
  payee_id TEXT,
  bucket_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  approved BOOLEAN NOT NULL,
  approved_amount_cents BIGINT NOT NULL CHECK (approved_amount_cents >= 0),
  decision_code TEXT NOT NULL,
  reason TEXT NOT NULL,
  provider_status TEXT NOT NULL CHECK (provider_status IN ('simulation', 'provider_gateway', 'blocked', 'approved', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE TABLE bill_payment_schedules (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  journal_entry_id TEXT REFERENCES journal_entries(id),
  idempotency_key TEXT NOT NULL,
  payee_id TEXT NOT NULL,
  bucket_id TEXT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  scheduled_for DATE,
  memo TEXT,
  decision_code TEXT NOT NULL,
  reason TEXT NOT NULL,
  provider_bill_payment_id TEXT,
  provider_status TEXT NOT NULL CHECK (provider_status IN ('created', 'blocked', 'submitted', 'settled', 'failed', 'canceled')),
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'rejected', 'blocked', 'submitted', 'settled', 'failed', 'canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE TABLE unlock_requests (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  journal_entry_id TEXT REFERENCES journal_entries(id),
  idempotency_key TEXT NOT NULL,
  bucket_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  unlocked_cents BIGINT NOT NULL CHECK (unlocked_cents >= 0),
  unlock_mode TEXT NOT NULL CHECK (unlock_mode IN ('slow_free', 'instant_fixed_fee')),
  reason TEXT NOT NULL,
  recovery_checks INTEGER NOT NULL CHECK (recovery_checks > 0),
  recovery_per_check_cents BIGINT NOT NULL CHECK (recovery_per_check_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('created', 'posted', 'replayed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE INDEX card_authorization_decisions_household_created_idx
  ON card_authorization_decisions(household_id, created_at);

CREATE INDEX bill_payment_schedules_household_scheduled_idx
  ON bill_payment_schedules(household_id, scheduled_for, status);

CREATE INDEX unlock_requests_household_created_idx
  ON unlock_requests(household_id, created_at);
