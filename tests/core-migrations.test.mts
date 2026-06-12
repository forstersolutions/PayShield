import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { buildMigrationPlan } from "../scripts/core-migrations.mjs";

const migrationsDir = "services/core/migrations";
const execFileAsync = promisify(execFile);

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

test("core migration planner emits ordered checksummed evidence", async () => {
  const plan = await buildMigrationPlan();

  assert.equal(plan.ok, true);
  assert.equal(plan.service, "payshield-core-migrations");
  assert.equal(plan.migrations.length, 3);
  assert.equal(plan.migrations[0]?.file, "0001_neobank_core.sql");
  assert.equal(plan.migrations[1]?.file, "0002_household_bucket_controls.sql");
  assert.equal(plan.migrations[2]?.file, "0003_ledger_integrity.sql");
  assert.match(plan.migrations[2]?.checksumSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(plan.migrations[2]?.destructivePatterns.length, 0);
  assert.equal(plan.applyCommand.includes("<postgres-url>"), true);
  assert.equal(JSON.stringify(plan).includes("postgres://"), false);
});

test("core migration CLI check outputs redacted JSON plan", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/core-migrations.mjs", "--check"],
    {
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  const plan = JSON.parse(stdout) as Awaited<
    ReturnType<typeof buildMigrationPlan>
  >;

  assert.equal(plan.ok, true);
  assert.equal(plan.migrations.length, 3);
  assert.equal(stdout.includes("PAYSHIELD_LEDGER_DATABASE_URL"), true);
  assert.equal(stdout.includes("://"), false);
});
