import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeLaunchReadiness } from "../scripts/launch-evidence.mjs";

const targetUrl = "https://payshield-lime.vercel.app";
const gitCommit = "abc123";
const requiredHome = [
  "PayShield | Protected Paycheck OS",
  "Prototype ready for diligence",
  "Join the pilot list",
  "Prototype only. PayShield is not a bank.",
].join(" ");

function publicEvidence(waitlist: Record<string, unknown>) {
  return {
    health: {
      ok: true,
      service: "payshield-market-site",
      siteUrl: targetUrl,
      vercel: {
        environment: "production",
        gitCommitSha: gitCommit,
      },
      waitlist,
    },
    homeBody: [
      requiredHome,
      `href="${targetUrl}/"`,
      `${targetUrl}/images/payshield-social-card.jpg`,
    ].join(" "),
    homeHeaders: {
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "referrer-policy": "strict-origin-when-cross-origin",
      "strict-transport-security": "max-age=31536000",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
    privacyBody: [
      "does not currently open deposit accounts",
      "utm_source",
      "utm_campaign",
      "Vercel Web Analytics",
      "Speed Insights",
      "does not send email addresses, names, bank details",
      "free-text pilot notes to analytics",
    ].join(" "),
    securityBody: [
      "Contact: https://github.com/forstersolutions/PayShield/security/advisories/new",
      "Policy: https://github.com/forstersolutions/PayShield/security/policy",
      `Canonical: ${targetUrl}/.well-known/security.txt`,
    ].join("\n"),
    termsBody: "PayShield is not a bank.",
    validationBody: {
      error: "Accept the pilot privacy and terms notice.",
    },
    validationStatus: 400,
  };
}

const leadCaptureDryRun = {
  checks: [
    "/api/waitlist accepts a signed required-webhook submission",
    "receiver treats signed replay with the same submissionId as idempotent",
  ],
  eraseDryRun: {
    dryRun: true,
    emailHash: "025af00cf03d",
    remaining: 0,
    removed: 1,
  },
  internalLogCounts: {
    errors: 0,
    logs: 3,
  },
  ok: true,
  summary: {
    byCampaign: {
      "Household Launch": 1,
    },
    byCampaignSource: {
      "Paid Social": 1,
    },
    bySegment: {
      Household: 1,
    },
    files: {
      csv: true,
      ndjson: true,
    },
    firstReceivedAt: "2026-06-05T00:00:00.000Z",
    lastReceivedAt: "2026-06-05T00:00:00.000Z",
    malformedLines: [],
    ok: true,
    total: 1,
  },
};

test("summarizes current prototype evidence without treating paid traffic as ready", () => {
  const evidence = summarizeLaunchReadiness({
    expectedSiteUrl: targetUrl,
    generatedAt: "2026-06-05T00:00:00.000Z",
    gitCommit,
    leadCaptureDryRun,
    publicEvidence: publicEvidence({
      mode: "demo",
      paidTrafficReady: false,
      requireWebhook: false,
      webhookConfigured: false,
      webhookSigningConfigured: false,
    }),
    targetUrl,
    vercelEnvAudit: {
      configured: ["NEXT_PUBLIC_SITE_URL"],
      environment: "Production",
      missing: [
        "PAYSHIELD_WAITLIST_WEBHOOK_URL",
        "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
        "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
      ],
      ok: false,
      required: [
        "NEXT_PUBLIC_SITE_URL",
        "PAYSHIELD_WAITLIST_WEBHOOK_URL",
        "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
        "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
      ],
      wrongEnvironment: [],
    },
  });
  const serialized = JSON.stringify(evidence);

  assert.equal(evidence.ok, true);
  assert.equal(evidence.paidTrafficReady, false);
  assert.deepEqual(evidence.remainingGates, [
    "vercelProductionWebhookEnv",
    "signedDurableProductionCapture",
  ]);
  assert.equal(evidence.readiness.prototype.ok, true);
  assert.equal(evidence.readiness.strict.ok, false);
  assert.equal(evidence.leadCaptureDryRun.summary.total, 1);
  assert.equal(serialized.includes("lead-capture-dry-run@example.com"), false);
  assert.equal(serialized.includes("Rent and insurance first."), false);
});

test("marks evidence paid-traffic ready when strict health and env gates pass", () => {
  const evidence = summarizeLaunchReadiness({
    expectedSiteUrl: targetUrl,
    gitCommit,
    leadCaptureDryRun,
    publicEvidence: publicEvidence({
      mode: "webhook",
      paidTrafficReady: true,
      requireWebhook: true,
      webhookConfigured: true,
      webhookSigningConfigured: true,
    }),
    targetUrl,
    vercelEnvAudit: {
      configured: [
        "NEXT_PUBLIC_SITE_URL",
        "PAYSHIELD_WAITLIST_WEBHOOK_URL",
        "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
        "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
      ],
      environment: "Production",
      missing: [],
      ok: true,
      required: [
        "NEXT_PUBLIC_SITE_URL",
        "PAYSHIELD_WAITLIST_WEBHOOK_URL",
        "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
        "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
      ],
      wrongEnvironment: [],
    },
  });

  assert.equal(evidence.ok, true);
  assert.equal(evidence.paidTrafficReady, true);
  assert.deepEqual(evidence.remainingGates, []);
  assert.equal(evidence.readiness.strict.ok, true);
});

test("flags a production commit mismatch", () => {
  const staleEvidence = publicEvidence({
    mode: "demo",
    paidTrafficReady: false,
    requireWebhook: false,
    webhookConfigured: false,
    webhookSigningConfigured: false,
  });

  staleEvidence.health.vercel.gitCommitSha = "different";

  const evidence = summarizeLaunchReadiness({
    gitCommit,
    leadCaptureDryRun,
    publicEvidence: staleEvidence,
    targetUrl,
    vercelEnvAudit: {
      configured: ["NEXT_PUBLIC_SITE_URL"],
      environment: "Production",
      missing: [],
      ok: true,
      required: ["NEXT_PUBLIC_SITE_URL"],
      wrongEnvironment: [],
    },
  });

  assert.equal(evidence.ok, false);
  assert.equal(
    evidence.remainingGates.includes("productionCommitMatchesLocalGit"),
    true,
  );
});
