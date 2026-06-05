import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCounselSignoffEvidence } from "../scripts/check-counsel-signoff.mjs";

const counselSignoff = {
  campaignCopyLintOk: true,
  ok: true,
  reviewedAt: "2026-06-05T00:00:00.000Z",
  reviewer: "Counsel or authorized reviewer",
  scope: ["privacy", "terms", "publicClaims", "campaignCopy"],
};

test("validates complete counsel sign-off evidence", () => {
  const result = evaluateCounselSignoffEvidence(counselSignoff);

  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 0);
  assert.equal(
    (result.summary as { reviewedAt: string }).reviewedAt,
    counselSignoff.reviewedAt,
  );
});

test("requires all counsel sign-off scopes", () => {
  const result = evaluateCounselSignoffEvidence({
    ...counselSignoff,
    scope: ["privacy", "terms"],
  });
  const failedChecks = result.checks
    .filter((check: { ok: boolean }) => !check.ok)
    .map((check: { name: string }) => check.name);

  assert.equal(result.ok, false);
  assert.equal(failedChecks.includes("counselScopeComplete"), true);
  assert.deepEqual((result.summary as { missingScopes: string[] }).missingScopes, [
    "publicclaims",
    "campaigncopy",
  ]);
});

test("requires reviewed date, reviewer, and campaign lint approval", () => {
  const result = evaluateCounselSignoffEvidence({
    ...counselSignoff,
    campaignCopyLintOk: false,
    reviewedAt: "not-a-date",
    reviewer: "",
  });
  const failedChecks = result.checks
    .filter((check: { ok: boolean }) => !check.ok)
    .map((check: { name: string }) => check.name);

  assert.equal(result.ok, false);
  assert.equal(failedChecks.includes("counselReviewedAt"), true);
  assert.equal(failedChecks.includes("counselReviewerRecorded"), true);
  assert.equal(failedChecks.includes("campaignCopyLintOk"), true);
});

test("flags sensitive values in counsel sign-off evidence", () => {
  const result = evaluateCounselSignoffEvidence({
    ...counselSignoff,
    reviewer: "reviewer@example.com",
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.findings.some(
      (finding: { finding: string }) => finding.finding === "email-like value",
    ),
    true,
  );
});
