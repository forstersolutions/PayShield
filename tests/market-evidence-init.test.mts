import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { createMarketEvidencePacket } from "../scripts/market-evidence-init.mjs";

async function tempEvidenceDir() {
  return mkdtemp(join(tmpdir(), "payshield-market-evidence-"));
}

test("creates local market evidence templates and redacted commands", async () => {
  const dir = await tempEvidenceDir();

  try {
    const result = await createMarketEvidencePacket({
      backupDir: "/secure/payshield/backups",
      dataDir: "/srv/payshield/waitlist",
      dir,
      generatedAt: "2026-06-05T00:00:00.000Z",
      receiverUrl: "https://receiver.example/payshield-waitlist",
      siteUrl: "https://payshield-lime.vercel.app/",
    });
    const counsel = JSON.parse(
      await readFile(join(dir, "counsel-signoff.json"), "utf8"),
    );
    const analytics = JSON.parse(
      await readFile(join(dir, "analytics-evidence.json"), "utf8"),
    );
    const managedReceiver = JSON.parse(
      await readFile(join(dir, "managed-receiver-evidence-template.json"), "utf8"),
    );
    const upstashReceiver = JSON.parse(
      await readFile(join(dir, "upstash-receiver-evidence-template.json"), "utf8"),
    );
    const blobReceiver = JSON.parse(
      await readFile(join(dir, "blob-receiver-evidence-template.json"), "utf8"),
    );
    const commands = await readFile(join(dir, "commands.md"), "utf8");
    const serialized = JSON.stringify(result) + commands;

    assert.equal(result.ok, true);
    assert.equal(result.siteUrl, "https://payshield-lime.vercel.app");
    assert.equal(result.files.length, 6);
    assert.equal(counsel.ok, false);
    assert.deepEqual(counsel.scope, [
      "privacy",
      "terms",
      "publicClaims",
      "campaignCopy",
    ]);
    assert.equal(analytics.webAnalyticsPilotConversions, false);
    assert.equal(analytics.productionUrl, "https://payshield-lime.vercel.app");
    assert.deepEqual(analytics.observedEventNames, [
      "Pilot Request Attempted",
      "Pilot Request Submitted",
    ]);
    assert.deepEqual(analytics.observedCampaignProperties, [
      "campaignMedium",
      "campaignName",
      "campaignSource",
      "hasCampaignAttribution",
    ]);
    assert.equal(managedReceiver.ok, false);
    assert.equal(managedReceiver.receiverType, "managed");
    assert.equal(
      managedReceiver.target.webhookUrl,
      "https://receiver.example/payshield-waitlist",
    );
    assert.equal(managedReceiver.webhookTest.signedPayloadAccepted, false);
    assert.equal(upstashReceiver.ok, false);
    assert.equal(upstashReceiver.receiverType, "upstash");
    assert.equal(
      upstashReceiver.target.productionUrl,
      "https://payshield-lime.vercel.app",
    );
    assert.equal(upstashReceiver.health.storageConfigured, false);
    assert.equal(blobReceiver.ok, false);
    assert.equal(blobReceiver.receiverType, "blob");
    assert.equal(blobReceiver.blob.access, "private");
    assert.equal(
      blobReceiver.target.productionUrl,
      "https://payshield-lime.vercel.app",
    );
    assert.equal(blobReceiver.health.storageConfigured, false);
    assert.match(commands, /npm run receiver:evidence/);
    assert.match(commands, /npm run receiver:managed:check/);
    assert.match(commands, /npm run receiver:upstash:evidence/);
    assert.match(commands, /npm run receiver:upstash:check/);
    assert.match(commands, /npm run receiver:blob:evidence/);
    assert.match(commands, /npm run receiver:blob:check/);
    assert.match(commands, /npm run vercel:webhook:cutover/);
    assert.match(commands, /npm run vercel:upstash:cutover/);
    assert.match(commands, /npm run counsel:signoff:check/);
    assert.match(commands, /npm run analytics:evidence:check/);
    assert.match(commands, /npm run launch:evidence/);
    assert.match(commands, /npm run vercel:env:audit/);
    assert.match(commands, /npm run smoke:deploy/);
    assert.match(commands, /--submit-test --require-webhook/);
    assert.match(commands, /npm run market:go-no-go/);
    assert.match(commands, /npm run market:status/);
    assert.match(commands, /PAYSHIELD_WAITLIST_WEBHOOK_SECRET=\.\.\./);
    assert.match(commands, /UPSTASH_REDIS_REST_URL=\.\.\./);
    assert.match(commands, /UPSTASH_REDIS_REST_TOKEN=\.\.\./);
    assert.match(commands, /BLOB_READ_WRITE_TOKEN=\.\.\./);
    assert.match(result.cutoverPlanCommand, /vercel:webhook:cutover/);
    assert.match(result.upstashCutoverPlanCommand, /vercel:upstash:cutover/);
    assert.match(result.counselSignoffCommand, /counsel:signoff:check/);
    assert.match(result.envAuditCommand, /vercel:env:audit/);
    assert.match(
      result.managedReceiverEvidenceCommand,
      /receiver:managed:check/,
    );
    assert.match(result.requiredCaptureSmokeCommand, /--require-webhook/);
    assert.match(
      result.upstashReceiverEvidenceCommand,
      /receiver:upstash:check/,
    );
    assert.match(
      result.upstashReceiverEvidenceGenerateCommand,
      /receiver:upstash:evidence/,
    );
    assert.match(result.blobReceiverEvidenceCommand, /receiver:blob:check/);
    assert.match(
      result.blobReceiverEvidenceGenerateCommand,
      /receiver:blob:evidence/,
    );
    assert.match(result.statusCommand, /market:status/);
    assert.equal(serialized.includes("shared-secret"), false);
    assert.equal(serialized.includes("@"), false);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("refuses to overwrite existing evidence files unless forced", async () => {
  const dir = await tempEvidenceDir();

  try {
    await writeFile(join(dir, "counsel-signoff.json"), "{}\n", "utf8");

    await assert.rejects(
      createMarketEvidencePacket({
        dir,
        generatedAt: "2026-06-05T00:00:00.000Z",
      }),
      /already exists/,
    );

    const result = await createMarketEvidencePacket({
      dir,
      force: true,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.ok, true);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("rejects receiver URLs with credentials, query strings, or fragments", async () => {
  const dir = await tempEvidenceDir();

  try {
    await assert.rejects(
      createMarketEvidencePacket({
        dir,
        receiverUrl: "https://user:pass@receiver.example/path?token=secret#frag",
      }),
      /must not include credentials, query strings, or fragments/,
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("rejects non-local HTTP receiver URLs", async () => {
  const dir = await tempEvidenceDir();

  try {
    await assert.rejects(
      createMarketEvidencePacket({
        dir,
        receiverUrl: "http://receiver.example/path",
      }),
      /must use https/,
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("allows localhost HTTP receiver URLs for local proof packets", async () => {
  const dir = await tempEvidenceDir();

  try {
    const result = await createMarketEvidencePacket({
      dir,
      receiverUrl: "http://127.0.0.1:8787/payshield-waitlist",
    });
    const managedReceiver = JSON.parse(
      await readFile(join(dir, "managed-receiver-evidence-template.json"), "utf8"),
    );

    assert.equal(result.ok, true);
    assert.equal(
      managedReceiver.target.webhookUrl,
      "http://127.0.0.1:8787/payshield-waitlist",
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
