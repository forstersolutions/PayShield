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
    "0005_money_decision_records.sql",
    "0006_provider_token_vault.sql",
    "0007_paycheck_detection_rules.sql",
    "0008_direct_deposit_setups.sql",
    "0009_commercial_checkout_intents.sql",
    "0010_reconciliation_exception_details.sql",
    "0011_bank_transaction_sync.sql",
    "0012_production_gate_evidence.sql",
    "0013_journal_household_scope.sql",
    "0014_household_money_profiles.sql",
    "0015_provider_onboarding_and_cards.sql",
    "0016_money_control_lifecycle.sql",
    "0017_provider_settlement_lifecycle.sql",
    "0018_kyc_hosted_verification.sql",
    "0019_plaid_sync_jobs.sql",
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
  assert.match(sql, /provider_subscription_id TEXT/);
  assert.match(sql, /current_period_end TIMESTAMPTZ/);
  assert.match(sql, /cancel_at_period_end BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /UNIQUE \(provider_name, provider_subscription_id\)/);
  assert.match(sql, /CREATE TABLE bank_connections/);
  assert.match(sql, /token_secret_ref TEXT NOT NULL/);
  assert.match(sql, /CREATE TABLE paycheck_detection_rules/);
  assert.match(sql, /CREATE TABLE paycheck_detections/);
  assert.match(sql, /CREATE TABLE transfer_intents/);
  assert.match(sql, /UNIQUE \(household_id, idempotency_key\)/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("money decision migration adds support and dispute records", async () => {
  const sql = await readFile(
    `${migrationsDir}/0005_money_decision_records.sql`,
    "utf8",
  );

  assert.match(sql, /CREATE TABLE card_authorization_decisions/);
  assert.match(sql, /CREATE TABLE bill_payment_schedules/);
  assert.match(sql, /CREATE TABLE unlock_requests/);
  assert.match(sql, /UNIQUE \(household_id, idempotency_key\)/);
  assert.match(sql, /provider_status TEXT NOT NULL/);
  assert.match(sql, /decision_code TEXT NOT NULL/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("provider token vault migration stores encrypted token custody records", async () => {
  const sql = await readFile(
    `${migrationsDir}/0006_provider_token_vault.sql`,
    "utf8",
  );

  assert.match(sql, /CREATE TABLE provider_token_secrets/);
  assert.match(sql, /ciphertext TEXT NOT NULL/);
  assert.match(sql, /nonce TEXT NOT NULL/);
  assert.match(sql, /auth_tag TEXT NOT NULL/);
  assert.match(sql, /token_fingerprint_sha256 TEXT NOT NULL/);
  assert.match(sql, /CREATE TABLE provider_token_vault_events/);
  assert.match(sql, /UNIQUE \(provider_name, provider_item_id\)/);
  assert.doesNotMatch(sql, /access_token TEXT/i);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("paycheck detection rule migration adds durable rule matching fields", async () => {
  const sql = await readFile(
    `${migrationsDir}/0007_paycheck_detection_rules.sql`,
    "utf8",
  );

  assert.match(sql, /ALTER TABLE paycheck_detection_rules/);
  assert.match(sql, /provider_item_id TEXT/);
  assert.match(sql, /provider_account_id TEXT/);
  assert.match(sql, /expected_frequency TEXT NOT NULL DEFAULT 'unknown'/);
  assert.match(sql, /idempotency_key TEXT/);
  assert.match(sql, /ALTER TABLE paycheck_detections/);
  assert.match(sql, /detection_rule_id TEXT REFERENCES paycheck_detection_rules\(id\)/);
  assert.match(sql, /paycheck_detection_rules_household_idempotency_idx/);
  assert.match(sql, /paycheck_detections_rule_idx/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("direct deposit setup migration stores masked routing state", async () => {
  const sql = await readFile(
    `${migrationsDir}/0008_direct_deposit_setups.sql`,
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS direct_deposit_setups/);
  assert.match(sql, /account_last4 TEXT NOT NULL/);
  assert.match(sql, /routing_last4 TEXT NOT NULL/);
  assert.match(sql, /UNIQUE \(household_id, idempotency_key\)/);
  assert.match(sql, /direct_deposit_setups_household_status_idx/);
  assert.match(sql, /money_rail_events_rail_check/);
  assert.match(sql, /direct_deposit/);
  assert.doesNotMatch(sql, /account_number/i);
  assert.doesNotMatch(sql, /routing_number/i);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("commercial checkout intent migration stores paid access attempts", async () => {
  const sql = await readFile(
    `${migrationsDir}/0009_commercial_checkout_intents.sql`,
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS commercial_checkout_intents/);
  assert.match(sql, /provider_checkout_id TEXT/);
  assert.match(sql, /checkout_mode TEXT NOT NULL/);
  assert.match(sql, /checkout_url_present BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /UNIQUE \(household_id, idempotency_key\)/);
  assert.match(sql, /commercial_checkout_intents_household_status_idx/);
  assert.doesNotMatch(sql, /card_number/i);
  assert.doesNotMatch(sql, /payment_method/i);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("reconciliation exception migration stores provider exception details", async () => {
  const sql = await readFile(
    `${migrationsDir}/0010_reconciliation_exception_details.sql`,
    "utf8",
  );

  assert.match(sql, /ALTER TABLE reconciliation_exceptions/);
  assert.match(sql, /ALTER COLUMN household_id DROP NOT NULL/);
  assert.match(sql, /source TEXT NOT NULL DEFAULT 'system'/);
  assert.match(sql, /provider_event_id TEXT/);
  assert.match(sql, /provider_transaction_id TEXT/);
  assert.match(sql, /reason_code TEXT/);
  assert.match(sql, /metadata JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(sql, /reconciliation_exceptions_idempotency_idx/);
  assert.match(sql, /reconciliation_exceptions_status_source_idx/);
  assert.match(sql, /reconciliation_exceptions_provider_event_idx/);
  assert.doesNotMatch(sql, /access_token/i);
  assert.doesNotMatch(sql, /card_number/i);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("bank transaction sync migration stores Plaid cursor evidence", async () => {
  const sql = await readFile(
    `${migrationsDir}/0011_bank_transaction_sync.sql`,
    "utf8",
  );

  assert.match(sql, /ALTER TABLE bank_connections/);
  assert.match(sql, /sync_cursor TEXT/);
  assert.match(sql, /last_transaction_sync_at TIMESTAMPTZ/);
  assert.match(sql, /last_transaction_sync_request_id TEXT/);
  assert.match(sql, /bank_connections_sync_status_idx/);
  assert.doesNotMatch(sql, /access_token/i);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("production gate evidence migration stores launch approval records", async () => {
  const sql = await readFile(
    `${migrationsDir}/0012_production_gate_evidence.sql`,
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS production_gate_evidence/);
  assert.match(sql, /gate_id TEXT NOT NULL/);
  assert.match(sql, /scope TEXT NOT NULL CHECK/);
  assert.match(sql, /status TEXT NOT NULL CHECK/);
  assert.match(sql, /evidence_ref TEXT NOT NULL/);
  assert.match(sql, /evidence_summary TEXT NOT NULL/);
  assert.match(sql, /approved_by TEXT/);
  assert.match(sql, /approved_at TIMESTAMPTZ/);
  assert.match(sql, /status = 'approved'/);
  assert.match(sql, /approved_by IS NOT NULL/);
  assert.match(sql, /approved_at IS NOT NULL/);
  assert.match(sql, /evidence_ref !~\*/);
  assert.match(sql, /production_gate_evidence_gate_status_idx/);
  assert.match(sql, /production_gate_evidence_scope_status_idx/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
  assert.doesNotMatch(sql, /card_number/i);
  assert.doesNotMatch(sql, /account_number/i);
});

test("journal household scope migration prevents cross-household ledger lines", async () => {
  const sql = await readFile(
    `${migrationsDir}/0013_journal_household_scope.sql`,
    "utf8",
  );

  assert.match(sql, /assert_journal_line_household_scope/);
  assert.match(sql, /journal_lines_household_scope_check/);
  assert.match(sql, /journal_entries\.household_id <> ledger_accounts\.household_id/);
  assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(sql, /integrity_constraint_violation/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("household money profile migration stores durable setup metadata", async () => {
  const sql = await readFile(
    `${migrationsDir}/0014_household_money_profiles.sql`,
    "utf8",
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS household_money_profiles/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS household_money_profile_events/);
  assert.match(sql, /paycheck_amount_cents BIGINT NOT NULL/);
  assert.match(sql, /expected_frequency IN/);
  assert.match(sql, /UNIQUE \(household_id\)/);
  assert.match(sql, /UNIQUE \(household_id, idempotency_key\)/);
  assert.doesNotMatch(sql, /access_token/i);
  assert.doesNotMatch(sql, /account_number/i);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("provider onboarding migration stores identity, account, and issued-card ownership", async () => {
  const sql = await readFile(
    `${migrationsDir}/0015_provider_onboarding_and_cards.sql`,
    "utf8",
  );

  assert.match(sql, /ALTER TABLE provider_customers/);
  assert.match(sql, /household_id TEXT REFERENCES households\(id\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS provider_kyc_applications/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS provider_financial_accounts/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS provider_cards/);
  assert.match(sql, /provider_card_id TEXT NOT NULL/);
  assert.match(sql, /card_last4 TEXT NOT NULL/);
  assert.match(sql, /card_authorization_provider_reference_idx/);
  assert.doesNotMatch(sql, /card_number/i);
  assert.doesNotMatch(sql, /account_number/i);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("money control lifecycle migration supports safe consumer reversals", async () => {
  const sql = await readFile(
    `${migrationsDir}/0016_money_control_lifecycle.sql`,
    "utf8",
  );

  assert.match(sql, /status IN \('modeled', 'provider_pending', 'approved', 'archived'\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS payee_control_events/);
  assert.match(sql, /provider_payee_id TEXT/);
  assert.match(sql, /canceled_by_user_id TEXT REFERENCES app_users\(id\)/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("provider settlement lifecycle clears pending money through immutable journals", async () => {
  const sql = await readFile(
    `${migrationsDir}/0017_provider_settlement_lifecycle.sql`,
    "utf8",
  );

  assert.match(sql, /'transfer_reservation'/);
  assert.match(sql, /'money_settlement'/);
  assert.match(sql, /settlement_journal_entry_id TEXT REFERENCES journal_entries\(id\)/);
  assert.match(sql, /reversal_journal_entry_id TEXT REFERENCES journal_entries\(id\)/);
  assert.match(sql, /card_authorization_decisions_lifecycle_status_check/);
  assert.match(sql, /transfer_intents_provider_reference_idx/);
  assert.match(sql, /bill_payments_provider_reference_idx/);
  assert.match(sql, /account_code TEXT/);
  assert.match(sql, /ledger_accounts_household_code_idx/);
  assert.match(sql, /'rejected'/);
  assert.match(sql, /remaining_recovery_cents BIGINT/);
  assert.match(sql, /recovery_checks_remaining INTEGER/);
  assert.match(sql, /unlock_requests_active_recovery_idx/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("KYC hosted verification migration preserves resumable provider handoff state", async () => {
  const sql = await readFile(
    `${migrationsDir}/0018_kyc_hosted_verification.sql`,
    "utf8",
  );

  assert.match(sql, /verification_url TEXT/);
  assert.match(sql, /expires_at TIMESTAMPTZ/);
  assert.match(sql, /provider_kyc_pending_expiry_idx/);
  assert.match(sql, /length\(verification_url\) <= 2000/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /DROP\s+COLUMN/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("Plaid sync queue migration supports durable multi-worker claims", async () => {
  const sql = await readFile(
    `${migrationsDir}/0019_plaid_sync_jobs.sql`,
    "utf8",
  );

  assert.match(sql, /CREATE TABLE plaid_sync_jobs/);
  assert.match(sql, /status IN \('queued', 'running', 'retry', 'completed', 'dead'\)/);
  assert.match(sql, /UNIQUE \(provider_event_id, provider_item_id\)/);
  assert.match(sql, /plaid_sync_jobs_claim_idx/);
  assert.doesNotMatch(sql, /DROP\s+TABLE/i);
  assert.doesNotMatch(sql, /DROP\s+COLUMN/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test("core migration planner emits ordered checksummed evidence", async () => {
  const plan = await buildMigrationPlan();

  assert.equal(plan.ok, true);
  assert.equal(plan.service, "payshield-core-migrations");
  assert.equal(plan.migrations.length, 19);
  assert.equal(plan.migrations[0]?.file, "0001_neobank_core.sql");
  assert.equal(plan.migrations[1]?.file, "0002_household_bucket_controls.sql");
  assert.equal(plan.migrations[2]?.file, "0003_ledger_integrity.sql");
  assert.equal(plan.migrations[3]?.file, "0004_commercial_money_rails.sql");
  assert.equal(plan.migrations[4]?.file, "0005_money_decision_records.sql");
  assert.equal(plan.migrations[5]?.file, "0006_provider_token_vault.sql");
  assert.equal(plan.migrations[6]?.file, "0007_paycheck_detection_rules.sql");
  assert.equal(plan.migrations[7]?.file, "0008_direct_deposit_setups.sql");
  assert.equal(plan.migrations[8]?.file, "0009_commercial_checkout_intents.sql");
  assert.equal(plan.migrations[9]?.file, "0010_reconciliation_exception_details.sql");
  assert.equal(plan.migrations[10]?.file, "0011_bank_transaction_sync.sql");
  assert.equal(plan.migrations[11]?.file, "0012_production_gate_evidence.sql");
  assert.equal(plan.migrations[12]?.file, "0013_journal_household_scope.sql");
  assert.equal(plan.migrations[13]?.file, "0014_household_money_profiles.sql");
  assert.equal(plan.migrations[14]?.file, "0015_provider_onboarding_and_cards.sql");
  assert.equal(plan.migrations[15]?.file, "0016_money_control_lifecycle.sql");
  assert.equal(plan.migrations[16]?.file, "0017_provider_settlement_lifecycle.sql");
  assert.equal(plan.migrations[17]?.file, "0018_kyc_hosted_verification.sql");
  assert.equal(plan.migrations[18]?.file, "0019_plaid_sync_jobs.sql");
  assert.equal(plan.latestVersion, "0019");
  assert.equal(plan.migrationLedgerTable, "core_schema_migrations");
  assert.match(plan.migrations[18]?.checksumSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.match(plan.schemaFingerprintSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(plan.migrations[18]?.destructivePatterns.length, 0);
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
  assert.equal(partial.pendingCount, 18);
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
  assert.equal(plan.migrations.length, 19);
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
  assert.match(failed?.stdout ?? "", /ledger database URL.*PGHOST/i);
  assert.doesNotMatch(failed?.stdout ?? "", /postgres:\/\//);
});
