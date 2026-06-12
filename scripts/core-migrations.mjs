import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const migrationsDir = "services/core/migrations";
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
    "Usage: node scripts/core-migrations.mjs [--plan|--check|--apply] [--json]",
    "",
    "Plans, validates, or applies dedicated core Postgres migrations.",
    "",
    "Options:",
    "  --plan   Print redacted migration plan JSON (default)",
    "  --check  Validate migration ordering and safety only",
    "  --apply  Apply migrations with psql using PAYSHIELD_LEDGER_DATABASE_URL",
    "  --json   Emit JSON output",
  ].join("\n");
}

function parseCliArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const modes = ["--plan", "--check", "--apply"].filter((flag) =>
    args.includes(flag),
  );
  const unknown = args.find(
    (arg) =>
      arg.startsWith("-") &&
      !["--plan", "--check", "--apply", "--json", "--help", "-h"].includes(arg),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  if (modes.length > 1) {
    throw new Error("Choose only one of --plan, --check, or --apply.");
  }

  return {
    apply: modes[0] === "--apply",
    check: modes[0] === "--check",
    help: false,
    json: args.includes("--json") || modes[0] !== "--apply",
    plan: !modes[0] || modes[0] === "--plan",
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

export async function buildMigrationPlan({ root = process.cwd() } = {}) {
  const absoluteMigrationsDir = join(root, migrationsDir);

  if (!existsSync(absoluteMigrationsDir)) {
    return {
      applyCommand:
        'PAYSHIELD_LEDGER_DATABASE_URL="<postgres-url>" npm run core:migrations:apply',
      failures: [`Missing migrations directory: ${migrationsDir}`],
      migrations: [],
      ok: false,
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
    migrations,
    ok: failures.length === 0,
    psqlRequiredForApply: true,
    service: "payshield-core-migrations",
  };
}

async function writeCombinedMigration(plan, root) {
  const tempDir = await mkdtemp(join(tmpdir(), "payshield-core-migrations-"));
  const filePath = join(tempDir, "combined.sql");
  const chunks = [];

  for (const migration of plan.migrations) {
    const sql = await readFile(join(root, migration.path), "utf8");

    chunks.push(
      [
        `-- BEGIN ${migration.file}`,
        sql.trim(),
        `-- END ${migration.file}`,
      ].join("\n"),
    );
  }

  await writeFile(filePath, `${chunks.join("\n\n")}\n`, "utf8");

  return { filePath, tempDir };
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

  const { filePath, tempDir } = await writeCombinedMigration(plan, root);

  try {
    await execFileAsync(
      "psql",
      [
        databaseUrl,
        "--set",
        "ON_ERROR_STOP=1",
        "--single-transaction",
        "--file",
        filePath,
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
      },
    );

    return {
      appliedCount: plan.migrations.length,
      checksums: plan.migrations.map((migration) => ({
        checksumSha256: migration.checksumSha256,
        file: migration.file,
      })),
      ok: true,
      service: plan.service,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
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
