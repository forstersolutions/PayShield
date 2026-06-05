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
  "src/app/api/health/route.ts",
  "src/app/components/site-footer.tsx",
  "src/app/components/waitlist-form.tsx",
  "src/app/components/paycheck-planner.tsx",
  "src/app/lib/pilot-analytics.ts",
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  ".github/workflows/ci.yml",
  "next.config.ts",
  "SECURITY.md",
  ".dockerignore",
  "Dockerfile.receiver",
  "scripts/analytics-audit.mjs",
  "scripts/check-campaign-copy.mjs",
  "scripts/launch-evidence.mjs",
  "scripts/lead-capture-dry-run.mjs",
  "scripts/paid-traffic-readiness.mjs",
  "scripts/smoke-deploy.mjs",
  "scripts/smoke-docker-receiver.mjs",
  "scripts/test-waitlist-webhook.mjs",
  "scripts/vercel-env-audit.mjs",
  "scripts/waitlist-data-ops.mjs",
  "scripts/waitlist-webhook-receiver.mjs",
  "vercel.json",
].forEach((path) => requireFile(path));

[
  "NEXT_PUBLIC_SITE_URL",
  "PAYSHIELD_WAITLIST_WEBHOOK_URL",
  "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
  "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
  "PAYSHIELD_RECEIVER_HEALTH_PATH",
].forEach((key) => requireText(".env.example", key));

requireText(
  "src/app/components/site-footer.tsx",
  "Prototype only. PayShield is not a bank.",
);
requireText("src/app/terms/page.tsx", "PayShield is not a bank.");
requireText(
  "src/app/terms/page.tsx",
  "does not provide banking, deposit, payment, debit card, bill-pay, or money movement services",
);
requireText(
  "src/app/privacy/page.tsx",
  "does not currently open deposit accounts, move money, issue cards, or collect bank credentials",
);
requireText("src/app/privacy/page.tsx", "utm_source");
requireText("src/app/privacy/page.tsx", "utm_campaign");
requireText("src/app/privacy/page.tsx", "Vercel Web Analytics");
requireText("src/app/privacy/page.tsx", "Speed Insights");
requireText(
  "src/app/privacy/page.tsx",
  "does not send email addresses, names, bank details",
);
requireText("src/app/privacy/page.tsx", "free-text pilot notes");
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
requireText("src/app/manifest.ts", 'name: "PayShield"');
requireText("src/app/manifest.ts", 'theme_color: "#1c1917"');
requireText(
  "src/app/components/paycheck-planner.tsx",
  'src="/images/payshield-product-mockup.avif"',
);
requireText(
  "public/.well-known/security.txt",
  "Contact: https://github.com/forstersolutions/PayShield/security/advisories/new",
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
requireText("scripts/smoke-deploy.mjs", "x-content-type-options");
requireText("scripts/smoke-deploy.mjs", "strict-transport-security");
requireText("scripts/smoke-deploy.mjs", "permissions-policy");
requireText("scripts/smoke-deploy.mjs", "/.well-known/security.txt");
requireText("scripts/smoke-deploy.mjs", "expectMissingAsset");
requireText("scripts/smoke-deploy.mjs", "payshield-social-card.jpg");
requireText("scripts/smoke-docker-receiver.mjs", "runDockerReceiverSmoke");
requireText("scripts/smoke-docker-receiver.mjs", "Dockerfile.receiver");
requireText("scripts/smoke-docker-receiver.mjs", "sendSignedWebhookTest");
requireText("scripts/smoke-docker-receiver.mjs", "summarizeWaitlistData");
requireText("scripts/smoke-docker-receiver.mjs", "eraseWaitlistEmail");
requireText("scripts/analytics-audit.mjs", "auditAnalyticsInstrumentation");
requireText("scripts/analytics-audit.mjs", "Pilot Request Attempted");
requireText("scripts/analytics-audit.mjs", "Pilot Request Submitted");
requireText("scripts/analytics-audit.mjs", "approvedTrackPropertySpreads");
requireText("scripts/analytics-audit.mjs", "bannedTrackPropertyPatterns");
requireText("scripts/analytics-audit.mjs", "sends unapproved analytics property");
requireText("scripts/check-campaign-copy.mjs", "lintCampaignCopy");
requireText("scripts/check-campaign-copy.mjs", "fdic-insurance");
requireText("scripts/check-campaign-copy.mjs", "direct-deposit");
requireText("package.json", "\"campaign:lint\"");
requireText("package.json", "\"legal:lint\"");
requireText("package.json", "\"analytics:audit\"");
requireText("package.json", "\"launch:evidence\"");
requireText("package.json", "\"lead-capture:dry-run\"");
requireText("package.json", "\"receiver:docker:smoke\"");
requireText("package.json", "npm run legal:lint");
requireText("docs/campaign-copy.md", "npm run campaign:lint");
requireText("docs/campaign-copy.md", "npm run legal:lint");
requireText("docs/campaign-copy.md", "PayShield is not a bank.");
requireText("docs/legal-review-packet.md", "Counsel Questions");
requireText("docs/legal-review-packet.md", "Sign-Off Record");
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
requireText("scripts/paid-traffic-readiness.mjs", "--allow-prototype");
requireText("scripts/paid-traffic-readiness.mjs", "paidTrafficReady");
requireText("scripts/paid-traffic-readiness.mjs", "webhookSigningConfigured");
requireText("scripts/paid-traffic-readiness.mjs", "publicCopyBannedPhrases");
requireText("scripts/paid-traffic-readiness.mjs", "collectPaidTrafficEvidence");
requireText("scripts/paid-traffic-readiness.mjs", "/.well-known/security.txt");
requireText("scripts/launch-evidence.mjs", "summarizeLaunchReadiness");
requireText("scripts/launch-evidence.mjs", "runLeadCaptureDryRun");
requireText("scripts/launch-evidence.mjs", "auditVercelEnvList");
requireText("scripts/launch-evidence.mjs", "--strict");
requireText("scripts/test-waitlist-webhook.mjs", "sendSignedWebhookTest");
requireText("scripts/test-waitlist-webhook.mjs", "x-payshield-webhook-signature");
requireText("scripts/test-waitlist-webhook.mjs", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET");
requireText("scripts/test-waitlist-webhook.mjs", "pilot-contact-consent-2026-06-05");
requireText("scripts/test-waitlist-webhook.mjs", "pilot-terms-2026-06-05");
requireText("scripts/test-waitlist-webhook.mjs", "x-payshield-submission-id");
requireText("scripts/test-waitlist-webhook.mjs", "submissionId");
requireText("scripts/test-waitlist-webhook.mjs", "--replay");
requireText("scripts/test-waitlist-webhook.mjs", "replayResult");
requireText("scripts/lead-capture-dry-run.mjs", "runLeadCaptureDryRun");
requireText("scripts/lead-capture-dry-run.mjs", "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK");
requireText("scripts/lead-capture-dry-run.mjs", "auditWaitlistData");
requireText("scripts/lead-capture-dry-run.mjs", "summarizeWaitlistData");
requireText("scripts/lead-capture-dry-run.mjs", "eraseWaitlistEmail");
requireText("scripts/smoke-docker-receiver.mjs", "auditWaitlistData");
requireText("scripts/waitlist-data-ops.mjs", "summarizeWaitlistData");
requireText("scripts/waitlist-data-ops.mjs", "auditWaitlistData");
requireText("scripts/waitlist-data-ops.mjs", "backupWaitlistData");
requireText("scripts/waitlist-data-ops.mjs", "eraseWaitlistEmail");
requireText("scripts/waitlist-data-ops.mjs", "Refusing to back up receiver files until audit passes");
requireText("scripts/waitlist-data-ops.mjs", "waitlist.csv row count does not match");
requireText("scripts/waitlist-data-ops.mjs", "malformedLines");
requireText("scripts/waitlist-data-ops.mjs", "privacyVersion");
requireText("scripts/waitlist-data-ops.mjs", "termsVersion");
requireText("scripts/waitlist-data-ops.mjs", "consentedAt");
requireText("scripts/waitlist-data-ops.mjs", "submissionId");
requireText("package.json", "\"waitlist:data\"");
requireText("package.json", "\"vercel:env:audit\"");
requireText("package.json", "\"receiver:docker:build\"");
requireText(".github/workflows/ci.yml", "npm run receiver:docker:smoke");
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
  "npm run legal:lint",
);
requireText("src/app/api/waitlist/route.ts", "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK");
requireText("src/app/api/waitlist/route.ts", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET is required");
requireText("src/app/api/waitlist/route.ts", "x-payshield-webhook-signature");
requireText("src/app/api/waitlist/route.ts", "x-payshield-webhook-timestamp");
requireText("src/app/api/waitlist/route.ts", "x-payshield-submission-id");
requireText("src/app/api/waitlist/route.ts", "pilot-contact-consent-2026-06-05");
requireText("src/app/api/waitlist/route.ts", "pilot-terms-2026-06-05");
requireText("src/app/api/waitlist/route.ts", "consentedAt");
requireText("src/app/api/waitlist/route.ts", "consentText");
requireText("src/app/api/waitlist/route.ts", "randomUUID");
requireText(
  "src/app/api/waitlist/route.ts",
  "Prototype request accepted for this walkthrough",
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
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_WAITLIST_WEBHOOK_URL");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET");
requireText("scripts/vercel-env-audit.mjs", "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK");
requireText("scripts/vercel-env-audit.mjs", "--allow-prototype");
requireText("scripts/vercel-env-audit.mjs", "--stdin");
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
requireText(".dockerignore", "data");
requireText(".gitignore", "/data/waitlist/");
requireText(".gitignore", "/data/waitlist-backups/");
requireText("vercel.json", '"framework": "nextjs"');
requireText("docs/vercel-launch.md", "attribution");
requireText("docs/vercel-launch.md", "utm_source");
requireText("docs/vercel-launch.md", "consentVersion");
requireText("docs/vercel-launch.md", "privacyVersion");
requireText("docs/vercel-launch.md", "termsVersion");
requireText("docs/vercel-launch.md", "submissionId");
requireText("docs/vercel-launch.md", "webhook:test -- https://your-webhook-url --replay");
requireText("docs/vercel-launch.md", "npm run vercel:env:audit");
requireText("docs/vercel-launch.md", "npm run waitlist:data -- audit --data-dir /path/to/waitlist");
requireText("docs/vercel-launch.md", "npm run waitlist:data -- backup --data-dir /path/to/waitlist --backup-dir /secure/path");
requireText("docs/market-readiness.md", "sanitized campaign metadata");
requireText("docs/market-readiness.md", "consent audit fields");
requireText("docs/market-readiness.md", "idempotent capture");
requireText("docs/market-readiness.md", "webhook:test -- https://your-webhook-url --replay");
requireText("docs/market-readiness.md", "npm run legal:lint");
requireText("docs/market-readiness.md", "npm run vercel:env:audit");
requireText("docs/market-readiness.md", "npm run analytics:audit");
requireText("docs/market-readiness.md", "npm run waitlist:data -- audit --data-dir /path/to/waitlist");
requireText("docs/market-readiness.md", "npm run waitlist:data -- backup --data-dir /path/to/waitlist --backup-dir /secure/path");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "sanitized `attribution` fields");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run analytics:audit");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run waitlist:data -- audit");
requireText(".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml", "npm run waitlist:data -- backup");

requireMaxSize("src/app/icon.svg", 5_000);
requireMaxSize("public/images/payshield-product-mockup.avif", 125_000);
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
  "src/app/components/paycheck-planner.tsx",
];

for (const path of publicCopyFiles) {
  rejectPattern(
    path,
    /\bmember\s+fdic\b/i,
    "Do not claim partner-bank FDIC status before sponsorship is approved",
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
