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
      operation: "Paycheck detection",
      service: "payshield-paycheck-detection",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/paychecks/detect",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message: "Paycheck detection requires the dedicated PayShield core service.",
      service: "payshield-paycheck-detection",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
