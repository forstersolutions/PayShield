import { randomBytes } from "node:crypto";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";
import { POST } from "../src/app/api/waitlist/route.ts";
import {
  createWaitlistWebhookReceiver,
  signPayShieldWebhook,
} from "./waitlist-webhook-receiver.mjs";
import {
  eraseWaitlistEmail,
  summarizeWaitlistData,
} from "./waitlist-data-ops.mjs";

const endpoint = "https://payshield.test/api/waitlist";
const testEmail = "lead-capture-dry-run@example.com";

function usage() {
  return [
    "Usage: npm run lead-capture:dry-run [--keep-data]",
    "",
    "Starts the lightweight receiver on localhost, forces /api/waitlist into signed fail-closed webhook mode,",
    "submits one pilot request, verifies stored consent and sanitized attribution, verifies idempotent replay,",
    "runs the non-PII data summary, and dry-runs an email erasure.",
    "",
    "The default run uses a temporary receiver data directory and deletes it before exit.",
    "--keep-data preserves the temporary directory for local inspection. It contains test lead data.",
  ].join("\n");
}

function parseCliArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  for (const arg of args) {
    if (arg !== "--keep-data") {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    help: false,
    keepData: args.includes("--keep-data"),
  };
}

function makeRequest(payload) {
  const body = JSON.stringify(payload);

  return new NextRequest(endpoint, {
    method: "POST",
    headers: {
      "content-length": String(Buffer.byteLength(body)),
      "content-type": "application/json",
      "x-forwarded-for": `lead-capture-dry-run-${Date.now()}-${Math.random()}`,
      "x-vercel-id": "lead-capture-dry-run",
    },
    body,
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      reject(error);
    };

    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      const address = server.address();

      if (!address || typeof address !== "object") {
        reject(new Error("Receiver did not expose a local address."));
        return;
      }

      const origin = `http://127.0.0.1:${address.port}`;

      resolve({
        close: () => new Promise((done) => server.close(() => done())),
        healthUrl: `${origin}/health`,
        url: `${origin}/payshield-waitlist`,
      });
    });
  });
}

function saveEnv(keys) {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      Object.prototype.hasOwnProperty.call(process.env, key)
        ? process.env[key]
        : undefined,
    ]),
  );
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function withCapturedConsole(callback) {
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  const errors = [];

  console.log = (...args) => {
    logs.push(args.map(String).join(" "));
  };
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    const result = await callback();

    return {
      errors,
      logs,
      result,
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function requireCheck(checks, condition, message) {
  if (!condition) {
    throw new Error(`Lead capture dry run failed: ${message}`);
  }

  checks.push(message);
}

async function readPersistedRecords(dataDir) {
  const ndjson = await readFile(join(dataDir, "waitlist.ndjson"), "utf8");

  return ndjson
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function publicSafeSummary(summary) {
  return {
    byCampaign: summary.byCampaign,
    byCampaignSource: summary.byCampaignSource,
    bySegment: summary.bySegment,
    files: summary.files,
    firstReceivedAt: summary.firstReceivedAt,
    lastReceivedAt: summary.lastReceivedAt,
    malformedLines: summary.malformedLines,
    ok: summary.ok,
    total: summary.total,
  };
}

export async function runLeadCaptureDryRun({ keepData = false } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-lead-capture-"));
  const secret = `dry-run-${randomBytes(24).toString("hex")}`;
  const server = createWaitlistWebhookReceiver({ dataDir, secret });
  const listener = await listen(server);
  const envSnapshot = saveEnv([
    "PAYSHIELD_WAITLIST_WEBHOOK_URL",
    "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
    "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
    "VERCEL_WEB_ANALYTICS_DISABLE_LOGS",
  ]);
  const checks = [];

  try {
    process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = listener.url;
    process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET = secret;
    process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";
    process.env.VERCEL_WEB_ANALYTICS_DISABLE_LOGS = "1";

    const health = await fetch(listener.healthUrl);
    const healthBody = await parseJsonResponse(health);

    requireCheck(
      checks,
      health.status === 200 &&
        healthBody?.service === "payshield-waitlist-receiver",
      "receiver health check returns payshield-waitlist-receiver",
    );

    const payload = {
      attribution: {
        landingPath: "/pilot?email=bad@example.com",
        utmCampaign: "Household Launch",
        utmContent: "safe-card<a>",
        utmMedium: "cpc",
        utmSource: "Paid Social",
        utmTerm: "123-45-6789",
      },
      consent: true,
      email: testEmail,
      message: "Rent and insurance first.",
      name: "Pilot Lead",
      segment: "Household",
    };
    const captured = await withCapturedConsole(async () =>
      POST(makeRequest(payload)),
    );
    const responseBody = await parseJsonResponse(captured.result);

    requireCheck(
      checks,
      captured.result.status === 200 && responseBody?.mode === "webhook",
      "/api/waitlist accepts a signed required-webhook submission",
    );

    const records = await readPersistedRecords(dataDir);

    requireCheck(checks, records.length === 1, "receiver stores exactly one lead");

    const record = records[0] ?? {};

    requireCheck(
      checks,
      record.email === testEmail,
      "receiver persists the normalized pilot email",
    );
    requireCheck(
      checks,
      record.consentVersion === "pilot-contact-consent-2026-06-05" &&
        record.privacyVersion === "pilot-privacy-2026-06-05" &&
        record.termsVersion === "pilot-terms-2026-06-05" &&
        Boolean(record.consentedAt) &&
        Boolean(record.consentText),
      "receiver persists consent, privacy, and terms audit fields",
    );
    requireCheck(
      checks,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        String(record.submissionId ?? ""),
      ),
      "receiver persists a UUID submissionId",
    );
    requireCheck(
      checks,
      record.attribution?.landingPath === "/pilot" &&
        record.attribution?.utmCampaign === "Household Launch" &&
        record.attribution?.utmContent === "safe-carda" &&
        record.attribution?.utmMedium === "cpc" &&
        record.attribution?.utmSource === "Paid Social" &&
        !("utmTerm" in (record.attribution ?? {})),
      "receiver persists sanitized campaign attribution without sensitive terms",
    );

    const replayRawBody = JSON.stringify(record);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const replay = await fetch(listener.url, {
      body: replayRawBody,
      headers: {
        "content-type": "application/json",
        "x-payshield-submission-id": record.submissionId,
        "x-payshield-webhook-signature": signPayShieldWebhook({
          rawBody: replayRawBody,
          secret,
          timestamp,
        }),
        "x-payshield-webhook-timestamp": timestamp,
      },
      method: "POST",
    });
    const replayBody = await parseJsonResponse(replay);

    requireCheck(
      checks,
      replay.status === 200 && replayBody?.duplicate === true,
      "receiver treats signed replay with the same submissionId as idempotent",
    );
    requireCheck(
      checks,
      (await readPersistedRecords(dataDir)).length === 1,
      "idempotent replay does not append a duplicate row",
    );

    const summary = await summarizeWaitlistData({ dataDir });
    const summaryJson = JSON.stringify(summary);

    requireCheck(
      checks,
      summary.ok === true &&
        summary.total === 1 &&
        summary.bySegment?.Household === 1 &&
        summary.byCampaign?.["Household Launch"] === 1 &&
        summary.byCampaignSource?.["Paid Social"] === 1,
      "waitlist data summary reports non-PII segment and campaign counts",
    );
    requireCheck(
      checks,
      !summaryJson.includes(testEmail) &&
        !summaryJson.includes("Rent and insurance first."),
      "waitlist data summary does not print pilot email or notes",
    );

    const eraseDryRun = await eraseWaitlistEmail({
      dataDir,
      dryRun: true,
      email: testEmail,
    });

    requireCheck(
      checks,
      eraseDryRun.dryRun === true &&
        eraseDryRun.removed === 1 &&
        eraseDryRun.remaining === 0,
      "waitlist data erase dry-run identifies the matching pilot email",
    );

    return {
      checks,
      dataDir: keepData ? dataDir : undefined,
      eraseDryRun: {
        dryRun: eraseDryRun.dryRun,
        emailHash: eraseDryRun.emailHash,
        remaining: eraseDryRun.remaining,
        removed: eraseDryRun.removed,
      },
      internalLogCounts: {
        errors: captured.errors.length,
        logs: captured.logs.length,
      },
      ok: true,
      summary: publicSafeSummary(summary),
    };
  } finally {
    restoreEnv(envSnapshot);
    await listener.close();

    if (!keepData) {
      await rm(dataDir, { recursive: true, force: true });
    }
  }
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = await runLeadCaptureDryRun({
    keepData: parsed.keepData,
  });

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Lead capture dry run failed.",
    );
    process.exit(1);
  });
}
