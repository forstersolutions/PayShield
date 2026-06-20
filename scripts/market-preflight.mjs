import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function readProjectFile(path) {
  return readFileSync(join(root, path), "utf8");
}

function requireFile(path) {
  const fullPath = join(root, path);

  if (!existsSync(fullPath)) {
    failures.push(`Missing required file: ${path}`);
    return null;
  }

  return fullPath;
}

function requireMissingFile(path) {
  const fullPath = join(root, path);

  if (existsSync(fullPath)) {
    failures.push(`Remove scaffold asset before launch: ${path}`);
  }
}

function requireText(path, text) {
  const content = readProjectFile(path);
  const normalizedContent = content.replace(/\s+/g, " ");
  const normalizedText = text.replace(/\s+/g, " ");

  if (!normalizedContent.includes(normalizedText)) {
    failures.push(`Missing required text in ${path}: ${text}`);
  }
}

function requireTextOrderInSection(
  path,
  sectionStartText,
  sectionEndText,
  beforeText,
  afterText,
) {
  const content = readProjectFile(path);
  const sectionStart = content.indexOf(sectionStartText);

  if (sectionStart < 0) {
    failures.push(`Missing required section start in ${path}: ${sectionStartText}`);
    return;
  }

  const sectionEnd = content.indexOf(sectionEndText, sectionStart);

  if (sectionEnd < 0) {
    failures.push(`Missing required section end in ${path}: ${sectionEndText}`);
    return;
  }

  const section = content.slice(sectionStart, sectionEnd);
  const beforeIndex = section.indexOf(beforeText);
  const afterIndex = section.indexOf(afterText);

  if (beforeIndex < 0) {
    failures.push(`Missing required ordered text in ${path}: ${beforeText}`);
    return;
  }

  if (afterIndex < 0) {
    failures.push(`Missing required ordered text in ${path}: ${afterText}`);
    return;
  }

  if (beforeIndex >= afterIndex) {
    failures.push(
      `${path} requires ${beforeText} before ${afterText} inside ${sectionStartText}`,
    );
  }
}

function requireMaxSize(path, maxBytes) {
  const fullPath = requireFile(path);

  if (!fullPath) {
    return;
  }

  const { size } = statSync(fullPath);

  if (size > maxBytes) {
    failures.push(
      `${path} is ${size} bytes; expected <= ${maxBytes} bytes for launch.`,
    );
  }
}

function rejectPattern(path, pattern, reason, allowedPattern = null) {
  const lines = readProjectFile(path).split("\n");

  lines.forEach((line, index) => {
    if (pattern.test(line)) {
      if (allowedPattern?.test(line)) {
        return;
      }

      failures.push(`${path}:${index + 1} ${reason}: ${line.trim()}`);
    }
  });
}

[
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/icon.svg",
  "src/app/manifest.ts",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "public/.well-known/security.txt",
  "docs/campaign-copy.md",
  "docs/legal-review-packet.md",
  "src/app/api/app/activation/route.ts",
  "src/app/api/launch/activation/route.ts",
  "src/app/api/app/bill-payments/route.ts",
  "src/app/api/app/billing/portal/route.ts",
  "src/app/api/app/buckets/route.ts",
  "src/app/api/app/payees/route.ts",
  "src/app/api/app/transfers/route.ts",
  "src/app/api/app/unlocks/route.ts",
  "src/app/api/card/authorize/route.ts",
  "src/app/api/provider/webhooks/route.ts",
  "src/app/api/public/billing/checkout/route.ts",
  "src/app/api/app/direct-deposit/route.ts",
  "src/app/api/app/control-plan/route.ts",
  "src/app/api/app/paychecks/rules/route.ts",
  "src/app/lib/neobank/core-required.ts",
  "src/app/api/health/route.ts",
  "src/app/components/bill-payment-panel.tsx",
  "src/app/components/site-footer.tsx",
  "src/app/components/waitlist-form.tsx",
  "src/app/components/bucket-control-panel.tsx",
  "src/app/components/money-engine-console.tsx",
  "src/app/components/money-control-plan-panel.tsx",
  "src/app/components/money-setup-console.tsx",
  "src/app/components/neobank-dashboard.tsx",
  "src/app/components/public-checkout-form.tsx",
  "src/app/lib/brand.ts",
  "src/app/lib/pilot-analytics.ts",
  "src/app/lib/neobank/auth.ts",
  "src/app/lib/neobank/app-access.ts",
  "src/app/lib/neobank/core-client.ts",
  "src/app/lib/neobank/core-config.ts",
  "src/app/lib/neobank/control-plan.ts",
  "src/app/lib/neobank/demo-state.ts",
  "src/app/lib/neobank/identity.ts",
  "src/app/lib/neobank/ledger.ts",
  "src/app/lib/neobank/provider-events.ts",
  "src/app/lib/neobank/provider.ts",
  "src/app/lib/neobank/readiness.ts",
  "src/app/lib/neobank/types.ts",
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  ".github/workflows/ci.yml",
  "next.config.ts",
  "src/proxy.ts",
  "Dockerfile.core",
  "compose.core.yml",
  "services/core/server.mjs",
  "services/core/product.mjs",
  "services/core/migrations/0001_neobank_core.sql",
  "services/core/migrations/0002_household_bucket_controls.sql",
  "services/core/migrations/0003_ledger_integrity.sql",
  "services/core/migrations/0004_commercial_money_rails.sql",
  "services/core/migrations/0005_money_decision_records.sql",
  "services/core/migrations/0006_provider_token_vault.sql",
  "services/core/migrations/0007_paycheck_detection_rules.sql",
  "services/core/migrations/0008_direct_deposit_setups.sql",
  "services/core/migrations/0009_commercial_checkout_intents.sql",
  "services/core/migrations/0010_reconciliation_exception_details.sql",
  "services/core/migrations/0011_bank_transaction_sync.sql",
  "services/core/migrations/0012_production_gate_evidence.sql",
  "services/core/migrations/0013_journal_household_scope.sql",
  "scripts/core-migrations.mjs",
  "SECURITY.md",
  ".dockerignore",
  "compose.receiver.yml",
  "Dockerfile.receiver",
  ".env.receiver.example",
  "scripts/analytics-audit.mjs",
  "scripts/analytics-production-probe.mjs",
  "scripts/blob-receiver-evidence.mjs",
  "scripts/check-blob-receiver-evidence.mjs",
  "scripts/check-managed-receiver-evidence.mjs",
  "scripts/check-upstash-receiver-evidence.mjs",
  "scripts/check-counsel-signoff.mjs",
  "scripts/check-analytics-evidence.mjs",
  "scripts/check-campaign-manifest.mjs",
  "scripts/check-campaign-copy.mjs",
  "docs/campaigns/manifest.json",
  "docs/campaigns/paid-social-household-pilot.md",
  "docs/campaigns/paid-search-safe-spending.md",
  "docs/campaigns/employer-pilot-email.md",
  "docs/campaigns/partner-one-pager.md",
  "scripts/launch-evidence.mjs",
  "scripts/lead-capture-dry-run.mjs",
  "scripts/market-evidence-init.mjs",
  "scripts/market-go-no-go.mjs",
  "scripts/market-status.mjs",
  "scripts/paid-traffic-readiness.mjs",
  "scripts/receiver-evidence.mjs",
  "scripts/smoke-deploy.mjs",
  "scripts/smoke-core-service.mjs",
  "scripts/smoke-docker-receiver.mjs",
  "scripts/test-waitlist-webhook.mjs",
  "scripts/vercel-cli.mjs",
  "scripts/vercel-env-audit.mjs",
  "scripts/vercel-upstash-cutover.mjs",
  "scripts/vercel-webhook-cutover.mjs",
  "scripts/waitlist-data-ops.mjs",
  "scripts/waitlist-webhook-receiver.mjs",
  "src/app/lib/waitlist-blob-storage.ts",
  "vercel.json",
].forEach((path) => requireFile(path));

[
  "NEXT_PUBLIC_SITE_URL",
  "PAYSHIELD_SUPPORT_EMAIL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "PAYSHIELD_ALLOW_REVIEW_APP_ACCESS",
  "PAYSHIELD_CORE_API_URL",
  "PAYSHIELD_CORE_SERVICE_TOKEN",
  "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE",
  "PAYSHIELD_CORE_TIMEOUT_MS",
  "PAYSHIELD_LEDGER_DATABASE_URL",
  "PAYSHIELD_LIVE_MONEY_ENABLED",
  "PAYSHIELD_BAAS_PROVIDER",
  "PAYSHIELD_BAAS_ADAPTER",
  "PAYSHIELD_BAAS_API_BASE_URL",
  "PAYSHIELD_BAAS_API_KEY",
  "PAYSHIELD_BAAS_CONTRACT_APPROVED",
  "PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED",
  "PAYSHIELD_REGULATED_COUNSEL_SIGNOFF",
  "PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED",
  "PAYSHIELD_REQUIRE_PAID_ACCESS",
  "PAYSHIELD_PROVIDER_WEBHOOK_SECRET",
  "PAYSHIELD_PROVIDER_WEBHOOK_REPLAY_TOLERANCE_SECONDS",
  "PAYSHIELD_WAITLIST_WEBHOOK_URL",
  "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
  "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
  "PAYSHIELD_WAITLIST_STORAGE",
  "PAYSHIELD_WAITLIST_STORAGE_PREFIX",
  "BLOB_READ_WRITE_TOKEN",
  "PAYSHIELD_RECEIVER_HEALTH_PATH",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
].forEach((key) => requireText(".env.example", key));

[
  "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
  "PAYSHIELD_RECEIVER_HOST_DATA_DIR",
  "PAYSHIELD_RECEIVER_HOST_PORT",
  "PAYSHIELD_RECEIVER_BACKUP_DIR",
].forEach((key) => requireText(".env.receiver.example", key));

requireText(
  "src/app/components/site-footer.tsx",
  "Protect the paycheck before ordinary spending can reach it.",
);
requireText(
  "src/app/terms/page.tsx",
  "Provider-enabled services",
);
requireText(
  "src/app/privacy/page.tsx",
  "PayShield is operated by Grayston Technologies.",
);
requireText("src/app/privacy/page.tsx", "support@graystontechnologies.com");
requireText("src/app/privacy/page.tsx", "utm_source");
requireText("src/app/privacy/page.tsx", "utm_campaign");
requireText("src/app/privacy/page.tsx", "Vercel Web Analytics");
requireText("src/app/privacy/page.tsx", "Speed Insights");
requireText(
  "src/app/privacy/page.tsx",
  "does not send email addresses, names, bank details",
);
requireText("src/app/privacy/page.tsx", "free-text financial notes");
requireText("src/app/components/waitlist-form.tsx", "Privacy Notice");
requireText("src/app/components/waitlist-form.tsx", "Terms");
requireText("src/app/components/waitlist-form.tsx", "consent");
requireText(
  "src/app/components/waitlist-form.tsx",
  "Do not include bank, card, SSN, account, or routing numbers.",
);
requireText("src/app/components/waitlist-form.tsx", "utm_source");
requireText("src/app/components/waitlist-form.tsx", "pilotCampaignAnalyticsProperties");
requireText(
  "src/app/layout.tsx",
  'const socialImageUrl = "/images/payshield-social-card.jpg";',
);
requireText("src/app/layout.tsx", 'manifest: "/manifest.webmanifest"');
requireText("src/app/layout.tsx", 'url: "/icon.svg"');
requireText("src/app/manifest.ts", "GRAYSTON_COMPANY_NAME");
requireText("src/app/lib/brand.ts", "Grayston Technologies");
requireText("src/app/manifest.ts", 'theme_color: "#050607"');
requireText(
  "src/app/components/neobank-dashboard.tsx",
  "Paycheck control software by Grayston Technologies.",
);
requireText("src/app/components/neobank-dashboard.tsx", "Safe to Spend");
requireText("src/app/components/neobank-dashboard.tsx", "Provider readiness");
requireText("src/app/components/neobank-dashboard.tsx", "support@graystontechnologies.com");
requireText("src/app/page.tsx", "NeobankDashboard");
requireText("src/app/app/page.tsx", 'dynamic = "force-dynamic"');
requireMissingFile("src/app/app/loading.tsx");
requireMissingFile("src/app/launch/loading.tsx");
requireMissingFile("src/app/components/route-loading-shell.tsx");
requireText("src/app/components/waitlist-form.tsx", "Contact Grayston support");
requireText("src/app/components/neobank-dashboard.tsx", "PublicCheckoutForm");
requireText("src/app/components/public-checkout-form.tsx", "/api/public/billing/checkout");
requireText("src/app/components/public-checkout-form.tsx", "Start protected access");
requireText("src/app/api/public/billing/checkout/route.ts", "payShieldUserIdForEmail");
requireText("src/app/api/public/billing/checkout/route.ts", "requireCheckoutSession: true");
requireText("src/app/lib/neobank/identity.ts", "payShieldUserIdForEmail");
requireText("src/app/lib/neobank/auth.ts", "clerkSubject: session.userId");
requireText("src/app/lib/neobank/auth.ts", "userId: session.userId");
requireText("src/app/lib/neobank/core-client.ts", "x-payshield-clerk-subject");
requireText("services/core/server.mjs", "x-payshield-clerk-subject");
requireText("src/app/lib/commercial/stripe-webhook.ts", "customerEmail");
requireText("src/app/components/bucket-control-panel.tsx", "Add bucket");
requireText("src/app/components/bucket-control-panel.tsx", "Save bucket profile");
requireText("src/app/components/bucket-control-panel.tsx", "/api/app/buckets");
requireText("src/app/components/bucket-control-panel.tsx", "draft recovery");
requireText("src/app/components/bucket-control-panel.tsx", "profileSource");
requireText("src/app/components/bucket-control-panel.tsx", "profilePersistence");
requireText("src/app/api/app/buckets/route.ts", "persisted: false");
requireText("src/app/components/payee-control-panel.tsx", "Payee controls");
requireText("src/app/components/payee-control-panel.tsx", "Save payee control");
requireText("src/app/components/payee-control-panel.tsx", "/api/app/payees");
requireText(
  "src/app/components/payee-control-panel.tsx",
  "payshield.payee-controls.draft",
);
requireText("src/app/components/bill-routing-workspace.tsx", "PayeeControlPanel");
requireText("src/app/components/bill-routing-workspace.tsx", "BillPaymentPanel");
requireText("src/app/components/bill-payment-panel.tsx", "Bill routing");
requireText("src/app/components/bill-payment-panel.tsx", "/api/app/bill-payments");
requireText("src/app/components/neobank-dashboard.tsx", "BillRoutingWorkspace");
requireText("src/app/components/household-command-center.tsx", "POST /api/app/payees");
requireText("src/app/api/app/bill-payments/route.ts", "/api/app/bill-payments");
[
  "src/app/api/app/bill-payments/route.ts",
  "src/app/api/app/buckets/route.ts",
  "src/app/api/app/direct-deposit/route.ts",
  "src/app/api/app/onboarding/start/route.ts",
  "src/app/api/app/payees/route.ts",
  "src/app/api/app/transfers/route.ts",
  "src/app/api/app/unlocks/route.ts",
  "src/app/api/card/authorize/route.ts",
  "src/app/api/provider/webhooks/route.ts",
].forEach((path) => {
  requireText(path, "requireDurableCoreService");
  requireText(path, "forwardCoreRequest");
  rejectPattern(
    path,
    /simulate(CardAuthorization|BillPayment|Unlock)|getBankingProvider|requirePaidAccessForFallback/,
    "Protected money routes must not import local simulation, provider, or paid-access fallback logic",
  );
});
requireText("src/app/components/money-operations-panel.tsx", "Save detection rule");
requireText("src/app/components/money-operations-panel.tsx", "Start here / Money operations");
requireText("src/app/components/money-operations-panel.tsx", "What actually turns on");
requireText(
  "src/app/components/money-operations-panel.tsx",
  "Revenue, bank link, detection, protection, and movement are",
);
requireText(
  "src/app/components/money-operations-panel.tsx",
  "the app lanes.",
);
requireText("src/app/components/money-operations-panel.tsx", "collecting, activation pending");
requireText("src/app/components/money-operations-panel.tsx", "/api/app/bank-link/exchange");
requireText(
  "services/core/product.mjs",
  "Bank connection already belongs to a different PayShield household.",
);
requireText("services/core/database.mjs", "ownership_conflict");
requireText(
  "services/core/database.mjs",
  "WHERE bank_connections.household_id = EXCLUDED.household_id",
);
requireText(
  "services/core/database.mjs",
  "AND bank_connections.user_id = EXCLUDED.user_id",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function recordBankConnection",
  "export async function getProfile",
  "ownership_conflict",
  "persistMoneyRailEvent(",
);
requireText("src/app/components/money-operations-panel.tsx", "Revenue and rails");
requireText("src/app/components/money-operations-panel.tsx", "The commercial operating map.");
requireText("src/app/components/money-operations-panel.tsx", "Manage billing");
requireText("src/app/components/money-operations-panel.tsx", "/api/app/billing/portal");
requireText("src/app/components/money-operations-panel.tsx", "/api/app/paychecks/rules");
requireText("src/app/components/money-operations-panel.tsx", "/api/app/direct-deposit");
requireText("src/app/components/money-operations-panel.tsx", "Approved destination");
requireText(
  "src/app/components/money-operations-panel.tsx",
  "Only payees approved for the selected protected bucket appear here.",
);
requireText(
  "services/core/product.mjs",
  "Protected transfers can only release to a payee assigned to the source bucket.",
);
requireText("src/app/components/money-setup-console.tsx", "Money setup console");
requireText("src/app/components/money-setup-console.tsx", "/api/app/activation");
requireText("src/app/components/money-setup-console.tsx", "Activation workbench");
requireText("src/app/components/money-setup-console.tsx", "setupCommands");
requireText(
  "src/app/components/money-setup-console.tsx",
  "The shortest route from subscription to protected paycheck.",
);
requireText("src/app/components/money-setup-console.tsx", "Next executable move");
requireText("src/app/components/money-setup-console.tsx", "Remaining gates");
requireText("src/app/components/money-setup-console.tsx", "Proof commands");
requireText("src/app/components/household-command-center.tsx", "MoneySetupConsole");
requireText("src/app/components/household-command-center.tsx", "MoneyEngineConsole");
requireText("src/app/components/household-command-center.tsx", "MoneyControlPlanPanel");
requireText(
  "src/app/components/household-command-center.tsx",
  "createHouseholdMoneyControlPlan",
);
requireText("src/app/components/money-control-plan-panel.tsx", "Household money control plan");
requireText(
  "src/app/components/money-control-plan-panel.tsx",
  "Plan paycheck split, bank setup, revenue, and release in one pass.",
);
requireText("src/app/components/money-control-plan-panel.tsx", "Paycheck split preview");
requireText("src/app/components/money-control-plan-panel.tsx", "Projected Safe to Spend");
requireText("src/app/components/money-control-plan-panel.tsx", "Operating steps");
requireText("src/app/components/money-control-plan-panel.tsx", "Run this plan from top to bottom");
requireText("src/app/components/money-control-plan-panel.tsx", "Start checkout");
requireText("src/app/components/money-control-plan-panel.tsx", "Save detection rule");
requireText("src/app/components/money-control-plan-panel.tsx", "Create transfer intent");
requireText("src/app/components/money-control-plan-panel.tsx", "/api/app/billing/checkout");
requireText("src/app/components/money-control-plan-panel.tsx", "/api/app/paychecks/rules");
requireText("src/app/components/money-control-plan-panel.tsx", "/api/app/transfers");
requireText("src/app/components/money-control-plan-panel.tsx", "Detection and release");
requireText("src/app/components/money-control-plan-panel.tsx", "Transfer guardrail");
requireText("src/app/components/money-control-plan-panel.tsx", "Proof artifacts");
requireText("src/app/components/money-control-plan-panel.tsx", "/api/app/control-plan");
requireText("src/app/lib/neobank/control-plan.ts", "payshield-household-control-plan");
requireText("src/app/lib/neobank/control-plan.ts", "projectedSafeToSpendCents");
requireText("src/app/lib/neobank/control-plan.ts", "paymentCollectionReady");
requireText("src/app/lib/neobank/control-plan.ts", "POST /api/app/bank-link/token");
requireText("src/app/lib/neobank/control-plan.ts", "POST /api/app/paychecks/rules");
requireText("src/app/lib/neobank/control-plan.ts", "POST /api/app/transfers");
requireText("src/app/api/app/control-plan/route.ts", "createHouseholdMoneyControlPlan");
requireText("src/app/api/app/control-plan/route.ts", "normalizeMoneyControlPlanInput");
requireText("src/app/api/app/control-plan/route.ts", "forwardCoreRequest");
requireText("services/core/product.mjs", "getHouseholdControlPlan");
requireText("services/core/product.mjs", "payshield-household-control-plan");
requireText("services/core/product.mjs", "projectedSafeToSpendCents");
requireText("services/core/server.mjs", 'path === "/app/control-plan"');
requireText("services/core/product.mjs", "GET /app/control-plan");
requireText("services/core/product.mjs", "POST /app/control-plan");
requireText("src/app/components/money-engine-console.tsx", "Money engine console");
requireText(
  "src/app/components/money-engine-console.tsx",
  "Charge the household. Then protect every paycheck.",
);
requireText("src/app/components/money-engine-console.tsx", "Monthly recurring revenue");
requireText("src/app/components/money-engine-console.tsx", "Target households");
requireText("src/app/components/money-engine-console.tsx", "Every row is an app action.");
requireText("src/app/components/money-engine-console.tsx", "stage.primaryEndpoint");
requireText("src/app/launch/page.tsx", "MoneyEngineConsole");
requireText("src/app/launch/page.tsx", "Activation workbench");
requireText("src/app/launch/page.tsx", "copy-safe");
requireText("src/app/launch/page.tsx", "setupCommands");
requireText(
  "src/app/components/household-command-center.tsx",
  "createHouseholdActivationPacket",
);
requireText("src/app/api/app/activation/route.ts", "/api/app/activation");
requireText("src/app/api/app/activation/route.ts", "createHouseholdActivationPacket");
requireText("src/app/api/launch/activation/route.ts", "createHouseholdActivationPacket");
requireText("src/app/lib/neobank/operations.ts", "npx vercel env add");
requireText("src/app/lib/neobank/operations.ts", "revenueAndRails");
requireText("src/app/lib/neobank/operations.ts", "Get paid");
requireText("src/app/lib/neobank/operations.ts", "/api/launch/activation");
requireText("src/app/lib/neobank/operations.ts", "npm run vercel:env:audit -- --profile commercial");
requireText("src/app/lib/neobank/operations.ts", "payshield-activation-console");
requireText("services/core/server.mjs", "/app/activation");
requireText("services/core/product.mjs", "getHouseholdActivation");
requireText("services/core/product.mjs", "npx vercel env add");
requireText("services/core/product.mjs", "revenueAndRails");
requireText("services/core/product.mjs", "Get paid");
requireText("services/core/product.mjs", "npm run vercel:env:audit -- --profile commercial");
requireText("src/app/api/app/billing/portal/route.ts", "/api/app/billing/status");
requireText("src/app/api/app/billing/portal/route.ts", "providerCustomerId");
requireText("src/app/lib/commercial/billing.ts", "createCommercialPortalSession");
requireText("src/app/lib/commercial/billing.ts", "billing_portal_provider_error");
requireText("src/app/api/app/direct-deposit/route.ts", "Direct deposit setup");
requireText("src/app/api/app/paychecks/rules/route.ts", "Paycheck detection rule storage");
requireText("src/app/lib/neobank/core-required.ts", "PAYSHIELD_CORE_API_URL");
requireText("src/app/lib/neobank/core-required.ts", "PAYSHIELD_CORE_SERVICE_TOKEN");
requireText("src/app/api/app/paychecks/sync/route.ts", "payshield-paycheck-transaction-sync");
requireText("src/app/api/app/paychecks/sync/route.ts", "/api/app/paychecks/sync");
requireText("src/proxy.ts", "protectedAppUnavailableResponse");
requireText("src/proxy.ts", "appAuthNotConfiguredBody");
requireText("src/proxy.ts", "review_access_token");
requireText("src/proxy.ts", "reviewAppAccessCookieValue");
requireText("src/proxy.ts", "reviewAppAccessCookieName");
requireText("src/proxy.ts", "PAYSHIELD_ALLOW_REVIEW_APP_ACCESS=true");
requireText("src/proxy.ts", 'pathname.startsWith("/api/app/")');
requireText("src/app/lib/neobank/app-access.ts", "PAYSHIELD_ALLOW_REVIEW_APP_ACCESS");
requireText("src/app/lib/neobank/app-access.ts", "PAYSHIELD_REVIEW_APP_ACCESS_TOKEN");
requireText("src/app/lib/neobank/app-access.ts", 'env.VERCEL_ENV !== "production"');
requireText("src/app/api/health/route.ts", "appAccess");
requireText("src/app/lib/neobank/core-config.ts", "PAYSHIELD_CORE_API_URL");
requireText("src/app/lib/neobank/core-config.ts", "VERCEL_ENV");
requireText("src/app/lib/neobank/core-client.ts", "x-payshield-provider-signature");
requireText("src/app/lib/commercial/billing.ts", "requireCheckoutSession");
requireText("src/app/lib/commercial/billing.ts", "paymentCollectionReady");
requireText("src/app/lib/commercial/billing.ts", "requirePaidAccessForFallback");
requireText("src/app/lib/commercial/billing.ts", "metadata[payshield_customer_email]");
requireText("src/app/api/app/billing/checkout/route.ts", "payment_collection_only");
requireText("src/app/api/app/billing/checkout/route.ts", "autoActivationReady");
requireText("src/app/lib/commercial/stripe-webhook.ts", "billingIdentityUserId");
requireText("src/app/lib/commercial/stripe-webhook.ts", "subscriptionDetailsObject");
requireText("src/app/lib/commercial/stripe-webhook.ts", "payshield_customer_email");
requireText("services/core/database.mjs", "shouldUpdateCommercialSubscription");
requireText("services/core/database.mjs", 'accessStatus !== "ignored"');
requireText("src/app/lib/neobank/money-rails.ts", "providerWebhookSigningConfigured");
requireText("src/app/lib/neobank/money-rails.ts", "transactionSyncReady");
requireText("src/app/lib/neobank/provider-events.ts", "classifyProviderEvent");
requireText("src/app/lib/neobank/provider-events.ts", "redactProviderEventPayload");
requireText("src/app/lib/neobank/provider.ts", "classifyProviderEvent");
requireText("services/core/product.mjs", "providerWebhookSignatureRequired");
requireText("services/core/product.mjs", "databaseConfigured(env)");
requireText(
  "services/core/product.mjs",
  "PAYSHIELD_PROVIDER_WEBHOOK_SECRET is required before provider webhooks can affect money controls.",
);
requireText("src/app/lib/neobank/ledger.ts", "scheduleBillPayment");
requireText("services/core/migrations/0002_household_bucket_controls.sql", "household_buckets");
requireText("services/core/migrations/0002_household_bucket_controls.sql", "household_bucket_rules");
requireText("services/core/migrations/0003_ledger_integrity.sql", "assert_journal_entry_balanced_by_id");
requireText("services/core/migrations/0003_ledger_integrity.sql", "DEFERRABLE INITIALLY DEFERRED");
requireText("services/core/migrations/0003_ledger_integrity.sql", "prevent_posted_journal_mutation");
requireText("services/core/migrations/0006_provider_token_vault.sql", "provider_token_secrets");
requireText("services/core/migrations/0006_provider_token_vault.sql", "ciphertext TEXT NOT NULL");
requireText("services/core/migrations/0007_paycheck_detection_rules.sql", "expected_frequency");
requireText("services/core/migrations/0007_paycheck_detection_rules.sql", "idempotency_key");
requireText("services/core/migrations/0007_paycheck_detection_rules.sql", "detection_rule_id");
requireText("services/core/migrations/0008_direct_deposit_setups.sql", "direct_deposit_setups");
requireText("services/core/migrations/0008_direct_deposit_setups.sql", "account_last4");
requireText("services/core/database.mjs", "updateDirectDepositSetupProviderStatus");
requireText(
  "services/core/database.mjs",
  "ON CONFLICT (household_id, idempotency_key) DO NOTHING",
);
requireText("services/core/product.mjs", "replayedReadySetup");
requireText(
  "services/core/product.mjs",
  "without another provider request",
);
requireText("services/core/migrations/0009_commercial_checkout_intents.sql", "commercial_checkout_intents");
requireText("services/core/migrations/0009_commercial_checkout_intents.sql", "provider_checkout_id");
requireText("services/core/migrations/0010_reconciliation_exception_details.sql", "provider_transaction_id");
requireText("services/core/migrations/0010_reconciliation_exception_details.sql", "reconciliation_exceptions_idempotency_idx");
requireText("services/core/migrations/0011_bank_transaction_sync.sql", "sync_cursor");
requireText("services/core/migrations/0011_bank_transaction_sync.sql", "last_transaction_sync_request_id");
requireText("services/core/migrations/0012_production_gate_evidence.sql", "production_gate_evidence");
requireText("services/core/migrations/0012_production_gate_evidence.sql", "evidence_ref");
requireText("services/core/migrations/0012_production_gate_evidence.sql", "approved_at");
requireText("services/core/migrations/0012_production_gate_evidence.sql", "gate_id");
requireText("services/core/migrations/0013_journal_household_scope.sql", "assert_journal_line_household_scope");
requireText("services/core/migrations/0013_journal_household_scope.sql", "journal_lines_household_scope_check");
requireText("scripts/core-migrations.mjs", "trigger:journal_lines_household_scope_check");
requireText("src/app/api/launch/gate-evidence/route.ts", "getAppSession");
requireText("src/app/api/launch/gate-evidence/route.ts", "PAYSHIELD_CORE_API_URL");
requireText("src/app/api/launch/gate-evidence/route.ts", "PAYSHIELD_CORE_SERVICE_TOKEN");
requireText("src/app/api/launch/gate-evidence/route.ts", "/api/launch/gate-evidence");
requireText("src/app/components/money-setup-console.tsx", "ProductionGateEvidenceRecorder");
requireText("src/app/launch/page.tsx", "ProductionGateEvidenceRecorder");
requireText("src/app/components/production-gate-evidence-recorder.tsx", "Gate evidence");
requireText("src/app/components/production-gate-evidence-recorder.tsx", "Record evidence");
requireText("src/app/components/production-gate-evidence-recorder.tsx", "/api/launch/gate-evidence");
requireText("services/core/server.mjs", "/token-vault/plaid");
requireText(
  "services/core/server.mjs",
  'if (request.method === "POST" && path === "/launch/gate-evidence")',
);
requireText("services/core/server.mjs", "x-payshield-provider-signature");
requireText("services/core/product.mjs", "receiveTokenVaultHandoff");
requireText("services/core/product.mjs", "recordProductionGateEvidence");
requireText("services/core/database.mjs", "persistProductionGateEvidence");
requireText("services/core/product.mjs", "syncLinkedBankPaychecks");
requireText("services/core/product.mjs", "/transactions/sync");
requireText("services/core/product.mjs", "requireActivePaidAccess");
requireText("services/core/product.mjs", "createDirectDepositSetup");
requireText("services/core/product.mjs", "recordCommercialCheckoutIntent");
requireText("services/core/product.mjs", "persistProviderWebhookException");
requireText("services/core/product.mjs", "savePaycheckDetectionRule");
requireText("services/core/product.mjs", "Paycheck did not match an active payroll rule");
requireText("services/core/product.mjs", "extractProviderPaycheckDetections");
requireText("services/core/product.mjs", "verifyProviderWebhookSignature");
requireText(
  "services/core/product.mjs",
  "Provider transaction could not be matched to an active PayShield bank connection.",
);
requireText(
  "services/core/product.mjs",
  "Provider paycheck transaction must include provider item and account identifiers",
);
requireText("services/core/database.mjs", "loadBankConnectionForProvider");
requireText("scripts/core-migrations.mjs", "PAYSHIELD_LEDGER_DATABASE_URL");
requireText("scripts/core-migrations.mjs", "checksumSha256");
requireText("scripts/core-migrations.mjs", "core_schema_migrations");
requireText("scripts/core-migrations.mjs", "verifyAppliedMigrations");
requireText("scripts/core-migrations.mjs", "PAYSHIELD_LEDGER_SCHEMA_VERIFIED");
requireText("scripts/core-migrations.mjs", "PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION");
requireText("docs/legal-review-packet.md", "Paycheck split model");
requireText(
  "public/.well-known/security.txt",
  "Contact: mailto:support@graystontechnologies.com",
);
requireText(
  "public/.well-known/security.txt",
  "Policy: https://github.com/forstersolutions/PayShield/security/policy",
);
requireText(
  "public/.well-known/security.txt",
  "Canonical: https://payshield-lime.vercel.app/.well-known/security.txt",
);
requireText("scripts/smoke-deploy.mjs", "--expect-site-url");
requireText("scripts/smoke-deploy.mjs", "--require-webhook");
requireText("scripts/smoke-deploy.mjs", "webhookSigningConfigured");
requireText("scripts/smoke-deploy.mjs", "storageConfigured");
requireText("scripts/smoke-deploy.mjs", "x-content-type-options");
requireText("scripts/smoke-deploy.mjs", "strict-transport-security");
requireText("scripts/smoke-deploy.mjs", "permissions-policy");
requireText("scripts/smoke-deploy.mjs", "/.well-known/security.txt");
requireText("scripts/smoke-deploy.mjs", "expectMissingAsset");
requireText("scripts/smoke-deploy.mjs", "payshield-social-card.jpg");
requireText("scripts/smoke-deploy.mjs", "checkBillPaymentSimulation");
requireText("scripts/smoke-deploy.mjs", "/api/app/bill-payments");
requireText("scripts/smoke-core-service.mjs", "runDockerCoreSmoke");
requireText("scripts/smoke-core-service.mjs", "Dockerfile.core");
requireText("scripts/smoke-core-service.mjs", "PAYSHIELD_CORE_SERVICE_TOKEN");
requireText("scripts/smoke-core-service.mjs", "safeToSpendCents");
requireText("scripts/smoke-core-service.mjs", "/api/app/bill-payments");
requireText("services/core/server.mjs", "path === \"/app/bill-payments\"");
requireText("services/core/product.mjs", "createBillPayment");
requireText("services/core/product.mjs", "scheduleBillPayment");
requireText("services/core/product.mjs", "updateBillPaymentProviderStatus");
requireText(
  "services/core/product.mjs",
  "Pending bill payment schedule resumed with the configured provider.",
);
requireText(
  "services/core/product.mjs",
  "Provider bill payment was created but the durable schedule status could not be updated.",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function createBillPayment",
  "function isUnlockMode",
  "persistOperationalJournal(",
  "providerCreateBillPayment(",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function createBillPayment",
  "function isUnlockMode",
  "persistBillPaymentSchedule(",
  "providerCreateBillPayment(",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function createBillPayment",
  "function isUnlockMode",
  "decisionPersistence.replayed",
  "providerCreateBillPayment(",
);
requireText("services/core/database.mjs", "updateBillPaymentProviderStatus");
requireText("scripts/smoke-docker-receiver.mjs", "runDockerReceiverSmoke");
requireText("scripts/smoke-docker-receiver.mjs", "Dockerfile.receiver");
requireText("scripts/smoke-docker-receiver.mjs", "sendSignedWebhookTest");
requireText("scripts/smoke-docker-receiver.mjs", "summarizeWaitlistData");
requireText("scripts/smoke-docker-receiver.mjs", "eraseWaitlistEmail");
requireText("scripts/analytics-audit.mjs", "auditAnalyticsInstrumentation");
requireText("scripts/analytics-audit.mjs", "Product Inquiry Attempted");
requireText("scripts/analytics-audit.mjs", "Product Inquiry Submitted");
requireText("scripts/analytics-audit.mjs", "approvedTrackPropertySpreads");
requireText("scripts/analytics-audit.mjs", "bannedTrackPropertyPatterns");
requireText("scripts/analytics-audit.mjs", "sends unapproved analytics property");
requireText("scripts/analytics-production-probe.mjs", "buildAnalyticsProbeEvidence");
requireText("scripts/analytics-production-probe.mjs", "analytics-evidence");
requireText("scripts/analytics-production-probe.mjs", "dashboardConfirmationRequired");
requireText("scripts/analytics-production-probe.mjs", "receiptIdRecorded");
requireText("scripts/analytics-production-probe.mjs", "runVercelCli");
requireText("scripts/analytics-production-probe.mjs", "vercel.speed_insights_metric.lcp");
requireText("scripts/check-analytics-evidence.mjs", "evaluateLiveAnalyticsEvidence");
requireText("scripts/check-analytics-evidence.mjs", "Product Inquiry Attempted");
requireText("scripts/check-analytics-evidence.mjs", "Product Inquiry Submitted");
requireText("scripts/check-analytics-evidence.mjs", "campaignSource");
requireText("scripts/check-analytics-evidence.mjs", "campaignMedium");
requireText("scripts/check-analytics-evidence.mjs", "hasCampaignAttribution");
requireText("scripts/check-analytics-evidence.mjs", "analyticsEvidenceRedacted");
requireText("scripts/check-analytics-evidence.mjs", "analyticsProductionProbeRecorded");
requireText("scripts/check-analytics-evidence.mjs", "analyticsProbeDurableCapture");
requireText(
  "scripts/check-managed-receiver-evidence.mjs",
  "evaluateManagedReceiverEvidenceFile",
);
requireText("scripts/check-managed-receiver-evidence.mjs", "receiver:managed:check");
requireText("scripts/check-managed-receiver-evidence.mjs", "Managed receiver");
requireText("scripts/vercel-cli.mjs", "pinnedVercelCliVersion");
requireText("scripts/vercel-cli.mjs", "NPM_CONFIG_CACHE");
requireText("scripts/vercel-cli.mjs", "vercel-cli.lock");
requireText("scripts/launch-evidence.mjs", "runVercelCli");
requireText("scripts/market-status.mjs", "runVercelCli");
requireText("scripts/vercel-env-audit.mjs", "runVercelCli");
[
  "scripts/analytics-production-probe.mjs",
  "scripts/launch-evidence.mjs",
  "scripts/market-status.mjs",
  "scripts/vercel-env-audit.mjs",
].forEach((path) => {
  rejectPattern(
    path,
    /execFileAsync\(\s*["']npx["']/,
    "programmatic Vercel CLI calls must use scripts/vercel-cli.mjs",
  );
});
requireText(
  "scripts/check-upstash-receiver-evidence.mjs",
  "evaluateUpstashReceiverEvidenceFile",
);
requireText("scripts/check-upstash-receiver-evidence.mjs", "receiver:upstash:check");
requireText("scripts/check-upstash-receiver-evidence.mjs", "Upstash Redis");
requireText("scripts/upstash-receiver-evidence.mjs", "generateUpstashReceiverEvidence");
requireText("scripts/upstash-receiver-evidence.mjs", "receiver:upstash:evidence");
requireText("scripts/upstash-receiver-evidence.mjs", "never prints the smoke lead email");
requireText(
  "scripts/check-blob-receiver-evidence.mjs",
  "evaluateBlobReceiverEvidenceFile",
);
requireText("scripts/check-blob-receiver-evidence.mjs", "receiver:blob:check");
requireText("scripts/check-blob-receiver-evidence.mjs", "Vercel Blob");
requireText("scripts/blob-receiver-evidence.mjs", "generateBlobReceiverEvidence");
requireText("scripts/blob-receiver-evidence.mjs", "receiver:blob:evidence");
requireText("scripts/blob-receiver-evidence.mjs", "Blob read-write token");
requireText("scripts/check-counsel-signoff.mjs", "evaluateCounselSignoffEvidence");
requireText("scripts/check-counsel-signoff.mjs", "counsel-signoff.json");
requireText("scripts/check-counsel-signoff.mjs", "Validates the redacted counsel sign-off record");
requireText("scripts/check-campaign-copy.mjs", "lintCampaignCopy");
requireText("scripts/check-campaign-copy.mjs", "fdic-insurance");
requireText("scripts/check-campaign-copy.mjs", "direct-deposit");
requireText("scripts/check-campaign-manifest.mjs", "lintCampaignManifest");
requireText("scripts/check-campaign-manifest.mjs", "docs/campaigns/manifest.json");
requireText("scripts/check-campaign-manifest.mjs", "draft-planning-only-framing");
requireText("package.json", "\"campaign:lint\"");
requireText("package.json", "\"campaign:lint:all\"");
requireText("package.json", "\"core:server\"");
requireText("package.json", "\"core:compose:config\"");
requireText("package.json", "\"counsel:signoff:check\"");
requireText("package.json", "\"legal:lint\"");
requireText("package.json", "\"analytics:audit\"");
requireText("package.json", "\"analytics:evidence:check\"");
requireText("package.json", "\"analytics:probe\"");
requireText("package.json", "\"launch:evidence\"");
requireText("package.json", "\"lead-capture:dry-run\"");
requireText("package.json", "\"market:evidence:init\"");
requireText("package.json", "\"market:go-no-go\"");
requireText("package.json", "\"market:status\"");
requireText("package.json", "\"receiver:managed:check\"");
requireText("package.json", "\"receiver:upstash:check\"");
requireText("package.json", "\"receiver:blob:check\"");
requireText("package.json", "\"receiver:docker:smoke\"");
requireText("package.json", "\"receiver:compose:config\"");
requireText("package.json", "npm run campaign:lint:all");
requireText("package.json", "npm run legal:lint");
requireText("docs/campaign-copy.md", "npm run campaign:lint");
requireText("docs/campaign-copy.md", "npm run campaign:lint:all");
requireText("docs/campaign-copy.md", "docs/campaigns/manifest.json");
requireText("docs/campaign-copy.md", "npm run legal:lint");
requireText("docs/campaign-copy.md", "approved provider credentials");
requireText("docs/campaigns/manifest.json", "paid-social-household-pilot.md");
requireText("docs/campaigns/manifest.json", "paid-search-safe-spending.md");
requireText("docs/campaigns/manifest.json", "employer-pilot-email.md");
requireText("docs/campaigns/manifest.json", "partner-one-pager.md");
requireText("docs/campaigns/paid-social-household-pilot.md", "approved provider credentials");
requireText("docs/campaigns/paid-social-household-pilot.md", "does not provide financial services");
requireText("docs/campaigns/paid-search-safe-spending.md", "approved provider credentials");
requireText("docs/campaigns/employer-pilot-email.md", "approved provider credentials");
requireText("docs/campaigns/partner-one-pager.md", "approved provider credentials");
requireText("docs/legal-review-packet.md", "Counsel Questions");
requireText("docs/legal-review-packet.md", "Sign-Off Record");
requireText("docs/legal-review-packet.md", "npm run market:evidence:init");
requireText("docs/legal-review-packet.md", "npm run campaign:lint:all");
requireText("docs/legal-review-packet.md", "npm run market:go-no-go");
requireText("docs/legal-review-packet.md", "launch-evidence/counsel-signoff.json");
requireText(
  "docs/legal-review-packet.md",
  "not legal approval",
);
requireText(
  "docs/legal-review-packet.md",
  "npm run campaign:lint -- docs/legal-review-packet.md docs/campaign-copy.md",
);
requireText("next.config.ts", "Strict-Transport-Security");
requireText("next.config.ts", "max-age=31536000");
requireText("scripts/paid-traffic-readiness.mjs", "--allow-demo-capture");
requireText("scripts/paid-traffic-readiness.mjs", "paidTrafficReady");
requireText("scripts/paid-traffic-readiness.mjs", "webhookSigningConfigured");
requireText("scripts/paid-traffic-readiness.mjs", "durable lead capture");
requireText("scripts/paid-traffic-readiness.mjs", "storageConfigured");
requireText("scripts/paid-traffic-readiness.mjs", "publicCopyBannedPhrases");
requireText("scripts/paid-traffic-readiness.mjs", "collectPaidTrafficEvidence");
requireText("scripts/paid-traffic-readiness.mjs", "/.well-known/security.txt");
requireText("scripts/launch-evidence.mjs", "summarizeLaunchReadiness");
requireText("scripts/launch-evidence.mjs", "runLeadCaptureDryRun");
requireText("scripts/launch-evidence.mjs", "auditVercelEnvList");
requireText("scripts/launch-evidence.mjs", "--strict");
requireText("scripts/market-evidence-init.mjs", "createMarketEvidencePacket");
requireText("scripts/market-evidence-init.mjs", "counsel-signoff.json");
requireText("scripts/market-evidence-init.mjs", "analytics-evidence.json");
requireText("scripts/market-evidence-init.mjs", "managed-receiver-evidence-template.json");
requireText("scripts/market-evidence-init.mjs", "upstash-receiver-evidence-template.json");
requireText("scripts/market-evidence-init.mjs", "blob-receiver-evidence-template.json");
requireText("scripts/market-evidence-init.mjs", "receiver:managed:check");
requireText("scripts/market-evidence-init.mjs", "receiver:upstash:check");
requireText("scripts/market-evidence-init.mjs", "receiver:blob:check");
requireText("scripts/market-evidence-init.mjs", "counsel:signoff:check");
requireText("scripts/market-evidence-init.mjs", "analytics:evidence:check");
requireText("scripts/market-evidence-init.mjs", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET=...");
requireText("scripts/market-evidence-init.mjs", "BLOB_READ_WRITE_TOKEN=...");
requireText("scripts/market-go-no-go.mjs", "summarizeMarketGoNoGo");
requireText("scripts/market-go-no-go.mjs", "evaluateReceiverEvidence");
requireText("scripts/market-go-no-go.mjs", "evaluateManagedReceiverEvidence");
requireText("scripts/market-go-no-go.mjs", "evaluateUpstashReceiverEvidence");
requireText("scripts/market-go-no-go.mjs", "evaluateBlobReceiverEvidence");
requireText("scripts/market-go-no-go.mjs", "managedReceiverEvidenceRedacted");
requireText("scripts/market-go-no-go.mjs", "upstashReceiverEvidenceRedacted");
requireText("scripts/market-go-no-go.mjs", "blobReceiverEvidenceRedacted");
requireText("scripts/market-go-no-go.mjs", "managedSignedWebhookReplay");
requireText("scripts/market-go-no-go.mjs", "evaluateCounselSignoff");
requireText("scripts/market-go-no-go.mjs", "evaluateAnalyticsEvidence");
requireText("scripts/market-go-no-go.mjs", "evaluateLiveAnalyticsEvidence");
requireText("scripts/market-go-no-go.mjs", "strictProductionLaunchEvidence");
requireText("scripts/market-status.mjs", "summarizeMarketStatus");
requireText("scripts/market-status.mjs", "parseVercelInspectOutput");
requireText("scripts/market-status.mjs", "githubCiPassesOnProductionCommit");
requireText("scripts/market-status.mjs", "localGitWorktreeClean");
requireText("scripts/market-status.mjs", "vercelDeploymentReady");
requireText("scripts/market-status.mjs", "health-fallback");
requireText("scripts/market-status.mjs", "inspectError");
requireText("scripts/market-status.mjs", "issueSummaryMarkdown");
requireText("scripts/market-evidence-init.mjs", "vercel:upstash:cutover");
requireText("scripts/market-evidence-init.mjs", "--apply-env");
requireText("scripts/market-evidence-init.mjs", "vercel:webhook:cutover");
requireText("scripts/market-evidence-init.mjs", "market:status");
requireText("scripts/vercel-upstash-cutover.mjs", "buildVercelUpstashCutoverPlan");
requireText("scripts/vercel-upstash-cutover.mjs", "applyVercelUpstashEnv");
requireText("scripts/vercel-upstash-cutover.mjs", "--apply-env");
requireText("scripts/vercel-upstash-cutover.mjs", "UPSTASH_REDIS_REST_URL");
requireText("scripts/vercel-upstash-cutover.mjs", "UPSTASH_REDIS_REST_TOKEN");
requireText("scripts/vercel-upstash-cutover.mjs", "npx vercel env add UPSTASH_REDIS_REST_TOKEN ${environment} --sensitive");
requireText("scripts/vercel-upstash-cutover.mjs", "upstashSecretsNotPrinted");
requireText("scripts/vercel-webhook-cutover.mjs", "buildVercelWebhookCutoverPlan");
requireText("scripts/vercel-webhook-cutover.mjs", "evaluateReceiverEvidence");
requireText("scripts/vercel-webhook-cutover.mjs", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET");
requireText("scripts/vercel-webhook-cutover.mjs", "npx vercel env add PAYSHIELD_WAITLIST_WEBHOOK_SECRET ${environment} --sensitive");
requireText("scripts/vercel-webhook-cutover.mjs", "secretNotPrinted");
requireText("scripts/test-waitlist-webhook.mjs", "sendSignedWebhookTest");
requireText("scripts/test-waitlist-webhook.mjs", "x-payshield-webhook-signature");
requireText("scripts/test-waitlist-webhook.mjs", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET");
requireText("scripts/test-waitlist-webhook.mjs", "grayston-product-onboarding-consent-2026-06-12");
requireText("scripts/test-waitlist-webhook.mjs", "paycheck-control-terms-2026-06-12");
requireText("scripts/test-waitlist-webhook.mjs", "support@graystontechnologies.com");
requireText("scripts/test-waitlist-webhook.mjs", "x-payshield-submission-id");
requireText("scripts/test-waitlist-webhook.mjs", "submissionId");
requireText("scripts/test-waitlist-webhook.mjs", "--replay");
requireText("scripts/test-waitlist-webhook.mjs", "replayResult");
requireText("scripts/test-waitlist-webhook.mjs", "emailHash");
requireText("scripts/test-waitlist-webhook.mjs", "redactedResponseBody");
rejectPattern(
  "scripts/test-waitlist-webhook.mjs",
  /sentEmail/,
  "Do not print raw webhook smoke email in CLI output",
);
requireText("scripts/lead-capture-dry-run.mjs", "runLeadCaptureDryRun");
requireText("scripts/lead-capture-dry-run.mjs", "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK");
requireText("scripts/lead-capture-dry-run.mjs", "auditWaitlistData");
requireText("scripts/lead-capture-dry-run.mjs", "summarizeWaitlistData");
requireText("scripts/lead-capture-dry-run.mjs", "eraseWaitlistEmail");
requireText("scripts/lead-capture-dry-run.mjs", "verifyWaitlistBackup");
requireText("scripts/receiver-evidence.mjs", "runReceiverEvidence");
requireText("scripts/receiver-evidence.mjs", "sendSignedWebhookTest");
requireText("scripts/receiver-evidence.mjs", "summarizeWaitlistData");
requireText("scripts/receiver-evidence.mjs", "auditWaitlistData");
requireText("scripts/receiver-evidence.mjs", "backupWaitlistData");
requireText("scripts/receiver-evidence.mjs", "verifyWaitlistBackup");
requireText("scripts/receiver-evidence.mjs", "eraseWaitlistEmail");
requireText(
  "scripts/receiver-evidence.mjs",
  "receiver evidence output does not print smoke lead PII or signing secret",
);
requireText("scripts/smoke-docker-receiver.mjs", "auditWaitlistData");
requireText("scripts/smoke-docker-receiver.mjs", "verifyWaitlistBackup");
requireText("scripts/waitlist-data-ops.mjs", "summarizeWaitlistData");
requireText("scripts/waitlist-data-ops.mjs", "auditWaitlistData");
requireText("scripts/waitlist-data-ops.mjs", "backupWaitlistData");
requireText("scripts/waitlist-data-ops.mjs", "verifyWaitlistBackup");
requireText("scripts/waitlist-data-ops.mjs", "eraseWaitlistEmail");
requireText("scripts/waitlist-data-ops.mjs", "Refusing to back up receiver files until audit passes");
requireText("scripts/waitlist-data-ops.mjs", "verify-backup");
requireText("scripts/waitlist-data-ops.mjs", "waitlist.csv row count does not match");
requireText("scripts/waitlist-data-ops.mjs", "malformedLines");
requireText("scripts/waitlist-data-ops.mjs", "privacyVersion");
requireText("scripts/waitlist-data-ops.mjs", "termsVersion");
requireText("scripts/waitlist-data-ops.mjs", "consentedAt");
requireText("scripts/waitlist-data-ops.mjs", "submissionId");
requireText("package.json", "\"waitlist:data\"");
requireText("package.json", "\"vercel:env:audit\"");
requireText("package.json", "\"vercel:upstash:cutover\"");
requireText("package.json", "\"vercel:webhook:cutover\"");
requireText("package.json", "\"receiver:docker:build\"");
requireText("package.json", "\"receiver:evidence\"");
requireText("package.json", "\"receiver:upstash:evidence\"");
requireText("package.json", "\"receiver:blob:evidence\"");
requireText(".github/workflows/ci.yml", "npm run receiver:docker:smoke");
requireText(".github/workflows/ci.yml", "npm run receiver:compose:config");
requireText("SECURITY.md", "GitHub Dependabot security updates are enabled");
requireText("SECURITY.md", "GitHub private vulnerability reporting is enabled");
requireText("SECURITY.md", "Do not open a public issue for security vulnerabilities");
requireText("SECURITY.md", "/.well-known/security.txt");
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "PAYSHIELD_WAITLIST_STORAGE=upstash",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "PAYSHIELD_WAITLIST_STORAGE=blob",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "waitlist.paidTrafficReady: true",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "/.well-known/security.txt",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "Default scaffold assets",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "Privacy Notice discloses UTM attribution",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "consentVersion",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "privacyVersion",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "idempotent",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "webhook:test -- https://your-webhook-url --replay",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run vercel:env:audit",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run launch:evidence",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run lead-capture:dry-run",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run receiver:docker:smoke",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run receiver:compose:config",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run receiver:evidence",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run receiver:managed:check",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run receiver:upstash:check",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run receiver:blob:check",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run legal:lint",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run counsel:signoff:check",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run analytics:evidence:check",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "npm run market:status",
);
requireText("src/app/api/waitlist/route.ts", "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK");
requireText("src/app/api/waitlist/route.ts", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET is required");
requireText("src/app/api/waitlist/route.ts", "PAYSHIELD_WAITLIST_STORAGE=upstash");
requireText("src/app/api/waitlist/route.ts", "PAYSHIELD_WAITLIST_STORAGE=blob");
requireText("src/app/api/waitlist/route.ts", "UPSTASH_REDIS_REST_URL");
requireText("src/app/api/waitlist/route.ts", "BLOB_READ_WRITE_TOKEN");
requireText("src/app/api/waitlist/route.ts", "multi-exec");
requireText("src/app/api/waitlist/route.ts", "x-payshield-webhook-signature");
requireText("src/app/api/waitlist/route.ts", "x-payshield-webhook-timestamp");
requireText("src/app/api/waitlist/route.ts", "x-payshield-submission-id");
requireText("src/app/api/waitlist/route.ts", "grayston-product-onboarding-consent-2026-06-12");
requireText("src/app/api/waitlist/route.ts", "paycheck-control-terms-2026-06-12");
requireText("src/app/api/waitlist/route.ts", "GRAYSTON_SUPPORT_EMAIL");
requireText("src/app/api/waitlist/route.ts", "consentedAt");
requireText("src/app/api/waitlist/route.ts", "consentText");
requireText("src/app/api/waitlist/route.ts", "randomUUID");
requireText(
  "src/app/api/waitlist/route.ts",
  "Request received in local capture mode.",
);
requireText("src/app/api/waitlist/route.ts", "request_sensitive_financial_info");
requireText(
  "src/app/api/waitlist/route.ts",
  "Do not include bank, card, SSN, or other sensitive financial details.",
);
requireText("src/app/api/waitlist/route.ts", "cleanCampaignAttribution");
requireText("src/app/api/waitlist/route.ts", "pilotCampaignAnalyticsProperties");
requireText("src/app/lib/pilot-analytics.ts", "pilotAnalyticsEventNames");
requireText("src/app/lib/pilot-analytics.ts", "pilotAnalyticsPropertyKeys");
requireText("src/app/lib/pilot-analytics.ts", "pilotCampaignAnalyticsProperties");
requireText("src/app/api/health/route.ts", "paidTrafficReady");
requireText("src/app/api/health/route.ts", "webhookConfigured");
requireText("src/app/api/health/route.ts", "webhookSigningConfigured");
requireText("src/app/api/health/route.ts", "storageConfigured");
requireText("src/app/api/health/route.ts", "storageMisconfigured");
requireText("src/app/api/health/route.ts", "storageProvider");
requireText("src/app/api/health/route.ts", "liveMoneyReady");
requireText("src/app/api/health/route.ts", "postgresSchemaVerified");
requireText("src/app/api/health/route.ts", "remainingGates");
requireText("src/app/api/health/route.ts", "tokenVaultEncryptionReady");
requireText("src/app/api/health/route.ts", "tokenVaultHandoffReady");
requireText("src/app/lib/neobank/provider-adapter.ts", "PAYSHIELD_BAAS_ADAPTER");
requireText("src/app/lib/neobank/provider-adapter.ts", "PAYSHIELD_BAAS_API_BASE_URL");
requireText("src/app/lib/neobank/readiness.ts", "provider_adapter");
requireText("src/proxy.ts", "clerkMiddleware");
requireText("src/proxy.ts", 'pathname === "/api/app"');
requireText("services/core/server.mjs", "payshield-core");
requireText("services/core/server.mjs", 'path === "/card/authorize"');
requireText("services/core/server.mjs", "PAYSHIELD_CORE_SERVICE_TOKEN");
requireText("services/core/product.mjs", "getCoreReadiness");
requireText("services/core/product.mjs", "provider_adapter");
requireText("services/core/product.mjs", "providerAdapterRequest");
requireText("services/core/product.mjs", "recordMoneyRailProviderException");
requireText("services/core/product.mjs", "persistTransactionSyncException");
requireText("services/core/product.mjs", "provider_adapter_error");
requireText("services/core/product.mjs", "updateTransferIntentProviderStatus");
requireText(
  "services/core/product.mjs",
  "Transfer intent could not be persisted before provider execution.",
);
requireText(
  "services/core/product.mjs",
  "Pending transfer intent resumed with the configured provider.",
);
requireText(
  "services/core/product.mjs",
  "will not replay provider execution after a durable terminal or blocked status",
);
requireText("services/core/product.mjs", "provider_pending");
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function createTransferIntent",
  "function cleanScheduledDate",
  "persistTransferIntent(",
  "providerCreateAchTransfer(",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function createTransferIntent",
  "function cleanScheduledDate",
  "persistence.replayed",
  "providerCreateAchTransfer(",
);
requireText("services/core/database.mjs", "updateTransferIntentProviderStatus");
requireText("services/core/database.mjs", "postgres_missing");
requireText("services/core/product.mjs", "plaid_transaction_removed");
requireText("services/core/product.mjs", "money_rail");
requireText("services/core/product.mjs", "saveBucketProfile");
requireText("services/core/product.mjs", "authorizeCard");
requireText("services/core/product.mjs", "loadCardAuthorizationDecision");
requireText(
  "services/core/product.mjs",
  "journalEntry: postedEntry || null",
);
requireText(
  "services/core/product.mjs",
  "Approved card journal entry will be persisted atomically with the card decision",
);
requireText(
  "services/core/product.mjs",
  "without recomputing spendable funds",
);
requireText(
  "services/core/product.mjs",
  "idempotency key already belongs to a different authorization payload",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function authorizeCard",
  "function stableEventId",
  "loadCardAuthorizationDecision(",
  "authorizeCardTransaction(",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function authorizeCard",
  "function stableEventId",
  "persistCardAuthorizationDecision(",
  "decisionPersistence.replayed",
);
requireText("services/core/database.mjs", "loadCardAuthorizationDecision");
requireText("services/core/database.mjs", "cardAuthorizationDecisionFromRow");
requireText("services/core/database.mjs", "insertJournalEntry(client");
requireText("services/core/database.mjs", "UPDATE card_authorization_decisions");
requireText("services/core/database.mjs", "SET journal_entry_id");
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function createDirectDepositSetup",
  "async function startOnboardingWithPaidAccess",
  "persistDirectDepositSetup(",
  "providerCreateDirectDepositInstructions(",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function createDirectDepositSetup",
  "async function startOnboardingWithPaidAccess",
  "replayedReadySetup",
  "providerCreateDirectDepositInstructions(",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function createDirectDepositSetup",
  "async function startOnboardingWithPaidAccess",
  "providerCreateDirectDepositInstructions(",
  "providerCompletedAt",
);
requireText("services/core/product.mjs", "loadPaycheckDetection");
requireText(
  "services/core/product.mjs",
  "Paycheck detection replayed from the original durable detection without recomputing bucket splits",
);
requireText(
  "services/core/product.mjs",
  "idempotency key or provider transaction already belongs to a different deposit payload",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function detectPaycheck",
  "export async function createTransferIntent",
  "loadPaycheckDetection(",
  "findMatchingPaycheckRule(",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function detectPaycheck",
  "export async function createTransferIntent",
  "loadPaycheckDetection(",
  "postPaycheckDeposit(",
);
requireTextOrderInSection(
  "services/core/product.mjs",
  "export async function detectPaycheck",
  "export async function createTransferIntent",
  "persistPaycheckDetection(",
  "persistence.replayed",
);
requireText("services/core/product.mjs", "journalEntry: entry");
requireText("services/core/database.mjs", "loadPaycheckDetection");
requireText("services/core/database.mjs", "paycheckDetectionFromRow");
requireText("services/core/database.mjs", "UPDATE paycheck_detections");
requireText("services/core/product.mjs", "handleProviderWebhook");
requireText("services/core/migrations/0001_neobank_core.sql", "journal_entries");
requireText("services/core/migrations/0001_neobank_core.sql", "provider_events");
requireText("Dockerfile.core", "services/core/server.mjs");
requireText("compose.core.yml", "PAYSHIELD_LEDGER_DATABASE_URL");
requireText("compose.core.yml", "PAYSHIELD_LEDGER_SCHEMA_VERIFIED");
requireText("compose.core.yml", "PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION");
requireText("compose.core.yml", "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE");
requireText("compose.core.yml", "PAYSHIELD_BAAS_CONTRACT_APPROVED");
requireText("package.json", "\"core:docker:smoke\"");
requireText("package.json", "\"core:migrations:verify\"");
requireText(".github/workflows/ci.yml", "Smoke core service image");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_WAITLIST_WEBHOOK_URL");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_WAITLIST_STORAGE");
requireText("scripts/vercel-env-audit.mjs", "UPSTASH_REDIS_REST_URL");
requireText("scripts/vercel-env-audit.mjs", "UPSTASH_REDIS_REST_TOKEN");
requireText("scripts/vercel-env-audit.mjs", "BLOB_READ_WRITE_TOKEN");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK");
requireText("scripts/vercel-env-audit.mjs", "--allow-demo-capture");
requireText("scripts/vercel-env-audit.mjs", "--stdin");
requireText("scripts/vercel-env-audit.mjs", "--profile commercial");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_COMMERCIAL_PRICE_ID");
requireText("scripts/vercel-env-audit.mjs", "STRIPE_WEBHOOK_SECRET");
requireText("scripts/vercel-env-audit.mjs", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
requireText("scripts/vercel-env-audit.mjs", "PLAID_SECRET");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_BAAS_API_KEY");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_BAAS_ADAPTER");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_BAAS_API_BASE_URL");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_LIVE_MONEY_ENABLED");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE");
requireText("scripts/smoke-deploy.mjs", "/api/health");
requireText("scripts/waitlist-webhook-receiver.mjs", "verifyPayShieldSignature");
requireText("scripts/waitlist-webhook-receiver.mjs", "payshield-waitlist-receiver");
requireText("scripts/waitlist-webhook-receiver.mjs", "waitlist.ndjson");
requireText("scripts/waitlist-webhook-receiver.mjs", "waitlist.csv");
requireText("scripts/waitlist-webhook-receiver.mjs", "utmCampaign");
requireText("scripts/waitlist-webhook-receiver.mjs", "privacyVersion");
requireText("scripts/waitlist-webhook-receiver.mjs", "termsVersion");
requireText("scripts/waitlist-webhook-receiver.mjs", "consentedAt");
requireText("scripts/waitlist-webhook-receiver.mjs", "findExistingSubmission");
requireText("scripts/waitlist-webhook-receiver.mjs", "submissionId");
requireText("Dockerfile.receiver", "PAYSHIELD_RECEIVER_DATA_DIR=/data/waitlist");
requireText("Dockerfile.receiver", "PAYSHIELD_RECEIVER_HEALTH_PATH=/health");
requireText("Dockerfile.receiver", "scripts/waitlist-webhook-receiver.mjs");
requireText("compose.receiver.yml", "dockerfile: Dockerfile.receiver");
requireText("compose.receiver.yml", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET");
requireText("compose.receiver.yml", "PAYSHIELD_RECEIVER_HOST_DATA_DIR");
requireText("compose.receiver.yml", "target: /data/waitlist");
requireText("compose.receiver.yml", "healthcheck");
requireText("compose.receiver.yml", "restart: unless-stopped");
requireText(".dockerignore", "data");
requireText(".gitignore", "/data/waitlist/");
requireText(".gitignore", "/data/waitlist-backups/");
requireText(".gitignore", "/launch-evidence/");
requireText(".gitignore", "/receiver-evidence.json");
requireText(".gitignore", "/counsel-signoff.json");
requireText(".gitignore", "/analytics-evidence.json");
requireText(".gitignore", "/market-go-no-go.json");
requireText(".gitignore", "!.env.receiver.example");
requireText("vercel.json", '"framework": "nextjs"');
requireText("docs/vercel-launch.md", "attribution");
requireText("docs/vercel-launch.md", "utm_source");
requireText("docs/vercel-launch.md", "consentVersion");
requireText("docs/vercel-launch.md", "privacyVersion");
requireText("docs/vercel-launch.md", "termsVersion");
requireText("docs/vercel-launch.md", "submissionId");
requireText("docs/vercel-launch.md", "webhook:test -- https://your-webhook-url --replay");
requireText("docs/vercel-launch.md", "npm run vercel:env:audit");
requireText("docs/vercel-launch.md", "npm run vercel:env:audit -- --profile commercial");
requireText("docs/vercel-launch.md", "PAYSHIELD_WAITLIST_STORAGE=upstash");
requireText("docs/vercel-launch.md", "PAYSHIELD_WAITLIST_STORAGE=blob");
requireText("docs/vercel-launch.md", "UPSTASH_REDIS_REST_URL");
requireText("docs/vercel-launch.md", "BLOB_READ_WRITE_TOKEN");
requireText("docs/vercel-launch.md", "docker compose --env-file .env.receiver -f compose.receiver.yml up -d --build");
requireText("docs/vercel-launch.md", "npm run receiver:compose:config");
requireText("docs/vercel-launch.md", "npm run receiver:evidence");
requireText("docs/vercel-launch.md", "npm run receiver:managed:check");
requireText("docs/vercel-launch.md", "npm run receiver:upstash:evidence");
requireText("docs/vercel-launch.md", "npm run receiver:upstash:check");
requireText("docs/vercel-launch.md", "npm run receiver:blob:evidence");
requireText("docs/vercel-launch.md", "npm run receiver:blob:check");
requireText("docs/vercel-launch.md", "npm run market:evidence:init");
requireText("docs/vercel-launch.md", "npm run counsel:signoff:check");
requireText("docs/vercel-launch.md", "npm run analytics:evidence:check");
requireText("docs/vercel-launch.md", "npm run analytics:probe");
requireText("docs/vercel-launch.md", "npm run vercel:upstash:cutover");
requireText("docs/vercel-launch.md", "--apply-env");
requireText("docs/vercel-launch.md", "npm run vercel:webhook:cutover");
requireText("docs/vercel-launch.md", "npm run market:go-no-go");
requireText("docs/vercel-launch.md", "npm run market:status");
requireText("docs/vercel-launch.md", "npm run campaign:lint:all");
requireText("docs/vercel-launch.md", "docs/campaigns/manifest.json");
requireText("docs/vercel-launch.md", "npm run waitlist:data -- audit --data-dir /path/to/waitlist");
requireText("docs/vercel-launch.md", "npm run waitlist:data -- backup --data-dir /path/to/waitlist --backup-dir /secure/path");
requireText("docs/vercel-launch.md", "npm run waitlist:data -- verify-backup --backup-path /secure/path/waitlist-backup-...");
requireText("docs/market-readiness.md", "sanitized campaign metadata");
requireText("docs/market-readiness.md", "consent audit fields");
requireText("docs/market-readiness.md", "idempotent capture");
requireText("docs/market-readiness.md", "webhook:test -- https://your-webhook-url --replay");
requireText("docs/market-readiness.md", "npm run legal:lint");
requireText("docs/market-readiness.md", "PAYSHIELD_WAITLIST_STORAGE=upstash");
requireText("docs/market-readiness.md", "PAYSHIELD_WAITLIST_STORAGE=blob");
requireText("docs/market-readiness.md", "UPSTASH_REDIS_REST_URL");
requireText("docs/market-readiness.md", "BLOB_READ_WRITE_TOKEN");
requireText("docs/market-readiness.md", "npm run counsel:signoff:check");
requireText("docs/market-readiness.md", "npm run vercel:env:audit");
requireText("docs/market-readiness.md", "npm run vercel:env:audit -- --profile commercial");
requireText("docs/market-readiness.md", "npm run analytics:audit");
requireText("docs/market-readiness.md", "npm run campaign:lint:all");
requireText("docs/market-readiness.md", "docs/campaigns/manifest.json");
requireText("docs/market-readiness.md", "docker compose --env-file .env.receiver -f compose.receiver.yml up -d --build");
requireText("docs/market-readiness.md", "npm run receiver:compose:config");
requireText("docs/market-readiness.md", "npm run receiver:evidence");
requireText("docs/market-readiness.md", "npm run receiver:managed:check");
requireText("docs/market-readiness.md", "npm run receiver:upstash:evidence");
requireText("docs/market-readiness.md", "npm run receiver:upstash:check");
requireText("docs/market-readiness.md", "npm run receiver:blob:evidence");
requireText("docs/market-readiness.md", "npm run receiver:blob:check");
requireText("docs/market-readiness.md", "npm run market:evidence:init");
requireText("docs/market-readiness.md", "npm run analytics:evidence:check");
requireText("docs/market-readiness.md", "npm run analytics:probe");
requireText("docs/market-readiness.md", "npm run vercel:upstash:cutover");
requireText("docs/market-readiness.md", "--apply-env");
requireText("docs/market-readiness.md", "npm run vercel:webhook:cutover");
requireText("docs/market-readiness.md", "npm run market:go-no-go");
requireText("docs/market-readiness.md", "npm run market:status");
requireText("docs/market-readiness.md", "npm run waitlist:data -- audit --data-dir /path/to/waitlist");
requireText("docs/market-readiness.md", "npm run waitlist:data -- backup --data-dir /path/to/waitlist --backup-dir /secure/path");
requireText("docs/market-readiness.md", "npm run waitlist:data -- verify-backup --backup-path /secure/path/waitlist-backup-...");
rejectPattern(
  "docs/vercel-launch.md",
  /Pilot Request (Attempted|Submitted|Failed|Received)/,
  "stale analytics event name",
);
rejectPattern(
  "docs/market-readiness.md",
  /Pilot Request (Attempted|Submitted|Failed|Received)/,
  "stale analytics event name",
);
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "sanitized `attribution` fields");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run analytics:audit");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run campaign:lint:all");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run market:evidence:init");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run receiver:upstash:evidence");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run receiver:blob:evidence");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run vercel:upstash:cutover");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "--apply-env");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run vercel:webhook:cutover");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run market:go-no-go");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run waitlist:data -- audit");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run waitlist:data -- backup");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run waitlist:data -- verify-backup");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "compose.receiver.yml");
requireText("docs/legal-review-packet.md", "npm run receiver:evidence");
requireText("docs/legal-review-packet.md", "npm run receiver:managed:check");
requireText("docs/legal-review-packet.md", "npm run receiver:upstash:check");
requireText("docs/legal-review-packet.md", "npm run receiver:upstash:evidence");
requireText("docs/legal-review-packet.md", "npm run receiver:blob:check");
requireText("docs/legal-review-packet.md", "npm run receiver:blob:evidence");
requireText("docs/legal-review-packet.md", "PAYSHIELD_WAITLIST_STORAGE=upstash");
requireText("docs/legal-review-packet.md", "PAYSHIELD_WAITLIST_STORAGE=blob");
requireText("docs/legal-review-packet.md", "UPSTASH_REDIS_REST_TOKEN");
requireText("docs/legal-review-packet.md", "BLOB_READ_WRITE_TOKEN");
requireText("docs/legal-review-packet.md", "npm run vercel:upstash:cutover");
requireText("docs/legal-review-packet.md", "--apply-env");
requireText("docs/legal-review-packet.md", "npm run vercel:webhook:cutover");
requireText("docs/legal-review-packet.md", "npm run counsel:signoff:check");
requireText("docs/legal-review-packet.md", "npm run analytics:evidence:check");
requireText("docs/legal-review-packet.md", "npm run market:status");

requireMaxSize("src/app/icon.svg", 5_000);
requireMaxSize("public/images/payshield-social-card.jpg", 250_000);

[
  "public/file.svg",
  "public/globe.svg",
  "public/next.svg",
  "public/vercel.svg",
  "public/window.svg",
].forEach((path) => requireMissingFile(path));

const publicCopyFiles = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/components/site-footer.tsx",
  "src/app/components/waitlist-form.tsx",
  "src/app/components/neobank-dashboard.tsx",
];
const publicMarketingFiles = [
  "src/app/page.tsx",
  "src/app/components/neobank-dashboard.tsx",
];

for (const path of publicCopyFiles) {
  rejectPattern(
    path,
    /\bmember\s+fdic\b/i,
    "Do not claim sponsored-account FDIC status before approvals are complete",
  );
  rejectPattern(
    path,
    /\bbanking services provided by\b/i,
    "Do not use sponsor-bank boilerplate before a sponsor is approved",
  );
  rejectPattern(
    path,
    /\bpayShield is a bank\b/i,
    "Do not state that PayShield is a bank",
    /\b(not|avoid|avoids)\b/i,
  );
  rejectPattern(
    path,
    /\bFDIC[-\s]insured\b/i,
    "Do not claim FDIC insurance before the final sponsor and recordkeeping model",
  );
  rejectPattern(
    path,
    /\bVercel preview\b/i,
    "Do not expose deployment-preview language in public marketing copy",
  );
  rejectPattern(
    path,
    /\bwaitlist webhook\b/i,
    "Do not expose backend lead-capture setup language in public marketing copy",
  );
  rejectPattern(
    path,
    /\bShip this frontend to Vercel\b/i,
    "Do not expose deployment instructions in public marketing copy",
  );
  rejectPattern(
    path,
    /\bForward submissions to CRM\b/i,
    "Do not expose internal lead-routing instructions in public marketing copy",
  );
  rejectPattern(
    path,
    /\bCapture households\b/i,
    "Do not phrase public pilot copy like an operator acquisition instruction",
  );
}

for (const path of publicMarketingFiles) {
  rejectPattern(
    path,
    /\bdirect[-\s]deposit\b/i,
    "Do not imply live direct-deposit support in public product marketing",
  );
  rejectPattern(
    path,
    /\bACH\b/i,
    "Do not imply live ACH support in public product marketing",
  );
  rejectPattern(
    path,
    /\bdebit card\b/i,
    "Do not imply a live debit-card product in public product marketing",
  );
  rejectPattern(
    path,
    /\bvirtual[-\s]card\b/i,
    "Do not imply a live virtual-card product in public product marketing",
  );
  rejectPattern(
    path,
    /\bcard issuing\b/i,
    "Do not imply live card issuing in public product marketing",
  );
  rejectPattern(
    path,
    /\bcard authorization\b/i,
    "Use planning-only spending-control language instead of live card authorization claims",
  );
  rejectPattern(
    path,
    /\bthen connect real money movement\b/i,
    "Do not imply real money movement is already ready to connect",
  );
  rejectPattern(
    path,
    /\bbefore live money movement\b/i,
    "Do not imply live money movement is imminent without regulated launch approval",
  );
}

rejectPattern(
  "src/app/api/waitlist/route.ts",
  /Configure PAYSHIELD_WAITLIST_WEBHOOK_URL in Vercel/i,
  "Do not expose internal Vercel env setup in public waitlist responses",
);

if (failures.length) {
  console.error("Market preflight failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Market preflight passed.");
