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
      operation: "Protected bucket unlocks",
      service: "payshield-unlocks",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/unlocks",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message:
        "Protected bucket unlocks require the dedicated PayShield core service.",
      service: "payshield-unlocks",
    });
  } catch (error) {
    const sessionErrorResponse = appSessionErrorResponse(error);

    if (sessionErrorResponse) {
      return sessionErrorResponse;
    }

    return unauthorizedAppResponse();
  }
}
