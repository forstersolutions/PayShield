import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const migrationsDir = "services/core/migrations";
const migrationLedgerTable = "core_schema_migrations";
const migrationNamePattern = /^(\d{4})_[a-z0-9_]+\.sql$/;
const destructivePatterns = [
  /\bDROP\s+DATABASE\b/i,
  /\bDROP\s+SCHEMA\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+TABLE\b[\s\S]*?\bDROP\s+COLUMN\b/i,
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function usage() {
  return [
    "Usage: node scripts/core-migrations.mjs [--plan|--check|--verify|--apply] [--json]",
    "",
    "Plans, validates, or applies dedicated core Postgres migrations.",
    "",
    "Options:",
    "  --plan   Print redacted migration plan JSON (default)",
    "  --check  Validate migration ordering and safety only",
    "  --verify Verify applied migration checksums and required schema objects with psql",
    "  --apply  Apply pending tracked migrations with psql using PAYSHIELD_LEDGER_DATABASE_URL",
    "  --json   Emit JSON output",
  ].join("\n");
}

function parseCliArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const modes = ["--plan", "--check", "--verify", "--apply"].filter((flag) =>
    args.includes(flag),
  );
  const unknown = args.find(
    (arg) =>
      arg.startsWith("-") &&
      ![
        "--plan",
        "--check",
        "--verify",
        "--apply",
        "--json",
        "--help",
        "-h",
      ].includes(arg),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  if (modes.length > 1) {
    throw new Error("Choose only one of --plan, --check, --verify, or --apply.");
  }

  return {
    apply: modes[0] === "--apply",
    check: modes[0] === "--check",
    help: false,
    json: args.includes("--json") || modes[0] !== "--apply",
    plan: !modes[0] || modes[0] === "--plan",
    verify: modes[0] === "--verify",
  };
}

function migrationNumber(file) {
  const match = file.match(migrationNamePattern);

  return match ? Number(match[1]) : null;
}

function destructiveFindings(sql) {
  return destructivePatterns
    .filter((pattern) => pattern.test(sql))
    .map((pattern) => pattern.source);
}

function validateMigrations(migrations) {
  const failures = [];
  const seen = new Set();

  migrations.forEach((migration, index) => {
    if (!migrationNamePattern.test(migration.file)) {
      failures.push(`${migration.file} must use 0001_snake_case.sql naming.`);
    }

    if (seen.has(migration.version)) {
      failures.push(`Duplicate migration version ${migration.version}.`);
    }

    seen.add(migration.version);

    const expected = String(index + 1).padStart(4, "0");

    if (migration.version !== expected) {
      failures.push(
        `Migration ${migration.file} should be version ${expected} in sequence.`,
      );
    }

    if (migration.destructivePatterns.length > 0) {
      failures.push(
        `${migration.file} contains destructive SQL pattern(s): ${migration.destructivePatterns.join(", ")}`,
      );
    }
  });

  return failures;
}

function latestVersion(migrations) {
  return migrations.at(-1)?.version ?? null;
}

function schemaFingerprint(migrations) {
  return sha256(
    migrations
      .map(
        (migration) =>
          `${migration.version}:${migration.file}:${migration.checksumSha256}`,
      )
      .join("\n"),
  );
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function redactDatabaseUrl(value, databaseUrl = process.env.PAYSHIELD_LEDGER_DATABASE_URL) {
  let redacted = String(value);

  if (databaseUrl) {
    redacted = redacted.split(databaseUrl).join("<postgres-url>");
  }

  return redacted.replace(
    /postgres(?:ql)?:\/\/[^\s"'<>]+/gi,
    "<postgres-url>",
  );
}

function parseAppliedMigrationRows(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [version, file, checksumSha256] = line.split("\t");

      return {
        checksumSha256: checksumSha256 ?? "",
        file: file ?? "",
        version: version ?? "",
      };
    });
}

function parseSchemaCheckRows(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ok] = line.split("\t");

      return {
        name,
        ok: ok === "t" || ok === "true",
      };
    });
}

export function evaluateAppliedMigrationState(plan, appliedRows = []) {
  const appliedByVersion = new Map(
    appliedRows.map((row) => [row.version, row]),
  );
  const applied = [];
  const pending = [];
  const failures = [];

  for (const migration of plan.migrations) {
    const row = appliedByVersion.get(migration.version);

    if (!row) {
      pending.push(migration);
      continue;
    }

    if (
      row.file !== migration.file ||
      row.checksumSha256 !== migration.checksumSha256
    ) {
      failures.push(
        `Applied migration ${migration.version} does not match current ${migration.file}.`,
      );
      continue;
    }

    applied.push(migration);
  }

  const knownVersions = new Set(plan.migrations.map((migration) => migration.version));
  const unexpected = appliedRows.filter((row) => !knownVersions.has(row.version));

  for (const row of unexpected) {
    failures.push(`Database has unexpected migration version ${row.version}.`);
  }

  return {
    applied,
    appliedCount: applied.length,
    failures,
    ok: failures.length === 0 && pending.length === 0 && plan.ok === true,
    pending,
    pendingCount: pending.length,
    unexpected,
  };
}

function createMigrationLedgerSql() {
  return `
CREATE TABLE IF NOT EXISTS ${migrationLedgerTable} (
  version TEXT PRIMARY KEY,
  file TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  statement_count INTEGER NOT NULL CHECK (statement_count > 0),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`.trim();
}

function appliedMigrationSelectSql() {
  return `
SELECT version || E'\\t' || file || E'\\t' || checksum_sha256
FROM ${migrationLedgerTable}
ORDER BY version;
`.trim();
}

function schemaObjectCheckSql() {
  return `
SELECT name || E'\\t' || ok
FROM (
  VALUES
    ('table:households', to_regclass('public.households') IS NOT NULL),
    ('table:app_users', to_regclass('public.app_users') IS NOT NULL),
    ('table:provider_customers', to_regclass('public.provider_customers') IS NOT NULL),
    ('table:ledger_accounts', to_regclass('public.ledger_accounts') IS NOT NULL),
    ('table:journal_entries', to_regclass('public.journal_entries') IS NOT NULL),
    ('table:journal_lines', to_regclass('public.journal_lines') IS NOT NULL),
    ('table:household_buckets', to_regclass('public.household_buckets') IS NOT NULL),
    ('table:household_bucket_rules', to_regclass('public.household_bucket_rules') IS NOT NULL),
    ('table:household_bucket_change_events', to_regclass('public.household_bucket_change_events') IS NOT NULL),
    ('table:payees', to_regclass('public.payees') IS NOT NULL),
    ('table:commercial_subscriptions', to_regclass('public.commercial_subscriptions') IS NOT NULL),
    ('table:commercial_billing_events', to_regclass('public.commercial_billing_events') IS NOT NULL),
    ('table:bank_connections', to_regclass('public.bank_connections') IS NOT NULL),
    ('table:money_rail_events', to_regclass('public.money_rail_events') IS NOT NULL),
    ('table:paycheck_detection_rules', to_regclass('public.paycheck_detection_rules') IS NOT NULL),
    ('table:paycheck_detections', to_regclass('public.paycheck_detections') IS NOT NULL),
    ('table:transfer_intents', to_regclass('public.transfer_intents') IS NOT NULL),
    ('table:card_authorization_decisions', to_regclass('public.card_authorization_decisions') IS NOT NULL),
    ('table:bill_payment_schedules', to_regclass('public.bill_payment_schedules') IS NOT NULL),
    ('table:unlock_requests', to_regclass('public.unlock_requests') IS NOT NULL),
    ('table:provider_token_secrets', to_regclass('public.provider_token_secrets') IS NOT NULL),
    ('table:provider_token_vault_events', to_regclass('public.provider_token_vault_events') IS NOT NULL),
    ('table:provider_events', to_regclass('public.provider_events') IS NOT NULL),
    ('table:production_gate_evidence', to_regclass('public.production_gate_evidence') IS NOT NULL),
    ('table:reconciliation_exceptions', to_regclass('public.reconciliation_exceptions') IS NOT NULL),
    ('table:${migrationLedgerTable}', to_regclass('public.${migrationLedgerTable}') IS NOT NULL),
    ('function:assert_journal_entry_balanced_by_id', to_regprocedure('public.assert_journal_entry_balanced_by_id(text)') IS NOT NULL),
    ('function:assert_journal_line_household_scope', to_regprocedure('public.assert_journal_line_household_scope()') IS NOT NULL),
    ('trigger:journal_entries_balance_check', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entries_balance_check' AND NOT tgisinternal)),
    ('trigger:journal_lines_balance_check', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_lines_balance_check' AND NOT tgisinternal)),
    ('trigger:journal_lines_household_scope_check', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_lines_household_scope_check' AND NOT tgisinternal)),
    ('trigger:journal_entries_prevent_update', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entries_prevent_update' AND NOT tgisinternal)),
    ('trigger:journal_lines_prevent_update', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_lines_prevent_update' AND NOT tgisinternal))
) AS checks(name, ok)
ORDER BY name;
`.trim();
}

async function runPsql(databaseUrl, args) {
  try {
    return await execFileAsync("psql", [databaseUrl, "--no-psqlrc", ...args], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? error.stderr
        : "";
    const message = error instanceof Error ? error.message : "psql failed";

    throw new Error(
      redactDatabaseUrl(`${message}${stderr ? `: ${stderr}` : ""}`, databaseUrl),
    );
  }
}

async function runPsqlCommand(databaseUrl, command) {
  return runPsql(databaseUrl, [
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    command,
  ]);
}

async function readAppliedMigrations(databaseUrl) {
  const { stdout } = await runPsql(databaseUrl, [
    "--set",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--command",
    appliedMigrationSelectSql(),
  ]);

  return parseAppliedMigrationRows(stdout);
}

async function readSchemaChecks(databaseUrl) {
  const { stdout } = await runPsql(databaseUrl, [
    "--set",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--command",
    schemaObjectCheckSql(),
  ]);

  return parseSchemaCheckRows(stdout);
}

function verifiedSchemaEnv(plan) {
  return {
    PAYSHIELD_LEDGER_SCHEMA_FINGERPRINT: plan.schemaFingerprintSha256,
    PAYSHIELD_LEDGER_SCHEMA_VERIFIED: "true",
    PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION: plan.latestVersion,
  };
}

export async function buildMigrationPlan({ root = process.cwd() } = {}) {
  const absoluteMigrationsDir = join(root, migrationsDir);

  if (!existsSync(absoluteMigrationsDir)) {
    return {
      applyCommand:
        'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:apply',
      failures: [`Missing migrations directory: ${migrationsDir}`],
      latestVersion: null,
      migrationLedgerTable,
      migrations: [],
      ok: false,
      schemaFingerprintSha256: null,
      verifyCommand:
        'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:verify',
      service: "payshield-core-migrations",
    };
  }

  const files = (await readdir(absoluteMigrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const migrations = [];

  for (const file of files) {
    const sql = await readFile(join(absoluteMigrationsDir, file), "utf8");
    const number = migrationNumber(file);

    migrations.push({
      checksumSha256: sha256(sql),
      destructivePatterns: destructiveFindings(sql),
      file,
      path: `${migrationsDir}/${file}`,
      statementCount: sql
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean).length,
      version: number === null ? "invalid" : String(number).padStart(4, "0"),
    });
  }

  const failures = validateMigrations(migrations);

  return {
    applyCommand:
      'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:apply',
    databaseUrlConfigured: Boolean(process.env.PAYSHIELD_LEDGER_DATABASE_URL),
    failures,
    latestVersion: latestVersion(migrations),
    migrationLedgerTable,
    migrations,
    ok: failures.length === 0,
    psqlRequiredForApply: true,
    schemaFingerprintSha256: schemaFingerprint(migrations),
    verifyCommand:
      'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:verify',
    service: "payshield-core-migrations",
  };
}

async function writeTrackedMigration(migration, root) {
  const tempDir = await mkdtemp(join(tmpdir(), "payshield-core-migrations-"));
  const filePath = join(tempDir, `${migration.version}.sql`);
  const sql = await readFile(join(root, migration.path), "utf8");

  await writeFile(
    filePath,
    [
      `-- BEGIN ${migration.file}`,
      sql.trim(),
      `-- END ${migration.file}`,
      "",
      `INSERT INTO ${migrationLedgerTable} (version, file, checksum_sha256, statement_count)`,
      `VALUES (${sqlLiteral(migration.version)}, ${sqlLiteral(migration.file)}, ${sqlLiteral(migration.checksumSha256)}, ${migration.statementCount});`,
      "",
    ].join("\n"),
    "utf8",
  );

  return { filePath, tempDir };
}

export async function verifyAppliedMigrations({ root = process.cwd() } = {}) {
  const plan = await buildMigrationPlan({ root });
  const databaseUrl = process.env.PAYSHIELD_LEDGER_DATABASE_URL;

  if (!databaseUrl) {
    return {
      failures: ["PAYSHIELD_LEDGER_DATABASE_URL is required for --verify."],
      latestVersion: plan.latestVersion,
      migrationLedgerTable,
      ok: false,
      service: plan.service,
    };
  }

  if (!plan.ok) {
    return {
      failures: plan.failures,
      latestVersion: plan.latestVersion,
      migrationLedgerTable,
      ok: false,
      service: plan.service,
    };
  }

  try {
    const appliedRows = await readAppliedMigrations(databaseUrl);
    const migrationState = evaluateAppliedMigrationState(plan, appliedRows);
    const schemaChecks = await readSchemaChecks(databaseUrl);
    const failedSchemaChecks = schemaChecks.filter((check) => !check.ok);
    const failures = [
      ...migrationState.failures,
      ...failedSchemaChecks.map((check) => `Missing required schema object: ${check.name}.`),
    ];

    if (migrationState.pendingCount > 0) {
      failures.push(
        `Database is missing ${migrationState.pendingCount} migration(s): ${migrationState.pending.map((migration) => migration.file).join(", ")}.`,
      );
    }

    const ok = failures.length === 0 && migrationState.pendingCount === 0;

    return {
      appliedCount: migrationState.appliedCount,
      envToSetWhenOk: ok ? verifiedSchemaEnv(plan) : {},
      failures,
      latestVersion: plan.latestVersion,
      migrationLedgerTable,
      ok,
      pendingCount: migrationState.pendingCount,
      schemaChecks,
      schemaFingerprintSha256: plan.schemaFingerprintSha256,
      service: plan.service,
    };
  } catch (error) {
    return {
      failures: [
        error instanceof Error
          ? error.message
          : "Unable to verify core ledger schema.",
      ],
      latestVersion: plan.latestVersion,
      migrationLedgerTable,
      ok: false,
      service: plan.service,
    };
  }
}

export async function applyMigrations({ root = process.cwd() } = {}) {
  const plan = await buildMigrationPlan({ root });

  if (!plan.ok) {
    throw new Error(`Migration plan is not safe: ${plan.failures.join("; ")}`);
  }

  const databaseUrl = process.env.PAYSHIELD_LEDGER_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("PAYSHIELD_LEDGER_DATABASE_URL is required for --apply.");
  }

  await runPsqlCommand(databaseUrl, createMigrationLedgerSql());

  const migrationState = evaluateAppliedMigrationState(
    plan,
    await readAppliedMigrations(databaseUrl),
  );

  if (migrationState.failures.length > 0) {
    throw new Error(
      `Migration ledger is not safe to apply: ${migrationState.failures.join("; ")}`,
    );
  }

  const applied = [];

  for (const migration of migrationState.pending) {
    const { filePath, tempDir } = await writeTrackedMigration(migration, root);

    try {
      await runPsql(databaseUrl, [
        "--set",
        "ON_ERROR_STOP=1",
        "--single-transaction",
        "--file",
        filePath,
      ]);
      applied.push({
        checksumSha256: migration.checksumSha256,
        file: migration.file,
        version: migration.version,
      });
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  }

  const verification = await verifyAppliedMigrations({ root });

  return {
    applied,
    appliedCount: applied.length,
    envToSetWhenVerified: verification.ok ? verifiedSchemaEnv(plan) : {},
    latestVersion: plan.latestVersion,
    migrationLedgerTable,
    ok: verification.ok,
    schemaFingerprintSha256: plan.schemaFingerprintSha256,
    service: plan.service,
    skippedCount: migrationState.appliedCount,
    verification,
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  if (args.apply) {
    const result = await applyMigrations();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (args.verify) {
    const result = await verifyAppliedMigrations();
    console.log(JSON.stringify(result, null, 2));

    if (!result.ok) {
      process.exitCode = 1;
    }

    return;
  }

  const plan = await buildMigrationPlan();

  if (args.check && !plan.ok) {
    console.error(JSON.stringify(plan, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify(plan, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : "Unknown error",
          ok: false,
          service: "payshield-core-migrations",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
