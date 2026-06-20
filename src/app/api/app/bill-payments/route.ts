import { NextRequest } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import {
  requireDurableCoreService,
  requiredCoreUnavailable,
} from "../../../lib/neobank/core-required.ts";

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Bill payment controls",
      service: "payshield-bill-payments",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/bill-payments",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message:
        "Bill payment controls require the dedicated PayShield core service.",
      service: "payshield-bill-payments",
    });
  } catch (error) {
    const sessionErrorResponse = appSessionErrorResponse(error);

    if (sessionErrorResponse) {
      return sessionErrorResponse;
    }

    return unauthorizedAppResponse();
  }
}
