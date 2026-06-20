-- Durable production/live-money gate evidence for regulated launch controls.
-- Store redacted references and approval facts only. Secrets, contract contents,
-- and legal documents must remain in their approved external systems.

CREATE TABLE IF NOT EXISTS production_gate_evidence (
  id TEXT PRIMARY KEY,
  gate_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (
    scope IN (
      'provider',
      'sponsor_disclosure',
      'counsel',
      'operations',
      'ledger',
      'auth',
      'core',
      'commercial',
      'money_rail',
      'live_money'
    )
  ),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'approved', 'rejected', 'revoked')
  ),
  evidence_ref TEXT NOT NULL,
  evidence_summary TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (
      status = 'approved'
      AND approved_by IS NOT NULL
      AND approved_at IS NOT NULL
    )
    OR status <> 'approved'
  ),
  CHECK (
    evidence_ref !~* '(secret|token|password|credential|access[_-]?token)'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS production_gate_evidence_gate_status_idx
  ON production_gate_evidence (gate_id, status)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS production_gate_evidence_scope_status_idx
  ON production_gate_evidence (scope, status, updated_at DESC);
