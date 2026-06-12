import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationsDir = "services/core/migrations";

test("core migrations are ordered and include ledger integrity migration", async () => {
  const migrations = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  assert.deepEqual(migrations, [
    "0001_neobank_core.sql",
    "0002_household_bucket_controls.sql",
    "0003_ledger_integrity.sql",
  ]);
});

test("ledger integrity migration enforces balanced immutable journals", async () => {
  const sql = await readFile(
    `${migrationsDir}/0003_ledger_integrity.sql`,
    "utf8",
  );

  assert.match(sql, /journal_entries_entry_type_check/);
  assert.match(sql, /journal_entries_reversal_reference_check/);
  assert.match(sql, /assert_journal_entry_balanced_by_id/);
  assert.match(sql, /COUNT\(\*\), COALESCE\(SUM\(amount_cents\), 0\)/);
  assert.match(sql, /line_count < 2/);
  assert.match(sql, /line_total <> 0/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER journal_entries_balance_check/);
  assert.match(sql, /CREATE CONSTRAINT TRIGGER journal_lines_balance_check/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /journal_entries_prevent_update/);
  assert.match(sql, /journal_lines_prevent_update/);
  assert.match(sql, /post a reversal instead/i);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});
