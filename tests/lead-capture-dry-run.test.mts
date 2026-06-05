import assert from "node:assert/strict";
import { test } from "node:test";
import { runLeadCaptureDryRun } from "../scripts/lead-capture-dry-run.mjs";

test("proves signed lead capture end to end without exposing PII", async () => {
  const result = await runLeadCaptureDryRun();
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.equal(result.dataDir, undefined);
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.bySegment.Household, 1);
  assert.equal(result.summary.byCampaign["Household Launch"], 1);
  assert.equal(result.summary.byCampaignSource["Paid Social"], 1);
  assert.equal(result.eraseDryRun.dryRun, true);
  assert.equal(result.eraseDryRun.removed, 1);
  assert.equal(result.eraseDryRun.remaining, 0);
  assert.equal(result.internalLogCounts.errors, 0);
  assert.equal(serialized.includes("lead-capture-dry-run@example.com"), false);
  assert.equal(serialized.includes("Rent and insurance first."), false);
  assert.equal(serialized.includes("PAYSHIELD_WAITLIST_WEBHOOK_SECRET"), false);
  assert.match(
    result.checks.join("\n"),
    /\/api\/waitlist accepts a signed required-webhook submission/,
  );
  assert.match(
    result.checks.join("\n"),
    /receiver treats signed replay with the same submissionId as idempotent/,
  );
});

test("restores process environment after the dry run", async () => {
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = "https://existing.example/hook";
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET = "existing-secret";
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "false";
  process.env.VERCEL_WEB_ANALYTICS_DISABLE_LOGS = "0";

  await runLeadCaptureDryRun();

  assert.equal(
    process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL,
    "https://existing.example/hook",
  );
  assert.equal(process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET, "existing-secret");
  assert.equal(process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK, "false");
  assert.equal(process.env.VERCEL_WEB_ANALYTICS_DISABLE_LOGS, "0");

  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET;
  delete process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK;
  delete process.env.VERCEL_WEB_ANALYTICS_DISABLE_LOGS;
});
