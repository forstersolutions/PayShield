import { getStripeWebhookReadiness } from "./stripe-webhook.ts";
import { getRevenueCatWebhookReadiness } from "./revenuecat-webhook.ts";
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

function stripeIdempotencyKey(value: string, userId: string) {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 255);

  return cleaned || `checkout-${userId}`.slice(0, 255);
}

export function getCommercialReadiness() {
  const webhook = getStripeWebhookReadiness();
  const revenueCat = getRevenueCatWebhookReadiness();
  const core = getCoreServiceConfig();
  const paymentLink = cleanPaymentLinkUrl(
    process.env.PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL,
  );
  const stripeSecretConfigured = envPresent("STRIPE_SECRET_KEY");
  const stripeMode = stripeSecretMode(process.env.STRIPE_SECRET_KEY);
  const stripePriceConfigured = envPresent("PAYSHIELD_COMMERCIAL_PRICE_ID");
  const stripeCheckoutConfigured =
    paymentLink.ok || (stripeSecretConfigured && stripePriceConfigured);
  const mobileStoreProductsConfigured = envTrue(
    "PAYSHIELD_REVENUECAT_STORES_CONFIGURED",
  );
  const mobileStoreBillingEnabled = revenueCat.enabled;
  const checkoutConfigured = mobileStoreBillingEnabled
    ? mobileStoreProductsConfigured
    : stripeCheckoutConfigured;
  const productionLiveStripeReady = mobileStoreBillingEnabled
    ? true
    : !productionRequiresLiveStripe() ||
      (paymentLink.ok
        ? paymentLink.mode === "live"
        : stripeMode === "live" && stripePriceConfigured);
  const webhookConfigured = mobileStoreBillingEnabled
    ? revenueCat.authorizationConfigured
    : webhook.signingSecretConfigured;
  const activationCoreServiceAuthConfigured = Boolean(core.serviceToken);
  const activationCoreReady = core.ok && activationCoreServiceAuthConfigured;
  const missing: string[] = [];

  if (mobileStoreBillingEnabled) {
    if (!mobileStoreProductsConfigured) {
      missing.push("PAYSHIELD_REVENUECAT_STORES_CONFIGURED");
    }

    if (!revenueCat.authorizationConfigured) {
      missing.push("PAYSHIELD_REVENUECAT_WEBHOOK_SECRET");
    }
  } else {
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
  }

  if (checkoutConfigured && webhookConfigured && !activationCoreReady) {
    if (!core.ok) {
      missing.push("PAYSHIELD_CORE_API_URL");
    }

    if (!activationCoreServiceAuthConfigured) {
      missing.push("PAYSHIELD_CORE_SERVICE_TOKEN");
    }
  }

  if (core.ok && !activationCoreServiceAuthConfigured) {
    missing.push("PAYSHIELD_CORE_SERVICE_TOKEN");
  }

  return {
    activationCoreConfigured: core.configured,
    activationCoreReady,
    activationCoreServiceAuthConfigured,
    checkoutConfigured,
    paymentCollectionReady: checkoutConfigured && productionLiveStripeReady,
    checkoutOperationalReady:
      checkoutConfigured &&
      webhookConfigured &&
      activationCoreReady &&
      productionLiveStripeReady,
    missing: [...new Set(missing)],
    mode: mobileStoreBillingEnabled
      ? "app_store"
      : paymentLink.ok
        ? "payment_link"
        : stripeSecretConfigured
          ? "checkout"
          : "not_configured",
    mobileStoreBillingEnabled,
    mobileStoreProductsConfigured,
    paymentLinkMode: paymentLink.mode,
    paymentLinkUrl: paymentLink.url,
    priceLabel:
      process.env.PAYSHIELD_COMMERCIAL_PRICE_LABEL?.trim() ||
      "$19/month",
    paidAccessReady:
      checkoutConfigured &&
      webhookConfigured &&
      activationCoreReady &&
      productionLiveStripeReady,
    productionLiveStripeReady,
    stripePriceConfigured,
    stripeSecretConfigured,
    stripeSecretMode: stripeMode,
    webhookEndpointPath: mobileStoreBillingEnabled
      ? revenueCat.endpointPath
      : webhook.endpointPath,
    webhookSigningSecretConfigured: webhookConfigured,
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
      readiness.mobileStoreBillingEnabled ||
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
        ? `Paid access must be active before ${operation}. Configure PAYSHIELD_CORE_API_URL so verified billing webhooks can activate household access before this workflow runs.`
        : readiness.activationCoreConfigured &&
            !readiness.activationCoreServiceAuthConfigured
          ? `Paid access must be fully configured before ${operation}. Add PAYSHIELD_CORE_SERVICE_TOKEN so Stripe webhooks can authenticate to core activation storage.`
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
  idempotencyKey: string;
  origin: string;
  productReady?: boolean;
  requireAccessActivation?: boolean;
  requireCheckoutSession?: boolean;
  requireProductReady?: boolean;
  successPath?: string;
  userId: string;
}) {
  const readiness = getCommercialReadiness();
  const checkoutSessionConfigured =
    readiness.stripeSecretConfigured && readiness.stripePriceConfigured;

  if (readiness.mode === "app_store") {
    return {
      error: "PayShield membership is purchased and managed in the mobile app.",
      errorCode: "mobile_store_purchase_required",
      readiness,
      status: 409,
      url: "",
    };
  }

  if (!readiness.checkoutConfigured) {
    return {
      error: "Commercial checkout is not configured. Add Stripe Checkout or a Stripe Payment Link.",
      errorCode: "checkout_not_configured",
      readiness,
      status: 424,
      url: "",
    };
  }

  if (
    input.requireCheckoutSession &&
    readiness.paymentLinkUrl &&
    !checkoutSessionConfigured
  ) {
    return {
      error:
        "Public checkout requires Stripe Checkout Session mode so PayShield can attach household identity metadata. Configure STRIPE_SECRET_KEY and PAYSHIELD_COMMERCIAL_PRICE_ID instead of a static payment link.",
      errorCode: "checkout_session_required",
      readiness,
      status: 424,
      url: "",
    };
  }

  if (!readiness.productionLiveStripeReady) {
    return {
      error:
        "Commercial checkout requires a live Stripe checkout asset in production.",
      errorCode: "checkout_live_mode_required",
      readiness,
      status: 424,
      url: "",
    };
  }

  if (input.requireAccessActivation && !readiness.checkoutOperationalReady) {
    return {
      error:
        "Commercial checkout is gated until webhook activation and core persistence are ready.",
      errorCode: "checkout_activation_not_ready",
      readiness,
      status: 424,
      url: "",
    };
  }

  if (input.requireProductReady && input.productReady !== true) {
    return {
      error: "Membership checkout is gated until PayShield account services are live.",
      errorCode: "checkout_product_not_ready",
      readiness,
      status: 424,
      url: "",
    };
  }

  if (
    readiness.paymentLinkUrl &&
    !(input.requireCheckoutSession && checkoutSessionConfigured)
  ) {
    return {
      accessActivationReady: readiness.checkoutOperationalReady,
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
      "metadata[payshield_customer_email]": input.email || "",
      "metadata[payshield_user_id]": input.userId,
      "mode": "subscription",
      "subscription_data[metadata][grayston_product]": "PayShield",
      "subscription_data[metadata][payshield_access]": "commercial",
      "subscription_data[metadata][payshield_customer_email]": input.email || "",
      "subscription_data[metadata][payshield_user_id]": input.userId,
      "success_url": successUrl.toString(),
      "cancel_url": cancelUrl.toString(),
    }),
    headers: {
      "authorization": `Bearer ${process.env.STRIPE_SECRET_KEY?.trim()}`,
      "content-type": "application/x-www-form-urlencoded",
      "idempotency-key": stripeIdempotencyKey(
        input.idempotencyKey,
        input.userId,
      ),
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
      error: "Membership checkout could not be started.",
      errorCode: "checkout_provider_error",
      readiness,
      status: 502,
      url: "",
    };
  }

  return {
    accessActivationReady: readiness.checkoutOperationalReady,
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
