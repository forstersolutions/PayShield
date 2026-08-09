import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server.js";
import { createCommercialCheckoutSession } from "../../../../lib/commercial/billing.ts";
import { checkPublicCheckoutRateLimit } from "../../../../lib/commercial/public-checkout-rate-limit.ts";
import { readCommercialCheckoutPayload } from "../../../../lib/commercial/request-body.ts";
import type { AppSession } from "../../../../lib/neobank/auth.ts";
import {
  coreReportsLiveMoneyReady,
  forwardCoreRequest,
} from "../../../../lib/neobank/core-client.ts";
import { requireDurableCoreService } from "../../../../lib/neobank/core-required.ts";
import { payShieldUserIdForEmail } from "../../../../lib/neobank/identity.ts";

export const dynamic = "force-dynamic";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function cleanPath(value: unknown, fallback: string) {
  const path = cleanText(value, 180);

  if (!path.startsWith("/") || path.startsWith("//")) {
    return fallback;
  }

  return path;
}

function wantsHtml(request: NextRequest) {
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function publicCheckoutReadiness(readiness: {
  mode: string;
  priceLabel: string;
}) {
  return {
    mode: readiness.mode,
    priceLabel: readiness.priceLabel,
  };
}

async function publicCheckoutPayload(request: NextRequest) {
  return readCommercialCheckoutPayload(request, "payshield-public-checkout");
}

async function recordPublicCheckoutIntent(input: {
  checkoutMode?: string;
  checkoutUrlPresent?: boolean;
  errorCode?: string;
  idempotencyKey: string;
  priceLabel?: string;
  providerCheckoutId?: string;
  session: AppSession;
  status: string;
}) {
  const coreResponse = await forwardCoreRequest({
    body: {
      checkoutMode: input.checkoutMode,
      checkoutUrlPresent: Boolean(input.checkoutUrlPresent),
      errorCode: input.errorCode,
      idempotencyKey: input.idempotencyKey,
      priceLabel: input.priceLabel,
      providerCheckoutId: input.providerCheckoutId,
      providerName: "stripe",
      status: input.status,
    },
    method: "POST",
    path: "/api/app/billing/checkout",
    session: input.session,
  });

  if (!coreResponse) {
    return null;
  }

  const body = (await coreResponse.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  return {
    body,
    ok: coreResponse.ok,
    status: coreResponse.status,
  };
}

export async function POST(request: NextRequest) {
  const payloadResult = await publicCheckoutPayload(request);

  if (!payloadResult.ok) {
    return payloadResult.response;
  }

  const payload = payloadResult.payload;
  const email = cleanText(payload.email, 160).toLowerCase();
  const userId = payShieldUserIdForEmail(email);

  if (!userId) {
    return NextResponse.json(
      {
        error: "Provide a valid email address before starting PayShield checkout.",
        service: "payshield-public-checkout",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: 400,
      },
    );
  }

  const coreRequired = requireDurableCoreService({
    operation: "Starting membership",
    service: "payshield-public-checkout",
  });

  if (coreRequired) {
    return coreRequired;
  }

  const rateLimit = checkPublicCheckoutRateLimit(request, userId);

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        error: "Too many membership attempts. Please wait a minute and try again.",
        service: "payshield-public-checkout",
      },
      {
        headers: {
          "cache-control": "no-store",
          "retry-after": String(rateLimit.retryAfterSeconds),
        },
        status: 429,
      },
    );
  }

  const session: AppSession = {
    authMode: "public_checkout",
    email,
    name: cleanText(payload.name, 120) || "PayShield household",
    userId,
  };
  const idempotencyKey =
    cleanText(payload.idempotencyKey, 120) ||
    `public-checkout-${userId}-${randomUUID()}`;
  const requestedIntent = await recordPublicCheckoutIntent({
    idempotencyKey,
    session,
    status: "requested",
  });

  if (requestedIntent && !requestedIntent.ok) {
    return NextResponse.json(requestedIntent.body, {
      headers: {
        "cache-control": "no-store",
      },
      status: requestedIntent.status,
    });
  }

  const productReady = await coreReportsLiveMoneyReady();
  const result = await createCommercialCheckoutSession({
    cancelPath: cleanPath(payload.cancelPath, "/?billing=cancelled"),
    email,
    idempotencyKey,
    origin: request.nextUrl.origin,
    productReady,
    requireAccessActivation: true,
    requireCheckoutSession: true,
    requireProductReady: true,
    successPath: cleanPath(payload.successPath, "/app?billing=active"),
    userId,
  });
  const finalStatus =
    result.status === 200
      ? "created"
      : result.status === 424
        ? "blocked"
        : "provider_error";
  const finalIntent = await recordPublicCheckoutIntent({
    checkoutMode: result.readiness.mode,
    checkoutUrlPresent: Boolean(result.url),
    errorCode:
      result.status === 200
        ? ""
        : (result.errorCode ??
          (result.status === 424
            ? "checkout_not_configured"
            : "checkout_provider_error")),
    idempotencyKey,
    priceLabel: result.readiness.priceLabel,
    providerCheckoutId: result.checkoutSessionId,
    session,
    status: finalStatus,
  });

  if (finalIntent && !finalIntent.ok) {
    return NextResponse.json(finalIntent.body, {
      headers: {
        "cache-control": "no-store",
      },
      status: finalIntent.status,
    });
  }

  if (result.status === 200 && result.url && wantsHtml(request)) {
    return NextResponse.redirect(result.url, {
      headers: {
        "cache-control": "no-store",
      },
      status: 303,
    });
  }

  return NextResponse.json(
    result.status === 200
      ? {
          checkoutIntent:
            finalIntent?.body.checkoutIntent ??
            {
              checkoutMode: result.readiness.mode,
              checkoutUrlPresent: Boolean(result.url),
              idempotencyKey,
              priceLabel: result.readiness.priceLabel,
              providerCheckoutId: result.checkoutSessionId ?? null,
              providerName: "stripe",
              status: finalStatus,
              userId,
            },
          checkoutSessionId: result.checkoutSessionId,
          corePersistence: finalIntent?.body.persistence ?? null,
          readiness: publicCheckoutReadiness(result.readiness),
          service: "payshield-public-checkout",
          url: result.url,
        }
      : {
          checkoutIntent:
            finalIntent?.body.checkoutIntent ??
            {
              checkoutMode: result.readiness.mode,
              checkoutUrlPresent: false,
              errorCode: result.errorCode ?? "checkout_not_configured",
              idempotencyKey,
              priceLabel: result.readiness.priceLabel,
              providerCheckoutId: null,
              providerName: "stripe",
              status: finalStatus,
              userId,
            },
          corePersistence: finalIntent?.body.persistence ?? null,
          error:
            result.status === 424
              ? "Membership signup is temporarily unavailable."
              : "Membership checkout could not be started.",
          readiness: publicCheckoutReadiness(result.readiness),
          service: "payshield-public-checkout",
        },
    {
      headers: {
        "cache-control": "no-store",
      },
      status: result.status,
    },
  );
}
