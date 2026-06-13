export const httpJsonProviderAdapter = "http_json";

function envPresent(name: string, env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env[name]?.trim());
}

function cleanBaseUrl(value: string | undefined, env: NodeJS.ProcessEnv) {
  if (!value?.trim()) {
    return "";
  }

  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname) &&
      env.VERCEL_ENV !== "production";

    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" && !localHttp)
    ) {
      return "";
    }

    url.pathname = url.pathname.replace(/\/+$/, "");

    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function cleanPath(value: string | undefined, fallback: string) {
  const path = value?.trim() || fallback;

  if (!path.startsWith("/") || path.includes("://")) {
    return fallback;
  }

  return path.replace(/\/{2,}/g, "/");
}

function adapterTimeoutMs(env: NodeJS.ProcessEnv) {
  const parsed = Number(env.PAYSHIELD_BAAS_TIMEOUT_MS);

  return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 30_000
    ? parsed
    : 8000;
}

export function getProviderAdapterConfig(env: NodeJS.ProcessEnv = process.env) {
  const adapter = env.PAYSHIELD_BAAS_ADAPTER?.trim().toLowerCase() || "";
  const apiBaseUrl = cleanBaseUrl(env.PAYSHIELD_BAAS_API_BASE_URL, env);
  const apiKeyConfigured = envPresent("PAYSHIELD_BAAS_API_KEY", env);
  const providerName = env.PAYSHIELD_BAAS_PROVIDER?.trim() || "";
  const missing = [
    ...(adapter === httpJsonProviderAdapter ? [] : ["PAYSHIELD_BAAS_ADAPTER=http_json"]),
    ...(apiBaseUrl ? [] : ["PAYSHIELD_BAAS_API_BASE_URL"]),
    ...(apiKeyConfigured ? [] : ["PAYSHIELD_BAAS_API_KEY"]),
    ...(providerName ? [] : ["PAYSHIELD_BAAS_PROVIDER"]),
  ];

  return {
    adapter,
    apiBaseUrl,
    apiKeyConfigured,
    endpoints: {
      billPayment: cleanPath(env.PAYSHIELD_BAAS_BILL_PAYMENT_PATH, "/bill-payments"),
      cardAuthorization: cleanPath(
        env.PAYSHIELD_BAAS_CARD_AUTHORIZATION_PATH,
        "/card-authorizations",
      ),
      cardIssue: cleanPath(env.PAYSHIELD_BAAS_CARD_ISSUE_PATH, "/cards"),
      customer: cleanPath(env.PAYSHIELD_BAAS_CUSTOMER_PATH, "/customers"),
      directDeposit: cleanPath(
        env.PAYSHIELD_BAAS_DIRECT_DEPOSIT_PATH,
        "/direct-deposit-instructions",
      ),
      financialAccount: cleanPath(
        env.PAYSHIELD_BAAS_FINANCIAL_ACCOUNT_PATH,
        "/financial-accounts",
      ),
      kyc: cleanPath(env.PAYSHIELD_BAAS_KYC_PATH, "/kyc/applications"),
      transfer: cleanPath(env.PAYSHIELD_BAAS_TRANSFER_PATH, "/ach-transfers"),
    },
    missing,
    ok: missing.length === 0,
    providerName,
    timeoutMs: adapterTimeoutMs(env),
  };
}

export function joinProviderPath(baseUrl: string, path: string) {
  return new URL(path.replace(/^\/+/, ""), `${baseUrl}/`).toString();
}
