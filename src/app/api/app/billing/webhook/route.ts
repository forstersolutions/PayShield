import { NextRequest, NextResponse } from "next/server.js";
import {
  buildCommercialBillingEventPayload,
  getStripeWebhookReadiness,
  parseStripeWebhookEvent,
  summarizeStripeBillingEvent,
  verifyStripeWebhookSignature,
} from "../../../../lib/commercial/stripe-webhook.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  const signatureHeader = request.headers.get("stripe-signature") || "";
  const readiness = getStripeWebhookReadiness();

  const verified = verifyStripeWebhookSignature({
    payload,
    secret: signingSecret,
    signatureHeader,
  });

  if (!verified.ok) {
    return NextResponse.json(
      {
        error: verified.error,
        readiness,
        service: "payshield-stripe-webhook",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: readiness.signingSecretConfigured ? 400 : 503,
      },
    );
  }

  const parsed = parseStripeWebhookEvent(payload);

  if (!parsed.event) {
    return NextResponse.json(
      {
        error: parsed.error,
        service: "payshield-stripe-webhook",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: 400,
      },
    );
  }

  const summary = summarizeStripeBillingEvent(parsed.event);
  const billingEvent = buildCommercialBillingEventPayload({
    event: parsed.event,
    summary,
  });
  const coreResponse = await forwardCoreRequest({
    body: billingEvent,
    method: "POST",
    path: "/api/commercial/billing-events",
  });

  if (coreResponse) {
    return coreResponse;
  }

  return NextResponse.json(
    {
      accepted: false,
      error:
        "Stripe event verified, but paid-access state was not persisted. Configure PAYSHIELD_CORE_API_URL and PAYSHIELD_CORE_SERVICE_TOKEN so Stripe retries until core activation storage accepts the event.",
      persisted: false,
      received: false,
      service: "payshield-stripe-webhook",
      summary,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
      status: 503,
    },
  );
}
