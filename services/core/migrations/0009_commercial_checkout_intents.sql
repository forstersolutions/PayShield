-- Record household checkout attempts before Stripe webhooks arrive.
-- This stores only operational metadata and never stores payment card data.

CREATE TABLE IF NOT EXISTS commercial_checkout_intents (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT NOT NULL REFERENCES app_users(id),
  provider_name TEXT NOT NULL,
  provider_checkout_id TEXT,
  checkout_mode TEXT NOT NULL CHECK (checkout_mode IN ('checkout', 'payment_link', 'not_configured')),
  checkout_url_present BOOLEAN NOT NULL DEFAULT false,
  price_label TEXT,
  status TEXT NOT NULL CHECK (status IN ('requested', 'created', 'payment_link', 'provider_error', 'blocked')),
  idempotency_key TEXT NOT NULL,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS commercial_checkout_intents_household_status_idx
  ON commercial_checkout_intents(household_id, status, created_at DESC);
