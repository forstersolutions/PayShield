import { NextRequest, NextResponse } from "next/server.js";
import { getAppSession } from "../../../lib/neobank/auth.ts";
import { isBucketId, simulateUnlock } from "../../../lib/neobank/demo-state.ts";
import type { UnlockMode } from "../../../lib/neobank/types.ts";

function isUnlockMode(value: unknown): value is UnlockMode {
  return value === "slow_free" || value === "instant_fixed_fee";
}

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, 140)
    : "";
}

function toCents(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount) || amount <= 0 || amount > 200_000) {
    return null;
  }

  return amount;
}

export async function POST(request: NextRequest) {
  try {
    await getAppSession();
    const payload = (await request.json().catch(() => ({}))) as {
      amountCents?: unknown;
      bucketId?: unknown;
      idempotencyKey?: unknown;
      mode?: unknown;
      reason?: unknown;
    };
    const amountCents = toCents(payload.amountCents);
    const reason = cleanText(payload.reason);

    if (
      amountCents === null ||
      !isBucketId(payload.bucketId) ||
      payload.bucketId === "safe_spending" ||
      !isUnlockMode(payload.mode) ||
      !reason
    ) {
      return NextResponse.json(
        {
          error:
            "Provide protected bucketId, integer amountCents, mode, and reason.",
        },
        { status: 400 },
      );
    }

    const simulated = simulateUnlock({
      amountCents,
      bucketId: payload.bucketId,
      idempotencyKey:
        cleanText(payload.idempotencyKey) ||
        `unlock-${payload.bucketId}-${amountCents}`,
      mode: payload.mode,
      reason,
    });

    return NextResponse.json(
      {
        ...simulated,
        message:
          "Unlock simulated with a recovery plan. Live unlocks remain gated until provider and compliance approval.",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message !== "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
