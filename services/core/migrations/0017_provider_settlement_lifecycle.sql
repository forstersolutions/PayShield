-- Provider settlement lifecycle for transfers, bills, and card authorizations.
-- Reservations, settlements, and reversals remain immutable journal records.

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_entry_type_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_entry_type_check
  CHECK (
    entry_type IN (
      'paycheck_deposit',
      'card_authorization',
      'bill_payment',
      'transfer_reservation',
      'money_settlement',
      'bucket_unlock',
      'reversal'
    )
  );

-- Persist the logical ledger account name. The generated primary key is scoped
-- to a household and cannot be decoded when journal entries are replayed.
ALTER TABLE ledger_accounts
  ADD COLUMN IF NOT EXISTS account_code TEXT;

UPDATE ledger_accounts
SET account_code = 'liability:bucket:' || bucket_id
WHERE account_code IS NULL
  AND bucket_id IS NOT NULL;

UPDATE ledger_accounts
SET account_code = 'asset:program_cash'
WHERE account_code IS NULL
  AND account_type = 'asset';

UPDATE ledger_accounts AS account
SET account_code = 'liability:card_settlement'
WHERE account.account_code IS NULL
  AND account.account_type = 'liability'
  AND account.bucket_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM journal_lines AS line
    JOIN journal_entries AS entry ON entry.id = line.journal_entry_id
    WHERE line.ledger_account_id = account.id
      AND entry.entry_type = 'card_authorization'
  );

UPDATE ledger_accounts AS account
SET account_code = 'liability:bill_pay_pending'
WHERE account.account_code IS NULL
  AND account.account_type = 'liability'
  AND account.bucket_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM journal_lines AS line
    JOIN journal_entries AS entry ON entry.id = line.journal_entry_id
    WHERE line.ledger_account_id = account.id
      AND entry.entry_type = 'bill_payment'
  );

UPDATE ledger_accounts AS account
SET account_code = 'liability:transfer_pending'
WHERE account.account_code IS NULL
  AND account.account_type = 'liability'
  AND account.bucket_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM journal_lines AS line
    JOIN journal_entries AS entry ON entry.id = line.journal_entry_id
    WHERE line.ledger_account_id = account.id
      AND entry.entry_type = 'transfer_reservation'
  );

CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_household_code_idx
  ON ledger_accounts(household_id, account_code)
  WHERE account_code IS NOT NULL;

ALTER TABLE payees
  DROP CONSTRAINT IF EXISTS payees_status_check;

ALTER TABLE payees
  ADD CONSTRAINT payees_status_check
  CHECK (
    status IN (
      'modeled',
      'provider_pending',
      'approved',
      'rejected',
      'archived'
    )
  );

ALTER TABLE transfer_intents
  ADD COLUMN IF NOT EXISTS journal_entry_id TEXT REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS settlement_journal_entry_id TEXT REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id TEXT REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS settlement_reversal_journal_entry_id TEXT REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS settled_amount_cents BIGINT CHECK (settled_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

ALTER TABLE transfer_intents
  DROP CONSTRAINT IF EXISTS transfer_intents_status_check;

ALTER TABLE transfer_intents
  ADD CONSTRAINT transfer_intents_status_check
  CHECK (
    status IN (
      'validated',
      'provider_pending',
      'submitted',
      'settled',
      'failed',
      'blocked',
      'canceled',
      'reversed'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS transfer_intents_provider_reference_idx
  ON transfer_intents(provider_name, provider_transfer_id)
  WHERE provider_name IS NOT NULL
    AND provider_transfer_id IS NOT NULL;

ALTER TABLE bill_payment_schedules
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS settlement_journal_entry_id TEXT REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id TEXT REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS settlement_reversal_journal_entry_id TEXT REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS settled_amount_cents BIGINT CHECK (settled_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

ALTER TABLE bill_payment_schedules
  DROP CONSTRAINT IF EXISTS bill_payment_schedules_provider_status_check;

ALTER TABLE bill_payment_schedules
  ADD CONSTRAINT bill_payment_schedules_provider_status_check
  CHECK (
    provider_status IN (
      'created',
      'blocked',
      'submitted',
      'settled',
      'failed',
      'canceled',
      'reversed'
    )
  );

ALTER TABLE bill_payment_schedules
  DROP CONSTRAINT IF EXISTS bill_payment_schedules_status_check;

ALTER TABLE bill_payment_schedules
  ADD CONSTRAINT bill_payment_schedules_status_check
  CHECK (
    status IN (
      'scheduled',
      'rejected',
      'blocked',
      'submitted',
      'settled',
      'failed',
      'canceled',
      'reversed'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS bill_payments_provider_reference_idx
  ON bill_payment_schedules(provider_name, provider_bill_payment_id)
  WHERE provider_name IS NOT NULL
    AND provider_bill_payment_id IS NOT NULL;

ALTER TABLE card_authorization_decisions
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT,
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS settlement_journal_entry_id TEXT REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id TEXT REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS settlement_reversal_journal_entry_id TEXT REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS settled_amount_cents BIGINT CHECK (settled_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

UPDATE card_authorization_decisions
SET lifecycle_status = CASE WHEN approved THEN 'authorized' ELSE 'declined' END
WHERE lifecycle_status IS NULL;

ALTER TABLE card_authorization_decisions
  ALTER COLUMN lifecycle_status SET NOT NULL;

ALTER TABLE card_authorization_decisions
  DROP CONSTRAINT IF EXISTS card_authorization_decisions_lifecycle_status_check;

ALTER TABLE card_authorization_decisions
  ADD CONSTRAINT card_authorization_decisions_lifecycle_status_check
  CHECK (
    lifecycle_status IN (
      'authorized',
      'declined',
      'settled',
      'reversed',
      'expired'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS card_decisions_provider_transaction_idx
  ON card_authorization_decisions(provider_name, provider_transaction_id)
  WHERE provider_name IS NOT NULL
    AND provider_transaction_id IS NOT NULL;

ALTER TABLE unlock_requests
  ADD COLUMN IF NOT EXISTS remaining_recovery_cents BIGINT NOT NULL DEFAULT 0
    CHECK (remaining_recovery_cents >= 0),
  ADD COLUMN IF NOT EXISTS recovery_checks_remaining INTEGER NOT NULL DEFAULT 0
    CHECK (recovery_checks_remaining >= 0),
  ADD COLUMN IF NOT EXISTS recovery_status TEXT NOT NULL DEFAULT 'complete'
    CHECK (recovery_status IN ('active', 'complete')),
  ADD COLUMN IF NOT EXISTS last_recovery_journal_entry_id TEXT
    REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ;

UPDATE unlock_requests
SET remaining_recovery_cents = unlocked_cents,
  recovery_checks_remaining = recovery_checks,
  recovery_status = CASE WHEN unlocked_cents > 0 THEN 'active' ELSE 'complete' END
WHERE status IN ('created', 'posted', 'replayed')
  AND remaining_recovery_cents = 0
  AND recovery_status = 'complete'
  AND recovered_at IS NULL;

CREATE INDEX IF NOT EXISTS unlock_requests_active_recovery_idx
  ON unlock_requests(household_id, created_at ASC)
  WHERE recovery_status = 'active';
