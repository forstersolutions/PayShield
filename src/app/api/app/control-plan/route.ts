import { NextRequest, NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import {
  createHouseholdMoneyControlPlan,
  normalizeMoneyControlPlanInput,
} from "../../../lib/neobank/control-plan.ts";

const noStoreHeaders = {
  "cache-control": "no-store",
};

export async function GET() {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/control-plan",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return NextResponse.json(createHouseholdMoneyControlPlan(), {
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
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/control-plan",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const payload = (await request.json().catch(() => ({}))) as unknown;
    const normalized = normalizeMoneyControlPlanInput(payload);

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

    return NextResponse.json(createHouseholdMoneyControlPlan(normalized.input), {
      headers: noStoreHeaders,
      status: 200,
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
