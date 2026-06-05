import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const defaultDataDir =
  process.env.PAYSHIELD_RECEIVER_DATA_DIR ?? join(process.cwd(), "data", "waitlist");
const csvHeader =
  "createdAt,email,name,segment,message,consentVersion,source,receivedAt";

function usage() {
  return [
    "Usage:",
    "  npm run waitlist:data -- summary [--data-dir data/waitlist]",
    "  npm run waitlist:data -- erase --email lead@example.com [--data-dir data/waitlist] [--dry-run]",
    "",
    "summary prints non-PII counts from the lightweight receiver files.",
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

  if (!["summary", "erase"].includes(command ?? "")) {
    throw new Error("Command must be summary or erase.");
  }

  const dataDir = flagValue(args, "--data-dir") || defaultDataDir;
  const email = flagValue(args, "--email");

  if (command === "erase" && !isValidEmail(email)) {
    throw new Error("--email must be a valid email address.");
  }

  return {
    command,
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

function emailHash(value) {
  return createHash("sha256").update(normalizeEmail(value)).digest("hex").slice(0, 12);
}

function normalizeRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Waitlist record must be a JSON object.");
  }

  const record = {
    consentVersion: cleanText(value.consentVersion, 80),
    createdAt: cleanText(value.createdAt, 40),
    email: normalizeEmail(value.email),
    message: cleanText(value.message, 800),
    name: cleanText(value.name, 80),
    receivedAt: cleanText(value.receivedAt, 40),
    segment: cleanText(value.segment, 40),
    source: cleanText(value.source, 80),
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
  return [
    record.createdAt,
    record.email,
    record.name,
    record.segment,
    record.message,
    record.consentVersion,
    record.source,
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
  const bySegment = {};
  const receivedAtValues = [];

  for (const record of records) {
    bySegment[record.segment || "Unknown"] =
      (bySegment[record.segment || "Unknown"] ?? 0) + 1;

    if (record.receivedAt) {
      receivedAtValues.push(record.receivedAt);
    }
  }

  receivedAtValues.sort();

  return {
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

  const result =
    parsed.command === "summary"
      ? await summarizeWaitlistData({ dataDir: parsed.dataDir })
      : await eraseWaitlistEmail({
          dataDir: parsed.dataDir,
          dryRun: parsed.dryRun,
          email: parsed.email,
        });

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Waitlist data operation failed.");
    process.exit(1);
  });
}
