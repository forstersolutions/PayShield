import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  eraseWaitlistEmail,
  summarizeWaitlistData,
} from "../scripts/waitlist-data-ops.mjs";

const records = [
  {
    attribution: {
      landingPath: "/",
      utmCampaign: "Household Launch",
      utmMedium: "cpc",
      utmSource: "Paid Social",
    },
    consentVersion: "pilot-privacy-2026-06-05",
    createdAt: "2026-06-05T00:00:00.000Z",
    email: "lead@example.com",
    message: "Rent first.",
    name: "Pilot Lead",
    receivedAt: "2026-06-05T00:00:01.000Z",
    segment: "Household",
    source: "payshield-market-site",
  },
  {
    attribution: {
      landingPath: "/partners",
      utmCampaign: "Partner Launch",
      utmMedium: "email",
      utmSource: "Partner Newsletter",
    },
    consentVersion: "pilot-privacy-2026-06-05",
    createdAt: "2026-06-05T01:00:00.000Z",
    email: "partner@example.com",
    message: "Partner pilot.",
    name: "Partner Lead",
    receivedAt: "2026-06-05T01:00:01.000Z",
    segment: "Investor or partner",
    source: "payshield-market-site",
  },
];

async function writeNdjson(dataDir: string, lines: string[]) {
  await writeFile(join(dataDir, "waitlist.ndjson"), `${lines.join("\n")}\n`, "utf8");
}

test("summarizes waitlist data without PII", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));

  try {
    await writeNdjson(
      dataDir,
      records.map((record) => JSON.stringify(record)),
    );
    const summary = await summarizeWaitlistData({ dataDir });
    const serialized = JSON.stringify(summary);

    assert.equal(summary.ok, true);
    assert.equal(summary.total, 2);
    assert.deepEqual(summary.bySegment, {
      Household: 1,
      "Investor or partner": 1,
    });
    assert.deepEqual(summary.byCampaign, {
      "Household Launch": 1,
      "Partner Launch": 1,
    });
    assert.deepEqual(summary.byCampaignSource, {
      "Paid Social": 1,
      "Partner Newsletter": 1,
    });
    assert.equal(summary.firstReceivedAt, "2026-06-05T00:00:01.000Z");
    assert.equal(summary.lastReceivedAt, "2026-06-05T01:00:01.000Z");
    assert.equal(serialized.includes("lead@example.com"), false);
    assert.equal(serialized.includes("Rent first."), false);
  } finally {
    await rm(dataDir, { recursive: true });
  }
});

test("erases matching email records and regenerates receiver files", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));

  try {
    await writeNdjson(
      dataDir,
      records.map((record) => JSON.stringify(record)),
    );
    const result = await eraseWaitlistEmail({
      dataDir,
      email: "LEAD@example.com",
    });
    const ndjson = await readFile(join(dataDir, "waitlist.ndjson"), "utf8");
    const csv = await readFile(join(dataDir, "waitlist.csv"), "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.removed, 1);
    assert.equal(result.remaining, 1);
    assert.equal(result.emailHash.length, 12);
    assert.equal(ndjson.includes("lead@example.com"), false);
    assert.equal(ndjson.includes("partner@example.com"), true);
    assert.match(
      csv,
      /^createdAt,email,name,segment,message,consentVersion,source,utmSource,utmMedium,utmCampaign,utmContent,utmTerm,landingPath,receivedAt/m,
    );
    assert.equal(csv.includes("lead@example.com"), false);
    assert.equal(csv.includes("partner@example.com"), true);
    assert.equal(csv.includes("Partner Launch"), true);
  } finally {
    await rm(dataDir, { recursive: true });
  }
});

test("dry-run erase does not rewrite files", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));

  try {
    await writeNdjson(
      dataDir,
      records.map((record) => JSON.stringify(record)),
    );
    const before = await readFile(join(dataDir, "waitlist.ndjson"), "utf8");
    const result = await eraseWaitlistEmail({
      dataDir,
      dryRun: true,
      email: "lead@example.com",
    });
    const after = await readFile(join(dataDir, "waitlist.ndjson"), "utf8");

    assert.equal(result.dryRun, true);
    assert.equal(result.removed, 1);
    assert.equal(before, after);
  } finally {
    await rm(dataDir, { recursive: true });
  }
});

test("refuses destructive erase when receiver data has malformed lines", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));

  try {
    await writeNdjson(dataDir, [
      JSON.stringify(records[0]),
      "{not-json}",
    ]);
    const summary = await summarizeWaitlistData({ dataDir });

    assert.equal(summary.ok, false);
    assert.deepEqual(summary.malformedLines, [2]);
    await assert.rejects(
      () => eraseWaitlistEmail({ dataDir, email: "lead@example.com" }),
      /malformed NDJSON lines: 2/,
    );
  } finally {
    await rm(dataDir, { recursive: true });
  }
});
