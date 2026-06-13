import { createHmac } from "node:crypto";
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

function cleanTokenVaultUrl(value: string | undefined) {
  if (!value?.trim()) {
    return "";
  }

  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname) &&
      process.env.VERCEL_ENV !== "production";

    if (url.username || url.password || url.search || url.hash) {
      return "";
    }

    if (url.protocol !== "https:" && !localHttp) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
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

function tokenVaultReadiness() {
  const keyId = process.env.PAYSHIELD_TOKEN_VAULT_KEY_ID?.trim() || "";
  const webhookUrl = cleanTokenVaultUrl(
    process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL,
  );
  const webhookSigningConfigured = envPresent(
    "PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET",
  );
  const keyConfigured = Boolean(keyId);
  const webhookReady = keyConfigured && Boolean(webhookUrl) && webhookSigningConfigured;

  return {
    keyConfigured,
    keyId,
    webhookConfigured: Boolean(webhookUrl),
    webhookReady,
    webhookUrl,
    webhookSigningConfigured,
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

async function storePlaidAccessToken(input: {
  accessToken: string;
  itemId: string;
  requestId: string;
}) {
  const vault = tokenVaultReadiness();
  const secret = process.env.PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET?.trim() || "";

  if (!vault.webhookReady || !secret) {
    throw new Error("Token vault handoff is not configured.");
  }

  const body = JSON.stringify({
    accessToken: input.accessToken,
    itemId: input.itemId,
    keyId: vault.keyId,
    providerName: "plaid",
    requestId: input.requestId,
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const response = await fetch(vault.webhookUrl, {
    body,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-payshield-signature": `t=${timestamp},v1=${signature}`,
    },
    method: "POST",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    tokenSecretRef?: unknown;
  };

  if (!response.ok) {
    throw new Error("Token vault rejected the Plaid access token.");
  }

  return typeof payload.tokenSecretRef === "string" &&
    payload.tokenSecretRef.trim()
    ? payload.tokenSecretRef.trim().slice(0, 240)
    : `vault://plaid/${input.itemId}`;
}

export function getMoneyRailReadiness() {
  const neobank = getNeobankReadiness();
  const plaidConfigured =
    envPresent("PLAID_CLIENT_ID") && envPresent("PLAID_SECRET");
  const vault = tokenVaultReadiness();
  const transferConfigured =
    envTrue("PAYSHIELD_TRANSFER_ENABLED") &&
    (envPresent("PLAID_TRANSFER_CLIENT_ID") ||
      envPresent("PAYSHIELD_BAAS_API_KEY") ||
      plaidConfigured);
  const tokenVaultConfigured = vault.keyConfigured;
  const missing: string[] = [];

  if (!plaidConfigured) {
    missing.push("PLAID_CLIENT_ID", "PLAID_SECRET");
  }

  if (!transferConfigured) {
    missing.push("PAYSHIELD_TRANSFER_ENABLED plus transfer/BaaS credentials");
  }

  if (plaidConfigured && !vault.webhookReady) {
    if (!vault.keyConfigured) {
      missing.push("PAYSHIELD_TOKEN_VAULT_KEY_ID");
    }

    if (!vault.webhookConfigured) {
      missing.push("PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL");
    }

    if (!vault.webhookSigningConfigured) {
      missing.push("PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET");
    }
  }

  return {
    bankLinkReady: plaidConfigured && vault.webhookReady,
    detectionMode: plaidConfigured ? "plaid_transactions_sync" : "manual_or_provider_webhook",
    paycheckDetectionReady: plaidConfigured && vault.webhookReady,
    liveMoneyReady: neobank.liveMoneyReady,
    missing,
    plaidConfigured,
    plaidEnv: process.env.PLAID_ENV?.trim() || "sandbox",
    tokenVaultConfigured,
    tokenVaultStoreReady: vault.webhookReady,
    transferConfigured,
    transferReady: neobank.liveMoneyReady && transferConfigured,
  };
}

export async function createBankLinkToken(input: {
  origin: string;
  userId: string;
}) {
  const readiness = getMoneyRailReadiness();

  if (!readiness.plaidConfigured || !readiness.tokenVaultStoreReady) {
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

  if (!readiness.plaidConfigured || !readiness.tokenVaultStoreReady) {
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
  const tokenSecretRef = await storePlaidAccessToken({
    accessToken: payload.access_token,
    itemId: payload.item_id,
    requestId: payload.request_id,
  });

  return {
    bankConnection: {
      accountId: input.accountId || "selected_account",
      institutionName: input.institutionName || "Linked institution",
      itemId: payload.item_id,
      tokenSecretRef,
      tokenVaultStatus: "ready",
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
