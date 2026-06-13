import { createHmac, timingSafeEqual } from "node:crypto";

const allowedClockSkewSeconds = 300;

export type StripeBillingEventSummary = {
  accessStatus: "active" | "blocked" | "canceled" | "ignored" | "past_due" | "pending";
  amountPaidCents: number | null;
  checkoutSessionId: string | null;
  customerId: string | null;
  eventId: string;
  eventType: string;
  handled: boolean;
  invoiceId: string | null;
  priceId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string;
  userId: string | null;
};

export type StripeWebhookEvent = {
  created?: number;
  data?: {
    object?: Record<string, unknown>;
  };
  id?: string;
  type?: string;
};

function parseSignatureHeader(signatureHeader: string) {
  const parts = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const parsed: Record<string, string[]> = {};

  for (const part of parts) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);

    parsed[key] = [...(parsed[key] ?? []), value];
  }

  return parsed;
}

function safeCompareHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataValue(object: Record<string, unknown>, key: string) {
  const metadata = objectValue(object.metadata);

  return stringValue(metadata[key]);
}

function linePriceId(object: Record<string, unknown>) {
  const lines = objectValue(object.lines);
  const data = Array.isArray(lines.data) ? lines.data : [];
  const firstLine = objectValue(data[0]);
  const price = objectValue(firstLine.price);

  return stringValue(price.id);
}

function subscriptionPriceId(object: Record<string, unknown>) {
  const items = objectValue(object.items);
  const data = Array.isArray(items.data) ? items.data : [];
  const firstItem = objectValue(data[0]);
  const price = objectValue(firstItem.price);

  return stringValue(price.id);
}

function subscriptionObjectId(object: Record<string, unknown>) {
  const subscription = object.subscription;

  if (typeof subscription === "string") {
    return stringValue(subscription);
  }

  return stringValue(objectValue(subscription).id);
}

function invoiceSubscriptionId(object: Record<string, unknown>) {
  const parent = objectValue(object.parent);
  const subscriptionDetails = objectValue(parent.subscription_details);

  return (
    stringValue(object.subscription) ||
    stringValue(subscriptionDetails.subscription) ||
    stringValue(objectValue(object.subscription).id)
  );
}

function checkoutPriceId(object: Record<string, unknown>) {
  const lineItems = objectValue(object.line_items);
  const data = Array.isArray(lineItems.data) ? lineItems.data : [];
  const firstLine = objectValue(data[0]);
  const price = objectValue(firstLine.price);

  return stringValue(price.id) || metadataValue(object, "price_id");
}

function accessStatusFor(eventType: string, object: Record<string, unknown>) {
  const status = stringValue(object.status) ?? "unknown";

  if (eventType === "checkout.session.completed") {
    return stringValue(object.payment_status) === "paid" ||
      stringValue(object.mode) === "subscription"
      ? "active"
      : "pending";
  }

  if (
    eventType === "customer.subscription.created" ||
    eventType === "customer.subscription.updated"
  ) {
    if (status === "active" || status === "trialing") {
      return "active";
    }

    if (status === "past_due" || status === "unpaid") {
      return "past_due";
    }

    if (status === "canceled" || status === "incomplete_expired") {
      return "canceled";
    }

    return "pending";
  }

  if (eventType === "customer.subscription.deleted") {
    return "canceled";
  }

  if (eventType === "invoice.paid" || eventType === "invoice.payment_succeeded") {
    return "active";
  }

  if (eventType === "invoice.payment_failed") {
    return "past_due";
  }

  return "ignored";
}

export function getStripeWebhookReadiness() {
  const signingSecretConfigured = Boolean(
    process.env.STRIPE_WEBHOOK_SECRET?.trim(),
  );

  return {
    endpointPath: "/api/app/billing/webhook",
    missing: signingSecretConfigured ? [] : ["STRIPE_WEBHOOK_SECRET"],
    signingSecretConfigured,
  };
}

export function verifyStripeWebhookSignature(input: {
  nowSeconds?: number;
  payload: string;
  secret: string;
  signatureHeader: string;
}) {
  const signature = parseSignatureHeader(input.signatureHeader);
  const timestamp = Number(signature.t?.[0]);
  const signatures = signature.v1 ?? [];

  if (!input.secret.trim()) {
    return { error: "Stripe webhook signing secret is not configured.", ok: false };
  }

  if (!Number.isInteger(timestamp) || signatures.length === 0) {
    return { error: "Stripe signature header is malformed.", ok: false };
  }

  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (Math.abs(nowSeconds - timestamp) > allowedClockSkewSeconds) {
    return { error: "Stripe signature timestamp is outside tolerance.", ok: false };
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.payload}`, "utf8")
    .digest("hex");
  const matched = signatures.some((candidate) =>
    safeCompareHex(candidate, expected),
  );

  return matched
    ? { ok: true }
    : { error: "Stripe signature verification failed.", ok: false };
}

export function parseStripeWebhookEvent(payload: string) {
  let event: StripeWebhookEvent;

  try {
    event = JSON.parse(payload) as StripeWebhookEvent;
  } catch {
    return { error: "Stripe webhook body must be valid JSON.", event: null };
  }

  if (!stringValue(event.id) || !stringValue(event.type)) {
    return { error: "Stripe webhook event must include id and type.", event: null };
  }

  const object = objectValue(event.data?.object);

  if (Object.keys(object).length === 0) {
    return { error: "Stripe webhook event must include data.object.", event: null };
  }

  return {
    error: null,
    event: {
      ...event,
      id: stringValue(event.id) ?? "",
      type: stringValue(event.type) ?? "",
    },
  };
}

export function summarizeStripeBillingEvent(event: StripeWebhookEvent): StripeBillingEventSummary {
  const object = objectValue(event.data?.object);
  const eventType = stringValue(event.type) ?? "unknown";
  const handledTypes = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.payment_succeeded",
  ]);
  const handled = handledTypes.has(eventType);
  const accessStatus = handled ? accessStatusFor(eventType, object) : "ignored";
  const customerId =
    stringValue(object.customer) || stringValue(objectValue(object.customer).id);
  const subscriptionId =
    subscriptionObjectId(object) || invoiceSubscriptionId(object);
  const checkoutSessionId =
    eventType === "checkout.session.completed" ? stringValue(object.id) : null;
  const invoiceId = eventType.startsWith("invoice.")
    ? stringValue(object.id)
    : null;
  const amountPaidCents =
    numberValue(object.amount_paid) ??
    numberValue(object.amount_total) ??
    numberValue(object.total);
  const priceId =
    stringValue(objectValue(object.plan).id) ||
    subscriptionPriceId(object) ||
    linePriceId(object) ||
    checkoutPriceId(object);

  return {
    accessStatus,
    amountPaidCents,
    checkoutSessionId,
    customerId,
    eventId: stringValue(event.id) ?? "",
    eventType,
    handled,
    invoiceId,
    priceId,
    subscriptionId,
    subscriptionStatus: stringValue(object.status) ?? (handled ? "unknown" : "ignored"),
    userId:
      metadataValue(object, "payshield_user_id") ||
      stringValue(object.client_reference_id),
  };
}

export function buildCommercialBillingEventPayload(input: {
  event: StripeWebhookEvent;
  summary: StripeBillingEventSummary;
}) {
  return {
    event: input.event,
    providerName: "stripe",
    summary: input.summary,
  };
}
