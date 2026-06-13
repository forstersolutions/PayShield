import { NextRequest, NextResponse } from "next/server.js";
import { requirePaidAccessForFallback } from "../../../../lib/commercial/billing.ts";
import { getAppSession } from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import { exchangeBankPublicToken } from "../../../../lib/neobank/money-rails.ts";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/bank-link/exchange",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const paidAccess = requirePaidAccessForFallback("bank token exchange");

    if (!paidAccess.ok) {
      return NextResponse.json(paidAccess.body, {
        headers: {
          "cache-control": "no-store",
        },
        status: paidAccess.status,
      });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      accountId?: unknown;
      accountMask?: unknown;
      accountName?: unknown;
      institutionName?: unknown;
      publicToken?: unknown;
    };
    const publicToken = cleanText(payload.publicToken, 240);

    if (!publicToken) {
      return NextResponse.json(
        { error: "Provide the Plaid public token returned by Link." },
        { status: 400 },
      );
    }

    const result = await exchangeBankPublicToken({
      accountId: cleanText(payload.accountId, 120),
      institutionName: cleanText(payload.institutionName, 120),
      publicToken,
    });

    if (result.status === 200 && result.bankConnection) {
      const bankConnection = result.bankConnection;
      const coreResponse = await forwardCoreRequest({
        body: {
          accountId: bankConnection.accountId,
          accountMask: cleanText(payload.accountMask, 16),
          accountName: cleanText(payload.accountName, 80),
          institutionName: bankConnection.institutionName,
          itemId: bankConnection.itemId,
          products: ["auth", "transactions"],
          providerName: "plaid",
          tokenSecretRef: bankConnection.tokenSecretRef,
        },
        method: "POST",
        path: "/api/app/bank-connections",
        session,
      });

      if (coreResponse) {
        return coreResponse;
      }
    }

    return NextResponse.json(
      result.status === 200
        ? {
            bankConnection: result.bankConnection,
            message:
              result.bankConnection?.tokenVaultStatus === "ready"
                ? "Bank link completed and vault reference is ready for background detection."
                : "Bank link completed. Configure the dedicated core token vault before background detection can run.",
            readiness: result.readiness,
            requestId: result.requestId,
          }
        : {
            error:
              "Bank link exchange requires Plaid credentials and a signed token-vault handoff.",
            readiness: result.readiness,
          },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: result.status,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Bank link exchange failed.",
      },
      { status: 502 },
    );
  }
}
