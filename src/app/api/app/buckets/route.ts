import { NextRequest, NextResponse } from "next/server.js";
import { getAppSession } from "../../../lib/neobank/auth.ts";
import {
  createNeobankSnapshot,
  isBucketId,
  neobankBuckets,
} from "../../../lib/neobank/demo-state.ts";

function toCents(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount) || amount < 0 || amount > 500_000) {
    return null;
  }

  return amount;
}

export async function POST(request: NextRequest) {
  try {
    await getAppSession();
    const payload = (await request.json().catch(() => ({}))) as {
      bucketId?: unknown;
      targetCents?: unknown;
    };
    const targetCents = toCents(payload.targetCents);

    if (!isBucketId(payload.bucketId) || targetCents === null) {
      return NextResponse.json(
        { error: "Provide bucketId and integer targetCents." },
        { status: 400 },
      );
    }

    if (payload.bucketId === "safe_spending") {
      return NextResponse.json(
        { error: "Safe spending is always the paycheck remainder." },
        { status: 400 },
      );
    }

    const snapshot = createNeobankSnapshot();
    const modeledBuckets = neobankBuckets.map((bucket) =>
      bucket.id === payload.bucketId ? { ...bucket, targetCents } : bucket,
    );

    return NextResponse.json(
      {
        bucket: modeledBuckets.find((bucket) => bucket.id === payload.bucketId),
        message:
          "Bucket target accepted for the closed-beta model. Durable writes require the Postgres ledger backend.",
        readiness: snapshot.readiness,
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
