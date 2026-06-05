import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server.js";
import { track } from "@vercel/analytics/server";

type WaitlistPayload = {
  attribution?: unknown;
  email?: unknown;
  name?: unknown;
  segment?: unknown;
  company?: unknown;
  message?: unknown;
  consent?: unknown;
};

type CampaignAttribution = {
  landingPath?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmMedium?: string;
  utmSource?: string;
  utmTerm?: string;
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
  "I agree that PayShield can contact me about the pilot and handle my information under the Privacy Notice and Terms.";
const consentVersion = "pilot-contact-consent-2026-06-05";
const privacyVersion = "pilot-privacy-2026-06-05";
const termsVersion = "pilot-terms-2026-06-05";

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

function hasCampaignAttribution(attribution: CampaignAttribution) {
  return Boolean(
    attribution.utmSource ||
      attribution.utmMedium ||
      attribution.utmCampaign ||
      attribution.utmContent ||
      attribution.utmTerm,
  );
}

function campaignAnalyticsProperties(attribution: CampaignAttribution) {
  const properties: Record<string, string | boolean> = {
    hasCampaignAttribution: hasCampaignAttribution(attribution),
  };

  if (attribution.utmSource) {
    properties.campaignSource = attribution.utmSource;
  }

  if (attribution.utmMedium) {
    properties.campaignMedium = attribution.utmMedium;
  }

  if (attribution.utmCampaign) {
    properties.campaignName = attribution.utmCampaign;
  }

  return properties;
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
  const webhookUrl = process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
  const requireWebhook = process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK === "true";
  const secret = process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET?.trim() ?? "";

  if (!webhookUrl) {
    if (requireWebhook) {
      throw new WaitlistConfigurationError(
        "PAYSHIELD_WAITLIST_WEBHOOK_URL is required when PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK=true",
      );
    }

    return { mode: "demo" as const };
  }

  if (requireWebhook && !secret) {
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

  const response = await fetch(webhookUrl, {
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
  const analyticsAttribution = campaignAnalyticsProperties(attribution);

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
      { error: "Choose a pilot segment." },
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
      { error: "Accept the pilot privacy and terms notice." },
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
    source: "payshield-market-site",
    submissionId: randomUUID(),
    termsVersion,
    createdAt,
    ...(Object.keys(attribution).length ? { attribution } : {}),
  };

  try {
    const result = await forwardToWebhook(submission);

    await track(
      "Pilot Request Received",
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
      hasCampaignAttribution: hasCampaignAttribution(attribution),
      mode: result.mode,
      ms: Date.now() - start,
    });

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      message:
        result.mode === "webhook"
          ? "Pilot request received."
          : "Prototype request accepted for this walkthrough. Pilot capture opens when production lead storage is enabled.",
    });
  } catch (error) {
    if (error instanceof WaitlistConfigurationError) {
      await track(
        "Pilot Request Failed",
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
            "Pilot request capture is temporarily unavailable. Try again shortly.",
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
