import { NextResponse } from "next/server.js";
import { getCommercialReadiness } from "../../../../lib/commercial/billing.ts";
import { coreReportsLiveMoneyReady } from "../../../../lib/neobank/core-client.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const commercial = getCommercialReadiness();
  const productReady = await coreReportsLiveMoneyReady();
  const available = commercial.paidAccessReady && productReady;

  return NextResponse.json(
    {
      available,
      membership: {
        priceLabel: commercial.priceLabel,
      },
      service: "payshield-membership-status",
      status: available ? "available" : "unavailable",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
      status: 200,
    },
  );
}
