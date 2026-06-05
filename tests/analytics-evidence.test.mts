import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLiveAnalyticsEvidence } from "../scripts/check-analytics-evidence.mjs";

const targetUrl = "https://payshield-lime.vercel.app";

const analyticsEvidence = {
  observedAt: "2026-06-05T00:00:00.000Z",
  observedCampaignProperties: [
    "campaignMedium",
    "campaignName",
    "campaignSource",
    "hasCampaignAttribution",
  ],
  observedEventNames: [
    "Early Access Request Attempted",
    "Early Access Request Submitted",
  ],
  ok: true,
  productionUrl: targetUrl,
  sanitizedCampaignMetadata: true,
  source: "Vercel Web Analytics and Speed Insights dashboard",
  speedInsightsProductionData: true,
  webAnalyticsPilotConversions: true,
};

test("validates complete live analytics evidence", () => {
  const result = evaluateLiveAnalyticsEvidence(analyticsEvidence, {
    targetUrl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 0);
  assert.equal(result.summary.productionUrl, targetUrl);
  assert.deepEqual(result.summary.observedEventNames, [
    "Early Access Request Attempted",
    "Early Access Request Submitted",
  ]);
});

test("flags missing required live analytics events and campaign properties", () => {
  const result = evaluateLiveAnalyticsEvidence(
    {
      ...analyticsEvidence,
      observedCampaignProperties: ["hasCampaignAttribution"],
      observedEventNames: ["Early Access Request Attempted"],
    },
    {
      targetUrl,
    },
  );
  const failedChecks = result.checks
    .filter((check: { ok: boolean }) => !check.ok)
    .map((check: { name: string }) => check.name);

  assert.equal(result.ok, false);
  assert.equal(failedChecks.includes("requiredAnalyticsEventsObserved"), true);
  assert.equal(failedChecks.includes("requiredCampaignPropertiesObserved"), true);
});

test("flags unsafe analytics evidence values", () => {
  const result = evaluateLiveAnalyticsEvidence(
    {
      ...analyticsEvidence,
      productionUrl: "https://payshield-lime.vercel.app/?email=lead@example.com",
      rawValue: "lead@example.com",
    },
    {
      targetUrl,
    },
  );
  const findingNames = result.findings.map(
    (finding: { finding: string }) => finding.finding,
  );

  assert.equal(result.ok, false);
  assert.equal(findingNames.includes("email-like value"), true);
  assert.equal(
    findingNames.includes(
      "analytics productionUrl must not include credentials, query strings, or fragments",
    ),
    true,
  );
});

test("requires evidence for the expected production URL", () => {
  const result = evaluateLiveAnalyticsEvidence(
    {
      ...analyticsEvidence,
      productionUrl: "https://example.com",
    },
    {
      targetUrl,
    },
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.some(
      (check: { name: string; ok: boolean }) =>
        check.name === "analyticsProductionUrl" && check.ok === false,
    ),
    true,
  );
});
