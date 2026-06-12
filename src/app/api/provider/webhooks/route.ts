import { NextRequest, NextResponse } from "next/server.js";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { getBankingProvider } from "../../../lib/neobank/provider.ts";
import { getNeobankReadiness } from "../../../lib/neobank/readiness.ts";

export async function POST(request: NextRequest) {
  const coreResponse = await forwardCoreRequest({
    method: "POST",
    path: "/api/provider/webhooks",
    request,
  });

  if (coreResponse) {
    return coreResponse;
  }

  const payload = await request.json().catch(() => ({}));
  const provider = getBankingProvider();
  const result = await provider.handleProviderWebhook(payload);
  const readiness = getNeobankReadiness();

  return NextResponse.json(
    {
      ...result,
      readiness,
      service: "payshield-provider-webhook",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
      status: result.accepted ? 202 : 400,
    },
  );
}
