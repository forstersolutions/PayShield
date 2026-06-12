import { NextResponse } from "next/server.js";
import { getAppSession } from "../../../lib/neobank/auth.ts";
import { createNeobankSnapshot } from "../../../lib/neobank/demo-state.ts";

export async function GET() {
  try {
    await getAppSession();
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
