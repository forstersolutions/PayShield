-- Linked-bank transaction sync state for Plaid transaction detection.
-- Stores cursors and request evidence only; raw provider access tokens remain
-- in provider_token_secrets under encrypted token-vault custody.

ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS sync_cursor TEXT,
  ADD COLUMN IF NOT EXISTS last_transaction_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_transaction_sync_request_id TEXT;

CREATE INDEX IF NOT EXISTS bank_connections_sync_status_idx
  ON bank_connections(provider_name, status, last_transaction_sync_at DESC);
