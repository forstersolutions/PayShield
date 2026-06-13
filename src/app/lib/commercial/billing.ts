import { getStripeWebhookReadiness } from "./stripe-webhook.ts";
import { getCoreServiceConfig } from "../neobank/core-config.ts";

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

function cleanPaymentLinkUrl(value: string | undefined) {
  if (!value?.trim()) {
    return {
      mode: "not_configured" as const,
      ok: false,
      url: "",
    };
  }

  try {
    const url = new URL(value.trim());
    const testMode =
      url.hostname === "buy.stripe.com" && url.pathname.startsWith("/test_");

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    ) {
      return {
        mode: testMode ? ("test" as const) : ("unknown" as const),
        ok: false,
        url: "",
      };
    }

    return {
      mode: testMode ? ("test" as const) : ("live" as const),
      ok: true,
      url: url.toString(),
    };
  } catch {
    return {
      mode: "unknown" as const,
      ok: false,
      url: "",
    };
  }
}

function stripeSecretMode(value: string | undefined) {
  const secret = value?.trim() || "";

  if (!secret) {
    return "not_configured" as const;
  }

  if (secret.startsWith("sk_live_")) {
    return "live" as const;
  }

  if (secret.startsWith("sk_test_")) {
    return "test" as const;
  }

  return "unknown" as const;
}

function productionRequiresLiveStripe() {
  return process.env.VERCEL_ENV === "production";
}

function portalStripeReady() {
  const stripeMode = stripeSecretMode(process.env.STRIPE_SECRET_KEY);

  return {
    liveModeReady: !productionRequiresLiveStripe() || stripeMode === "live",
    stripeSecretConfigured: envPresent("STRIPE_SECRET_KEY"),
    stripeSecretMode: stripeMode,
  };
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
  const core = getCoreServiceConfig();
  const paymentLink = cleanPaymentLinkUrl(
    process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL,
  );
  const stripeSecretConfigured = envPresent("STRIPE_SECRET_KEY");
  const stripeMode = stripeSecretMode(process.env.STRIPE_SECRET_KEY);
  const stripePriceConfigured = envPresent("PAYSHIELD_COMMERCIAL_PRICE_ID");
  const checkoutConfigured =
    paymentLink.ok || (stripeSecretConfigured && stripePriceConfigured);
  const productionLiveStripeReady =
    !productionRequiresLiveStripe() ||
    (paymentLink.ok
      ? paymentLink.mode === "live"
      : stripeMode === "live" && stripePriceConfigured);
  const activationCoreReady = core.ok;
  const missing: string[] = [];

  if (
    process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL?.trim() &&
    !paymentLink.ok
  ) {
    missing.push("PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL valid HTTPS URL");
  }

  if (!checkoutConfigured) {
    if (!stripeSecretConfigured) {
      missing.push("STRIPE_SECRET_KEY");
    }

    if (!stripePriceConfigured && !paymentLink.ok) {
      missing.push(
        "PAYSHIELD_COMMERCIAL_PRICE_ID or PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
      );
    }
  }

  if (checkoutConfigured && !productionLiveStripeReady) {
    missing.push("Stripe live-mode checkout asset");
  }

  if (!webhook.signingSecretConfigured) {
    missing.push("STRIPE_WEBHOOK_SECRET");
  }

  if (checkoutConfigured && webhook.signingSecretConfigured && !activationCoreReady) {
    missing.push("PAYSHIELD_CORE_API_URL");
  }

  return {
    activationCoreConfigured: core.configured,
    activationCoreReady,
    checkoutConfigured,
    checkoutOperationalReady:
      checkoutConfigured &&
      webhook.signingSecretConfigured &&
      activationCoreReady &&
      productionLiveStripeReady,
    missing,
    mode: paymentLink.ok
      ? "payment_link"
      : stripeSecretConfigured
        ? "checkout"
        : "not_configured",
    paymentLinkMode: paymentLink.mode,
    paymentLinkUrl: paymentLink.url,
    priceLabel:
      process.env.PAYSHIELD_COMMERCIAL_PRICE_LABEL?.trim() ||
      "$19/month",
    paidAccessReady:
      checkoutConfigured &&
      webhook.signingSecretConfigured &&
      activationCoreReady &&
      productionLiveStripeReady,
    productionLiveStripeReady,
    stripePriceConfigured,
    stripeSecretConfigured,
    stripeSecretMode: stripeMode,
    webhookEndpointPath: webhook.endpointPath,
    webhookSigningSecretConfigured: webhook.signingSecretConfigured,
  };
}

export function paidAccessRequired() {
  const readiness = getCommercialReadiness();
  const productionRuntime = process.env.VERCEL_ENV === "production";

  return {
    readiness,
    required:
      productionRuntime ||
      envTrue("PAYSHIELD_REQUIRE_PAID_ACCESS") ||
      readiness.checkoutConfigured,
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

  if (!readiness.checkoutConfigured) {
    return {
      error: "Commercial checkout is not configured. Add Stripe Checkout or a Stripe Payment Link.",
      errorCode: "checkout_not_configured",
      readiness,
      status: 424,
      url: "",
    };
  }

  if (!readiness.checkoutOperationalReady) {
    return {
      error:
        "Commercial checkout is gated until webhook activation, core persistence, and live Stripe mode are ready.",
      errorCode: "checkout_activation_not_ready",
      readiness,
      status: 424,
      url: "",
    };
  }

  if (readiness.paymentLinkUrl) {
    return {
      readiness,
      status: 200,
      url: readiness.paymentLinkUrl,
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

export async function createCommercialPortalSession(input: {
  customerId?: string | null;
  origin: string;
  returnPath?: string;
}) {
  const portalReadiness = portalStripeReady();
  const missing = [
    ...(portalReadiness.stripeSecretConfigured ? [] : ["STRIPE_SECRET_KEY"]),
    ...(portalReadiness.liveModeReady ? [] : ["Stripe live-mode secret"]),
    ...(input.customerId ? [] : ["provider_customer_id"]),
  ];
  const readiness = {
    missing,
    portalConfigured:
      portalReadiness.stripeSecretConfigured &&
      portalReadiness.liveModeReady &&
      Boolean(input.customerId),
    stripeSecretConfigured: portalReadiness.stripeSecretConfigured,
    stripeSecretMode: portalReadiness.stripeSecretMode,
  };

  if (!input.customerId) {
    return {
      error:
        "Billing portal requires an active Stripe customer from durable paid-access records.",
      errorCode: "billing_customer_required",
      readiness,
      status: 424,
      url: "",
    };
  }

  if (!portalReadiness.stripeSecretConfigured) {
    return {
      error: "Billing portal requires STRIPE_SECRET_KEY.",
      errorCode: "billing_portal_not_configured",
      readiness,
      status: 424,
      url: "",
    };
  }

  if (!portalReadiness.liveModeReady) {
    return {
      error: "Billing portal requires a live-mode Stripe secret in production.",
      errorCode: "billing_portal_live_mode_required",
      readiness,
      status: 424,
      url: "",
    };
  }

  const origin =
    cleanBaseUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    cleanBaseUrl(input.origin) ||
    "http://localhost:3000";
  const returnUrl = new URL(input.returnPath || "/app?billing=manage", `${origin}/`);
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    body: formBody({
      customer: input.customerId,
      return_url: returnUrl.toString(),
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
      error: payload.error?.message || "Stripe Billing Portal session could not be created.",
      errorCode: "billing_portal_provider_error",
      readiness,
      status: 502,
      url: "",
    };
  }

  return {
    portalSessionId: payload.id,
    readiness,
    status: 200,
    url: payload.url,
  };
}
