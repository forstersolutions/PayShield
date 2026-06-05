import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runReceiverEvidence } from "../scripts/receiver-evidence.mjs";
import { createWaitlistWebhookReceiver } from "../scripts/waitlist-webhook-receiver.mjs";

function listen(server: ReturnType<typeof createWaitlistWebhookReceiver>) {
  return new Promise<{
    close: () => Promise<void>;
    healthUrl: string;
    webhookUrl: string;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      assert(address && typeof address === "object");

      const origin = `http://127.0.0.1:${address.port}`;

      resolve({
        close: () => new Promise((done) => server.close(() => done())),
        healthUrl: `${origin}/health`,
        webhookUrl: `${origin}/payshield-waitlist`,
      });
    });
  });
}

test("runs receiver evidence without exposing PII or secrets", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-receiver-evidence-"));
  const backupDir = await mkdtemp(join(tmpdir(), "payshield-receiver-backup-"));
  const secret = "receiver-evidence-secret";
  const server = createWaitlistWebhookReceiver({ dataDir, secret });
  const listener = await listen(server);

  try {
    const result = await runReceiverEvidence({
      backupDir,
      dataDir,
      healthUrl: listener.healthUrl,
      secret,
      url: listener.webhookUrl,
    });
    const serialized = JSON.stringify(result);
    const ndjson = await readFile(join(dataDir, "waitlist.ndjson"), "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.health.service, "payshield-waitlist-receiver");
    assert.equal(result.webhook.firstStatus, 202);
    assert.equal(result.webhook.replayStatus, 200);
    assert.equal(result.webhook.replayDuplicate, true);
    const byCampaign = result.summary.byCampaign as Record<string, number>;
    const byCampaignSource = result.summary.byCampaignSource as Record<string, number>;

    assert.equal(byCampaign["receiver-smoke"], 1);
    assert.equal(byCampaignSource["webhook-test"], 1);
    assert.equal(result.dataAudit.ok, true);
    assert.equal(result.dataAudit.duplicateSubmissionIds, 0);
    assert.equal(result.backup.ok, true);
    assert.equal(result.backupVerification.ok, true);
    assert.equal(
      result.backupVerification.checkedFiles["waitlist.ndjson"].sha256Match,
      true,
    );
    assert.equal(result.eraseDryRun.dryRun, true);
    assert.equal(result.eraseDryRun.removed, 1);
    assert.equal(ndjson.trim().split("\n").length, 1);
    assert.equal(serialized.includes("receiver-evidence+"), false);
    assert.equal(serialized.includes("Signed webhook smoke test. Safe to delete."), false);
    assert.equal(serialized.includes(secret), false);
  } finally {
    await listener.close();
    await rm(dataDir, { recursive: true });
    await rm(backupDir, { recursive: true });
  }
});

test("requires a receiver signing secret", async () => {
  await assert.rejects(
    runReceiverEvidence({
      backupDir: "/tmp/payshield-backups",
      dataDir: "/tmp/payshield-data",
      secret: "",
      url: "https://receiver.example/payshield-waitlist",
    }),
    /PAYSHIELD_WAITLIST_WEBHOOK_SECRET is required/,
  );
});
