import { NextRequest, NextResponse } from "next/server.js";
import { requirePaidAccessForFallback } from "../../../lib/commercial/billing.ts";
import { getAppSession } from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { createNeobankSnapshot } from "../../../lib/neobank/demo-state.ts";
import { getBankingProvider } from "../../../lib/neobank/provider.ts";
import { assertLiveMoneyReady } from "../../../lib/neobank/readiness.ts";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const payload = (await request.json().catch(() => ({}))) as {
      idempotencyKey?: unknown;
      providerAccountId?: unknown;
      providerCustomerId?: unknown;
      providerName?: unknown;
    };
    const coreResponse = await forwardCoreRequest({
      body: {
        idempotencyKey: cleanText(payload.idempotencyKey, 120),
        providerAccountId: cleanText(payload.providerAccountId, 160),
        providerCustomerId: cleanText(payload.providerCustomerId, 160),
        providerName: cleanText(payload.providerName, 40),
      },
      method: "POST",
      path: "/api/app/direct-deposit",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const paidAccess = requirePaidAccessForFallback("direct deposit setup");

    if (!paidAccess.ok) {
      return NextResponse.json(paidAccess.body, {
        headers: {
          "cache-control": "no-store",
        },
        status: paidAccess.status,
      });
    }

    const snapshot = createNeobankSnapshot();
    const liveMoney = assertLiveMoneyReady(snapshot.readiness);
    const provider = getBankingProvider();
    const directDeposit = await provider.createDirectDepositInstructions({
      providerAccountId:
        cleanText(payload.providerAccountId, 160) ||
        (liveMoney.ok
          ? "financial-account-live"
          : "financial-account-provider-contract-required"),
    });

    return NextResponse.json(
      {
        directDeposit,
        liveMoney,
        message: liveMoney.ok
          ? "Paycheck routing instructions are ready for the configured provider account."
          : "Paycheck routing setup recorded. Provider activation is required before live instructions are released.",
        persisted: false,
        persistence: {
          persisted: false,
          persistence: "memory",
          persistenceReason:
            "Direct deposit setup requires PAYSHIELD_CORE_API_URL for durable storage.",
        },
        readiness: snapshot.readiness,
        service: "payshield-direct-deposit-setup",
        setup: {
          accountLast4: directDeposit.accountLast4,
          accountName: directDeposit.accountName,
          idempotencyKey:
            cleanText(payload.idempotencyKey, 120) ||
            `direct-deposit-${session.userId}`,
          providerAccountId: cleanText(payload.providerAccountId, 160) || null,
          providerCustomerId: cleanText(payload.providerCustomerId, 160) || null,
          providerName: cleanText(payload.providerName, 40) || "payshield",
          providerStatus: directDeposit.providerStatus,
          routingLast4: directDeposit.routingLast4,
          status: liveMoney.ok ? "ready" : "blocked",
        },
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: liveMoney.ok ? 200 : 423,
      },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
