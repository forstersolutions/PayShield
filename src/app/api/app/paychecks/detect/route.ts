import { NextRequest, NextResponse } from "next/server.js";
import { requirePaidAccessForFallback } from "../../../../lib/commercial/billing.ts";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import {
  buildBucketBalances,
  LedgerBook,
  postPaycheckDeposit,
} from "../../../../lib/neobank/ledger.ts";
import { neobankBuckets } from "../../../../lib/neobank/demo-state.ts";
import { getMoneyRailReadiness } from "../../../../lib/neobank/money-rails.ts";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function toCents(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount) || amount <= 0 || amount > 2_000_000) {
    return null;
  }

  return amount;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/paychecks/detect",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const paidAccess = requirePaidAccessForFallback("paycheck detection");

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
      employerName?: unknown;
      idempotencyKey?: unknown;
      receivedAt?: unknown;
    };
    const amountCents = toCents(payload.amountCents);
    const employerName = cleanText(payload.employerName, 80);
    const receivedAt =
      cleanText(payload.receivedAt, 32) || new Date().toISOString();

    if (amountCents === null || !employerName) {
      return NextResponse.json(
        { error: "Provide employerName and integer amountCents." },
        { status: 400 },
      );
    }

    const book = new LedgerBook();
    const entry = postPaycheckDeposit(book, neobankBuckets, {
      amountCents,
      employerName,
      idempotencyKey:
        cleanText(payload.idempotencyKey, 120) ||
        `paycheck-${employerName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}-${amountCents}`,
      receivedAt,
    });
    const balances = buildBucketBalances(book, neobankBuckets);
    const safeToSpendCents =
      balances.find((bucket) => bucket.id === "safe_spending")?.availableCents ??
      0;
    const protectedCents = balances
      .filter((bucket) => bucket.id !== "safe_spending")
      .reduce((sum, bucket) => sum + bucket.availableCents, 0);

    return NextResponse.json(
      {
        balances,
        detection: {
          amountCents,
          employerName,
          mode: getMoneyRailReadiness().detectionMode,
          receivedAt,
        },
        ledgerEntry: entry,
        message:
          "Paycheck detected and split by bucket priority before Safe to Spend is computed.",
        protectedCents,
        readiness: getMoneyRailReadiness(),
        safeToSpendCents,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
