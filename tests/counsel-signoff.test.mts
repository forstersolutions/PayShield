import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCounselSignoffEvidence } from "../scripts/check-counsel-signoff.mjs";

const complete = {
  approved: true,
  evidenceRef: "legal-system-review-2026-08-08",
  providerProgram: "Contracted production program",
  reviewedAt: "2026-08-08T12:00:00.000Z",
  reviewer: "Authorized counsel",
  scope: [
    "privacy",
    "terms",
    "publicClaims",
    "productFlows",
    "providerDisclosures",
    "operations",
  ],
  sourceCommit: "a".repeat(40),
};

test("validates complete redacted counsel approval", () => {
  const result = evaluateCounselSignoffEvidence(complete);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test("requires every product and provider review scope", () => {
  const result = evaluateCounselSignoffEvidence({ ...complete, scope: ["privacy", "terms"] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.summary.missingScopes, [
    "publicclaims",
    "productflows",
    "providerdisclosures",
    "operations",
  ]);
});

test("rejects unapproved, unversioned, or secret-bearing evidence", () => {
  const result = evaluateCounselSignoffEvidence({
    ...complete,
    approved: false,
    evidenceRef: "sk_live_do_not_store",
    sourceCommit: "main",
  });
  const findings = result.findings.map((finding) => finding.finding);
  assert.equal(result.ok, false);
  assert.equal(findings.includes("approved"), true);
  assert.equal(findings.includes("sourceCommit"), true);
  assert.equal(findings.includes("redacted"), true);
});
