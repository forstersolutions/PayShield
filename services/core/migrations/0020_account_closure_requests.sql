-- Account closure is initiated in-product and retained as an auditable request.
-- Provider shutdown and legally required record retention remain explicit states.

CREATE TABLE account_closure_requests (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  user_id TEXT REFERENCES app_users(id),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested',
      'identity_review',
      'provider_shutdown',
      'retention_hold',
      'completed',
      'canceled'
    )),
  reason TEXT,
  acknowledged_data_retention BOOLEAN NOT NULL DEFAULT false,
  idempotency_key TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, idempotency_key)
);

CREATE UNIQUE INDEX account_closure_requests_open_household_idx
  ON account_closure_requests(household_id)
  WHERE status IN (
    'requested',
    'identity_review',
    'provider_shutdown',
    'retention_hold'
  );

CREATE INDEX account_closure_requests_status_idx
  ON account_closure_requests(status, requested_at);
