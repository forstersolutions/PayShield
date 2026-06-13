-- Durable paycheck detection rule setup for recurring linked-bank income.
-- Rules stay separate from detected transactions so household payroll matching
-- can be reviewed, paused, and audited before money-control automation runs.

ALTER TABLE paycheck_detection_rules
  ADD COLUMN IF NOT EXISTS bank_connection_id TEXT REFERENCES bank_connections(id),
  ADD COLUMN IF NOT EXISTS provider_item_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_account_id TEXT,
  ADD COLUMN IF NOT EXISTS expected_frequency TEXT NOT NULL DEFAULT 'unknown'
    CHECK (expected_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'unknown')),
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100
    CHECK (priority >= 1 AND priority <= 1000),
  ADD COLUMN IF NOT EXISTS last_matched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE paycheck_detections
  ADD COLUMN IF NOT EXISTS detection_rule_id TEXT REFERENCES paycheck_detection_rules(id);

CREATE UNIQUE INDEX IF NOT EXISTS paycheck_detection_rules_household_idempotency_idx
  ON paycheck_detection_rules(household_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS paycheck_detection_rules_provider_ref_idx
  ON paycheck_detection_rules(provider_name, provider_item_id, provider_account_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS paycheck_detection_rules_household_priority_idx
  ON paycheck_detection_rules(household_id, status, priority, updated_at DESC);

CREATE INDEX IF NOT EXISTS paycheck_detections_rule_idx
  ON paycheck_detections(detection_rule_id, created_at DESC)
  WHERE detection_rule_id IS NOT NULL;
