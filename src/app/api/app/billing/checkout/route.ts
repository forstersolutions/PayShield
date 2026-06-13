import { NextRequest, NextResponse } from "next/server.js";
import { createCommercialCheckoutSession } from "../../../../lib/commercial/billing.ts";
import { getAppSession } from "../../../../lib/neobank/auth.ts";
import { demoUser } from "../../../../lib/neobank/demo-state.ts";

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

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const payload = (await request.json().catch(() => ({}))) as {
      cancelPath?: unknown;
      successPath?: unknown;
    };
    const result = await createCommercialCheckoutSession({
      cancelPath: cleanPath(payload.cancelPath, "/app?billing=cancelled"),
      email: demoUser.email,
      origin: request.nextUrl.origin,
      successPath: cleanPath(payload.successPath, "/app?billing=active"),
      userId: session.userId,
    });

    return NextResponse.json(
      result.status === 200
        ? {
            checkoutSessionId: result.checkoutSessionId,
            readiness: result.readiness,
            url: result.url,
          }
        : {
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
