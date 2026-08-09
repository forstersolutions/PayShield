import { NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { requireCoreForSession } from "../../../lib/neobank/core-required.ts";
import { createNeobankSnapshot } from "../../../lib/neobank/demo-state.ts";
import {
  householdForSession,
  userForSession,
} from "../../../lib/neobank/session-household.ts";

export async function GET() {
  try {
    const session = await getAppSession();
    const coreRequired = requireCoreForSession(session, {
      operation: "Account profile",
      service: "payshield-app-profile",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/me",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const snapshot = createNeobankSnapshot();
    const household = householdForSession(snapshot, session);
    const user = userForSession(snapshot, session);

    return NextResponse.json(
      {
        auth: session,
        profile: {
          access: snapshot.user.profileAccess,
          audience: "US households",
          release: "commercial_control_profile",
        },
        household,
        householdId: household.householdId,
        kycStatus: user.kycStatus,
        readiness: snapshot.readiness,
        user,
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
