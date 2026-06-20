import { NextRequest, NextResponse } from "next/server.js";
import { requirePaidAccessForFallback } from "../../../../lib/commercial/billing.ts";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import { getMoneyRailReadiness } from "../../../../lib/neobank/money-rails.ts";

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/paychecks/sync",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const paidAccess = requirePaidAccessForFallback(
      "linked-bank paycheck sync",
    );

    if (!paidAccess.ok) {
      return NextResponse.json(paidAccess.body, {
        headers: {
          "cache-control": "no-store",
        },
        status: paidAccess.status,
      });
    }

    return NextResponse.json(
      {
        error:
          "Linked-bank paycheck sync requires Plaid credentials, signed token-vault handoff, encrypted token custody, and durable Postgres ledger storage.",
        readiness: getMoneyRailReadiness(),
        service: "payshield-paycheck-transaction-sync",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: 424,
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
