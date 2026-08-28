import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const requiredMarkers = [
  ["Vercel core runtime", "PAYSHIELD_CORE_RUNTIME=vercel", "../.env.example"],
  ["Supabase project reference", "PAYSHIELD_SUPABASE_PROJECT_REF=", "../.env.example"],
  ["Supabase pooled ledger", "PAYSHIELD_LEDGER_DATABASE_URL=", "../.env.example"],
  ["Supabase security verification", "PAYSHIELD_SUPABASE_SECURITY_VERIFIED=false", "../.env.example"],
  ["scheduled maintenance secret", "CRON_SECRET=", "../.env.example"],
  ["in-process dispatcher", "dispatchCoreRequest", "../services/core/dispatcher.mjs"],
  ["post-response job processing", "runCoreFollowup", "../services/core/dispatcher.mjs"],
  ["durable maintenance processing", "runCoreMaintenance", "../services/core/dispatcher.mjs"],
  ["serverless database pool limit", '=== "vercel" ? 2 : 5', "../services/core/database.mjs"],
  ["Supabase transaction pooler enforcement", ".pooler.supabase.com", "../src/app/lib/neobank/core-config.ts"],
  ["forced row-level security", "FORCE ROW LEVEL SECURITY", "../supabase/migrations/20260827185032_payshield_ledger_security.sql"],
  ["Data API isolation", "FROM anon, authenticated", "../supabase/migrations/20260827185032_payshield_ledger_security.sql"],
  ["default privilege isolation", "ALTER DEFAULT PRIVILEGES", "../supabase/migrations/20260827185032_payshield_ledger_security.sql"],
  ["Plaid webhook facade", "/api/plaid/webhooks", "../src/app/api/plaid/webhooks/route.ts"],
  ["maintenance route", "runCoreMaintenance", "../src/app/api/jobs/maintenance/route.ts"],
  ["daily maintenance schedule", "/api/jobs/maintenance", "../vercel.json"],
  ["schema apply command", "supabase:schema:apply", "../package.json"],
  ["schema verification command", "supabase:schema:verify", "../package.json"],
];

const forbiddenArtifacts = [
  "../.github/workflows/deploy-core.yml",
  "../infra/aws/payshield-core.yaml",
  "../infra/aws/github-deploy-role.yaml",
];

const noAwsReferenceFiles = [
  "../README.md",
  "../docs/market-readiness.md",
  "../docs/money-rails-production.md",
  "../.github/workflows/ci.yml",
];

export function auditSupabaseInfrastructure() {
  const failures = [];

  for (const [label, marker, path] of requiredMarkers) {
    if (!read(path).includes(marker)) {
      failures.push(`Missing ${label}.`);
    }
  }

  for (const path of forbiddenArtifacts) {
    if (existsSync(new URL(path, import.meta.url))) {
      failures.push(`Remove obsolete AWS artifact ${path.replace("../", "")}.`);
    }
  }

  for (const path of noAwsReferenceFiles) {
    const source = read(path);

    if (/\b(?:AWS|ECS|Fargate|RDS|CloudFormation|Secrets Manager)\b/i.test(source)) {
      failures.push(`Remove AWS deployment guidance from ${path.replace("../", "")}.`);
    }
  }

  return {
    controlsChecked:
      requiredMarkers.length + forbiddenArtifacts.length + noAwsReferenceFiles.length,
    failures,
    ok: failures.length === 0,
    service: "payshield-supabase-infrastructure",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const audit = auditSupabaseInfrastructure();
  console.log(JSON.stringify(audit, null, 2));

  if (!audit.ok) {
    process.exitCode = 1;
  }
}
