-- Provider token vault custody for linked-bank access tokens.
-- Raw provider tokens are never stored directly. The core receiver encrypts
-- token material before writing this table and returns only token_secret_ref
-- values to product records.

CREATE TABLE provider_token_secrets (
  id TEXT PRIMARY KEY,
  provider_name TEXT NOT NULL,
  provider_item_id TEXT NOT NULL,
  key_id TEXT NOT NULL,
  algorithm TEXT NOT NULL CHECK (algorithm IN ('aes-256-gcm')),
  ciphertext TEXT NOT NULL,
  nonce TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  token_fingerprint_sha256 TEXT NOT NULL,
  request_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'rotated', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (provider_name, provider_item_id)
);

CREATE TABLE provider_token_vault_events (
  id TEXT PRIMARY KEY,
  provider_name TEXT NOT NULL,
  provider_item_id TEXT,
  request_id TEXT,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('token_stored', 'token_replayed', 'token_rotated', 'token_revoked', 'token_rejected')
  ),
  key_id TEXT,
  token_secret_ref TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX provider_token_secrets_status_idx
  ON provider_token_secrets(provider_name, status, updated_at);

CREATE INDEX provider_token_vault_events_item_idx
  ON provider_token_vault_events(provider_name, provider_item_id, created_at);

CREATE INDEX provider_token_vault_events_request_idx
  ON provider_token_vault_events(provider_name, request_id, event_type);
