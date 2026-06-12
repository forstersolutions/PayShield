import { NextResponse } from "next/server.js";
import { getAppSession } from "../../../lib/neobank/auth.ts";
import { createNeobankSnapshot } from "../../../lib/neobank/demo-state.ts";

export async function GET() {
  try {
    const session = await getAppSession();
    const snapshot = createNeobankSnapshot();

    return NextResponse.json(
      {
        auth: session,
        beta: {
          access: snapshot.user.betaAccess,
          audience: "US households",
          release: "closed_paid_beta",
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
