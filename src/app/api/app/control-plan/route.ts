import { NextRequest, NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import {
  createHouseholdMoneyControlPlan,
  normalizeMoneyControlPlanInput,
} from "../../../lib/neobank/control-plan.ts";

const noStoreHeaders = {
  "cache-control": "no-store",
};

export async function GET() {
  try {
    await getAppSession();

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
    await getAppSession();

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
