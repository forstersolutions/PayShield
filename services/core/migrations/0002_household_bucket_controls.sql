-- Durable household bucket controls for customizable protected money rules.
-- These records define the rule profile that the ledger/card authorization
-- services read before money movement is enabled.

CREATE TABLE household_buckets (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  target_cents BIGINT NOT NULL CHECK (target_cents >= 0),
  priority INTEGER NOT NULL CHECK (priority > 0),
  protection TEXT NOT NULL CHECK (protection IN ('bill_only', 'hard_lock', 'soft_lock', 'emergency', 'spendable')),
  due_rule TEXT NOT NULL,
  payee_id TEXT REFERENCES payees(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, slug)
);

CREATE TABLE household_bucket_rules (
  id TEXT PRIMARY KEY,
  bucket_id TEXT NOT NULL REFERENCES household_buckets(id),
  card_scope TEXT NOT NULL CHECK (card_scope IN ('none', 'approved_payee', 'merchant_rules', 'safe_spend')),
  unlock_policy TEXT NOT NULL CHECK (unlock_policy IN ('slow_free', 'instant_allowed', 'support_review')),
  mcc_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  merchant_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  max_authorization_cents BIGINT CHECK (max_authorization_cents IS NULL OR max_authorization_cents > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE household_bucket_change_events (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  actor_user_id TEXT REFERENCES app_users(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'paused', 'archived', 'reordered')),
  before_profile JSONB,
  after_profile JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE INDEX household_buckets_household_priority_idx
  ON household_buckets(household_id, priority)
  WHERE status = 'active';

CREATE INDEX household_bucket_rules_bucket_idx
  ON household_bucket_rules(bucket_id);
