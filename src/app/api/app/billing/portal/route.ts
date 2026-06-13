import { NextRequest, NextResponse } from "next/server.js";
import { createCommercialPortalSession } from "../../../../lib/commercial/billing.ts";
import { getAppSession } from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import { createHouseholdOperationsPacket } from "../../../../lib/neobank/operations.ts";

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

function commercialAccessFromPayload(payload: Record<string, unknown>) {
  const commercialAccess = payload.commercialAccess;

  return commercialAccess &&
    typeof commercialAccess === "object" &&
    !Array.isArray(commercialAccess)
    ? (commercialAccess as Record<string, unknown>)
    : {};
}

function providerCustomerIdFromAccess(access: Record<string, unknown>) {
  const value = access.providerCustomerId;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function loadBillingStatus(session: Awaited<ReturnType<typeof getAppSession>>) {
  const coreResponse = await forwardCoreRequest({
    method: "GET",
    path: "/api/app/billing/status",
    session,
  });

  if (coreResponse) {
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

  const packet = createHouseholdOperationsPacket(session);

  return {
    body: {
      commercialAccess: packet.commercialAccess,
      household: packet.household,
      service: "payshield-billing-status",
    },
    ok: true,
    status: 200,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const payload = (await request.json().catch(() => ({}))) as {
      returnPath?: unknown;
    };
    const billingStatus = await loadBillingStatus(session);

    if (!billingStatus.ok) {
      return NextResponse.json(billingStatus.body, {
        headers: {
          "cache-control": "no-store",
        },
        status: billingStatus.status,
      });
    }

    const commercialAccess = commercialAccessFromPayload(billingStatus.body);
    const result = await createCommercialPortalSession({
      customerId: providerCustomerIdFromAccess(commercialAccess),
      origin: request.nextUrl.origin,
      returnPath: cleanPath(payload.returnPath, "/app?billing=manage"),
    });

    return NextResponse.json(
      result.status === 200
        ? {
            commercialAccess,
            portalSessionId: result.portalSessionId,
            readiness: result.readiness,
            url: result.url,
          }
        : {
            commercialAccess,
            error: result.error || "Billing portal is not ready.",
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
