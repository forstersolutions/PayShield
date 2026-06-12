import { NextResponse } from "next/server.js";
import { getAppSession } from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { createNeobankSnapshot } from "../../../lib/neobank/demo-state.ts";

export async function GET() {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/balances",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const snapshot = createNeobankSnapshot();
    const safeSpend = snapshot.buckets.find(
      (bucket) => bucket.id === "safe_spending",
    );

    return NextResponse.json(
      {
        buckets: snapshot.buckets,
        card: snapshot.card,
        directDeposit: snapshot.directDeposit,
        protectedCents: snapshot.buckets
          .filter((bucket) => bucket.id !== "safe_spending")
          .reduce((sum, bucket) => sum + bucket.availableCents, 0),
        readiness: snapshot.readiness,
        safeToSpendCents: safeSpend?.availableCents ?? 0,
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
