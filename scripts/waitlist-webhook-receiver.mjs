import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const defaultPath = "/payshield-waitlist";
const defaultHealthPath = "/health";
const defaultPort = 8787;
const defaultMaxBodyBytes = 20_000;
const defaultToleranceSeconds = 300;
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

class PayloadTooLargeError extends Error {}

function jsonResponse(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function readRawBody(request, maxBodyBytes) {
  const chunks = [];
  let bytes = 0;
  let tooLarge = false;

  for await (const chunk of request) {
    bytes += chunk.length;

    if (bytes > maxBodyBytes) {
      tooLarge = true;
      continue;
    }

    chunks.push(chunk);
  }

  if (tooLarge) {
    throw new PayloadTooLargeError("Request body is too large.");
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function signPayShieldWebhook({ rawBody, secret, timestamp }) {
  return `v1=${createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`;
}

export function verifyPayShieldSignature({
  now = Math.floor(Date.now() / 1000),
  rawBody,
  secret,
  signature,
  timestamp,
  toleranceSeconds = defaultToleranceSeconds,
}) {
  if (!secret || !signature || !timestamp || !/^\d+$/.test(timestamp)) {
    return false;
  }

  if (!/^v1=[a-f0-9]{64}$/.test(signature)) {
    return false;
  }

  const ageSeconds = Math.abs(now - Number(timestamp));

  if (ageSeconds > toleranceSeconds) {
    return false;
  }

  const expected = signPayShieldWebhook({ rawBody, secret, timestamp });
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
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

function normalizeSubmission(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Webhook body must be a JSON object.");
  }

  const attribution = normalizeAttribution(value.attribution);
  const submission = {
    createdAt: cleanText(value.createdAt, 40),
    email: cleanText(value.email, 254).toLowerCase(),
    name: cleanText(value.name, 80),
    segment: cleanText(value.segment, 40),
    message: cleanText(value.message, 800),
    consentVersion: cleanText(value.consentVersion, 80),
    source: cleanText(value.source, 80),
    ...(Object.keys(attribution).length ? { attribution } : {}),
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)) {
    throw new Error("Webhook body is missing a valid email.");
  }

  if (!submission.segment || !submission.consentVersion || !submission.source) {
    throw new Error("Webhook body is missing required lead metadata.");
  }

  return submission;
}

function csvValue(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function csvRow(submission, receivedAt) {
  const attribution = submission.attribution ?? {};

  return [
    submission.createdAt,
    submission.email,
    submission.name,
    submission.segment,
    submission.message,
    submission.consentVersion,
    submission.source,
    attribution.utmSource ?? "",
    attribution.utmMedium ?? "",
    attribution.utmCampaign ?? "",
    attribution.utmContent ?? "",
    attribution.utmTerm ?? "",
    attribution.landingPath ?? "",
    receivedAt,
  ]
    .map(csvValue)
    .join(",");
}

export async function persistSubmission({ dataDir, rawBody, receivedAt }) {
  const submission = normalizeSubmission(JSON.parse(rawBody));
  const record = {
    ...submission,
    receivedAt,
  };

  await mkdir(dataDir, { recursive: true });
  await appendFile(
    join(dataDir, "waitlist.ndjson"),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );

  const csvPath = join(dataDir, "waitlist.csv");
  const header =
    "createdAt,email,name,segment,message,consentVersion,source,utmSource,utmMedium,utmCampaign,utmContent,utmTerm,landingPath,receivedAt\n";

  await appendFile(
    csvPath,
    `${existsSync(csvPath) ? "" : header}${csvRow(submission, receivedAt)}\n`,
    "utf8",
  );

  return record;
}

export function createWaitlistWebhookReceiver({
  dataDir,
  healthPath = defaultHealthPath,
  maxBodyBytes = defaultMaxBodyBytes,
  path = defaultPath,
  secret,
  toleranceSeconds = defaultToleranceSeconds,
}) {
  return createServer(async (request, response) => {
    const requestPath = request.url?.split("?")[0];

    if (request.method === "GET" && requestPath === healthPath) {
      jsonResponse(response, 200, {
        ok: true,
        service: "payshield-waitlist-receiver",
      });
      return;
    }

    if (request.method !== "POST" || requestPath !== path) {
      jsonResponse(response, 404, { error: "Not found." });
      return;
    }

    let rawBody = "";

    try {
      rawBody = await readRawBody(request, maxBodyBytes);
    } catch (error) {
      jsonResponse(response, error instanceof PayloadTooLargeError ? 413 : 400, {
        error: error instanceof Error ? error.message : "Invalid request body.",
      });
      return;
    }

    const timestamp =
      request.headers["x-payshield-webhook-timestamp"]?.toString() ?? "";
    const signature =
      request.headers["x-payshield-webhook-signature"]?.toString() ?? "";

    if (
      !verifyPayShieldSignature({
        rawBody,
        secret,
        signature,
        timestamp,
        toleranceSeconds,
      })
    ) {
      jsonResponse(response, 401, { error: "Invalid webhook signature." });
      return;
    }

    try {
      const record = await persistSubmission({
        dataDir,
        rawBody,
        receivedAt: new Date().toISOString(),
      });

      jsonResponse(response, 202, {
        ok: true,
        email: record.email,
      });
    } catch (error) {
      jsonResponse(response, 400, {
        error:
          error instanceof Error ? error.message : "Invalid waitlist submission.",
      });
    }
  });
}

export function startWaitlistWebhookReceiver({
  dataDir = process.env.PAYSHIELD_RECEIVER_DATA_DIR ??
    join(process.cwd(), "data", "waitlist"),
  healthPath = process.env.PAYSHIELD_RECEIVER_HEALTH_PATH ?? defaultHealthPath,
  maxBodyBytes = Number(
    process.env.PAYSHIELD_RECEIVER_MAX_BODY_BYTES ?? defaultMaxBodyBytes,
  ),
  path = process.env.PAYSHIELD_RECEIVER_PATH ?? defaultPath,
  port = Number(process.env.PORT ?? defaultPort),
  secret = process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET,
} = {}) {
  if (!secret) {
    throw new Error("PAYSHIELD_WAITLIST_WEBHOOK_SECRET is required.");
  }

  const server = createWaitlistWebhookReceiver({
    dataDir,
    healthPath,
    maxBodyBytes,
    path,
    secret,
  });

  server.listen(port, () => {
    console.log(
      JSON.stringify({
        dataDir,
        healthPath,
        message: "waitlist_webhook_receiver_started",
        path,
        port,
      }),
    );
  });

  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWaitlistWebhookReceiver();
}
