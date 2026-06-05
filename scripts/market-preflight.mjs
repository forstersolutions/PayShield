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
  "docs/campaign-copy.md",
  "src/app/api/health/route.ts",
  "src/app/components/site-footer.tsx",
  "src/app/components/waitlist-form.tsx",
  "src/app/components/paycheck-planner.tsx",
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  ".github/workflows/ci.yml",
  "next.config.ts",
  "SECURITY.md",
  ".dockerignore",
  "Dockerfile.receiver",
  "scripts/check-campaign-copy.mjs",
  "scripts/paid-traffic-readiness.mjs",
  "scripts/smoke-deploy.mjs",
  "scripts/test-waitlist-webhook.mjs",
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
requireText("src/app/components/waitlist-form.tsx", "Privacy Notice");
requireText("src/app/components/waitlist-form.tsx", "Terms");
requireText("src/app/components/waitlist-form.tsx", "consent");
requireText(
  "src/app/components/waitlist-form.tsx",
  "Do not include bank, card, SSN, account, or routing numbers.",
);
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
requireText("scripts/smoke-deploy.mjs", "--expect-site-url");
requireText("scripts/smoke-deploy.mjs", "--require-webhook");
requireText("scripts/smoke-deploy.mjs", "webhookSigningConfigured");
requireText("scripts/smoke-deploy.mjs", "x-content-type-options");
requireText("scripts/smoke-deploy.mjs", "strict-transport-security");
requireText("scripts/smoke-deploy.mjs", "permissions-policy");
requireText("scripts/smoke-deploy.mjs", "payshield-social-card.jpg");
requireText("scripts/check-campaign-copy.mjs", "lintCampaignCopy");
requireText("scripts/check-campaign-copy.mjs", "fdic-insurance");
requireText("scripts/check-campaign-copy.mjs", "direct-deposit");
requireText("package.json", "\"campaign:lint\"");
requireText("docs/campaign-copy.md", "npm run campaign:lint");
requireText("docs/campaign-copy.md", "PayShield is not a bank.");
requireText("next.config.ts", "Strict-Transport-Security");
requireText("next.config.ts", "max-age=31536000");
requireText("scripts/paid-traffic-readiness.mjs", "--allow-prototype");
requireText("scripts/paid-traffic-readiness.mjs", "paidTrafficReady");
requireText("scripts/paid-traffic-readiness.mjs", "webhookSigningConfigured");
requireText("scripts/paid-traffic-readiness.mjs", "publicCopyBannedPhrases");
requireText("scripts/test-waitlist-webhook.mjs", "sendSignedWebhookTest");
requireText("scripts/test-waitlist-webhook.mjs", "x-payshield-webhook-signature");
requireText("scripts/test-waitlist-webhook.mjs", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET");
requireText("scripts/waitlist-data-ops.mjs", "summarizeWaitlistData");
requireText("scripts/waitlist-data-ops.mjs", "eraseWaitlistEmail");
requireText("scripts/waitlist-data-ops.mjs", "malformedLines");
requireText("package.json", "\"waitlist:data\"");
requireText("package.json", "\"receiver:docker:build\"");
requireText(".github/workflows/ci.yml", "npm run receiver:docker:build");
requireText("SECURITY.md", "GitHub Dependabot security updates are enabled");
requireText("SECURITY.md", "GitHub private vulnerability reporting is enabled");
requireText("SECURITY.md", "Do not open a public issue for security vulnerabilities");
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true",
);
requireText(
  ".github/ISSUE_TEMPLATE/paid-traffic-readiness.yml",
  "waitlist.paidTrafficReady: true",
);
requireText("src/app/api/waitlist/route.ts", "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK");
requireText("src/app/api/waitlist/route.ts", "PAYSHIELD_WAITLIST_WEBHOOK_SECRET is required");
requireText("src/app/api/waitlist/route.ts", "x-payshield-webhook-signature");
requireText("src/app/api/waitlist/route.ts", "x-payshield-webhook-timestamp");
requireText(
  "src/app/api/waitlist/route.ts",
  "Prototype request accepted for this walkthrough",
);
requireText("src/app/api/waitlist/route.ts", "request_sensitive_financial_info");
requireText(
  "src/app/api/waitlist/route.ts",
  "Do not include bank, card, SSN, or other sensitive financial details.",
);
requireText("src/app/api/health/route.ts", "paidTrafficReady");
requireText("src/app/api/health/route.ts", "webhookConfigured");
requireText("src/app/api/health/route.ts", "webhookSigningConfigured");
requireText("scripts/smoke-deploy.mjs", "/api/health");
requireText("scripts/waitlist-webhook-receiver.mjs", "verifyPayShieldSignature");
requireText("scripts/waitlist-webhook-receiver.mjs", "payshield-waitlist-receiver");
requireText("scripts/waitlist-webhook-receiver.mjs", "waitlist.ndjson");
requireText("scripts/waitlist-webhook-receiver.mjs", "waitlist.csv");
requireText("Dockerfile.receiver", "PAYSHIELD_RECEIVER_DATA_DIR=/data/waitlist");
requireText("Dockerfile.receiver", "PAYSHIELD_RECEIVER_HEALTH_PATH=/health");
requireText("Dockerfile.receiver", "scripts/waitlist-webhook-receiver.mjs");
requireText(".dockerignore", "data");
requireText(".gitignore", "/data/waitlist/");
requireText("vercel.json", '"framework": "nextjs"');

requireMaxSize("src/app/icon.svg", 5_000);
requireMaxSize("public/images/payshield-product-mockup.avif", 125_000);
requireMaxSize("public/images/payshield-social-card.jpg", 250_000);

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
