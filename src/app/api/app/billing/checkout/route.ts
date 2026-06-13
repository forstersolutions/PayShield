import { NextRequest, NextResponse } from "next/server.js";
import { createCommercialCheckoutSession } from "../../../../lib/commercial/billing.ts";
import { getAppSession } from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";

function cleanPath(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  return trimmed.slice(0, 180);
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function checkoutIdempotencyKey(value: unknown, userId: string) {
  return cleanText(value, 120) || `checkout-${userId}`;
}

async function recordCheckoutIntent(input: {
  checkoutMode?: string;
  checkoutUrlPresent?: boolean;
  errorCode?: string;
  idempotencyKey: string;
  priceLabel?: string;
  providerCheckoutId?: string;
  session: Awaited<ReturnType<typeof getAppSession>>;
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
  try {
    const session = await getAppSession();
    const payload = (await request.json().catch(() => ({}))) as {
      cancelPath?: unknown;
      idempotencyKey?: unknown;
      successPath?: unknown;
    };
    const idempotencyKey = checkoutIdempotencyKey(
      payload.idempotencyKey,
      session.userId,
    );
    const requestedIntent = await recordCheckoutIntent({
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

    const result = await createCommercialCheckoutSession({
      cancelPath: cleanPath(payload.cancelPath, "/app?billing=cancelled"),
      email: session.email,
      origin: request.nextUrl.origin,
      successPath: cleanPath(payload.successPath, "/app?billing=active"),
      userId: session.userId,
    });
    const finalStatus =
      result.status === 200
        ? result.checkoutSessionId
          ? "created"
          : "payment_link"
        : result.status === 424
          ? "blocked"
          : "provider_error";
    const finalIntent = await recordCheckoutIntent({
      checkoutMode: result.readiness.mode,
      checkoutUrlPresent: Boolean(result.url),
      errorCode:
        result.status === 200
          ? ""
          : result.status === 424
            ? "checkout_not_configured"
            : "checkout_provider_error",
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

    const checkoutIntent =
      (finalIntent?.body.checkoutIntent as Record<string, unknown> | undefined) ??
      {
        checkoutMode: result.readiness.mode,
        checkoutUrlPresent: Boolean(result.url),
        errorCode:
          result.status === 200
            ? null
            : result.status === 424
              ? "checkout_not_configured"
              : "checkout_provider_error",
        idempotencyKey,
        priceLabel: result.readiness.priceLabel,
        providerCheckoutId: result.checkoutSessionId ?? null,
        providerName: "stripe",
        status: finalStatus,
        userId: session.userId,
      };

    return NextResponse.json(
      result.status === 200
        ? {
            checkoutIntent,
            checkoutSessionId: result.checkoutSessionId,
            corePersistence: finalIntent?.body.persistence ?? null,
            readiness: result.readiness,
            url: result.url,
          }
        : {
            checkoutIntent,
            corePersistence: finalIntent?.body.persistence ?? null,
            error:
              result.error ||
              "Commercial checkout is not configured. Add Stripe Checkout or a Stripe Payment Link.",
            readiness: result.readiness,
          },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: result.status,
      },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
