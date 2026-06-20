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
      operation: "Linked-bank paycheck sync",
      service: "payshield-paycheck-transaction-sync",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/paychecks/sync",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message:
        "Linked-bank paycheck sync requires the dedicated PayShield core service.",
      service: "payshield-paycheck-transaction-sync",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
