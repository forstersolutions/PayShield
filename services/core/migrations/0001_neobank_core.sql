-- PayShield regulated core schema.
-- Apply only to the dedicated Postgres ledger database, never to Vercel build
-- artifacts or analytics stores.

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  beta_access_status TEXT NOT NULL CHECK (beta_access_status IN ('approved', 'pending', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app_users (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  clerk_subject TEXT UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  kyc_status TEXT NOT NULL CHECK (kyc_status IN ('not_started', 'provider_pending', 'submitted', 'approved', 'rejected', 'manual_review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE provider_customers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id),
  provider_name TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  provider_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_name, provider_customer_id)
);

CREATE TABLE ledger_accounts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability')),
  bucket_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  idempotency_key TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  memo TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  reversed_entry_id TEXT REFERENCES journal_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE TABLE journal_lines (
  id BIGSERIAL PRIMARY KEY,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id),
  ledger_account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0)
);

CREATE TABLE payees (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  allowed_bucket_id TEXT NOT NULL,
  name TEXT NOT NULL,
  max_cents BIGINT NOT NULL CHECK (max_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('modeled', 'provider_pending', 'approved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE provider_events (
  id TEXT PRIMARY KEY,
  provider_name TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_name, provider_event_id)
);

CREATE TABLE reconciliation_exceptions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX journal_lines_account_idx ON journal_lines(ledger_account_id);
CREATE INDEX journal_entries_household_created_idx ON journal_entries(household_id, created_at);
CREATE INDEX provider_events_processed_idx ON provider_events(processed_at);
