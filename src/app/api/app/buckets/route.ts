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
import {
  createNeobankSnapshot,
} from "../../../lib/neobank/demo-state.ts";

export async function GET() {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/buckets",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const snapshot = createNeobankSnapshot();

    return NextResponse.json(
      {
        buckets: snapshot.buckets,
        message: "Household bucket profile loaded for rule validation.",
        persisted: false,
        profilePersistence: "stateless_model",
        profileSource: "app_template_model",
        readiness: snapshot.readiness,
        templates: [
          "Rent",
          "Mortgage",
          "Utilities",
          "Insurance",
          "Vehicle",
          "Childcare",
          "Debt payoff",
          "Emergency",
          "Taxes",
        ],
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
      operation: "Protected bucket profile changes",
      service: "payshield-bucket-controls",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/buckets",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message:
        "Protected bucket profile changes require the dedicated PayShield core service.",
      service: "payshield-bucket-controls",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
