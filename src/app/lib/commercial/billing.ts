import { getStripeWebhookReadiness } from "./stripe-webhook.ts";

const stripeApiVersion = "2026-02-25.clover";

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

function envTrue(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function cleanBaseUrl(value: string | undefined) {
  if (!value?.trim()) {
    return "";
  }

  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");

    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function formBody(input: Record<string, string>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value) {
      params.set(key, value);
    }
  }

  return params;
}

export function getCommercialReadiness() {
  const webhook = getStripeWebhookReadiness();
  const paymentLinkUrl =
    process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL?.trim() || "";
  const stripeSecretConfigured = envPresent("STRIPE_SECRET_KEY");
  const stripePriceConfigured = envPresent("PAYSHIELD_COMMERCIAL_PRICE_ID");
  const checkoutConfigured =
    Boolean(paymentLinkUrl) || (stripeSecretConfigured && stripePriceConfigured);
  const missing: string[] = [];

  if (!checkoutConfigured) {
    if (!stripeSecretConfigured) {
      missing.push("STRIPE_SECRET_KEY");
    }

    if (!stripePriceConfigured && !paymentLinkUrl) {
      missing.push(
        "PAYSHIELD_COMMERCIAL_PRICE_ID or PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
      );
    }
  }

  if (!webhook.signingSecretConfigured) {
    missing.push("STRIPE_WEBHOOK_SECRET");
  }

  return {
    checkoutConfigured,
    missing,
    mode: paymentLinkUrl ? "payment_link" : stripeSecretConfigured ? "checkout" : "not_configured",
    priceLabel:
      process.env.PAYSHIELD_COMMERCIAL_PRICE_LABEL?.trim() ||
      "$19/month",
    paidAccessReady: checkoutConfigured && webhook.signingSecretConfigured,
    stripePriceConfigured,
    stripeSecretConfigured,
    webhookEndpointPath: webhook.endpointPath,
    webhookSigningSecretConfigured: webhook.signingSecretConfigured,
  };
}

export function paidAccessRequired() {
  const readiness = getCommercialReadiness();

  return {
    readiness,
    required:
      envTrue("PAYSHIELD_REQUIRE_PAID_ACCESS") || readiness.checkoutConfigured,
  };
}

export function requirePaidAccessForFallback(operation: string) {
  const { readiness, required } = paidAccessRequired();

  if (!required) {
    return {
      ok: true as const,
      readiness,
    };
  }

  return {
    body: {
      code: readiness.paidAccessReady
        ? "paid_access_state_unverified"
        : "paid_access_not_configured",
      error: readiness.paidAccessReady
        ? `Paid access must be active before ${operation}. Configure PAYSHIELD_CORE_API_URL so Stripe webhooks can activate household access before this workflow runs.`
        : `Paid access must be fully configured before ${operation}.`,
      readiness,
      service: "payshield-paid-access-gate",
    },
    ok: false as const,
    status: 402,
  };
}

export async function createCommercialCheckoutSession(input: {
  cancelPath?: string;
  email?: string;
  origin: string;
  successPath?: string;
  userId: string;
}) {
  const readiness = getCommercialReadiness();
  const paymentLinkUrl =
    process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL?.trim();

  if (paymentLinkUrl) {
    return {
      readiness,
      status: 200,
      url: paymentLinkUrl,
    };
  }

  if (!readiness.checkoutConfigured) {
    return {
      readiness,
      status: 424,
      url: "",
    };
  }

  const origin =
    cleanBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    cleanBaseUrl(input.origin) ||
    "http://localhost:3000";
  const successUrl = new URL(input.successPath || "/app?billing=active", `${origin}/`);
  const cancelUrl = new URL(input.cancelPath || "/app?billing=cancelled", `${origin}/`);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    body: formBody({
      "allow_promotion_codes": "true",
      "client_reference_id": input.userId,
      "customer_email": input.email || "",
      "line_items[0][price]":
        process.env.PAYSHIELD_COMMERCIAL_PRICE_ID?.trim() || "",
      "line_items[0][quantity]": "1",
      "metadata[grayston_product]": "PayShield",
      "metadata[payshield_access]": "commercial",
      "metadata[payshield_user_id]": input.userId,
      "mode": "subscription",
      "subscription_data[metadata][grayston_product]": "PayShield",
      "subscription_data[metadata][payshield_access]": "commercial",
      "subscription_data[metadata][payshield_user_id]": input.userId,
      "success_url": successUrl.toString(),
      "cancel_url": cancelUrl.toString(),
    }),
    headers: {
      "authorization": `Bearer ${process.env.STRIPE_SECRET_KEY?.trim()}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": stripeApiVersion,
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    id?: string;
    url?: string;
  };

  if (!response.ok || !payload.url) {
    return {
      error: payload.error?.message || "Stripe Checkout session could not be created.",
      readiness,
      status: 502,
      url: "",
    };
  }

  return {
    checkoutSessionId: payload.id,
    readiness,
    status: 200,
    url: payload.url,
  };
}
