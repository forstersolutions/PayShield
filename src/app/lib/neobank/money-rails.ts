import { getNeobankReadiness } from "./readiness.ts";
import type { BucketId } from "./types.ts";

export type PaycheckDetectionInput = {
  amountCents: number;
  employerName: string;
  idempotencyKey: string;
  receivedAt: string;
};

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

function envTrue(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function cleanList(value: string | undefined, fallback: string[]) {
  const parsed = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed?.length ? parsed : fallback;
}

function plaidBaseUrl() {
  const env = process.env.PLAID_ENV?.trim().toLowerCase() || "sandbox";

  if (env === "production") {
    return "https://production.plaid.com";
  }

  if (env === "development") {
    return "https://development.plaid.com";
  }

  return "https://sandbox.plaid.com";
}

function plaidCredentials() {
  return {
    client_id: process.env.PLAID_CLIENT_ID?.trim() || "",
    secret: process.env.PLAID_SECRET?.trim() || "",
  };
}

async function plaidRequest<T>(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${plaidBaseUrl()}${path}`, {
    body: JSON.stringify({
      ...plaidCredentials(),
      ...body,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error_code?: string;
    error_message?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error_message ||
        payload.error_code ||
        `Plaid request failed with status ${response.status}.`,
    );
  }

  return payload;
}

export function getMoneyRailReadiness() {
  const neobank = getNeobankReadiness();
  const plaidConfigured =
    envPresent("PLAID_CLIENT_ID") && envPresent("PLAID_SECRET");
  const transferConfigured =
    envTrue("PAYSHIELD_TRANSFER_ENABLED") &&
    (envPresent("PLAID_TRANSFER_CLIENT_ID") ||
      envPresent("PAYSHIELD_BAAS_API_KEY") ||
      plaidConfigured);
  const tokenVaultConfigured =
    envPresent("PAYSHIELD_TOKEN_VAULT_KEY_ID") ||
    envPresent("PAYSHIELD_BAAS_API_KEY");
  const missing: string[] = [];

  if (!plaidConfigured) {
    missing.push("PLAID_CLIENT_ID", "PLAID_SECRET");
  }

  if (!transferConfigured) {
    missing.push("PAYSHIELD_TRANSFER_ENABLED plus transfer/BaaS credentials");
  }

  if (plaidConfigured && !tokenVaultConfigured) {
    missing.push("PAYSHIELD_TOKEN_VAULT_KEY_ID or BaaS token vault");
  }

  return {
    bankLinkReady: plaidConfigured && tokenVaultConfigured,
    detectionMode: plaidConfigured ? "plaid_transactions_sync" : "manual_or_provider_webhook",
    paycheckDetectionReady: plaidConfigured && tokenVaultConfigured,
    liveMoneyReady: neobank.liveMoneyReady,
    missing,
    plaidConfigured,
    plaidEnv: process.env.PLAID_ENV?.trim() || "sandbox",
    tokenVaultConfigured,
    transferConfigured,
    transferReady: neobank.liveMoneyReady && transferConfigured,
  };
}

export async function createBankLinkToken(input: {
  origin: string;
  userId: string;
}) {
  const readiness = getMoneyRailReadiness();

  if (!readiness.plaidConfigured) {
    return {
      readiness,
      status: 424,
    };
  }

  const products = cleanList(process.env.PLAID_PRODUCTS, ["auth", "transactions"]);
  const countryCodes = cleanList(process.env.PLAID_COUNTRY_CODES, ["US"]);
  const webhook = process.env.PLAID_WEBHOOK_URL?.trim();
  const redirectUri = process.env.PLAID_REDIRECT_URI?.trim();
  const payload = await plaidRequest<{
    expiration: string;
    link_token: string;
    request_id: string;
  }>("/link/token/create", {
    client_name: "PayShield",
    country_codes: countryCodes,
    language: "en",
    products,
    redirect_uri: redirectUri || undefined,
    transactions: products.includes("transactions")
      ? { days_requested: 180 }
      : undefined,
    user: {
      client_user_id: input.userId,
    },
    webhook,
  });

  return {
    expiration: payload.expiration,
    linkToken: payload.link_token,
    readiness,
    requestId: payload.request_id,
    status: 200,
  };
}

export async function exchangeBankPublicToken(input: {
  accountId?: string;
  institutionName?: string;
  publicToken: string;
}) {
  const readiness = getMoneyRailReadiness();

  if (!readiness.plaidConfigured) {
    return {
      readiness,
      status: 424,
    };
  }

  const payload = await plaidRequest<{
    access_token: string;
    item_id: string;
    request_id: string;
  }>("/item/public_token/exchange", {
    public_token: input.publicToken,
  });

  return {
    bankConnection: {
      accountId: input.accountId || "selected_account",
      institutionName: input.institutionName || "Linked institution",
      itemId: payload.item_id,
      tokenSecretRef:
        process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID?.trim()
          ? `vault://plaid/${payload.item_id}`
          : "requires_core_secret_store",
      tokenVaultStatus: readiness.bankLinkReady
        ? "ready"
        : "requires_core_secret_store",
    },
    readiness,
    requestId: payload.request_id,
    status: 200,
  };
}

export function buildTransferIntent(input: {
  amountCents: number;
  destinationPayeeId: string;
  idempotencyKey: string;
  sourceBucketId: BucketId;
}) {
  const readiness = getMoneyRailReadiness();

  return {
    amountCents: input.amountCents,
    destinationPayeeId: input.destinationPayeeId,
    idempotencyKey: input.idempotencyKey,
    providerStatus: readiness.liveMoneyReady && readiness.transferConfigured ? "ready" : "blocked",
    readiness,
    sourceBucketId: input.sourceBucketId,
  };
}
