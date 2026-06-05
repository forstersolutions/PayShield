import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateUpstashReceiverEvidenceFile } from "../scripts/check-upstash-receiver-evidence.mjs";

const upstashEvidence = {
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
    productionUrl: "https://payshield-lime.vercel.app",
  },
};

test("validates complete Upstash receiver evidence", () => {
  const result = evaluateUpstashReceiverEvidenceFile(upstashEvidence);
  const summary = result.summary as {
    receiverType: string;
    storageProvider: string;
  };

  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 0);
  assert.equal(summary.receiverType, "upstash");
  assert.equal(summary.storageProvider, "upstash");
});

test("requires Upstash health and production submit proof", () => {
  const result = evaluateUpstashReceiverEvidenceFile({
    ...upstashEvidence,
    health: {
      mode: "demo",
      paidTrafficReady: false,
      storageConfigured: false,
    },
    productionSubmit: {
      mode: "demo",
      status: 200,
    },
  });
  const failedChecks = result.checks
    .filter((check: { ok: boolean }) => !check.ok)
    .map((check: { name: string }) => check.name);

  assert.equal(result.ok, false);
  assert.equal(failedChecks.includes("upstashHealthReady"), true);
  assert.equal(failedChecks.includes("upstashProductionSubmit"), true);
});

test("rejects Upstash evidence that leaks PII or unsafe URL parts", () => {
  const result = evaluateUpstashReceiverEvidenceFile({
    ...upstashEvidence,
    reviewer: "ops@example.com",
    target: {
      productionUrl: "https://payshield-lime.vercel.app?token=secret",
    },
  });
  const findingNames = result.findings.map(
    (finding: { finding: string }) => finding.finding,
  );

  assert.equal(result.ok, false);
  assert.equal(findingNames.includes("email-like value"), true);
  assert.equal(
    findingNames.includes(
      "Upstash production URL must not include credentials, query strings, or fragments",
    ),
    true,
  );
});
