import { NextRequest, NextResponse } from "next/server.js";
import { getAppSession } from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import {
  createNeobankSnapshot,
  isBucketId,
} from "../../../lib/neobank/demo-state.ts";

const cleanName = (value: unknown) =>
  typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 80)
    : "";

function toCents(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount) || amount <= 0 || amount > 500_000) {
    return null;
  }

  return amount;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/payees",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const payload = (await request.json().catch(() => ({}))) as {
      allowedBucketId?: unknown;
      maxCents?: unknown;
      name?: unknown;
    };
    const name = cleanName(payload.name);
    const maxCents = toCents(payload.maxCents);

    if (!name || !isBucketId(payload.allowedBucketId) || maxCents === null) {
      return NextResponse.json(
        { error: "Provide name, allowedBucketId, and integer maxCents." },
        { status: 400 },
      );
    }

    if (payload.allowedBucketId === "safe_spending") {
      return NextResponse.json(
        { error: "Payee controls are for protected buckets." },
        { status: 400 },
      );
    }

    const snapshot = createNeobankSnapshot();
    const payee = {
      allowedBucketId: payload.allowedBucketId,
      id: `payee_modeled_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      maxCents,
      name,
      status: snapshot.readiness.liveMoneyReady ? "approved" : "provider_pending",
    };

    return NextResponse.json(
      {
        message:
          "Payee modeled. Provider approval is required before real bill routing.",
        payee,
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
