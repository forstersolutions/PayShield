import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVercelWebhookCutoverPlan } from "../scripts/vercel-webhook-cutover.mjs";

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

test("builds a redacted Vercel webhook cutover plan", () => {
  const secret = "super-secret-cutover-value";
  const result = buildVercelWebhookCutoverPlan({
    generatedAt: "2026-06-05T00:00:00.000Z",
    receiverEvidence,
    secretValue: secret,
    siteUrl: "https://payshield-lime.vercel.app/",
  });
  const serialized = JSON.stringify(result);
  const commands = result.commands.map(
    (step: { command: string }) => step.command,
  );

  assert.equal(result.ok, true);
  assert.equal(result.readyForVercelCutover, true);
  assert.equal(result.receiverWebhookUrl, "https://receiver.example/payshield-waitlist");
  assert.deepEqual(result.remainingGates, []);
  assert.equal(serialized.includes(secret), false);
  assert.equal(
    commands.some((command) =>
      command.includes("npx vercel env add PAYSHIELD_WAITLIST_WEBHOOK_URL production"),
    ),
    true,
  );
  assert.equal(
    commands.some((command) =>
      command.includes(
        'npx vercel env add PAYSHIELD_WAITLIST_WEBHOOK_SECRET production --sensitive',
      ),
    ),
    true,
  );
  assert.equal(
    commands.some((command) => command.includes('"$PAYSHIELD_WAITLIST_WEBHOOK_SECRET"')),
    true,
  );
  assert.equal(
    commands.some((command) =>
      command.includes("PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK production"),
    ),
    true,
  );
  assert.equal(
    commands.some((command) =>
      command.includes("npm run launch:evidence") && command.includes("--strict"),
    ),
    true,
  );
});

test("keeps cutover closed when the secret env value is missing", () => {
  const result = buildVercelWebhookCutoverPlan({
    generatedAt: "2026-06-05T00:00:00.000Z",
    receiverEvidence,
    secretValue: "",
    siteUrl: "https://payshield-lime.vercel.app",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.remainingGates, ["secretEnvPresent"]);
});

test("keeps cutover closed when receiver evidence is unsafe", () => {
  const result = buildVercelWebhookCutoverPlan({
    generatedAt: "2026-06-05T00:00:00.000Z",
    receiverEvidence: {
      ...receiverEvidence,
      target: {
        healthUrl: "https://user:pass@receiver.example/health",
        webhookUrl: "https://receiver.example/payshield-waitlist?token=secret",
      },
    },
    secretValue: "super-secret-cutover-value",
    siteUrl: "https://payshield-lime.vercel.app",
  });

  assert.equal(result.ok, false);
  assert.equal(result.remainingGates.includes("receiverEvidenceReady"), true);
});

test("requires production environment for paid traffic cutover", () => {
  assert.throws(
    () =>
      buildVercelWebhookCutoverPlan({
        environment: "preview",
        receiverEvidence,
        secretValue: "super-secret-cutover-value",
      }),
    /production/,
  );
});
