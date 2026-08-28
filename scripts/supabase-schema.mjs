import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  applyMigrations,
  verifyAppliedMigrations,
} from "./core-migrations.mjs";

const execFileAsync = promisify(execFile);
const supabaseMigrationsDir = "supabase/migrations";
const migrationPattern = /^\d{14}_[a-z0-9_]+\.sql$/;

function databaseConfigured(env = process.env) {
  return Boolean(
    env.PAYSHIELD_LEDGER_DATABASE_URL?.trim() ||
      ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"].every((name) =>
        Boolean(env[name]?.trim()),
      ),
  );
}

function redact(value) {
  let output = String(value || "");

  for (const secret of [
    process.env.PAYSHIELD_LEDGER_DATABASE_URL,
    process.env.PGPASSWORD,
  ]) {
    if (secret) {
      output = output.split(secret).join("<redacted>");
    }
  }

  return output.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "<postgres-url>");
}

async function runPsql(args) {
  const databaseUrl = process.env.PAYSHIELD_LEDGER_DATABASE_URL?.trim() || "";

  try {
    return await execFileAsync(
      "psql",
      [...(databaseUrl ? [databaseUrl] : []), "--no-psqlrc", ...args],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
    );
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? error.stderr
        : "";
    throw new Error(
      redact(
        `${error instanceof Error ? error.message : "psql failed"}${stderr ? `: ${stderr}` : ""}`,
      ),
    );
  }
}

async function loadPlatformMigrations(root = process.cwd()) {
  const directory = join(root, supabaseMigrationsDir);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  const failures = [];
  const migrations = [];

  for (const file of files) {
    if (!migrationPattern.test(file)) {
      failures.push(`${file} must use a Supabase timestamp migration name.`);
      continue;
    }

    const sql = await readFile(join(directory, file), "utf8");
    const requiredMarkers = [
      "ENABLE ROW LEVEL SECURITY",
      "FORCE ROW LEVEL SECURITY",
      "FROM anon, authenticated",
      "ALTER DEFAULT PRIVILEGES",
      "payshield_platform_migrations",
    ];

    for (const marker of requiredMarkers) {
      if (!sql.includes(marker)) {
        failures.push(`${file} is missing ${marker}.`);
      }
    }

    migrations.push({
      file,
      path: join(directory, file),
      sql,
      version: file.slice(0, 14),
    });
  }

  if (migrations.length === 0) {
    failures.push("At least one Supabase platform migration is required.");
  }

  return { failures, migrations, ok: failures.length === 0 };
}

async function expectedLedgerTables(root = process.cwd()) {
  const directory = join(root, "services/core/migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql"));
  const tables = new Set([
    "core_schema_migrations",
    "payshield_platform_migrations",
  ]);

  for (const file of files) {
    const sql = await readFile(join(directory, file), "utf8");

    for (const match of sql.matchAll(
      /CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z][a-z0-9_]*)/gi,
    )) {
      tables.add(match[1].toLowerCase());
    }
  }

  return [...tables].sort();
}

function tableSecuritySql(tableNames) {
  const values = tableNames
    .map((name) => `('${name.replaceAll("'", "''")}')`)
    .join(",\n");

  return `
WITH expected(name) AS (VALUES ${values})
SELECT expected.name || E'\\t' ||
       COALESCE(classes.relrowsecurity::text, 'false') || E'\\t' ||
       COALESCE(classes.relforcerowsecurity::text, 'false') || E'\\t' ||
       COALESCE(has_table_privilege('anon', classes.oid, 'SELECT'), false)::text || E'\\t' ||
       COALESCE(has_table_privilege('authenticated', classes.oid, 'SELECT'), false)::text
FROM expected
LEFT JOIN pg_class AS classes
  ON classes.relname = expected.name
 AND classes.relnamespace = 'public'::regnamespace
ORDER BY expected.name;
`.trim();
}

async function verifyPlatformSecurity(root = process.cwd()) {
  if (!databaseConfigured()) {
    return {
      failures: ["A Supabase pooled PostgreSQL URL or complete PG* fields are required."],
      ok: false,
    };
  }

  const tables = await expectedLedgerTables(root);
  const { stdout } = await runPsql([
    "--set",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--command",
    tableSecuritySql(tables),
  ]);
  const rows = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, rls, forced, anonSelect, authenticatedSelect] = line.split("\t");

      return {
        anonSelect: anonSelect === "true" || anonSelect === "t",
        authenticatedSelect:
          authenticatedSelect === "true" || authenticatedSelect === "t",
        forced: forced === "true" || forced === "t",
        name,
        rls: rls === "true" || rls === "t",
      };
    });
  const failures = [];

  for (const row of rows) {
    if (!row.rls || !row.forced) {
      failures.push(`${row.name} must use forced row-level security.`);
    }

    if (row.anonSelect || row.authenticatedSelect) {
      failures.push(`${row.name} must not be readable through the Supabase Data API.`);
    }
  }

  if (rows.length !== tables.length) {
    failures.push("One or more expected PayShield tables are missing.");
  }

  return { failures, ok: failures.length === 0, tableCount: tables.length };
}

export async function checkSupabaseSchema({ root = process.cwd() } = {}) {
  const platform = await loadPlatformMigrations(root);

  return {
    failures: platform.failures,
    migrationCount: platform.migrations.length,
    ok: platform.ok,
    service: "payshield-supabase-schema",
  };
}

export async function applySupabaseSchema({ root = process.cwd() } = {}) {
  const core = await applyMigrations({ root });
  const platform = await loadPlatformMigrations(root);

  if (!platform.ok) {
    throw new Error(platform.failures.join("; "));
  }

  for (const migration of platform.migrations) {
    await runPsql([
      "--set",
      "ON_ERROR_STOP=1",
      "--single-transaction",
      "--file",
      migration.path,
    ]);
  }

  const security = await verifyPlatformSecurity(root);

  return {
    core,
    ok: core.ok && security.ok,
    platformAppliedCount: platform.migrations.length,
    security,
    service: "payshield-supabase-schema",
  };
}

export async function verifySupabaseSchema({ root = process.cwd() } = {}) {
  const [core, platform, security] = await Promise.all([
    verifyAppliedMigrations({ root }),
    loadPlatformMigrations(root),
    verifyPlatformSecurity(root),
  ]);

  return {
    core,
    failures: [...core.failures, ...platform.failures, ...security.failures],
    ok: core.ok && platform.ok && security.ok,
    security,
    service: "payshield-supabase-schema",
  };
}

async function main() {
  const mode = process.argv.includes("--apply")
    ? "apply"
    : process.argv.includes("--verify")
      ? "verify"
      : "check";
  const result =
    mode === "apply"
      ? await applySupabaseSchema()
      : mode === "verify"
        ? await verifySupabaseSchema()
        : await checkSupabaseSchema();

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          error: error instanceof Error ? redact(error.message) : "Unknown error",
          ok: false,
          service: "payshield-supabase-schema",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
}
