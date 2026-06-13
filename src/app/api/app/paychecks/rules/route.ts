import { NextRequest, NextResponse } from "next/server.js";
import { requirePaidAccessForFallback } from "../../../../lib/commercial/billing.ts";
import { getAppSession } from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function toCents(value: unknown, max = 2_000_000) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount) || amount <= 0 || amount > max) {
    return null;
  }

  return amount;
}

function cleanFrequency(value: unknown) {
  const frequency = cleanText(value, 20).toLowerCase();

  return ["weekly", "biweekly", "semimonthly", "monthly", "unknown"].includes(
    frequency,
  )
    ? frequency
    : "unknown";
}

function cleanStatus(value: unknown) {
  const status = cleanText(value, 20).toLowerCase();

  return ["active", "paused", "archived"].includes(status) ? status : "active";
}

function cleanPattern(value: unknown, maxLength: number) {
  const pattern = cleanText(value, maxLength);

  return /[A-Za-z0-9]/.test(pattern) ? pattern : "";
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/paychecks/rules",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const paidAccess = requirePaidAccessForFallback("paycheck detection setup");

    if (!paidAccess.ok) {
      return NextResponse.json(paidAccess.body, {
        headers: {
          "cache-control": "no-store",
        },
        status: paidAccess.status,
      });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      employerNamePattern?: unknown;
      expectedFrequency?: unknown;
      idempotencyKey?: unknown;
      maximumAmountCents?: unknown;
      minimumAmountCents?: unknown;
      priority?: unknown;
      providerAccountId?: unknown;
      providerItemId?: unknown;
      providerName?: unknown;
      ruleName?: unknown;
      status?: unknown;
      transactionNamePattern?: unknown;
    };
    const ruleName = cleanText(payload.ruleName, 80);
    const employerNamePattern = cleanPattern(payload.employerNamePattern, 100);
    const transactionNamePattern = cleanPattern(
      payload.transactionNamePattern,
      160,
    );
    const minimumAmountCents = toCents(payload.minimumAmountCents);
    const maximumAmountProvided =
      payload.maximumAmountCents !== undefined &&
      payload.maximumAmountCents !== null &&
      payload.maximumAmountCents !== "";
    const maximumAmountCents = maximumAmountProvided
      ? toCents(payload.maximumAmountCents)
      : null;
    const priority = toCents(payload.priority ?? 100, 1000);

    if (
      !ruleName ||
      (!employerNamePattern && !transactionNamePattern) ||
      minimumAmountCents === null ||
      priority === null ||
      (maximumAmountProvided && maximumAmountCents === null)
    ) {
      return NextResponse.json(
        {
          error:
            "Provide ruleName, employerNamePattern or transactionNamePattern, and minimumAmountCents.",
          service: "payshield-paycheck-detection-rules",
        },
        { status: 400 },
      );
    }

    if (maximumAmountCents !== null && maximumAmountCents <= minimumAmountCents) {
      return NextResponse.json(
        {
          error: "maximumAmountCents must be greater than minimumAmountCents.",
          service: "payshield-paycheck-detection-rules",
        },
        { status: 400 },
      );
    }

    const providerName =
      cleanText(payload.providerName, 40).toLowerCase() || "plaid";
    const idempotencyKey =
      cleanText(payload.idempotencyKey, 120) ||
      `paycheck-rule-${ruleName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}-${providerName}`;
    const rule = {
      amountRangeCents: {
        max: maximumAmountCents,
        min: minimumAmountCents,
      },
      expectedFrequency: cleanFrequency(payload.expectedFrequency),
      idempotencyKey,
      match: {
        employerNamePattern: employerNamePattern || null,
        transactionNamePattern: transactionNamePattern || null,
      },
      priority,
      providerAccountId: cleanText(payload.providerAccountId, 160) || null,
      providerItemId: cleanText(payload.providerItemId, 160) || null,
      providerName,
      ruleName,
      status: cleanStatus(payload.status),
    };

    return NextResponse.json(
      {
        message:
          "Paycheck detection rule validated. Durable automation requires the dedicated core service.",
        persisted: false,
        persistence: {
          persisted: false,
          persistence: "memory",
          persistenceReason:
            "Paycheck detection rules require PAYSHIELD_CORE_API_URL for durable storage.",
        },
        rule,
        service: "payshield-paycheck-detection-rules",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: 200,
      },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
