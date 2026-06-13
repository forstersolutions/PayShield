import { NextRequest, NextResponse } from "next/server.js";
import { requirePaidAccessForFallback } from "../../../lib/commercial/billing.ts";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import {
  neobankPayees,
  simulateBillPayment,
} from "../../../lib/neobank/demo-state.ts";
import { getBankingProvider } from "../../../lib/neobank/provider.ts";

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

function cleanScheduledDate(value: unknown) {
  const scheduledFor = cleanText(value, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    return "";
  }

  return scheduledFor;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/bill-payments",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const paidAccess = requirePaidAccessForFallback("bill payment controls");

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
      idempotencyKey?: unknown;
      memo?: unknown;
      payeeId?: unknown;
      scheduledFor?: unknown;
    };
    const amountCents = toCents(payload.amountCents);
    const payeeId = cleanText(payload.payeeId, 120);
    const scheduledFor = cleanScheduledDate(payload.scheduledFor);

    if (amountCents === null || !payeeId || !scheduledFor) {
      return NextResponse.json(
        {
          error:
            "Provide payeeId, integer amountCents, and scheduledFor as YYYY-MM-DD.",
        },
        { status: 400 },
      );
    }

    const simulated = simulateBillPayment({
      amountCents,
      idempotencyKey:
        cleanText(payload.idempotencyKey, 120) ||
        `bill-${payeeId}-${amountCents}-${scheduledFor}`,
      memo: cleanText(payload.memo, 120) || undefined,
      payeeId,
      scheduledFor,
    });
    const payee = neobankPayees.find((candidate) => candidate.id === payeeId);
    const providerBillPayment =
      simulated.decision.accepted &&
      simulated.readiness.liveMoneyReady &&
      payee
        ? await getBankingProvider().createBillPayment({
            amountCents,
            idempotencyKey: simulated.ledgerEntries.at(-1)?.idempotencyKey ?? "",
            payee,
          })
        : {
            providerBillPaymentId: "bill-pay-provider-contract-required",
            status: "blocked" as const,
          };

    return NextResponse.json(
      {
        ...simulated,
        decision: {
          ...simulated.decision,
          providerStatus: providerBillPayment.status,
        },
        message: simulated.decision.accepted
          ? "Bill payment scheduled in the protected bucket model. Provider execution requires active money-movement controls."
          : "Bill payment was not scheduled.",
        providerBillPayment,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: simulated.decision.accepted ? 200 : 400,
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
