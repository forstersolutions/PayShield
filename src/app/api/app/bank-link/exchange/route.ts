import { NextRequest, NextResponse } from "next/server.js";
import { getAppSession } from "../../../../lib/neobank/auth.ts";
import { exchangeBankPublicToken } from "../../../../lib/neobank/money-rails.ts";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

export async function POST(request: NextRequest) {
  try {
    await getAppSession();
    const payload = (await request.json().catch(() => ({}))) as {
      accountId?: unknown;
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

    return NextResponse.json(
      result.status === 200
        ? {
            bankConnection: result.bankConnection,
            message:
              "Bank link completed. Persist the access token in the dedicated core secret store before background detection can run.",
            readiness: result.readiness,
            requestId: result.requestId,
          }
        : {
            error:
              "Bank link exchange requires Plaid credentials before users can connect an external account.",
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
