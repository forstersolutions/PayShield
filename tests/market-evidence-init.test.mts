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
    const commands = await readFile(join(dir, "commands.md"), "utf8");
    const serialized = JSON.stringify(result) + commands;

    assert.equal(result.ok, true);
    assert.equal(result.siteUrl, "https://payshield-lime.vercel.app");
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
    assert.match(commands, /npm run receiver:evidence/);
    assert.match(commands, /npm run vercel:webhook:cutover/);
    assert.match(commands, /npm run analytics:evidence:check/);
    assert.match(commands, /npm run launch:evidence/);
    assert.match(commands, /npm run market:go-no-go/);
    assert.match(commands, /PAYSHIELD_WAITLIST_WEBHOOK_SECRET=\.\.\./);
    assert.match(result.cutoverPlanCommand, /vercel:webhook:cutover/);
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
