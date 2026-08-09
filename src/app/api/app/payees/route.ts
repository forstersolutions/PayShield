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

async function forwardPayeeRequest(
  request: NextRequest,
  method: "DELETE" | "PATCH" | "POST",
) {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Protected payee controls",
      service: "payshield-payees",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method,
      path: "/api/app/payees",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message:
        "Protected payee controls require the dedicated PayShield core service.",
      service: "payshield-payees",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}

export async function POST(request: NextRequest) {
  return forwardPayeeRequest(request, "POST");
}

export async function PATCH(request: NextRequest) {
  return forwardPayeeRequest(request, "PATCH");
}

export async function DELETE(request: NextRequest) {
  return forwardPayeeRequest(request, "DELETE");
}
