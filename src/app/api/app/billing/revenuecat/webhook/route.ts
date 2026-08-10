import { NextRequest, NextResponse } from "next/server.js";

import { readCommercialRawPayload } from "../../../../../lib/commercial/request-body.ts";
import {
  buildRevenueCatBillingEventPayload,
  getRevenueCatWebhookReadiness,
  parseRevenueCatWebhook,
  summarizeRevenueCatBillingEvent,
  verifyRevenueCatAuthorization,
} from "../../../../../lib/commercial/revenuecat-webhook.ts";
import { forwardCoreRequest } from "../../../../../lib/neobank/core-client.ts";

export const dynamic = "force-dynamic";

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

export async function POST(request: NextRequest) {
  const readiness = getRevenueCatWebhookReadiness();
  const payloadResult = await readCommercialRawPayload(
    request,
    "payshield-revenuecat-webhook",
  );

  if (!payloadResult.ok) {
    return payloadResult.response;
  }

  const authorization = verifyRevenueCatAuthorization({
    authorization: request.headers.get("authorization") || "",
    secret: process.env.PAYSHIELD_REVENUECAT_WEBHOOK_SECRET || "",
  });

  if (!authorization.ok) {
    return noStoreJson(
      {
        error: authorization.error,
        readiness,
        service: "payshield-revenuecat-webhook",
      },
      readiness.authorizationConfigured ? 401 : 503,
    );
  }

  const parsed = parseRevenueCatWebhook(payloadResult.text);

  if (!parsed.event || !parsed.envelope || !parsed.eventId || !parsed.eventType) {
    return noStoreJson(
      {
        error: parsed.error,
        service: "payshield-revenuecat-webhook",
      },
      400,
    );
  }

  const summary = summarizeRevenueCatBillingEvent({
    entitlementId: readiness.entitlementId,
    event: parsed.event,
    eventId: parsed.eventId,
    eventType: parsed.eventType,
  });
  const coreResponse = await forwardCoreRequest({
    body: buildRevenueCatBillingEventPayload({
      envelope: parsed.envelope,
      summary,
    }),
    method: "POST",
    path: "/api/commercial/billing-events",
  });

  if (coreResponse) {
    return coreResponse;
  }

  return noStoreJson(
    {
      accepted: false,
      error:
        "RevenueCat event authenticated, but household access was not persisted. Configure the PayShield core service so RevenueCat can retry this event.",
      persisted: false,
      received: false,
      service: "payshield-revenuecat-webhook",
      summary,
    },
    503,
  );
}
