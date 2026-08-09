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
import {
  createNeobankSnapshot,
} from "../../../lib/neobank/demo-state.ts";
import { householdForSession } from "../../../lib/neobank/session-household.ts";

const noStoreHeaders = {
  "cache-control": "no-store",
};
const service = "payshield-household-money-profile";

function defaultProfile() {
  return {
    bankConnectionId: null,
    detectionRuleId: null,
    employerName: "",
    expectedFrequency: "biweekly",
    nextPayday: null,
    paycheckAmountCents: 0,
    preferredPayeeId: null,
    preferredTransferBucketId: null,
    requestedTransferCents: 0,
    source: "app_control_model",
  };
}

function controlPlanInputFromProfile(profile: ReturnType<typeof defaultProfile>) {
  return {
    employerName: profile.employerName,
    expectedFrequency: profile.expectedFrequency,
    paycheckAmountCents: profile.paycheckAmountCents,
    preferredPayeeId: profile.preferredPayeeId,
    preferredTransferBucketId: profile.preferredTransferBucketId,
    requestedTransferCents: profile.requestedTransferCents,
    ruleName: `${profile.employerName || "Primary"} paycheck`,
  };
}

export async function GET() {
  try {
    const session = await getAppSession();
    const coreRequired = requireCoreForSession(session, {
      operation: "Paycheck settings",
      service,
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/money-profile",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const profile = defaultProfile();
    const snapshot = createNeobankSnapshot();
    const household = householdForSession(snapshot, session);

    return NextResponse.json(
      {
        controlPlan: createHouseholdMoneyControlPlan(
          controlPlanInputFromProfile(profile),
          session,
        ),
        householdId: household.householdId,
        message: "Paycheck settings are ready.",
        persisted: false,
        persistence: {
          persisted: false,
          persistence: "app_control_model",
        },
        profile,
        profilePersistence: "app_control_model",
        service,
      },
      {
        headers: noStoreHeaders,
        status: 200,
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireCoreForSession(session, {
      operation: "Saving paycheck settings",
      service,
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/money-profile",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const payloadResult = await readAppJsonPayload(request, service);

    if (!payloadResult.ok) {
      return payloadResult.response;
    }

    const normalized = normalizeMoneyControlPlanInput(payloadResult.payload);

    if (!normalized.ok) {
      return NextResponse.json(
        {
          errors: normalized.errors,
          service,
        },
        {
          headers: noStoreHeaders,
          status: 400,
        },
      );
    }

    const snapshot = createNeobankSnapshot();
    const household = householdForSession(snapshot, session);
    const profile = {
      bankConnectionId: null,
      detectionRuleId: null,
      employerName: normalized.input.employerName,
      expectedFrequency: normalized.input.expectedFrequency,
      nextPayday:
        typeof payloadResult.payload.nextPayday === "string"
          ? payloadResult.payload.nextPayday.trim().slice(0, 24) || null
          : null,
      paycheckAmountCents: normalized.input.paycheckAmountCents,
      preferredPayeeId: normalized.input.preferredPayeeId,
      preferredTransferBucketId: normalized.input.preferredTransferBucketId,
      requestedTransferCents: normalized.input.requestedTransferCents,
      source: "app_session_model",
    };

    return NextResponse.json(
      {
        controlPlan: createHouseholdMoneyControlPlan(normalized.input, session),
        householdId: household.householdId,
        message: "Paycheck preview updated for this session.",
        persisted: false,
        persistence: {
          persisted: false,
          persistence: "app_session_model",
          reason: "This preview is available for the current session only.",
        },
        profile,
        profilePersistence: "app_session_model",
        profileSource: "app_session_model",
        service,
      },
      {
        headers: noStoreHeaders,
        status: 200,
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
