import { NextRequest, NextResponse } from "next/server.js";
import { simulateCardAuthorization } from "../../../lib/neobank/demo-state.ts";
import { getBankingProvider } from "../../../lib/neobank/provider.ts";
import { getNeobankReadiness } from "../../../lib/neobank/readiness.ts";

function cleanText(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().replace(/\s+/g, " ").slice(0, 120) || fallback;
}

function toCents(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount) || amount <= 0 || amount > 500_000) {
    return null;
  }

  return amount;
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    amountCents?: unknown;
    idempotencyKey?: unknown;
    merchantCategoryCode?: unknown;
    merchantName?: unknown;
    payeeId?: unknown;
  };
  const amountCents = toCents(payload.amountCents);

  if (amountCents === null) {
    return NextResponse.json(
      { error: "Provide integer amountCents." },
      { status: 400 },
    );
  }

  const input = {
    amountCents,
    idempotencyKey:
      cleanText(payload.idempotencyKey, "") ||
      `card-auth-${cleanText(payload.merchantName, "merchant")}-${amountCents}`,
    merchantCategoryCode:
      typeof payload.merchantCategoryCode === "string"
        ? cleanText(payload.merchantCategoryCode, "")
        : undefined,
    merchantName: cleanText(payload.merchantName, "Unknown merchant"),
    payeeId:
      typeof payload.payeeId === "string" ? cleanText(payload.payeeId, "") : undefined,
  };
  const readiness = getNeobankReadiness();

  if (readiness.liveMoneyReady) {
    const decision = await getBankingProvider().respondToCardAuthorization(input);

    return NextResponse.json(
      {
        decision,
        mode: "provider_gateway",
        readiness,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  const simulated = simulateCardAuthorization(input);

  return NextResponse.json(
    {
      ...simulated,
      readiness,
      service: "payshield-card-authorization",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
