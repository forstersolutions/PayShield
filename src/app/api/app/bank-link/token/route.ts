import { NextRequest, NextResponse } from "next/server.js";
import { getAppSession } from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import { createBankLinkToken } from "../../../../lib/neobank/money-rails.ts";

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      body: {
        origin: request.nextUrl.origin,
      },
      method: "POST",
      path: "/api/app/bank-link/token",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const result = await createBankLinkToken({
      origin: request.nextUrl.origin,
      userId: session.userId,
    });

    return NextResponse.json(
      result.status === 200
        ? {
            expiration: result.expiration,
            linkToken: result.linkToken,
            readiness: result.readiness,
            requestId: result.requestId,
          }
        : {
            error:
              "Bank linking requires Plaid credentials and a signed token-vault handoff before users can connect an external account.",
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
            : "Bank link token could not be created.",
      },
      { status: 502 },
    );
  }
}
