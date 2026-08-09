-- Durable Plaid transaction-sync work queue. Webhook receivers enqueue quickly;
-- core workers claim with SKIP LOCKED so multiple Fargate tasks can process
-- safely without duplicate concurrent execution.

CREATE TABLE plaid_sync_jobs (
  id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL,
  provider_item_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'retry', 'completed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  completed_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_event_id, provider_item_id)
);

CREATE INDEX plaid_sync_jobs_claim_idx
  ON plaid_sync_jobs(status, available_at, created_at)
  WHERE status IN ('queued', 'retry', 'running');

CREATE INDEX plaid_sync_jobs_item_idx
  ON plaid_sync_jobs(provider_item_id, created_at DESC);
