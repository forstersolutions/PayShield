import { timingSafeEqual } from "node:crypto";

export type RevenueCatBillingEventSummary = {
  accessStatus: "active" | "blocked" | "canceled" | "ignored" | "past_due" | "pending";
  amountPaidCents: number | null;
  cancelAtPeriodEnd: boolean;
  checkoutSessionId: null;
  customerEmail: null;
  customerId: string | null;
  currentPeriodEnd: string | null;
  eventId: string;
  eventType: string;
  handled: boolean;
  invoiceId: string | null;
  priceId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string;
  userId: string | null;
};

type RevenueCatEnvelope = {
  api_version?: unknown;
  event?: unknown;
};

const activeEvents = new Set([
  "INITIAL_PURCHASE",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "RENEWAL",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "UNCANCELLATION",
]);

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, maxLength = 200) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => stringValue(item, 160))
        .filter((item): item is string => Boolean(item))
    : [];
}

function timestampToIso(value: unknown) {
  const timestamp = numberValue(value);

  if (timestamp === null || timestamp < 0) {
    return null;
  }

  const date = new Date(timestamp);

  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function usableUserId(value: unknown) {
  const userId = stringValue(value, 100);

  if (
    !userId ||
    userId.startsWith("$RCAnonymousID:") ||
    userId.includes("/")
  ) {
    return null;
  }

  return userId;
}

function eventUserId(event: Record<string, unknown>) {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...stringList(event.aliases),
  ];

  for (const candidate of candidates) {
    const userId = usableUserId(candidate);

    if (userId) {
      return userId;
    }
  }

  return null;
}

function entitlementIds(event: Record<string, unknown>) {
  return [
    ...stringList(event.entitlement_ids),
    ...(stringValue(event.entitlement_id, 160)
      ? [stringValue(event.entitlement_id, 160) as string]
      : []),
  ];
}

function eventAccessState(eventType: string, expiresAt: string | null) {
  if (activeEvents.has(eventType)) {
    return { accessStatus: "active" as const, cancelAtPeriodEnd: false, subscriptionStatus: "active" };
  }

  if (eventType === "CANCELLATION") {
    const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;

    return expired
      ? { accessStatus: "canceled" as const, cancelAtPeriodEnd: true, subscriptionStatus: "canceled" }
      : { accessStatus: "active" as const, cancelAtPeriodEnd: true, subscriptionStatus: "active" };
  }

  if (eventType === "EXPIRATION") {
    return { accessStatus: "canceled" as const, cancelAtPeriodEnd: false, subscriptionStatus: "canceled" };
  }

  if (eventType === "BILLING_ISSUE") {
    return { accessStatus: "past_due" as const, cancelAtPeriodEnd: false, subscriptionStatus: "past_due" };
  }

  if (eventType === "SUBSCRIPTION_PAUSED") {
    return { accessStatus: "blocked" as const, cancelAtPeriodEnd: false, subscriptionStatus: "paused" };
  }

  return { accessStatus: "ignored" as const, cancelAtPeriodEnd: false, subscriptionStatus: "ignored" };
}

export function getRevenueCatWebhookReadiness() {
  const entitlementId =
    process.env.PAYSHIELD_REVENUECAT_ENTITLEMENT_ID?.trim() ||
    "payshield_pro";

  return {
    authorizationConfigured: Boolean(
      process.env.PAYSHIELD_REVENUECAT_WEBHOOK_SECRET?.trim(),
    ),
    enabled:
      process.env.PAYSHIELD_MOBILE_STORE_BILLING_ENABLED?.trim().toLowerCase() ===
      "true",
    endpointPath: "/api/app/billing/revenuecat/webhook",
    entitlementId,
  };
}

export function verifyRevenueCatAuthorization({
  authorization,
  secret,
}: {
  authorization: string;
  secret: string;
}) {
  if (!secret.trim()) {
    return {
      error: "RevenueCat webhook authentication is not configured.",
      ok: false as const,
    };
  }

  const expected = Buffer.from(`Bearer ${secret.trim()}`);
  const received = Buffer.from(authorization.trim());
  const ok =
    expected.length === received.length && timingSafeEqual(expected, received);

  return ok
    ? { ok: true as const }
    : {
        error: "RevenueCat webhook authorization is invalid.",
        ok: false as const,
      };
}

export function parseRevenueCatWebhook(payload: string) {
  let envelope: RevenueCatEnvelope;

  try {
    envelope = JSON.parse(payload) as RevenueCatEnvelope;
  } catch {
    return { error: "RevenueCat webhook body must be valid JSON.", event: null };
  }

  const event = objectValue(envelope.event);
  const eventId = stringValue(event.id, 160);
  const eventType = stringValue(event.type, 120)?.toUpperCase() ?? null;

  if (!eventId || !eventType) {
    return {
      error: "RevenueCat webhook requires event.id and event.type.",
      event: null,
    };
  }

  return {
    envelope: {
      api_version: stringValue(envelope.api_version, 20) ?? "unknown",
      event,
    },
    error: "",
    event,
    eventId,
    eventType,
  };
}

export function summarizeRevenueCatBillingEvent({
  entitlementId,
  event,
  eventId,
  eventType,
}: {
  entitlementId: string;
  event: Record<string, unknown>;
  eventId: string;
  eventType: string;
}): RevenueCatBillingEventSummary {
  const currentPeriodEnd = timestampToIso(event.expiration_at_ms);
  const state = eventAccessState(eventType, currentPeriodEnd);
  const userId = eventUserId(event);
  const appliesToPayShield = entitlementIds(event).includes(entitlementId);
  const recognized = state.accessStatus !== "ignored";
  const handled = Boolean(appliesToPayShield && recognized && userId);
  const currency = stringValue(event.currency, 8)?.toUpperCase();
  const price = numberValue(event.price_in_purchased_currency ?? event.price);
  const transactionId = stringValue(event.transaction_id, 160);

  return {
    accessStatus: handled ? state.accessStatus : "ignored",
    amountPaidCents:
      handled && currency === "USD" && price !== null && price >= 0
        ? Math.round(price * 100)
        : null,
    cancelAtPeriodEnd: handled && state.cancelAtPeriodEnd,
    checkoutSessionId: null,
    customerEmail: null,
    customerId: userId,
    currentPeriodEnd,
    eventId,
    eventType,
    handled,
    invoiceId: transactionId,
    priceId: stringValue(event.product_id, 160),
    subscriptionId:
      stringValue(event.original_transaction_id, 160) ?? transactionId,
    subscriptionStatus: handled ? state.subscriptionStatus : "ignored",
    userId,
  };
}

export function buildRevenueCatBillingEventPayload({
  envelope,
  summary,
}: {
  envelope: Record<string, unknown>;
  summary: RevenueCatBillingEventSummary;
}) {
  return {
    event: envelope,
    providerName: "revenuecat",
    summary,
  };
}
