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
      operation: "Protected transfer intents",
      service: "payshield-transfer-intents",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/transfers",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message:
        "Protected transfer intents require the dedicated PayShield core service.",
      service: "payshield-transfer-intents",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
