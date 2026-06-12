import { NextResponse } from "next/server.js";
import { getAppSession } from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { createNeobankSnapshot } from "../../../lib/neobank/demo-state.ts";

export async function GET() {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/me",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const snapshot = createNeobankSnapshot();

    return NextResponse.json(
      {
        auth: session,
        profile: {
          access: snapshot.user.profileAccess,
          audience: "US households",
          release: "commercial_control_profile",
        },
        householdId: snapshot.householdId,
        kycStatus: snapshot.user.kycStatus,
        readiness: snapshot.readiness,
        user: snapshot.user,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
