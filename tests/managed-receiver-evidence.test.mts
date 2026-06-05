import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateManagedReceiverEvidenceFile } from "../scripts/check-managed-receiver-evidence.mjs";

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

test("validates complete managed receiver evidence", () => {
  const result = evaluateManagedReceiverEvidenceFile(managedReceiverEvidence);
  const summary = result.summary as {
    receiverName: string;
    receiverType: string;
  };

  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 0);
  assert.equal(summary.receiverType, "managed");
  assert.equal(summary.receiverName, "Managed CRM");
});

test("requires signed webhook replay proof", () => {
  const result = evaluateManagedReceiverEvidenceFile({
    ...managedReceiverEvidence,
    webhookTest: {
      firstStatus: 202,
      replayStatus: 500,
      signedPayloadAccepted: true,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.checks.some(
      (check: { name: string; ok: boolean }) =>
        check.name === "managedSignedWebhookReplay" && check.ok === false,
    ),
    true,
  );
});

test("rejects raw webhook test output that still includes the smoke email", () => {
  const result = evaluateManagedReceiverEvidenceFile({
    ...managedReceiverEvidence,
    webhookTest: {
      ...managedReceiverEvidence.webhookTest,
      sentEmail: "webhook-smoke@example.com",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.findings.some(
      (finding: { finding: string }) => finding.finding === "email-like value",
    ),
    true,
  );
});

test("rejects managed receiver evidence that uses a non-HTTPS webhook URL", () => {
  const result = evaluateManagedReceiverEvidenceFile({
    ...managedReceiverEvidence,
    target: {
      webhookUrl: "http://crm.example/payshield-waitlist",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.findings.some(
      (finding: { finding: string }) =>
        finding.finding ===
        "managed receiver webhook URL must use https for production evidence",
    ),
    true,
  );
});
