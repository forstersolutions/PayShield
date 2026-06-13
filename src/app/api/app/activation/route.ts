import { NextResponse } from "next/server.js";
import { getAppSession } from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { createHouseholdActivationPacket } from "../../../lib/neobank/operations.ts";

export async function GET() {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/activation",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return NextResponse.json(createHouseholdActivationPacket(session), {
      headers: {
        "cache-control": "no-store",
      },
      status: 200,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
