-- Household-scoped journal safety for protected money controls.
-- Journal lines must point to ledger accounts owned by the same household as
-- the journal entry, or Safe to Spend could be computed from another household.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM journal_lines
    JOIN journal_entries
      ON journal_entries.id = journal_lines.journal_entry_id
    JOIN ledger_accounts
      ON ledger_accounts.id = journal_lines.ledger_account_id
    WHERE journal_entries.household_id <> ledger_accounts.household_id
  ) THEN
    RAISE EXCEPTION 'Existing journal lines include cross-household ledger accounts'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION assert_journal_line_household_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  entry_household_id TEXT;
  account_household_id TEXT;
BEGIN
  SELECT household_id
    INTO entry_household_id
  FROM journal_entries
  WHERE id = NEW.journal_entry_id;

  SELECT household_id
    INTO account_household_id
  FROM ledger_accounts
  WHERE id = NEW.ledger_account_id;

  IF
    entry_household_id IS NULL
    OR account_household_id IS NULL
    OR entry_household_id <> account_household_id
  THEN
    RAISE EXCEPTION 'Journal line account household does not match journal entry household'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER journal_lines_household_scope_check
  AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION assert_journal_line_household_scope();
