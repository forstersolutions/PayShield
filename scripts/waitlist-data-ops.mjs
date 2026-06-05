import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const defaultDataDir =
  process.env.PAYSHIELD_RECEIVER_DATA_DIR ?? join(process.cwd(), "data", "waitlist");
const csvHeader =
  "submissionId,createdAt,email,name,segment,message,consentVersion,privacyVersion,termsVersion,consentedAt,consentText,source,utmSource,utmMedium,utmCampaign,utmContent,utmTerm,landingPath,receivedAt";
const auditRequiredFields = [
  "submissionId",
  "email",
  "segment",
  "consentVersion",
  "privacyVersion",
  "termsVersion",
  "consentedAt",
  "consentText",
  "source",
  "createdAt",
  "receivedAt",
];
const attributionFields = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
];
const emailLikeValue = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const longSensitiveNumber = /\b\d(?:[\s-]?\d){8,}\b/;
const urlLikeValue = /\b(?:https?:\/\/|www\.)/i;

function usage() {
  return [
    "Usage:",
    "  npm run waitlist:data -- summary [--data-dir data/waitlist]",
    "  npm run waitlist:data -- audit [--data-dir data/waitlist] [--allow-empty]",
    "  npm run waitlist:data -- erase --email lead@example.com [--data-dir data/waitlist] [--dry-run]",
    "",
    "summary prints non-PII counts from the lightweight receiver files.",
    "audit checks receiver file integrity, required metadata, idempotency keys, and CSV consistency without printing PII.",
    "erase removes matching email records from waitlist.ndjson and regenerates waitlist.csv.",
  ].join("\n");
}

function flagValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));

  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  const next = args[index + 1];

  if (index === -1 || !next || next.startsWith("--")) {
    return "";
  }

  return next;
}

function parseCliArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const command = args.find((arg) => !arg.startsWith("--"));

  if (!["summary", "audit", "erase"].includes(command ?? "")) {
    throw new Error("Command must be summary, audit, or erase.");
  }

  const dataDir = flagValue(args, "--data-dir") || defaultDataDir;
  const email = flagValue(args, "--email");

  if (command === "erase" && !isValidEmail(email)) {
    throw new Error("--email must be a valid email address.");
  }

  return {
    command,
    allowEmpty: args.includes("--allow-empty"),
    dataDir,
    dryRun: args.includes("--dry-run"),
    email,
    help: false,
  };
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
}

function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function cleanAttributionValue(value, maxLength = 80) {
  const normalized = cleanText(value, maxLength);

  if (
    !normalized ||
    emailLikeValue.test(normalized) ||
    longSensitiveNumber.test(normalized) ||
    urlLikeValue.test(normalized)
  ) {
    return "";
  }

  return normalized.replace(/[^A-Za-z0-9 .:+/_-]/g, "").trim().slice(0, maxLength);
}

function cleanLandingPath(value) {
  if (typeof value !== "string") {
    return "";
  }

  const path = value.trim().split(/[?#]/)[0] ?? "";

  if (
    !path.startsWith("/") ||
    emailLikeValue.test(path) ||
    longSensitiveNumber.test(path)
  ) {
    return "";
  }

  return path.replace(/[^A-Za-z0-9/_-]/g, "").slice(0, 120) || "/";
}

function normalizeAttribution(value) {
  const attribution = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return attribution;
  }

  for (const field of attributionFields) {
    const cleaned = cleanAttributionValue(value[field]);

    if (cleaned) {
      attribution[field] = cleaned;
    }
  }

  const landingPath = cleanLandingPath(value.landingPath);

  if (landingPath) {
    attribution.landingPath = landingPath;
  }

  return attribution;
}

function emailHash(value) {
  return createHash("sha256").update(normalizeEmail(value)).digest("hex").slice(0, 12);
}

function normalizeRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Waitlist record must be a JSON object.");
  }

  const attribution = normalizeAttribution(value.attribution);
  const record = {
    consentText: cleanText(value.consentText, 240),
    consentedAt: cleanText(value.consentedAt, 40),
    consentVersion: cleanText(value.consentVersion, 80),
    createdAt: cleanText(value.createdAt, 40),
    email: normalizeEmail(value.email),
    message: cleanText(value.message, 800),
    name: cleanText(value.name, 80),
    privacyVersion: cleanText(value.privacyVersion, 80),
    receivedAt: cleanText(value.receivedAt, 40),
    segment: cleanText(value.segment, 40),
    source: cleanText(value.source, 80),
    submissionId: cleanText(value.submissionId, 80),
    termsVersion: cleanText(value.termsVersion, 80),
    ...(Object.keys(attribution).length ? { attribution } : {}),
  };

  if (!isValidEmail(record.email)) {
    throw new Error("Waitlist record is missing a valid email.");
  }

  return record;
}

async function readRecords(dataDir) {
  const ndjsonPath = join(dataDir, "waitlist.ndjson");

  if (!existsSync(ndjsonPath)) {
    return {
      malformedLines: [],
      ndjsonPath,
      records: [],
    };
  }

  const content = await readFile(ndjsonPath, "utf8");
  const records = [];
  const malformedLines = [];

  content.split("\n").forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    try {
      records.push(normalizeRecord(JSON.parse(trimmed)));
    } catch {
      malformedLines.push(index + 1);
    }
  });

  return {
    malformedLines,
    ndjsonPath,
    records,
  };
}

function csvValue(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function csvRow(record) {
  const attribution = record.attribution ?? {};

  return [
    record.submissionId,
    record.createdAt,
    record.email,
    record.name,
    record.segment,
    record.message,
    record.consentVersion,
    record.privacyVersion,
    record.termsVersion,
    record.consentedAt,
    record.consentText,
    record.source,
    attribution.utmSource ?? "",
    attribution.utmMedium ?? "",
    attribution.utmCampaign ?? "",
    attribution.utmContent ?? "",
    attribution.utmTerm ?? "",
    attribution.landingPath ?? "",
    record.receivedAt,
  ]
    .map(csvValue)
    .join(",");
}

async function writeReceiverFiles(dataDir, records) {
  await mkdir(dataDir, { recursive: true });

  const suffix = `${process.pid}-${Date.now()}`;
  const ndjsonPath = join(dataDir, "waitlist.ndjson");
  const csvPath = join(dataDir, "waitlist.csv");
  const tempNdjsonPath = join(dataDir, `waitlist.ndjson.${suffix}.tmp`);
  const tempCsvPath = join(dataDir, `waitlist.csv.${suffix}.tmp`);
  const ndjsonBody = records.map((record) => JSON.stringify(record)).join("\n");
  const csvBody = [csvHeader, ...records.map(csvRow)].join("\n");

  await writeFile(tempNdjsonPath, ndjsonBody ? `${ndjsonBody}\n` : "", "utf8");
  await writeFile(tempCsvPath, `${csvBody}\n`, "utf8");
  await rename(tempNdjsonPath, ndjsonPath);
  await rename(tempCsvPath, csvPath);
}

/**
 * @param {{ dataDir?: string }} [options]
 */
export async function summarizeWaitlistData({ dataDir = defaultDataDir } = {}) {
  const { malformedLines, records } = await readRecords(dataDir);
  const byCampaign = {};
  const byCampaignSource = {};
  const bySegment = {};
  const receivedAtValues = [];

  for (const record of records) {
    const campaign = record.attribution?.utmCampaign || "Unattributed";
    const campaignSource = record.attribution?.utmSource || "Unattributed";

    byCampaign[campaign] = (byCampaign[campaign] ?? 0) + 1;
    byCampaignSource[campaignSource] =
      (byCampaignSource[campaignSource] ?? 0) + 1;

    bySegment[record.segment || "Unknown"] =
      (bySegment[record.segment || "Unknown"] ?? 0) + 1;

    if (record.receivedAt) {
      receivedAtValues.push(record.receivedAt);
    }
  }

  receivedAtValues.sort();

  return {
    byCampaign,
    byCampaignSource,
    bySegment,
    files: {
      csv: existsSync(join(dataDir, "waitlist.csv")),
      ndjson: existsSync(join(dataDir, "waitlist.ndjson")),
    },
    firstReceivedAt: receivedAtValues[0] ?? null,
    lastReceivedAt: receivedAtValues.at(-1) ?? null,
    malformedLines,
    ok: malformedLines.length === 0,
    total: records.length,
  };
}

async function fileEvidence(dataDir, filename) {
  const path = join(dataDir, filename);

  if (!existsSync(path)) {
    return {
      bytes: 0,
      exists: false,
      sha256: null,
    };
  }

  const content = await readFile(path);

  return {
    bytes: content.byteLength,
    exists: true,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

async function auditCsvFile({ dataDir, expectedRows }) {
  const csvPath = join(dataDir, "waitlist.csv");

  if (!existsSync(csvPath)) {
    return {
      exists: false,
      expectedRows,
      headerOk: false,
      rowCount: 0,
      rowCountMatches: expectedRows === 0,
    };
  }

  const content = await readFile(csvPath, "utf8");
  const lines = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const header = lines[0] ?? "";
  const rowCount = Math.max(0, lines.length - 1);

  return {
    exists: true,
    expectedRows,
    headerOk: header === csvHeader,
    rowCount,
    rowCountMatches: rowCount === expectedRows,
  };
}

/**
 * @param {{ allowEmpty?: boolean; dataDir?: string }} [options]
 */
export async function auditWaitlistData({
  allowEmpty = false,
  dataDir = defaultDataDir,
} = {}) {
  const { malformedLines, records } = await readRecords(dataDir);
  const summary = await summarizeWaitlistData({ dataDir });
  const csv = await auditCsvFile({ dataDir, expectedRows: records.length });
  const files = {
    csv: await fileEvidence(dataDir, "waitlist.csv"),
    ndjson: await fileEvidence(dataDir, "waitlist.ndjson"),
  };
  const missingRequired = Object.fromEntries(
    auditRequiredFields.map((field) => [field, 0]),
  );
  const submissionIdCounts = new Map();
  let recordsWithAttribution = 0;
  let recordsWithCampaign = 0;
  let recordsWithCampaignSource = 0;
  let recordsWithLandingPath = 0;

  for (const record of records) {
    for (const field of auditRequiredFields) {
      if (!record[field]) {
        missingRequired[field] += 1;
      }
    }

    if (record.submissionId) {
      submissionIdCounts.set(
        record.submissionId,
        (submissionIdCounts.get(record.submissionId) ?? 0) + 1,
      );
    }

    if (record.attribution && Object.keys(record.attribution).length) {
      recordsWithAttribution += 1;
    }

    if (record.attribution?.utmCampaign) {
      recordsWithCampaign += 1;
    }

    if (record.attribution?.utmSource) {
      recordsWithCampaignSource += 1;
    }

    if (record.attribution?.landingPath) {
      recordsWithLandingPath += 1;
    }
  }

  const duplicateSubmissionIds = [...submissionIdCounts.values()].filter(
    (count) => count > 1,
  ).length;
  const findings = [];

  if (malformedLines.length) {
    findings.push(
      `waitlist.ndjson contains malformed lines: ${malformedLines.join(", ")}`,
    );
  }

  if (!allowEmpty && records.length === 0) {
    findings.push("No receiver records found; submit a signed test lead before launch.");
  }

  if (records.length > 0 && !csv.exists) {
    findings.push("waitlist.csv is missing while waitlist.ndjson has records.");
  }

  if (csv.exists && !csv.headerOk) {
    findings.push("waitlist.csv header does not match the receiver schema.");
  }

  if (csv.exists && !csv.rowCountMatches) {
    findings.push("waitlist.csv row count does not match waitlist.ndjson records.");
  }

  if (duplicateSubmissionIds > 0) {
    findings.push("waitlist.ndjson contains duplicate submissionId values.");
  }

  for (const [field, count] of Object.entries(missingRequired)) {
    if (count > 0) {
      findings.push(`${count} receiver record(s) missing ${field}.`);
    }
  }

  return {
    allowEmpty,
    attribution: {
      recordsWithAttribution,
      recordsWithCampaign,
      recordsWithCampaignSource,
      recordsWithLandingPath,
    },
    csv,
    duplicateSubmissionIds,
    files,
    findings,
    malformedLines,
    missingRequired,
    ok: findings.length === 0,
    summary,
  };
}

/**
 * @param {{ dataDir?: string; dryRun?: boolean; email?: string }} [options]
 */
export async function eraseWaitlistEmail({
  dataDir = defaultDataDir,
  dryRun = false,
  email,
} = {}) {
  if (!isValidEmail(email)) {
    throw new Error("A valid email is required.");
  }

  const { malformedLines, records } = await readRecords(dataDir);

  if (malformedLines.length) {
    throw new Error(
      `Refusing to rewrite waitlist files with malformed NDJSON lines: ${malformedLines.join(", ")}`,
    );
  }

  const normalizedEmail = normalizeEmail(email);
  const remainingRecords = records.filter((record) => record.email !== normalizedEmail);
  const removed = records.length - remainingRecords.length;

  if (!dryRun) {
    await writeReceiverFiles(dataDir, remainingRecords);
  }

  return {
    dryRun,
    emailHash: emailHash(normalizedEmail),
    ok: true,
    remaining: remainingRecords.length,
    removed,
  };
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  let result;

  if (parsed.command === "summary") {
    result = await summarizeWaitlistData({ dataDir: parsed.dataDir });
  } else if (parsed.command === "audit") {
    result = await auditWaitlistData({
      allowEmpty: parsed.allowEmpty,
      dataDir: parsed.dataDir,
    });
  } else {
    result = await eraseWaitlistEmail({
      dataDir: parsed.dataDir,
      dryRun: parsed.dryRun,
      email: parsed.email,
    });
  }

  console.log(JSON.stringify(result, null, 2));

  if (parsed.command === "audit" && !result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Waitlist data operation failed.");
    process.exit(1);
  });
}
