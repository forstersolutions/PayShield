import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server.js";
import { track } from "@vercel/analytics/server";
import {
  hasPilotCampaignAttribution,
  pilotCampaignAnalyticsProperties,
  type CampaignAttribution,
} from "../../lib/pilot-analytics.ts";
import { putWaitlistBlob } from "../../lib/waitlist-blob-storage.ts";
import { getWaitlistCaptureConfig } from "../../lib/waitlist-capture-config.ts";

type WaitlistPayload = {
  attribution?: unknown;
  email?: unknown;
  name?: unknown;
  segment?: unknown;
  company?: unknown;
  message?: unknown;
  consent?: unknown;
};

type WaitlistSubmission = {
  attribution?: CampaignAttribution;
  consentText: string;
  email: string;
  name: string;
  segment: string;
  message: string;
  consentedAt: string;
  consentVersion: string;
  privacyVersion: string;
  source: string;
  submissionId: string;
  termsVersion: string;
  createdAt: string;
};

const allowedSegments = new Set([
  "Household",
  "Hourly worker",
  "Gig worker",
  "Military family",
  "Employer",
  "Investor or partner",
]);

const maxBodyBytes = 10_000;
const rateLimitMaxKeys = 500;
const rateLimitMaxRequests = 6;
const rateLimitWindowMs = 60_000;
const webhookTimeoutMs = 8_000;
const requestLog = new Map<string, number[]>();
const sensitiveFinancialTerms =
  /\b(ssn|social security|routing number|account number|card number|credit card number|debit card number)\b/i;
const longSensitiveNumber = /\b\d(?:[\s-]?\d){8,}\b/;
const emailLikeValue = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const urlLikeValue = /\b(?:https?:\/\/|www\.)/i;
const attributionFields = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
] as const;
const consentText =
  "I agree that PayShield can contact me about product onboarding and handle my information under the Privacy Notice and Terms.";
const consentVersion = "product-onboarding-contact-consent-2026-06-06";
const privacyVersion = "paycheck-planning-privacy-2026-06-06";
const termsVersion = "paycheck-planning-terms-2026-06-06";

class WaitlistConfigurationError extends Error {}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasSensitiveFinancialInfo(value: string) {
  return sensitiveFinancialTerms.test(value) || longSensitiveNumber.test(value);
}

function cleanAttributionValue(value: unknown, maxLength = 80) {
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

function cleanLandingPath(value: unknown) {
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

function cleanCampaignAttribution(value: unknown) {
  const attribution: CampaignAttribution = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return attribution;
  }

  const payload = value as Record<string, unknown>;

  for (const field of attributionFields) {
    const cleaned = cleanAttributionValue(payload[field]);

    if (cleaned) {
      attribution[field] = cleaned;
    }
  }

  const landingPath = cleanLandingPath(payload.landingPath);

  if (landingPath) {
    attribution.landingPath = landingPath;
  }

  return attribution;
}

function getClientKey(request: NextRequest) {
  const candidate =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous";

  return candidate.slice(0, 80);
}

function pruneRequestLog(windowStart: number) {
  for (const [key, timestamps] of requestLog.entries()) {
    const recent = timestamps.filter((time) => time > windowStart);

    if (recent.length) {
      requestLog.set(key, recent);
    } else {
      requestLog.delete(key);
    }
  }

  while (requestLog.size > rateLimitMaxKeys) {
    const oldestKey = requestLog.keys().next().value;

    if (!oldestKey) {
      break;
    }

    requestLog.delete(oldestKey);
  }
}

function isRateLimited(key: string) {
  const now = Date.now();
  const windowStart = now - rateLimitWindowMs;
  pruneRequestLog(windowStart);

  const recent = (requestLog.get(key) ?? []).filter((time) => time > windowStart);

  if (recent.length >= rateLimitMaxRequests) {
    requestLog.set(key, recent);
    return true;
  }

  requestLog.set(key, [...recent, now]);
  return false;
}

async function forwardToWebhook(data: WaitlistSubmission) {
  const capture = getWaitlistCaptureConfig();
  const secret = process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET?.trim() ?? "";

  if (!capture.webhookUrl) {
    if (capture.requireWebhook) {
      throw new WaitlistConfigurationError(
        "PAYSHIELD_WAITLIST_WEBHOOK_URL is required when PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true",
      );
    }

    return { mode: "demo" as const };
  }

  if (!capture.webhook || !capture.webhookEndpointConfigured) {
    throw new WaitlistConfigurationError(
      "PAYSHIELD_WAITLIST_WEBHOOK_URL must be a valid HTTPS URL without credentials, query strings, or fragments. Localhost HTTP is allowed only outside Vercel production.",
    );
  }

  if (capture.requireWebhook && !secret) {
    throw new WaitlistConfigurationError(
      "PAYSHIELD_WAITLIST_WEBHOOK_SECRET is required when PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true",
    );
  }

  const body = JSON.stringify(data);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = secret
    ? `v1=${createHmac("sha256", secret)
        .update(`${timestamp}.${body}`)
        .digest("hex")}`
    : "";

  const response = await fetch(capture.webhook.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-payshield-submission-id": data.submissionId,
      ...(signature
        ? {
            "x-payshield-webhook-signature": signature,
            "x-payshield-webhook-timestamp": timestamp,
          }
        : {}),
    },
    signal: AbortSignal.timeout(webhookTimeoutMs),
    body,
  });

  if (!response.ok) {
    throw new Error(`Webhook returned ${response.status}`);
  }

  return { mode: "webhook" as const };
}

function cleanRedisPrefix(value: string) {
  return value
    .trim()
    .replace(/[^A-Za-z0-9:_-]/g, "")
    .replace(/:+/g, ":")
    .replace(/^:+|:+$/g, "")
    .slice(0, 80) || "payshield:waitlist";
}

function leadEmailHash(email: string) {
  return createHash("sha256")
    .update(email.toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

async function storeInBlob(data: WaitlistSubmission) {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? "";

  if (!token) {
    throw new WaitlistConfigurationError(
      "BLOB_READ_WRITE_TOKEN is required when PAYSHIELD_WAITLIST_STORAGE=blob",
    );
  }

  await putWaitlistBlob({
    data,
    prefix: process.env.PAYSHIELD_WAITLIST_STORAGE_PREFIX ?? "payshield:waitlist",
    token,
  });

  return { mode: "blob" as const };
}

async function storeInUpstash(data: WaitlistSubmission) {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim() ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ?? "";

  if (!restUrl || !token) {
    throw new WaitlistConfigurationError(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required when PAYSHIELD_WAITLIST_STORAGE=upstash",
    );
  }

  const endpoint = new URL(restUrl);

  if (endpoint.protocol !== "https:") {
    throw new WaitlistConfigurationError(
      "UPSTASH_REDIS_REST_URL must use https.",
    );
  }

  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/multi-exec`;
  const prefix = cleanRedisPrefix(
    process.env.PAYSHIELD_WAITLIST_STORAGE_PREFIX ?? "payshield:waitlist",
  );
  const leadKey = `${prefix}:lead:${data.submissionId}`;
  const submissionsKey = `${prefix}:submissions`;
  const emailKey = `${prefix}:email:${leadEmailHash(data.email)}`;
  const commands = [
    ["SET", leadKey, JSON.stringify(data), "NX"],
    ["ZADD", submissionsKey, String(Date.parse(data.createdAt)), data.submissionId],
    ["SADD", emailKey, data.submissionId],
  ];
  const response = await fetch(endpoint.toString(), {
    body: JSON.stringify(commands),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(webhookTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Upstash Redis returned ${response.status}`);
  }

  const result = (await response.json().catch(() => null)) as
    | Array<{ error?: string; result?: unknown }>
    | null;
  const failedCommand = result?.find((item) => item.error);

  if (!Array.isArray(result) || failedCommand) {
    throw new Error("Upstash Redis command failed");
  }

  return { mode: "upstash" as const };
}

async function captureWaitlistSubmission(data: WaitlistSubmission) {
  const capture = getWaitlistCaptureConfig();

  if (capture.mode === "blob") {
    return storeInBlob(data);
  }

  if (capture.mode === "upstash") {
    return storeInUpstash(data);
  }

  return forwardToWebhook(data);
}

function logWaitlistEvent(
  level: "info" | "error",
  message: string,
  details: Record<string, string | number | boolean | null | undefined>,
) {
  const payload = {
    level,
    message,
    route: "/api/waitlist",
    ...details,
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  const key = getClientKey(request);

  logWaitlistEvent("info", "request_started", {
    requestId,
  });

  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (contentLength > maxBodyBytes) {
    logWaitlistEvent("info", "request_body_too_large", {
      requestId,
      ms: Date.now() - start,
    });
    return NextResponse.json(
      { error: "Request body is too large." },
      { status: 413 },
    );
  }

  if (isRateLimited(key)) {
    logWaitlistEvent("info", "request_rate_limited", {
      requestId,
      ms: Date.now() - start,
    });
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  let payload: WaitlistPayload;

  try {
    payload = (await request.json()) as WaitlistPayload;
  } catch {
    logWaitlistEvent("info", "request_invalid_json", {
      requestId,
      ms: Date.now() - start,
    });
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (cleanText(payload.company, 120)) {
    logWaitlistEvent("info", "request_filtered", {
      requestId,
      ms: Date.now() - start,
    });
    return NextResponse.json({ ok: true, mode: "filtered" });
  }

  const email = cleanText(payload.email, 254).toLowerCase();
  const name = cleanText(payload.name, 80);
  const segment = cleanText(payload.segment, 40);
  const message = cleanText(payload.message, 800);
  const consent = payload.consent === true;
  const attribution = cleanCampaignAttribution(payload.attribution);
  const analyticsAttribution = pilotCampaignAnalyticsProperties(attribution);

  if (!isValidEmail(email)) {
    logWaitlistEvent("info", "request_invalid_email", {
      requestId,
      ms: Date.now() - start,
    });
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  if (!allowedSegments.has(segment)) {
    logWaitlistEvent("info", "request_invalid_segment", {
      requestId,
      ms: Date.now() - start,
    });
    return NextResponse.json(
      { error: "Choose a contact segment." },
      { status: 400 },
    );
  }

  if (hasSensitiveFinancialInfo(`${name} ${message}`)) {
    logWaitlistEvent("info", "request_sensitive_financial_info", {
      requestId,
      segment,
      ms: Date.now() - start,
    });
    return NextResponse.json(
      {
        error:
          "Do not include bank, card, SSN, or other sensitive financial details.",
      },
      { status: 400 },
    );
  }

  if (!consent) {
    logWaitlistEvent("info", "request_missing_consent", {
      requestId,
      segment,
      ms: Date.now() - start,
    });
    return NextResponse.json(
      { error: "Accept the privacy and terms notice." },
      { status: 400 },
    );
  }

  const createdAt = new Date().toISOString();
  const submission = {
    email,
    name,
    segment,
    message,
    consentText,
    consentedAt: createdAt,
    consentVersion,
    privacyVersion,
    source: "payshield-web-app",
    submissionId: randomUUID(),
    termsVersion,
    createdAt,
    ...(Object.keys(attribution).length ? { attribution } : {}),
  };

  try {
    const result = await captureWaitlistSubmission(submission);

    await track(
      "Product Inquiry Received",
      {
        segment,
        hasName: Boolean(name),
        hasMessage: Boolean(message),
        mode: result.mode,
        ...analyticsAttribution,
      },
      {
        request: {
          headers: request.headers,
        },
      },
    ).catch(() => undefined);

    logWaitlistEvent("info", "request_completed", {
      requestId,
      segment,
      hasCampaignAttribution: hasPilotCampaignAttribution(attribution),
      mode: result.mode,
      ms: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      receiptId:
        result.mode === "blob" ||
        result.mode === "upstash" ||
        result.mode === "webhook"
          ? submission.submissionId
          : undefined,
      message:
        result.mode === "blob" ||
        result.mode === "upstash" ||
        result.mode === "webhook"
          ? "Product inquiry received."
          : "Request received in local capture mode.",
    });
  } catch (error) {
    if (error instanceof WaitlistConfigurationError) {
      await track(
        "Product Inquiry Failed",
        {
          segment,
          status: "missing_webhook",
          ...analyticsAttribution,
        },
        {
          request: {
            headers: request.headers,
          },
        },
      ).catch(() => undefined);

      logWaitlistEvent("error", "request_not_configured", {
        requestId,
        segment,
        error: error.message,
        ms: Date.now() - start,
      });
      return NextResponse.json(
        {
          error:
            "Contact capture is temporarily unavailable. Try again shortly.",
        },
        { status: 503 },
      );
    }

    logWaitlistEvent("error", "request_failed", {
      requestId,
      segment,
      error: error instanceof Error ? error.message : "Unknown error",
      ms: Date.now() - start,
    });
    return NextResponse.json(
      { error: "Unable to save this request. Try again shortly." },
      { status: 502 },
    );
  }
}
