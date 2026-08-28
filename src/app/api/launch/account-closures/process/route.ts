import { NextRequest, NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  unauthorizedAppResponse,
} from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import {
  getOperatorSession,
  operatorAccessDeniedResponse,
} from "../../../../lib/neobank/operator-auth.ts";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getOperatorSession();
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      operator: true,
      path: "/api/launch/account-closures/process",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return NextResponse.json(
      {
        code: "core_operations_required",
        error: "Account closure processing requires the dedicated PayShield core service.",
        service: "payshield-account-closure-worker",
      },
      {
        headers: { "cache-control": "no-store" },
        status: 424,
      },
    );
  } catch (error) {
    return (
      operatorAccessDeniedResponse(error) ??
      appSessionErrorResponse(error) ??
      unauthorizedAppResponse()
    );
  }
}
