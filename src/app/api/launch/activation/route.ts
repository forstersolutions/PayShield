import { NextResponse } from "next/server.js";
import { createHouseholdActivationPacket } from "../../../lib/neobank/operations.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { requireCoreForSession } from "../../../lib/neobank/core-required.ts";
import {
  getOperatorSession,
  operatorAccessDeniedResponse,
} from "../../../lib/neobank/operator-auth.ts";
import {
  appSessionErrorResponse,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getOperatorSession();
    const coreRequired = requireCoreForSession(session, {
      operation: "Operator activation status",
      service: "payshield-operator-activation",
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
    return (
      operatorAccessDeniedResponse(error) ??
      appSessionErrorResponse(error) ??
      unauthorizedAppResponse()
    );
  }
}
