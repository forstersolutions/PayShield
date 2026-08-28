import { NextRequest, NextResponse } from "next/server.js";
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
import { createHouseholdOperationsPacket } from "../../../lib/neobank/operations.ts";

export async function GET() {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/bank-connections",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const packet = createHouseholdOperationsPacket(session);

    return NextResponse.json(
      {
        bankConnections: packet.operations.bankConnections,
        count: packet.operations.bankConnections.length,
        message: "Connected bank sources loaded for this household.",
        readiness: packet.moneyRails,
        service: "payshield-bank-connections",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Bank connection record storage",
      service: "payshield-bank-connections",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/bank-connections",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message:
        "Bank connection record storage requires the dedicated PayShield core service.",
      service: "payshield-bank-connections",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Bank connection revocation",
      service: "payshield-bank-connections",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "DELETE",
      path: "/api/app/bank-connections",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message: "Bank connection revocation requires the dedicated PayShield core service.",
      service: "payshield-bank-connections",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
