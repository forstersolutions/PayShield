import { NextRequest, NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/reconciliation/resolve",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return NextResponse.json(
      {
        code: "core_operations_required",
        error:
          "Resolving reconciliation exceptions requires the dedicated PayShield core operations store.",
        service: "payshield-reconciliation-resolution",
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
