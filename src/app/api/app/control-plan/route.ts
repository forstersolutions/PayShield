import { NextRequest, NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { requireCoreForSession } from "../../../lib/neobank/core-required.ts";
import {
  createHouseholdMoneyControlPlan,
  normalizeMoneyControlPlanInput,
} from "../../../lib/neobank/control-plan.ts";
import { readAppJsonPayload } from "../../../lib/neobank/request-body.ts";

const noStoreHeaders = {
  "cache-control": "no-store",
};

export async function GET() {
  try {
    const session = await getAppSession();
    const coreRequired = requireCoreForSession(session, {
      operation: "Paycheck allocation",
      service: "payshield-household-control-plan",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/control-plan",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return NextResponse.json(createHouseholdMoneyControlPlan({}, session), {
      headers: noStoreHeaders,
      status: 200,
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireCoreForSession(session, {
      operation: "Saving paycheck allocation",
      service: "payshield-household-control-plan",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/control-plan",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const payloadResult = await readAppJsonPayload(
      request,
      "payshield-household-control-plan",
    );

    if (!payloadResult.ok) {
      return payloadResult.response;
    }

    const normalized = normalizeMoneyControlPlanInput(payloadResult.payload);

    if (!normalized.ok) {
      return NextResponse.json(
        {
          errors: normalized.errors,
          service: "payshield-household-control-plan",
        },
        {
          headers: noStoreHeaders,
          status: 400,
        },
      );
    }

    return NextResponse.json(
      createHouseholdMoneyControlPlan(normalized.input, session),
      {
        headers: noStoreHeaders,
        status: 200,
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
