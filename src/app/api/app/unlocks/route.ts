import { NextRequest, NextResponse } from "next/server.js";
import { requirePaidAccessForFallback } from "../../../lib/commercial/billing.ts";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
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
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/unlocks",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const paidAccess = requirePaidAccessForFallback("protected bucket unlocks");

    if (!paidAccess.ok) {
      return NextResponse.json(paidAccess.body, {
        headers: {
          "cache-control": "no-store",
        },
        status: paidAccess.status,
      });
    }

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
          "Recovery plan created. Provider execution requires active money-movement controls.",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    const sessionErrorResponse = appSessionErrorResponse(error);

    if (sessionErrorResponse) {
      return sessionErrorResponse;
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return unauthorizedAppResponse();
  }
}
