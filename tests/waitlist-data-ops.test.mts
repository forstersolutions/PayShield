import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  auditWaitlistData,
  backupWaitlistData,
  eraseWaitlistEmail,
  summarizeWaitlistData,
  verifyWaitlistBackup,
} from "../scripts/waitlist-data-ops.mjs";

const records = [
  {
    attribution: {
      landingPath: "/",
      utmCampaign: "Household Launch",
      utmMedium: "cpc",
      utmSource: "Paid Social",
    },
    consentText:
      "I agree that PayShield can contact me about the pilot and handle my information under the Privacy Notice and Terms.",
    consentedAt: "2026-06-05T00:00:00.000Z",
    consentVersion: "pilot-contact-consent-2026-06-05",
    createdAt: "2026-06-05T00:00:00.000Z",
    email: "lead@example.com",
    message: "Rent first.",
    name: "Pilot Lead",
    privacyVersion: "pilot-privacy-2026-06-05",
    receivedAt: "2026-06-05T00:00:01.000Z",
    segment: "Household",
    source: "payshield-market-site",
    submissionId: "018f7f62-9878-4aab-9ed3-86368f7f4512",
    termsVersion: "pilot-terms-2026-06-05",
  },
  {
    attribution: {
      landingPath: "/partners",
      utmCampaign: "Partner Launch",
      utmMedium: "email",
      utmSource: "Partner Newsletter",
    },
    consentText:
      "I agree that PayShield can contact me about the pilot and handle my information under the Privacy Notice and Terms.",
    consentedAt: "2026-06-05T01:00:00.000Z",
    consentVersion: "pilot-contact-consent-2026-06-05",
    createdAt: "2026-06-05T01:00:00.000Z",
    email: "partner@example.com",
    message: "Partner pilot.",
    name: "Partner Lead",
    privacyVersion: "pilot-privacy-2026-06-05",
    receivedAt: "2026-06-05T01:00:01.000Z",
    segment: "Investor or partner",
    source: "payshield-market-site",
    submissionId: "018f7f62-9878-4aab-9ed3-86368f7f4513",
    termsVersion: "pilot-terms-2026-06-05",
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

test("audits receiver files without exposing PII", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));

  try {
    await writeNdjson(
      dataDir,
      records.map((record) => JSON.stringify(record)),
    );
    await eraseWaitlistEmail({
      dataDir,
      email: "missing@example.com",
    });
    const audit = await auditWaitlistData({ dataDir });
    const serialized = JSON.stringify(audit);

    assert.equal(audit.ok, true);
    assert.deepEqual(audit.findings, []);
    assert.equal(audit.summary.total, 2);
    assert.equal(audit.csv.exists, true);
    assert.equal(audit.csv.headerOk, true);
    assert.equal(audit.csv.rowCountMatches, true);
    assert.equal(audit.files.ndjson.exists, true);
    assert.equal(audit.files.csv.exists, true);
    assert.equal(audit.files.ndjson.sha256?.length, 64);
    assert.equal(audit.files.csv.sha256?.length, 64);
    assert.equal(audit.duplicateSubmissionIds, 0);
    assert.equal(audit.missingRequired.submissionId, 0);
    assert.equal(audit.missingRequired.consentText, 0);
    assert.equal(audit.missingRequired.privacyVersion, 0);
    assert.equal(audit.missingRequired.termsVersion, 0);
    assert.equal(audit.attribution.recordsWithAttribution, 2);
    assert.equal(audit.attribution.recordsWithCampaign, 2);
    assert.equal(audit.attribution.recordsWithCampaignSource, 2);
    assert.equal(serialized.includes("lead@example.com"), false);
    assert.equal(serialized.includes("partner@example.com"), false);
    assert.equal(serialized.includes("Rent first."), false);
    assert.equal(serialized.includes("Partner pilot."), false);
  } finally {
    await rm(dataDir, { recursive: true });
  }
});

test("flags missing metadata, duplicate submissions, and CSV mismatches", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));

  try {
    await writeNdjson(dataDir, [
      JSON.stringify({
        ...records[0],
        termsVersion: "",
      }),
      JSON.stringify({
        ...records[1],
        consentText: "",
        submissionId: records[0].submissionId,
      }),
    ]);
    await writeFile(join(dataDir, "waitlist.csv"), "bad-header\n", "utf8");
    const audit = await auditWaitlistData({ dataDir });
    const serialized = JSON.stringify(audit);

    assert.equal(audit.ok, false);
    assert.equal(audit.duplicateSubmissionIds, 1);
    assert.equal(audit.missingRequired.termsVersion, 1);
    assert.equal(audit.missingRequired.consentText, 1);
    assert.equal(audit.csv.headerOk, false);
    assert.equal(audit.csv.rowCountMatches, false);
    assert.equal(
      audit.findings.includes("waitlist.csv header does not match the receiver schema."),
      true,
    );
    assert.equal(
      audit.findings.includes("waitlist.csv row count does not match waitlist.ndjson records."),
      true,
    );
    assert.equal(
      audit.findings.includes("waitlist.ndjson contains duplicate submissionId values."),
      true,
    );
    assert.equal(serialized.includes("lead@example.com"), false);
    assert.equal(serialized.includes("Partner pilot."), false);
  } finally {
    await rm(dataDir, { recursive: true });
  }
});

test("allows an empty receiver audit only when explicitly requested", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));

  try {
    const blocked = await auditWaitlistData({ dataDir });
    const allowed = await auditWaitlistData({ allowEmpty: true, dataDir });

    assert.equal(blocked.ok, false);
    assert.equal(
      blocked.findings.includes(
        "No receiver records found; submit a signed test lead before launch.",
      ),
      true,
    );
    assert.equal(allowed.ok, true);
    assert.deepEqual(allowed.findings, []);
    assert.equal(allowed.summary.total, 0);
  } finally {
    await rm(dataDir, { recursive: true });
  }
});

test("backs up receiver files with a redacted manifest", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));
  const backupDir = await mkdtemp(join(tmpdir(), "payshield-data-backups-"));

  try {
    await writeNdjson(
      dataDir,
      records.map((record) => JSON.stringify(record)),
    );
    await eraseWaitlistEmail({
      dataDir,
      email: "missing@example.com",
    });
    const result = await backupWaitlistData({
      backupDir,
      dataDir,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });
    const verification = await verifyWaitlistBackup({
      backupPath: result.backupPath,
    });
    const manifest = await readFile(result.manifestPath, "utf8");
    const backupNdjson = await readFile(
      join(result.backupPath, "waitlist.ndjson"),
      "utf8",
    );
    const backupCsv = await readFile(join(result.backupPath, "waitlist.csv"), "utf8");
    const serialized = JSON.stringify(result);

    assert.equal(result.ok, true);
    assert.equal(result.backupId, "waitlist-backup-2026-06-05T00-00-00-000Z");
    assert.deepEqual(result.copiedFiles.sort(), [
      "waitlist.csv",
      "waitlist.ndjson",
    ]);
    assert.equal(result.audit.ok, true);
    assert.equal(result.audit.summary.total, 2);
    assert.equal(result.audit.files.ndjson.sha256?.length, 64);
    assert.match(manifest, /"backupId": "waitlist-backup-2026-06-05T00-00-00-000Z"/);
    assert.match(manifest, /"sha256": "[a-f0-9]{64}"/);
    assert.equal(serialized.includes("lead@example.com"), false);
    assert.equal(serialized.includes("Partner pilot."), false);
    assert.equal(manifest.includes("lead@example.com"), false);
    assert.equal(manifest.includes("Partner pilot."), false);
    assert.equal(verification.ok, true);
    assert.equal(verification.backupId, result.backupId);
    const checkedFiles = verification.checkedFiles as Record<
      string,
      { bytesMatch?: boolean; sha256Match?: boolean }
    >;

    assert.equal(checkedFiles["waitlist.ndjson"].sha256Match, true);
    assert.equal(checkedFiles["waitlist.csv"].bytesMatch, true);
    assert.equal(JSON.stringify(verification).includes("lead@example.com"), false);
    assert.equal(JSON.stringify(verification).includes("Partner pilot."), false);
    assert.equal(backupNdjson.includes("lead@example.com"), true);
    assert.equal(backupCsv.includes("partner@example.com"), true);
  } finally {
    await rm(dataDir, { recursive: true });
    await rm(backupDir, { recursive: true });
  }
});

test("refuses backup when receiver audit fails", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));
  const backupDir = await mkdtemp(join(tmpdir(), "payshield-data-backups-"));

  try {
    await writeNdjson(dataDir, [
      JSON.stringify({
        ...records[0],
        consentText: "",
      }),
    ]);

    await assert.rejects(
      () =>
        backupWaitlistData({
          backupDir,
          dataDir,
          generatedAt: "2026-06-05T00:00:00.000Z",
        }),
      /Refusing to back up receiver files until audit passes/,
    );
  } finally {
    await rm(dataDir, { recursive: true });
    await rm(backupDir, { recursive: true });
  }
});

test("flags tampered backup files without exposing PII", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));
  const backupDir = await mkdtemp(join(tmpdir(), "payshield-data-backups-"));

  try {
    await writeNdjson(
      dataDir,
      records.map((record) => JSON.stringify(record)),
    );
    await eraseWaitlistEmail({
      dataDir,
      email: "missing@example.com",
    });
    const result = await backupWaitlistData({
      backupDir,
      dataDir,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    await writeFile(
      join(result.backupPath, "waitlist.csv"),
      "tampered lead@example.com Partner pilot.\n",
      "utf8",
    );

    const verification = await verifyWaitlistBackup({
      backupPath: result.backupPath,
    });
    const serialized = JSON.stringify(verification);

    assert.equal(verification.ok, false);
    assert.equal(
      verification.findings.includes(
        "waitlist.csv does not match the backup manifest evidence.",
      ),
      true,
    );
    const checkedFiles = verification.checkedFiles as Record<
      string,
      { sha256Match?: boolean }
    >;

    assert.equal(checkedFiles["waitlist.csv"].sha256Match, false);
    assert.equal(serialized.includes("lead@example.com"), false);
    assert.equal(serialized.includes("Partner pilot."), false);
  } finally {
    await rm(dataDir, { recursive: true });
    await rm(backupDir, { recursive: true });
  }
});

test("flags incomplete backup directories", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-data-ops-"));
  const backupDir = await mkdtemp(join(tmpdir(), "payshield-data-backups-"));

  try {
    await writeNdjson(
      dataDir,
      records.map((record) => JSON.stringify(record)),
    );
    await eraseWaitlistEmail({
      dataDir,
      email: "missing@example.com",
    });
    const result = await backupWaitlistData({
      backupDir,
      dataDir,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    await rm(join(result.backupPath, "waitlist.ndjson"));

    const missingFile = await verifyWaitlistBackup({
      backupPath: result.backupPath,
    });
    const missingManifest = await verifyWaitlistBackup({
      backupPath: join(backupDir, "missing-backup"),
    });

    assert.equal(missingFile.ok, false);
    assert.equal(
      missingFile.findings.includes("waitlist.ndjson is missing from the backup."),
      true,
    );
    assert.equal(missingManifest.ok, false);
    assert.equal(
      missingManifest.findings.includes("Backup manifest is missing or unreadable."),
      true,
    );
    assert.deepEqual(missingManifest.checkedFiles, {});
  } finally {
    await rm(dataDir, { recursive: true });
    await rm(backupDir, { recursive: true });
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
      /^submissionId,createdAt,email,name,segment,message,consentVersion,privacyVersion,termsVersion,consentedAt,consentText,source,utmSource,utmMedium,utmCampaign,utmContent,utmTerm,landingPath,receivedAt/m,
    );
    assert.equal(csv.includes("lead@example.com"), false);
    assert.equal(csv.includes("partner@example.com"), true);
    assert.equal(csv.includes("018f7f62-9878-4aab-9ed3-86368f7f4513"), true);
    assert.equal(csv.includes("Partner Launch"), true);
    assert.equal(csv.includes("pilot-terms-2026-06-05"), true);
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
