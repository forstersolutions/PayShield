-- Database-level ledger integrity for live money controls.
-- This migration makes posted journal records immutable and requires every
-- journal entry to balance at transaction commit.

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_entry_type_check
  CHECK (
    entry_type IN (
      'paycheck_deposit',
      'card_authorization',
      'bill_payment',
      'bucket_unlock',
      'reversal'
    )
  );

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_reversal_reference_check
  CHECK (
    (entry_type = 'reversal' AND reversed_entry_id IS NOT NULL)
    OR (entry_type <> 'reversal' AND reversed_entry_id IS NULL)
  );

ALTER TABLE ledger_accounts
  ADD CONSTRAINT ledger_accounts_bucket_shape_check
  CHECK (
    (account_type = 'asset' AND bucket_id IS NULL)
    OR (account_type = 'liability')
  );

CREATE UNIQUE INDEX ledger_accounts_household_bucket_unique_idx
  ON ledger_accounts(household_id, bucket_id)
  WHERE bucket_id IS NOT NULL;

CREATE OR REPLACE FUNCTION assert_journal_entry_balanced_by_id(entry_id TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  line_count INTEGER;
  line_total BIGINT;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(amount_cents), 0)
    INTO line_count, line_total
  FROM journal_lines
  WHERE journal_entry_id = entry_id;

  IF line_count < 2 THEN
    RAISE EXCEPTION 'Journal entry % must have at least two lines', entry_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF line_total <> 0 THEN
    RAISE EXCEPTION 'Journal entry % is not balanced: % cents', entry_id, line_total
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION assert_journal_entry_header_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_journal_entry_balanced_by_id(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION assert_journal_entry_line_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_journal_entry_balanced_by_id(NEW.journal_entry_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_posted_journal_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Posted journal records are immutable; post a reversal instead'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE CONSTRAINT TRIGGER journal_entries_balance_check
  AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_journal_entry_header_balanced();

CREATE CONSTRAINT TRIGGER journal_lines_balance_check
  AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_journal_entry_line_balanced();

CREATE TRIGGER journal_entries_prevent_update
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_journal_mutation();

CREATE TRIGGER journal_lines_prevent_update
  BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_journal_mutation();
