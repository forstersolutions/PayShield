import { NextRequest, NextResponse } from "next/server.js";
import { requirePaidAccessForFallback } from "../../../lib/commercial/billing.ts";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import {
  createNeobankSnapshot,
  isBucketId,
} from "../../../lib/neobank/demo-state.ts";
import { getBankingProvider } from "../../../lib/neobank/provider.ts";
import { buildTransferIntent } from "../../../lib/neobank/money-rails.ts";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

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
      path: "/api/app/transfers",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const paidAccess = requirePaidAccessForFallback("protected transfers");

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
      destinationPayeeId?: unknown;
      idempotencyKey?: unknown;
      sourceBucketId?: unknown;
    };
    const amountCents = toCents(payload.amountCents);
    const destinationPayeeId = cleanText(payload.destinationPayeeId, 120);

    if (
      amountCents === null ||
      !isBucketId(payload.sourceBucketId) ||
      !destinationPayeeId
    ) {
      return NextResponse.json(
        {
          error:
            "Provide sourceBucketId, destinationPayeeId, and integer amountCents.",
        },
        { status: 400 },
      );
    }

    const snapshot = createNeobankSnapshot();
    const sourceBucket = snapshot.buckets.find(
      (bucket) => bucket.id === payload.sourceBucketId,
    );

    if (!sourceBucket || amountCents > sourceBucket.availableCents) {
      return NextResponse.json(
        {
          error: "Transfer amount exceeds the selected bucket balance.",
          sourceBucket,
        },
        { status: 400 },
      );
    }

    const idempotencyKey =
      cleanText(payload.idempotencyKey, 120) ||
      `transfer-${payload.sourceBucketId}-${destinationPayeeId}-${amountCents}`;
    const intent = buildTransferIntent({
      amountCents,
      destinationPayeeId,
      idempotencyKey,
      sourceBucketId: payload.sourceBucketId,
    });
    const providerTransfer = await getBankingProvider().createAchTransfer({
      amountCents,
      destinationPayeeId,
      idempotencyKey,
      sourceBucketId: payload.sourceBucketId,
    });

    return NextResponse.json(
      {
        intent,
        message:
          providerTransfer.status === "created"
            ? "Protected transfer created with the configured provider."
            : "Transfer intent validated. Provider execution remains locked until approved money-rail credentials are active.",
        providerTransfer,
        sourceBucket,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: 200,
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
