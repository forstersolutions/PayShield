-- Durable reconciliation exception details for provider, rail, and support
-- operations. These records intentionally avoid raw bank tokens and card data.

ALTER TABLE reconciliation_exceptions
  ALTER COLUMN household_id DROP NOT NULL;

ALTER TABLE reconciliation_exceptions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'system' CHECK (
    source IN ('provider_webhook', 'money_rail', 'ledger', 'support', 'system')
  ),
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS reason_code TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_exceptions_idempotency_idx
  ON reconciliation_exceptions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS reconciliation_exceptions_status_source_idx
  ON reconciliation_exceptions(status, source, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS reconciliation_exceptions_provider_event_idx
  ON reconciliation_exceptions(provider_name, provider_event_id);
