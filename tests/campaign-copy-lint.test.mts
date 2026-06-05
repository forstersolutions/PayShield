import assert from "node:assert/strict";
import { test } from "node:test";
import { lintCampaignCopy } from "../scripts/check-campaign-copy.mjs";

test("allows prototype-safe campaign copy and disclaimers", () => {
  const result = lintCampaignCopy({
    text: [
      "PayShield is a protected-paycheck prototype for customer discovery.",
      "PayShield is not a bank.",
      "The prototype does not open accounts, move money, issue cards, or offer FDIC insurance.",
      "Use it to evaluate whether one safe-to-spend balance resonates with households.",
    ].join("\n"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 0);
});

test("flags regulated banking, insurance, account, rail, and card claims", () => {
  const result = lintCampaignCopy({
    label: "ad-draft.md",
    text: [
      "PayShield is a bank with FDIC-insured deposit accounts.",
      "Open your account today with direct deposit, ACH, debit card, and bill-pay.",
      "Move money automatically and never miss rent.",
    ].join("\n"),
  });
  const ids = result.findings.map((finding) => finding.id);

  assert.equal(result.ok, false);
  assert.deepEqual(
    [
      "ach",
      "bank-claim",
      "bill-pay",
      "card-issuing",
      "deposit-account",
      "direct-deposit",
      "fdic-insurance",
      "guarantee",
      "money-movement",
    ].every((id) => ids.includes(id)),
    true,
  );
  assert.equal(result.findings[0]?.label, "ad-draft.md");
});

test("reports line and column for campaign copy findings", () => {
  const result = lintCampaignCopy({
    text: ["Safe opening line.", "Get FDIC insurance with PayShield."].join("\n"),
  });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0]?.line, 2);
  assert.equal(result.findings[0]?.column, 5);
});

test("does not let a safe disclaimer hide a later regulated claim", () => {
  const result = lintCampaignCopy({
    text: "PayShield is not a bank, but direct deposit and ACH are live.",
  });
  const ids = result.findings.map((finding) => finding.id);

  assert.equal(result.ok, false);
  assert.equal(ids.includes("direct-deposit"), true);
  assert.equal(ids.includes("ach"), true);
});

test("allows explicit do-not guardrails that name prohibited claims", () => {
  const result = lintCampaignCopy({
    text: [
      "Do not say PayShield is a bank.",
      "Do not say users can open a deposit account.",
      "Do not say PayShield supports live direct deposit, ACH, debit cards, virtual cards, or bill-pay.",
      "Do not say PayShield moves money or guarantees protection.",
    ].join("\n"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 0);
});
