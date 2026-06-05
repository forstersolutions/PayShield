import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditAnalyticsInstrumentation,
  extractTrackCalls,
  extractTrackPropertyEntries,
} from "../scripts/analytics-audit.mjs";
import {
  pilotCampaignAnalyticsProperties,
  pilotAnalyticsEventNames,
  pilotAnalyticsPropertyKeys,
} from "../src/app/lib/pilot-analytics.ts";

test("audits current analytics instrumentation without PII findings", () => {
  const result = auditAnalyticsInstrumentation();

  assert.equal(result.ok, true);
  assert.equal(result.analyticsMounted, true);
  assert.equal(result.speedInsightsMounted, true);
  assert.equal(result.trackCallCount, 6);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.propertyKeys, [
    "hasMessage",
    "hasName",
    "mode",
    "segment",
    "status",
  ]);
  assert.deepEqual(result.spreadProperties, [
    "analyticsAttribution",
    "campaignProperties",
  ]);
  assert.deepEqual(result.eventNames, [
    "Pilot Request Attempted",
    "Pilot Request Failed",
    "Pilot Request Received",
    "Pilot Request Submitted",
  ]);
});

test("extracts track call event names and line numbers", () => {
  const calls = extractTrackCalls({
    file: "sample.ts",
    text: [
      "track('Pilot Request Attempted', { segment: 'Household' });",
      "",
      "track(\"Pilot Request Submitted\", { mode: 'demo' });",
    ].join("\n"),
  });

  assert.deepEqual(
    calls.map((call) => [call.eventName, call.line]),
    [
      ["Pilot Request Attempted", 1],
      ["Pilot Request Submitted", 3],
    ],
  );
});

test("extracts explicit and shared analytics property entries", () => {
  const entries = extractTrackPropertyEntries(
    [
      "track('Pilot Request Submitted', {",
      "  segment,",
      "  hasName: Boolean(name),",
      "  mode: String(result.mode ?? 'unknown'),",
      "  ...campaignProperties,",
      "});",
    ].join("\n"),
  );

  assert.deepEqual(entries.keys, ["segment", "hasName", "mode"]);
  assert.deepEqual(entries.spreads, ["campaignProperties"]);
});

test("flags banned analytics properties", () => {
  const result = auditAnalyticsInstrumentation({
    files: {
      "sample.ts": [
        "track('Pilot Request Submitted', {",
        "  email: 'lead@example.com',",
        "  message: 'Rent first',",
        "});",
      ].join("\n"),
    },
    layoutText: "<Analytics /><SpeedInsights />",
    privacyText:
      "Vercel Web Analytics Speed Insights utm_source utm_campaign does not send email addresses, names, bank details",
    sharedText: [
      "export const pilotAnalyticsEventNames = [",
      "'Pilot Request Attempted',",
      "'Pilot Request Failed',",
      "'Pilot Request Received',",
      "'Pilot Request Submitted',",
      "] as const;",
      "export const pilotAnalyticsPropertyKeys = [",
      "'campaignMedium',",
      "'campaignName',",
      "'campaignSource',",
      "'hasCampaignAttribution',",
      "'hasMessage',",
      "'hasName',",
      "'mode',",
      "'segment',",
      "'status',",
      "] as const;",
    ].join("\n"),
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.findings.includes("sample.ts:1 sends banned analytics property email"),
    true,
  );
  assert.equal(
    result.findings.includes("sample.ts:1 sends banned analytics property message"),
    true,
  );
});

test("flags unapproved non-PII analytics properties", () => {
  const result = auditAnalyticsInstrumentation({
    files: {
      "sample.ts": [
        "track('Pilot Request Submitted', {",
        "  segment: 'Household',",
        "  unexpectedMetric: true,",
        "});",
      ].join("\n"),
    },
    layoutText: "<Analytics /><SpeedInsights />",
    privacyText:
      "Vercel Web Analytics Speed Insights utm_source utm_campaign does not send email addresses, names, bank details",
    sharedText: [
      "export const pilotAnalyticsEventNames = [",
      "'Pilot Request Attempted',",
      "'Pilot Request Failed',",
      "'Pilot Request Received',",
      "'Pilot Request Submitted',",
      "] as const;",
      "export const pilotAnalyticsPropertyKeys = [",
      "'campaignMedium',",
      "'campaignName',",
      "'campaignSource',",
      "'hasCampaignAttribution',",
      "'hasMessage',",
      "'hasName',",
      "'mode',",
      "'segment',",
      "'status',",
      "] as const;",
    ].join("\n"),
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.findings.includes(
      "sample.ts:1 sends unapproved analytics property unexpectedMetric",
    ),
    true,
  );
});

test("campaign analytics properties expose only approved non-PII keys", () => {
  const properties = pilotCampaignAnalyticsProperties({
    landingPath: "/pilot",
    utmCampaign: "Household Launch",
    utmContent: "button-a",
    utmMedium: "cpc",
    utmSource: "Paid Social",
    utmTerm: "rent protection",
  });

  assert.deepEqual(properties, {
    campaignMedium: "cpc",
    campaignName: "Household Launch",
    campaignSource: "Paid Social",
    hasCampaignAttribution: true,
  });
  assert.equal("utmTerm" in properties, false);
  assert.equal("utmContent" in properties, false);
  assert.equal("landingPath" in properties, false);
  assert.deepEqual(
    [...pilotAnalyticsEventNames].sort(),
    [
      "Pilot Request Attempted",
      "Pilot Request Failed",
      "Pilot Request Received",
      "Pilot Request Submitted",
    ],
  );
  assert.equal(pilotAnalyticsPropertyKeys.includes("email" as never), false);
});
