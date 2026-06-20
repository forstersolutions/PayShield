import { NextRequest } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import {
  requireDurableCoreService,
  requiredCoreUnavailable,
} from "../../../../lib/neobank/core-required.ts";

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Bank account connection",
      service: "payshield-bank-link-token",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      body: {
        origin: request.nextUrl.origin,
      },
      method: "POST",
      path: "/api/app/bank-link/token",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message: "Bank account connection requires the dedicated PayShield core service.",
      service: "payshield-bank-link-token",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
