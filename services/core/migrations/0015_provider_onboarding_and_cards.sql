-- Durable BaaS onboarding and issued-card ownership records. Provider
-- identifiers are retained for reconciliation; account numbers, PANs, and
-- identity documents remain with the approved provider.

ALTER TABLE provider_customers
  ADD COLUMN IF NOT EXISTS household_id TEXT REFERENCES households(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE provider_customers
SET household_id = app_users.household_id
FROM app_users
WHERE provider_customers.user_id = app_users.id
  AND provider_customers.household_id IS NULL;

ALTER TABLE provider_customers
  ALTER COLUMN household_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS provider_customers_provider_user_idx
  ON provider_customers(provider_name, user_id);

CREATE INDEX IF NOT EXISTS provider_customers_household_idx
  ON provider_customers(household_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS provider_kyc_applications (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES app_users(id),
  provider_name TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  provider_application_id TEXT NOT NULL,
  provider_request_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('started', 'submitted', 'provider_pending', 'manual_review', 'approved', 'rejected', 'expired')
  ),
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_name, provider_application_id),
  UNIQUE (provider_name, user_id)
);

CREATE TABLE IF NOT EXISTS provider_financial_accounts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES app_users(id),
  provider_name TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_request_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('opening', 'opened', 'active', 'restricted', 'suspended', 'closed')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_name, provider_account_id),
  UNIQUE (provider_name, household_id)
);

CREATE TABLE IF NOT EXISTS provider_cards (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES app_users(id),
  provider_name TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_card_id TEXT NOT NULL,
  card_last4 TEXT NOT NULL CHECK (card_last4 ~ '^[0-9]{4}$'),
  status TEXT NOT NULL CHECK (
    status IN ('requested', 'issued', 'active', 'frozen', 'closed')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_name, provider_card_id),
  UNIQUE (provider_name, household_id)
);

CREATE INDEX IF NOT EXISTS provider_kyc_household_status_idx
  ON provider_kyc_applications(household_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS provider_financial_accounts_household_status_idx
  ON provider_financial_accounts(household_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS provider_cards_household_status_idx
  ON provider_cards(household_id, status, updated_at DESC);

ALTER TABLE card_authorization_decisions
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_card_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_authorization_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS card_authorization_provider_reference_idx
  ON card_authorization_decisions(provider_name, provider_authorization_id)
  WHERE provider_name IS NOT NULL
    AND provider_authorization_id IS NOT NULL;
