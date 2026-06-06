import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeLaunchReadiness } from "../scripts/launch-evidence.mjs";

const targetUrl = "https://payshield-lime.vercel.app";
const gitCommit = "abc123";
const requiredHome = [
  "PayShield | Paycheck Planning App",
  "Spend after the paycheck keeps its promises.",
  "Export plan",
  "Open the planner. Build the plan. Export the truth.",
].join(" ");

function publicEvidence(waitlist: Record<string, unknown>) {
  return {
    health: {
      ok: true,
      service: "payshield-web-app",
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
      "free-text financial notes to analytics",
    ].join(" "),
    securityBody: [
      "Contact: https://github.com/forstersolutions/PayShield/security/advisories/new",
      "Policy: https://github.com/forstersolutions/PayShield/security/policy",
      `Canonical: ${targetUrl}/.well-known/security.txt`,
    ].join("\n"),
    termsBody: "PayShield is not a bank.",
    validationBody: {
      error: "Accept the privacy and terms notice.",
    },
    validationStatus: 400,
  };
}

const leadCaptureDryRun = {
  backup: {
    audit: {
      ok: true,
      summary: {
        total: 1,
      },
    },
    backupId: "waitlist-backup-2026-06-05T00-00-00-000Z",
    copiedFiles: ["waitlist.ndjson", "waitlist.csv"],
    generatedAt: "2026-06-05T00:00:00.000Z",
    ok: true,
  },
  backupVerification: {
    backupId: "waitlist-backup-2026-06-05T00-00-00-000Z",
    checkedFiles: {
      "waitlist.csv": {
        bytes: 500,
        bytesMatch: true,
        exists: true,
        sha256:
          "1111111111111111111111111111111111111111111111111111111111111111",
        sha256Match: true,
      },
      "waitlist.ndjson": {
        bytes: 350,
        bytesMatch: true,
        exists: true,
        sha256:
          "2222222222222222222222222222222222222222222222222222222222222222",
        sha256Match: true,
      },
    },
    findings: [],
    manifest: {
      auditOk: true,
      copiedFiles: ["waitlist.ndjson", "waitlist.csv"],
      generatedAt: "2026-06-05T00:00:00.000Z",
      ok: true,
      total: 1,
    },
    ok: true,
  },
  checks: [
    "/api/waitlist accepts a signed required-webhook submission",
    "receiver treats signed replay with the same submissionId as idempotent",
    "waitlist data audit verifies receiver files and required metadata",
    "waitlist data backup creates a redacted manifest for receiver files",
    "waitlist data backup verification confirms manifest hashes",
  ],
  dataAudit: {
    allowEmpty: false,
    attribution: {
      recordsWithAttribution: 1,
      recordsWithCampaign: 1,
      recordsWithCampaignSource: 1,
      recordsWithLandingPath: 1,
    },
    csv: {
      exists: true,
      expectedRows: 1,
      headerOk: true,
      rowCount: 1,
      rowCountMatches: true,
    },
    duplicateSubmissionIds: 0,
    files: {
      csv: {
        bytes: 500,
        exists: true,
        sha256:
          "1111111111111111111111111111111111111111111111111111111111111111",
      },
      ndjson: {
        bytes: 350,
        exists: true,
        sha256:
          "2222222222222222222222222222222222222222222222222222222222222222",
      },
    },
    findings: [],
    malformedLines: [],
    missingRequired: {
      consentText: 0,
      consentedAt: 0,
      consentVersion: 0,
      createdAt: 0,
      email: 0,
      privacyVersion: 0,
      receivedAt: 0,
      segment: 0,
      source: 0,
      submissionId: 0,
      termsVersion: 0,
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
  },
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
const analyticsAudit = {
  allowedEventNames: [
    "Product Inquiry Attempted",
    "Product Inquiry Failed",
    "Product Inquiry Received",
    "Product Inquiry Submitted",
  ],
  allowedPropertyKeys: [
    "campaignMedium",
    "campaignName",
    "campaignSource",
    "hasCampaignAttribution",
    "hasMessage",
    "hasName",
    "mode",
    "segment",
    "status",
  ],
  analyticsMounted: true,
  eventNames: [
    "Product Inquiry Attempted",
    "Product Inquiry Failed",
    "Product Inquiry Received",
    "Product Inquiry Submitted",
  ],
  findings: [],
  ok: true,
  propertyKeys: ["hasMessage", "hasName", "mode", "segment", "status"],
  speedInsightsMounted: true,
  spreadProperties: ["analyticsAttribution", "campaignProperties"],
  trackCallCount: 6,
};

test("summarizes current launch-surface evidence without treating paid traffic as ready", () => {
  const evidence = summarizeLaunchReadiness({
    analyticsAudit,
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
    "vercelProductionCaptureEnv",
    "signedDurableProductionCapture",
  ]);
  assert.equal(evidence.readiness.launchSurface.ok, true);
  assert.equal(evidence.readiness.strict.ok, false);
  assert.equal(evidence.leadCaptureDryRun.backup.ok, true);
  assert.equal(evidence.leadCaptureDryRun.backupVerification.ok, true);
  assert.equal(
    evidence.leadCaptureDryRun.backupVerification.checkedFiles["waitlist.csv"]
      .sha256Match,
    true,
  );
  assert.equal(
    evidence.leadCaptureDryRun.backup.copiedFiles.includes("waitlist.csv"),
    true,
  );
  assert.equal(evidence.leadCaptureDryRun.summary.total, 1);
  assert.equal(evidence.leadCaptureDryRun.dataAudit.ok, true);
  assert.equal(evidence.leadCaptureDryRun.dataAudit.csv.rowCountMatches, true);
  assert.equal(serialized.includes("lead-capture-dry-run@example.com"), false);
  assert.equal(serialized.includes("Rent and insurance first."), false);
});

test("marks evidence paid-traffic ready when strict health and env gates pass", () => {
  const evidence = summarizeLaunchReadiness({
    analyticsAudit,
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

test("marks evidence paid-traffic ready with Vercel-native Upstash env gates", () => {
  const evidence = summarizeLaunchReadiness({
    analyticsAudit,
    expectedSiteUrl: targetUrl,
    gitCommit,
    leadCaptureDryRun,
    publicEvidence: publicEvidence({
      mode: "upstash",
      paidTrafficReady: true,
      requireWebhook: true,
      storageConfigured: true,
      storageProvider: "upstash",
      webhookConfigured: false,
      webhookSigningConfigured: false,
    }),
    targetUrl,
    vercelEnvAudit: {
      capturePath: "upstash",
      configured: [
        "NEXT_PUBLIC_SITE_URL",
        "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
        "PAYSHIELD_WAITLIST_STORAGE",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
      ],
      environment: "Production",
      missing: [],
      ok: true,
      required: [
        "NEXT_PUBLIC_SITE_URL",
        "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
        "PAYSHIELD_WAITLIST_STORAGE",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
      ],
      wrongEnvironment: [],
    },
  });

  assert.equal(evidence.ok, true);
  assert.equal(evidence.paidTrafficReady, true);
  assert.deepEqual(evidence.remainingGates, []);
  assert.equal(evidence.readiness.strict.ok, true);
  assert.equal(evidence.gates[4]?.capturePath, "upstash");
});

test("marks evidence paid-traffic ready with Vercel-native Blob env gates", () => {
  const evidence = summarizeLaunchReadiness({
    analyticsAudit,
    expectedSiteUrl: targetUrl,
    gitCommit,
    leadCaptureDryRun,
    publicEvidence: publicEvidence({
      mode: "blob",
      paidTrafficReady: true,
      requireWebhook: true,
      storageConfigured: true,
      storageProvider: "blob",
      webhookConfigured: false,
      webhookSigningConfigured: false,
    }),
    targetUrl,
    vercelEnvAudit: {
      capturePath: "blob",
      configured: [
        "NEXT_PUBLIC_SITE_URL",
        "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
        "PAYSHIELD_WAITLIST_STORAGE",
        "BLOB_READ_WRITE_TOKEN",
      ],
      environment: "Production",
      missing: [],
      ok: true,
      required: [
        "NEXT_PUBLIC_SITE_URL",
        "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
        "PAYSHIELD_WAITLIST_STORAGE",
        "BLOB_READ_WRITE_TOKEN",
      ],
      wrongEnvironment: [],
    },
  });

  assert.equal(evidence.ok, true);
  assert.equal(evidence.paidTrafficReady, true);
  assert.deepEqual(evidence.remainingGates, []);
  assert.equal(evidence.readiness.strict.ok, true);
  assert.equal(evidence.gates[4]?.capturePath, "blob");
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
    analyticsAudit,
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
