import { NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { requireCoreForSession } from "../../../lib/neobank/core-required.ts";
import { createHouseholdActivationPacket } from "../../../lib/neobank/operations.ts";

export async function GET() {
  try {
    const session = await getAppSession();
    const coreRequired = requireCoreForSession(session, {
      operation: "Account activation status",
      service: "payshield-activation-console",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/activation",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return NextResponse.json(createHouseholdActivationPacket(session), {
      headers: {
        "cache-control": "no-store",
      },
      status: 200,
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
