import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server.js";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { getMoneyRailReadiness } from "../../../lib/neobank/money-rails.ts";
import { getBankingProvider } from "../../../lib/neobank/provider.ts";
import { getNeobankReadiness } from "../../../lib/neobank/readiness.ts";

const maxProviderWebhookBytes = 64 * 1024;

function parseSignatureHeader(header: string) {
  const parts = header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const parsed = Object.fromEntries(
    parts.map((part) => {
      const index = part.indexOf("=");

      return index === -1
        ? [part, ""]
        : [part.slice(0, index), part.slice(index + 1)];
    }),
  );

  return {
    timestamp: parsed.t || "",
    versionOne: parsed.v1 || "",
  };
}

function providerWebhookReplayToleranceSeconds() {
  const parsed = Number(process.env.PAYSHIELD_PROVIDER_WEBHOOK_REPLAY_TOLERANCE_SECONDS);

  return Number.isInteger(parsed) && parsed >= 30 && parsed <= 900
    ? parsed
    : 300;
}

function compareHexDigest(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function providerWebhookSignatureRequired(
  readiness: ReturnType<typeof getNeobankReadiness>,
  moneyRails: ReturnType<typeof getMoneyRailReadiness>,
) {
  return Boolean(
    process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET?.trim() ||
      process.env.VERCEL_ENV === "production" ||
      process.env.PAYSHIELD_LEDGER_DATABASE_URL?.trim() ||
      readiness.liveMoneyReady ||
      (moneyRails.plaidConfigured && moneyRails.tokenVaultStoreReady),
  );
}

function verifyProviderWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  readiness: ReturnType<typeof getNeobankReadiness>,
  moneyRails: ReturnType<typeof getMoneyRailReadiness>,
) {
  const secret = process.env.PAYSHIELD_PROVIDER_WEBHOOK_SECRET?.trim() || "";
  const required = providerWebhookSignatureRequired(readiness, moneyRails);

  if (!required && !secret) {
    return {
      mode: "not_required",
      ok: true,
    };
  }

  if (!secret) {
    return {
      error:
        "PAYSHIELD_PROVIDER_WEBHOOK_SECRET is required before provider webhooks can affect money controls.",
      mode: "missing_secret",
      ok: false,
      status: 503,
    };
  }

  if (!rawBody || !signatureHeader) {
    return {
      error: "Provider webhook requires a signed raw body.",
      mode: "missing_signature",
      ok: false,
      status: 401,
    };
  }

  const signature = parseSignatureHeader(signatureHeader);
  const timestampSeconds = Number(signature.timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isInteger(timestampSeconds)) {
    return {
      error: "Provider webhook signature timestamp is invalid.",
      mode: "invalid_timestamp",
      ok: false,
      status: 401,
    };
  }

  if (
    Math.abs(nowSeconds - timestampSeconds) >
    providerWebhookReplayToleranceSeconds()
  ) {
    return {
      error: "Provider webhook signature timestamp is outside replay tolerance.",
      mode: "stale_signature",
      ok: false,
      status: 401,
    };
  }

  const expected = createHmac("sha256", secret)
    .update(`${signature.timestamp}.${rawBody}`)
    .digest("hex");

  if (!compareHexDigest(expected, signature.versionOne)) {
    return {
      error: "Provider webhook signature is invalid.",
      mode: "invalid_signature",
      ok: false,
      status: 401,
    };
  }

  return {
    mode: "verified",
    ok: true,
  };
}

export async function POST(request: NextRequest) {
  const coreResponse = await forwardCoreRequest({
    method: "POST",
    path: "/api/provider/webhooks",
    request,
  });

  if (coreResponse) {
    return coreResponse;
  }

  const rawBody = await request.text();
  const bytes = new TextEncoder().encode(rawBody).byteLength;

  if (bytes > maxProviderWebhookBytes) {
    return NextResponse.json(
      {
        error: "Request body is too large.",
        service: "payshield-provider-webhook",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: 413,
      },
    );
  }

  const readiness = getNeobankReadiness();
  const moneyRails = getMoneyRailReadiness();
  const verified = verifyProviderWebhookSignature(
    rawBody,
    request.headers.get("x-payshield-provider-signature") || "",
    readiness,
    moneyRails,
  );

  if (!verified.ok) {
    return NextResponse.json(
      {
        accepted: false,
        error: verified.error,
        mode: "blocked",
        moneyRails,
        providerWebhookAuthenticity: verified.mode,
        readiness,
        service: "payshield-provider-webhook",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: verified.status,
      },
    );
  }

  let payload: unknown = {};

  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json(
      {
        accepted: false,
        error: "Provider webhook body must be valid JSON.",
        mode: "blocked",
        service: "payshield-provider-webhook",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: 400,
      },
    );
  }
  const provider = getBankingProvider();
  const result = await provider.handleProviderWebhook(payload);

  return NextResponse.json(
    {
      ...result,
      moneyRails,
      providerWebhookAuthenticity: verified.mode,
      readiness,
      service: "payshield-provider-webhook",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
      status: result.accepted ? 202 : 400,
    },
  );
}
