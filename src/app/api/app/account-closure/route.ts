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

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Account closure status",
      service: "payshield-account-closure",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/account-closure",
      session,
    });

    return (
      coreResponse ||
      requiredCoreUnavailable({
        message: "Account closure status requires the dedicated PayShield core service.",
        service: "payshield-account-closure",
      })
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Account closure request",
      service: "payshield-account-closure",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/account-closure",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message: "Account closure requests require the dedicated PayShield core service.",
      service: "payshield-account-closure",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
