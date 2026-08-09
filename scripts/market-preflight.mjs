import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
let checkCount = 0;

function check(condition, message) {
  checkCount += 1;

  if (!condition) {
    failures.push(message);
  }
}

function source(path) {
  const fullPath = join(root, path);

  check(existsSync(fullPath), `Missing required file: ${path}`);
  return existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
}

function includes(path, marker, label = marker) {
  check(source(path).includes(marker), `${path} is missing ${label}.`);
}

const requiredFiles = [
  ".env.example",
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-core.yml",
  "Dockerfile.core",
  "SECURITY.md",
  "infra/aws/github-deploy-role.yaml",
  "infra/aws/payshield-core.yaml",
  "public/apple-icon.png",
  "public/favicon.ico",
  "public/icon.svg",
  "public/images/grayston-logo-full.png",
  "public/images/payshield-logo-clean.png",
  "public/images/payshield-mark.png",
  "public/images/payshield-social-card.jpg",
  "services/core/database.mjs",
  "services/core/product.mjs",
  "services/core/server.mjs",
  "src/app/api/health/route.ts",
  "src/app/api/public/billing/status/route.ts",
  "src/app/components/household-money-workspace.tsx",
  "src/app/components/neobank-dashboard.tsx",
  "src/app/components/pay-shield-mark.tsx",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
];

for (const file of requiredFiles) {
  const fullPath = join(root, file);
  check(existsSync(fullPath), `Missing required release file: ${file}`);

  if (existsSync(fullPath) && !file.endsWith(".ts") && !file.endsWith(".tsx")) {
    check(statSync(fullPath).size > 0, `Release file is empty: ${file}`);
  }
}

const consumerFiles = [
  "src/app/page.tsx",
  "src/app/app/page.tsx",
  "src/app/components/neobank-dashboard.tsx",
  "src/app/components/household-money-workspace.tsx",
  "src/app/components/household-money-profile-panel.tsx",
  "src/app/components/bucket-control-panel.tsx",
  "src/app/components/payee-control-panel.tsx",
  "src/app/components/bill-payment-panel.tsx",
  "src/app/components/unlock-control-panel.tsx",
];
const rejectedCopy = [
  /\bearly access\b/i,
  /\bpaid beta\b/i,
  /\bprototype\b/i,
  /\bsimulation mode\b/i,
  /\bnot a bank\b/i,
  /\bAI[- ]generated\b/i,
];

for (const file of consumerFiles) {
  const text = source(file);

  for (const pattern of rejectedCopy) {
    check(!pattern.test(text), `${file} contains rejected product copy ${pattern}.`);
  }
}

const srcFiles = readdirSync(join(root, "src"), { recursive: true })
  .filter((path) => typeof path === "string" && /\.(ts|tsx)$/.test(path))
  .map((path) => join("src", path));
const runtimeText = srcFiles.map((file) => source(file)).join("\n");

check(!/\blocalStorage\b|\bsessionStorage\b/.test(runtimeText), "Runtime code must not persist financial state in browser storage.");
check(!existsSync(join(root, "src/app/api/waitlist/route.ts")), "Obsolete waitlist endpoint must not be deployed.");
check(!runtimeText.includes("/api/waitlist"), "Runtime code still references the obsolete waitlist endpoint.");

includes("src/app/components/neobank-dashboard.tsx", "Safe to Spend");
includes("src/app/components/neobank-dashboard.tsx", "Spend what&apos;s free. Protect what&apos;s spoken for.");
includes("src/app/components/household-money-workspace.tsx", "/api/app/bank-link/token");
includes("src/app/components/household-money-workspace.tsx", "/api/app/paychecks/sync");
includes("src/app/components/household-money-workspace.tsx", "/api/app/transfers");
includes("src/app/components/household-money-workspace.tsx", "/api/app/card/status");
includes("src/app/components/household-money-workspace.tsx", "/api/app/audit/export");
includes("src/app/components/bucket-control-panel.tsx", "custom_");
includes("src/app/lib/client-action-idempotency.ts", "idempotencyKeyForAction");
includes("src/app/lib/neobank/core-required.ts", "requireDurableCoreService");
includes("src/app/lib/neobank/auth.ts", "clerkSubject: session.userId");
includes("src/app/api/health/route.ts", 'service: "payshield-web-app"');
includes("src/app/api/public/billing/status/route.ts", 'service: "payshield-membership-status"');

includes("services/core/server.mjs", 'path === "/plaid/webhooks"');
includes("services/core/server.mjs", "SIGTERM");
includes("services/core/server.mjs", "closeDatabasePool");
includes("services/core/product.mjs", "verifyPlaidWebhook");
includes("services/core/product.mjs", "processPlaidSyncJobs");
includes("services/core/product.mjs", "timingSafeEqual");
includes("services/core/database.mjs", "FOR UPDATE SKIP LOCKED");
includes("services/core/migrations/0003_ledger_integrity.sql", "prevent_posted_journal_mutation");
includes("services/core/migrations/0019_plaid_sync_jobs.sql", "plaid_sync_jobs");

const migrations = readdirSync(join(root, "services/core/migrations"))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort();
const versions = migrations.map((file) => file.slice(0, 4));
const expectedVersions = Array.from({ length: 19 }, (_, index) =>
  String(index + 1).padStart(4, "0"),
);

check(JSON.stringify(versions) === JSON.stringify(expectedVersions), "Core migrations must be sequential from 0001 through 0019.");

includes("infra/aws/payshield-core.yaml", "AssignPublicIp: DISABLED");
includes("infra/aws/payshield-core.yaml", "PubliclyAccessible: false");
includes("infra/aws/payshield-core.yaml", "StorageEncrypted: true");
includes("infra/aws/payshield-core.yaml", "MultiAZ: true");
includes("infra/aws/payshield-core.yaml", "DeletionProtection: true");
includes("infra/aws/payshield-core.yaml", "Rollback: true");
includes("infra/aws/github-deploy-role.yaml", "sts:AssumeRoleWithWebIdentity");
includes("infra/aws/github-deploy-role.yaml", "environment:${GitHubEnvironment}");
includes(".github/workflows/deploy-core.yml", "Run forward-only database migrations");
includes(".github/workflows/deploy-core.yml", "PAYSHIELD_CFN_EXECUTION_ROLE_ARN");
includes(".github/workflows/ci.yml", "core-postgres-integration.test.mts");

if (failures.length) {
  console.error("Release preflight failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Release preflight passed (${checkCount} checks).`);
