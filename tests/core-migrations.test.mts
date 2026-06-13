import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  buildMigrationPlan,
  evaluateAppliedMigrationState,
} from "../scripts/core-migrations.mjs";

const migrationsDir = "services/core/migrations";
const execFileAsync = promisify(execFile);

test("core migrations are ordered and include money rail migration", async () => {
  const migrations = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  assert.deepEqual(migrations, [
    "0001_neobank_core.sql",
    "0002_household_bucket_controls.sql",
    "0003_ledger_integrity.sql",
    "0004_commercial_money_rails.sql",
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

test("commercial money rail migration adds operational tables", async () => {
  const sql = await readFile(
    `${migrationsDir}/0004_commercial_money_rails.sql`,
    "utf8",
  );

  assert.match(sql, /CREATE TABLE commercial_subscriptions/);
  assert.match(sql, /CREATE TABLE commercial_billing_events/);
  assert.match(sql, /CREATE TABLE bank_connections/);
  assert.match(sql, /token_secret_ref TEXT NOT NULL/);
  assert.match(sql, /CREATE TABLE paycheck_detection_rules/);
  assert.match(sql, /CREATE TABLE paycheck_detections/);
  assert.match(sql, /CREATE TABLE transfer_intents/);
  assert.match(sql, /UNIQUE \(household_id, idempotency_key\)/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("core migration planner emits ordered checksummed evidence", async () => {
  const plan = await buildMigrationPlan();

  assert.equal(plan.ok, true);
  assert.equal(plan.service, "payshield-core-migrations");
  assert.equal(plan.migrations.length, 4);
  assert.equal(plan.migrations[0]?.file, "0001_neobank_core.sql");
  assert.equal(plan.migrations[1]?.file, "0002_household_bucket_controls.sql");
  assert.equal(plan.migrations[2]?.file, "0003_ledger_integrity.sql");
  assert.equal(plan.migrations[3]?.file, "0004_commercial_money_rails.sql");
  assert.equal(plan.latestVersion, "0004");
  assert.equal(plan.migrationLedgerTable, "core_schema_migrations");
  assert.match(plan.migrations[3]?.checksumSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.match(plan.schemaFingerprintSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(plan.migrations[3]?.destructivePatterns.length, 0);
  assert.equal(plan.applyCommand.includes("<postgres-url>"), true);
  assert.equal(plan.verifyCommand.includes("<postgres-url>"), true);
  assert.equal(JSON.stringify(plan).includes("postgres://"), false);
});

test("core migration state identifies pending and checksum drift", async () => {
  const plan = await buildMigrationPlan();
  const partial = evaluateAppliedMigrationState(plan, [
    {
      checksumSha256: plan.migrations[0]?.checksumSha256 ?? "",
      file: plan.migrations[0]?.file ?? "",
      version: "0001",
    },
  ]);

  assert.equal(partial.ok, false);
  assert.equal(partial.appliedCount, 1);
  assert.equal(partial.pendingCount, 3);
  assert.equal(partial.pending[0]?.version, "0002");

  const drift = evaluateAppliedMigrationState(plan, [
    {
      checksumSha256: "0".repeat(64),
      file: plan.migrations[0]?.file ?? "",
      version: "0001",
    },
  ]);

  assert.equal(drift.ok, false);
  assert.equal(drift.failures.length, 1);
  assert.match(drift.failures[0] ?? "", /does not match current/);
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
  assert.equal(plan.migrations.length, 4);
  assert.equal(plan.migrationLedgerTable, "core_schema_migrations");
  assert.equal(stdout.includes("PAYSHIELD_LEDGER_DATABASE_URL"), true);
  assert.equal(stdout.includes("://"), false);
});

test("core migration verify fails closed without database URL", async () => {
  let failed:
    | {
        code?: number;
        stdout?: string;
      }
    | undefined;

  try {
    await execFileAsync(process.execPath, ["scripts/core-migrations.mjs", "--verify"], {
      encoding: "utf8",
      timeout: 10_000,
    });
  } catch (error) {
    failed = error as typeof failed;
  }

  assert.equal(failed?.code, 1);
  assert.match(failed?.stdout ?? "", /PAYSHIELD_LEDGER_DATABASE_URL/);
  assert.doesNotMatch(failed?.stdout ?? "", /postgres:\/\//);
});
