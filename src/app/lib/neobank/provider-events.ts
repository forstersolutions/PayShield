import { createHash } from "node:crypto";

export type ProviderPaycheckDetection = {
  amountCents: number;
  employerName: string;
  idempotencyKey: string;
  itemId: string;
  providerAccountId: string;
  providerEventId: string;
  providerName: string;
  providerTransactionId: string;
  receivedAt: string;
};

export type ProviderPaycheckSkip = {
  amountCents: number | null;
  employerName: string;
  providerTransactionId: string;
  reason: string;
  reasonCode: "paycheck_detection_rejected";
  status: "rejected";
};

export type ProviderEventAudit = {
  eventId: string;
  providerName: string;
  redactedPayload: unknown;
};

export type ProviderEventClassification = {
  detectionCount: number;
  detections: ProviderPaycheckDetection[];
  eventType: string;
  providerEvent: ProviderEventAudit;
  skipped: ProviderPaycheckSkip[];
  skippedCount: number;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function cleanNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function safeObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hashParts(...parts: unknown[]) {
  return createHash("sha256")
    .update(parts.map((part) => JSON.stringify(part)).join(":"))
    .digest("hex")
    .slice(0, 32);
}

function firstText(source: Record<string, unknown>, keys: string[], maxLength: number) {
  for (const key of keys) {
    const value = cleanText(source[key], maxLength);

    if (value) {
      return value;
    }
  }

  return "";
}

function categoryText(transaction: Record<string, unknown>) {
  const category = transaction.personal_finance_category;

  if (category && typeof category === "object" && !Array.isArray(category)) {
    const categoryObject = category as Record<string, unknown>;

    return [
      cleanText(categoryObject.primary, 80),
      cleanText(categoryObject.detailed, 120),
    ].join(" ");
  }

  if (Array.isArray(transaction.category)) {
    return transaction.category.map((item) => cleanText(item, 80)).join(" ");
  }

  return [
    cleanText(transaction.category, 120),
    cleanText(transaction.type, 80),
    cleanText(transaction.transaction_type, 80),
  ].join(" ");
}

function transactionName(transaction: Record<string, unknown>) {
  return (
    firstText(
      transaction,
      [
        "employerName",
        "employer_name",
        "merchant_name",
        "name",
        "description",
        "transactionName",
        "transaction_name",
      ],
      120,
    ) || "Provider transaction"
  );
}

function creditDirection(transaction: Record<string, unknown>) {
  const direction = [
    cleanText(transaction.direction, 40),
    cleanText(transaction.flow, 40),
    cleanText(transaction.transaction_direction, 40),
  ]
    .join(" ")
    .toLowerCase();

  return /credit|inflow|deposit|incoming/.test(direction);
}

function providerAmountCents(transaction: Record<string, unknown>) {
  const amountCents = cleanNumber(transaction.amountCents ?? transaction.amount_cents);

  if (amountCents !== null) {
    return Number.isInteger(amountCents) && amountCents > 0
      ? amountCents
      : creditDirection(transaction) && Number.isInteger(Math.abs(amountCents))
        ? Math.abs(amountCents)
        : null;
  }

  const amount = cleanNumber(transaction.amount);

  if (amount === null) {
    return null;
  }

  if (amount < 0) {
    return Math.round(Math.abs(amount) * 100);
  }

  return creditDirection(transaction) ? Math.round(amount * 100) : null;
}

function incomeSignal(transaction: Record<string, unknown>) {
  const text = `${categoryText(transaction)} ${transactionName(transaction)}`.toLowerCase();

  return /income|payroll|paycheck|salary|wage|direct deposit|direct_deposit|ach credit|ach_credit/.test(
    text,
  );
}

function transactionCandidates(payload: Record<string, unknown>) {
  const candidates = [
    payload.transactions,
    payload.added,
    payload.new_transactions,
    payload.transactions_added,
    payload.posted,
    payload.deposits,
    payload.items,
  ];

  return candidates.flatMap((candidate) => (Array.isArray(candidate) ? candidate : []));
}

function providerNameFromPayload(payload: Record<string, unknown>) {
  return (
    firstText(payload, ["providerName", "provider_name", "provider"], 80) ||
    "provider"
  );
}

function providerEventId(providerName: string, payload: Record<string, unknown>) {
  return (
    firstText(
      payload,
      [
        "providerEventId",
        "provider_event_id",
        "webhookId",
        "webhook_id",
        "eventId",
        "event_id",
        "id",
      ],
      180,
    ) || `${providerName}:${hashParts(providerName, payload)}`
  );
}

function providerTransactionId(
  transaction: Record<string, unknown>,
  fallback: string,
) {
  return (
    firstText(
      transaction,
      [
        "providerTransactionId",
        "provider_transaction_id",
        "transactionId",
        "transaction_id",
        "id",
      ],
      180,
    ) || fallback
  );
}

function providerItemId(
  payload: Record<string, unknown>,
  transaction: Record<string, unknown>,
) {
  return (
    firstText(transaction, ["itemId", "item_id"], 180) ||
    firstText(payload, ["itemId", "item_id"], 180)
  );
}

function providerAccountId(
  payload: Record<string, unknown>,
  transaction: Record<string, unknown>,
) {
  return (
    firstText(transaction, ["accountId", "account_id"], 180) ||
    firstText(payload, ["accountId", "account_id"], 180)
  );
}

function receivedAt(transaction: Record<string, unknown>) {
  return (
    firstText(
      transaction,
      ["authorized_datetime", "datetime", "dateTime", "date"],
      40,
    ) || new Date().toISOString()
  );
}

export function redactProviderEventPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactProviderEventPayload);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      /secret|token|authorization|password|credential|card|routing|account_number/i.test(key)
        ? "[redacted]"
        : redactProviderEventPayload(item),
    ]),
  );
}

export function classifyProviderEvent(input: unknown): ProviderEventClassification {
  const payload = safeObject(input);
  const providerName = providerNameFromPayload(payload);
  const eventId = providerEventId(providerName, payload);
  const detections: ProviderPaycheckDetection[] = [];
  const skipped: ProviderPaycheckSkip[] = [];

  for (const [index, rawTransaction] of transactionCandidates(payload).entries()) {
    const transaction = safeObject(rawTransaction);

    if (!Object.keys(transaction).length) {
      continue;
    }

    if (transaction.pending === true || transaction.status === "pending") {
      continue;
    }

    if (!incomeSignal(transaction)) {
      continue;
    }

    const amountCents = providerAmountCents(transaction);
    const employerName = transactionName(transaction);
    const transactionId = providerTransactionId(
      transaction,
      `${eventId}:transaction:${index}`,
    );

    if (!amountCents || amountCents <= 0 || amountCents > 2_000_000) {
      skipped.push({
        amountCents,
        employerName,
        providerTransactionId: transactionId,
        reason: "Provider paycheck transaction amountCents is missing or outside PayShield limits.",
        reasonCode: "paycheck_detection_rejected",
        status: "rejected",
      });
      continue;
    }

    detections.push({
      amountCents,
      employerName,
      idempotencyKey: `provider:${eventId}:${transactionId}`,
      itemId: providerItemId(payload, transaction),
      providerAccountId: providerAccountId(payload, transaction),
      providerEventId: eventId,
      providerName,
      providerTransactionId: transactionId,
      receivedAt: receivedAt(transaction),
    });
  }

  return {
    detectionCount: detections.length,
    detections,
    eventType:
      firstText(payload, ["eventType", "webhook_code", "type"], 80) ||
      "provider_webhook",
    providerEvent: {
      eventId,
      providerName,
      redactedPayload: redactProviderEventPayload(payload),
    },
    skipped,
    skippedCount: skipped.length,
  };
}
