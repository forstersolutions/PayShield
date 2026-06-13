import { NextResponse } from "next/server.js";
import { getAppSession } from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import { createHouseholdOperationsPacket } from "../../../../lib/neobank/operations.ts";

export async function GET() {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/billing/status",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const packet = createHouseholdOperationsPacket(session);

    return NextResponse.json(
      {
        commercialAccess: packet.commercialAccess,
        household: packet.household,
        readiness: {
          checkoutConfigured: packet.commercialAccess.readyForCheckout,
          mode: packet.commercialAccess.mode,
          priceLabel: packet.commercialAccess.priceLabel,
        },
        service: "payshield-billing-status",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: 200,
      },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
