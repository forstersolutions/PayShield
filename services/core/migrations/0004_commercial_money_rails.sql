-- Commercial access, bank connections, paycheck detection, and transfer
-- operations for the regulated PayShield core.
-- This adds append-only operational records without storing raw bank tokens.

CREATE TABLE commercial_subscriptions (
  id TEXT PRIMARY KEY,
  household_id TEXT REFERENCES households(id),
  user_id TEXT REFERENCES app_users(id),
  provider_name TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  provider_subscription_id TEXT,
  price_id TEXT,
  access_status TEXT NOT NULL CHECK (access_status IN ('pending', 'active', 'past_due', 'canceled', 'blocked')),
  subscription_status TEXT NOT NULL CHECK (
    subscription_status IN (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused',
      'unknown'
    )
  ),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_name, provider_subscription_id)
);

CREATE TABLE commercial_billing_events (
  id TEXT PRIMARY KEY,
  provider_name TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  user_id TEXT REFERENCES app_users(id),
  household_id TEXT REFERENCES households(id),
  access_status TEXT NOT NULL CHECK (access_status IN ('pending', 'active', 'past_due', 'canceled', 'blocked', 'ignored')),
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_name, provider_event_id)
);

CREATE TABLE bank_connections (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES app_users(id),
  provider_name TEXT NOT NULL,
  provider_item_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  account_name TEXT,
  account_mask TEXT,
  token_secret_ref TEXT NOT NULL,
  products JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('connected', 'syncing', 'error', 'revoked')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_name, provider_item_id, provider_account_id)
);

CREATE TABLE money_rail_events (
  id TEXT PRIMARY KEY,
  household_id TEXT REFERENCES households(id),
  bank_connection_id TEXT REFERENCES bank_connections(id),
  provider_name TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  rail TEXT NOT NULL CHECK (rail IN ('bank_link', 'transaction_sync', 'transfer', 'provider_webhook')),
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_name, provider_event_id)
);

CREATE TABLE paycheck_detection_rules (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  rule_name TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  employer_name_pattern TEXT,
  transaction_name_pattern TEXT,
  minimum_amount_cents BIGINT CHECK (minimum_amount_cents IS NULL OR minimum_amount_cents > 0),
  maximum_amount_cents BIGINT CHECK (maximum_amount_cents IS NULL OR maximum_amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE paycheck_detections (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  bank_connection_id TEXT REFERENCES bank_connections(id),
  provider_event_id TEXT,
  provider_transaction_id TEXT,
  employer_name TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  received_at TIMESTAMPTZ NOT NULL,
  journal_entry_id TEXT REFERENCES journal_entries(id),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('detected', 'split_posted', 'ignored', 'reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key),
  UNIQUE (household_id, provider_transaction_id)
);

CREATE TABLE transfer_intents (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  source_bucket_id TEXT NOT NULL,
  destination_payee_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  provider_name TEXT,
  provider_transfer_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('validated', 'provider_pending', 'submitted', 'settled', 'failed', 'blocked', 'canceled')
  ),
  provider_status TEXT NOT NULL,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE INDEX commercial_subscriptions_household_idx
  ON commercial_subscriptions(household_id, access_status);

CREATE INDEX commercial_billing_events_subscription_idx
  ON commercial_billing_events(provider_name, provider_subscription_id);

CREATE INDEX bank_connections_household_status_idx
  ON bank_connections(household_id, status);

CREATE INDEX money_rail_events_connection_idx
  ON money_rail_events(bank_connection_id, created_at);

CREATE INDEX paycheck_detection_rules_household_status_idx
  ON paycheck_detection_rules(household_id, status);

CREATE INDEX paycheck_detections_household_received_idx
  ON paycheck_detections(household_id, received_at);

CREATE INDEX transfer_intents_household_status_idx
  ON transfer_intents(household_id, status, created_at);
