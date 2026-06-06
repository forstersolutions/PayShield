import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateManagedReceiverEvidence,
  evaluateReceiverEvidence,
  evaluateUpstashReceiverEvidence,
  scanEvidenceForSensitiveValues,
  summarizeMarketGoNoGo,
} from "../scripts/market-go-no-go.mjs";

const targetUrl = "https://payshield-lime.vercel.app";

const launchEvidence = {
  ok: true,
  paidTrafficReady: true,
  production: {
    health: {
      ok: true,
      service: "payshield-web-app",
      siteUrl: targetUrl,
      waitlist: {
        mode: "webhook",
        paidTrafficReady: true,
        requireWebhook: true,
        webhookConfigured: true,
        webhookSigningConfigured: true,
      },
    },
  },
  readiness: {
    strict: {
      ok: true,
    },
  },
  remainingGates: [],
  vercelEnv: {
    ok: true,
  },
};

const receiverEvidence = {
  backup: {
    audit: {
      ok: true,
    },
    backupId: "waitlist-backup-2026-06-05T00-00-00-000Z",
    copiedFiles: ["waitlist.ndjson", "waitlist.csv"],
    ok: true,
  },
  backupVerification: {
    checkedFiles: {
      "waitlist.csv": {
        sha256Match: true,
      },
      "waitlist.ndjson": {
        sha256Match: true,
      },
    },
    ok: true,
  },
  dataAudit: {
    csv: {
      rowCountMatches: true,
    },
    duplicateSubmissionIds: 0,
    missingRequired: {
      consentText: 0,
      privacyVersion: 0,
      submissionId: 0,
      termsVersion: 0,
    },
    ok: true,
  },
  eraseDryRun: {
    dryRun: true,
    removed: 1,
  },
  generatedAt: "2026-06-05T00:00:00.000Z",
  health: {
    ok: true,
    service: "payshield-waitlist-receiver",
    status: 200,
  },
  ok: true,
  summary: {
    ok: true,
    total: 1,
  },
  target: {
    healthUrl: "https://receiver.example/health",
    webhookUrl: "https://receiver.example/payshield-waitlist",
  },
  webhook: {
    firstStatus: 202,
    replayDuplicate: true,
    replayStatus: 202,
  },
};

const managedReceiverEvidence = {
  deletionProcessDocumented: true,
  durableStorage: true,
  exportProcessDocumented: true,
  ok: true,
  receiverName: "Managed CRM",
  receiverType: "managed",
  replayIdempotent: true,
  reviewedAt: "2026-06-05T00:00:00.000Z",
  reviewer: "Launch operator",
  signatureVerified: true,
  storageOwner: "Revenue operations",
  storesAttribution: true,
  storesConsentFields: true,
  storesSubmissionId: true,
  target: {
    webhookUrl: "https://crm.example/payshield-waitlist",
  },
  webhookTest: {
    firstStatus: 202,
    replayStatus: 200,
    signedPayloadAccepted: true,
  },
};

const upstashReceiverEvidence = {
  deletionProcessDocumented: true,
  durableStorage: true,
  exportProcessDocumented: true,
  health: {
    mode: "upstash",
    paidTrafficReady: true,
    storageConfigured: true,
  },
  ok: true,
  productionSubmit: {
    mode: "upstash",
    status: 200,
  },
  receiverType: "upstash",
  reviewedAt: "2026-06-05T00:00:00.000Z",
  reviewer: "Launch operator",
  storageOwner: "Revenue operations",
  storesAttribution: true,
  storesConsentFields: true,
  storesEmailHashIndex: true,
  storesSubmissionId: true,
  target: {
    productionUrl: targetUrl,
  },
};

const counselSignoff = {
  campaignCopyLintOk: true,
  ok: true,
  reviewedAt: "2026-06-05T00:00:00.000Z",
  reviewer: "Outside counsel",
  scope: ["privacy", "terms", "publicClaims", "campaignCopy"],
};

const analyticsEvidence = {
  ok: true,
  observedAt: "2026-06-05T00:00:00.000Z",
  observedCampaignProperties: [
    "campaignMedium",
    "campaignName",
    "campaignSource",
    "hasCampaignAttribution",
  ],
  observedEventNames: [
    "Product Inquiry Attempted",
    "Product Inquiry Submitted",
  ],
  productionUrl: targetUrl,
  sanitizedCampaignMetadata: true,
  source: "Vercel Web Analytics and Speed Insights dashboard",
  speedInsightsProductionData: true,
  webAnalyticsPilotConversions: true,
};

test("summarizes a complete market go/no-go packet as ready", () => {
  const result = summarizeMarketGoNoGo({
    analyticsEvidence,
    counselSignoff,
    generatedAt: "2026-06-05T00:00:00.000Z",
    launchEvidence,
    receiverEvidence,
    targetUrl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.marketReady, true);
  assert.equal(result.paidTrafficReady, true);
  assert.deepEqual(result.remainingGates, []);
  assert.equal(result.evidence.launch.ok, true);
  assert.equal(result.evidence.receiver.ok, true);
  assert.equal(result.evidence.counsel.ok, true);
  assert.equal(result.evidence.analytics.ok, true);
});

test("summarizes a complete market go/no-go packet with managed receiver evidence as ready", () => {
  const result = summarizeMarketGoNoGo({
    analyticsEvidence,
    counselSignoff,
    generatedAt: "2026-06-05T00:00:00.000Z",
    launchEvidence,
    receiverEvidence: managedReceiverEvidence,
    targetUrl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.marketReady, true);
  assert.equal(result.evidence.receiver.ok, true);
  assert.equal(
    (result.evidence.receiver.summary as { receiverType: string }).receiverType,
    "managed",
  );
});

test("summarizes a complete market go/no-go packet with Upstash receiver evidence as ready", () => {
  const result = summarizeMarketGoNoGo({
    analyticsEvidence,
    counselSignoff,
    generatedAt: "2026-06-05T00:00:00.000Z",
    launchEvidence,
    receiverEvidence: upstashReceiverEvidence,
    targetUrl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.marketReady, true);
  assert.equal(result.evidence.receiver.ok, true);
  assert.equal(
    (result.evidence.receiver.summary as { receiverType: string }).receiverType,
    "upstash",
  );
});

test("keeps the market decision closed when external evidence is missing", () => {
  const result = summarizeMarketGoNoGo({
    analyticsEvidence: undefined,
    counselSignoff: undefined,
    generatedAt: "2026-06-05T00:00:00.000Z",
    launchEvidence: {
      ...launchEvidence,
      paidTrafficReady: false,
      remainingGates: ["vercelProductionCaptureEnv"],
    },
    receiverEvidence: undefined,
    targetUrl,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.remainingGates, [
    "strictProductionLaunchEvidence",
    "productionReceiverEvidence",
    "counselSignoff",
    "liveAnalyticsEvidence",
  ]);
  assert.equal(result.evidence.receiver.summary.provided, false);
  assert.equal(result.evidence.counsel.summary.provided, false);
  assert.equal(result.evidence.analytics.summary.provided, false);
});

test("rejects receiver evidence that leaks PII or sensitive URL parts", () => {
  const unsafeReceiverEvidence = {
    ...receiverEvidence,
    leak: "receiver-evidence+abc@example.com",
    target: {
      healthUrl: "https://user:pass@receiver.example/health?token=secret",
      webhookUrl: "https://receiver.example/payshield-waitlist#secret",
    },
  };
  const result = evaluateReceiverEvidence(unsafeReceiverEvidence);
  const findingNames = result.findings.map(
    (finding: { finding: string }) => finding.finding,
  );

  assert.equal(result.ok, false);
  assert.equal(findingNames.includes("email-like value"), true);
  assert.equal(
    findingNames.includes(
      "receiver health URL must not include credentials, query strings, or fragments",
    ),
    true,
  );
  assert.equal(
    findingNames.includes(
      "receiver webhook URL must not include credentials, query strings, or fragments",
    ),
    true,
  );
});

test("rejects final receiver evidence that uses non-HTTPS URLs", () => {
  const packet = summarizeMarketGoNoGo({
    analyticsEvidence,
    counselSignoff,
    launchEvidence,
    receiverEvidence: {
      ...receiverEvidence,
      target: {
        healthUrl: "http://receiver.example/health",
        webhookUrl: "http://receiver.example/payshield-waitlist",
      },
    },
    targetUrl,
  });
  const findings = packet.evidence.receiver.findings.map(
    (finding: { finding: string }) => finding.finding,
  );

  assert.equal(packet.marketReady, false);
  assert.equal(
    findings.includes("receiver webhook URL must use https for production evidence"),
    true,
  );
  assert.equal(
    findings.includes("receiver health URL must use https for production evidence"),
    true,
  );
});

test("rejects managed receiver evidence without durable storage attestations", () => {
  const result = evaluateManagedReceiverEvidence({
    ...managedReceiverEvidence,
    durableStorage: false,
    storesConsentFields: false,
  });
  const failedChecks = result.checks
    .filter((check: { ok: boolean }) => !check.ok)
    .map((check: { name: string }) => check.name);

  assert.equal(result.ok, false);
  assert.equal(failedChecks.includes("managedDurableStorage"), true);
  assert.equal(failedChecks.includes("managedConsentFieldsStored"), true);
});

test("rejects managed receiver evidence that leaks PII or unsafe URL parts", () => {
  const result = evaluateManagedReceiverEvidence({
    ...managedReceiverEvidence,
    reviewer: "ops@example.com",
    target: {
      webhookUrl: "https://crm.example/payshield-waitlist?token=secret",
    },
  });
  const findingNames = result.findings.map(
    (finding: { finding: string }) => finding.finding,
  );

  assert.equal(result.ok, false);
  assert.equal(findingNames.includes("email-like value"), true);
  assert.equal(
    findingNames.includes(
      "managed receiver webhook URL must not include credentials, query strings, or fragments",
    ),
    true,
  );
});

test("rejects Upstash receiver evidence without storage attestations", () => {
  const result = evaluateUpstashReceiverEvidence({
    ...upstashReceiverEvidence,
    storesEmailHashIndex: false,
    storesSubmissionId: false,
  });
  const failedChecks = result.checks
    .filter((check: { ok: boolean }) => !check.ok)
    .map((check: { name: string }) => check.name);

  assert.equal(result.ok, false);
  assert.equal(failedChecks.includes("upstashEmailHashIndexStored"), true);
  assert.equal(failedChecks.includes("upstashSubmissionIdStored"), true);
});

test("scans nested evidence strings for sensitive values", () => {
  const findings = scanEvidenceForSensitiveValues({
    nested: ["PAYSHIELD_WAITLIST_WEBHOOK_SECRET=super-secret"],
  });

  assert.deepEqual(findings, [
    {
      finding: "raw webhook secret environment assignment",
      path: '$["nested"][0]',
    },
  ]);
});
