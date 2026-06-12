type CoreServiceConfig =
  | {
      baseUrl: string;
      configured: true;
      error: null;
      ok: true;
      serviceToken: string;
      timeoutMs: number;
    }
  | {
      configured: true;
      error: string;
      ok: false;
      serviceToken: string;
      timeoutMs: number;
    }
  | {
      configured: false;
      error: null;
      ok: false;
      serviceToken: string;
      timeoutMs: number;
    };

const defaultCoreTimeoutMs = 8_000;

function parseTimeoutMs(value: string | undefined) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > 30_000) {
    return defaultCoreTimeoutMs;
  }

  return parsed;
}

export function getCoreServiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): CoreServiceConfig {
  const rawBaseUrl = env.PAYSHIELD_CORE_API_URL?.trim() ?? "";
  const serviceToken = env.PAYSHIELD_CORE_SERVICE_TOKEN?.trim() ?? "";
  const timeoutMs = parseTimeoutMs(env.PAYSHIELD_CORE_TIMEOUT_MS);

  if (!rawBaseUrl) {
    return {
      configured: false,
      error: null,
      ok: false,
      serviceToken,
      timeoutMs,
    };
  }

  let url: URL;

  try {
    url = new URL(rawBaseUrl);
  } catch {
    return {
      configured: true,
      error: "PAYSHIELD_CORE_API_URL must be a valid absolute HTTP(S) URL.",
      ok: false,
      serviceToken,
      timeoutMs,
    };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return {
      configured: true,
      error: "PAYSHIELD_CORE_API_URL must use HTTP or HTTPS.",
      ok: false,
      serviceToken,
      timeoutMs,
    };
  }

  if (env.VERCEL_ENV === "production" && url.protocol !== "https:") {
    return {
      configured: true,
      error: "PAYSHIELD_CORE_API_URL must use HTTPS in Vercel Production.",
      ok: false,
      serviceToken,
      timeoutMs,
    };
  }

  if (url.username || url.password || url.search || url.hash) {
    return {
      configured: true,
      error:
        "PAYSHIELD_CORE_API_URL must not include credentials, query strings, or fragments.",
      ok: false,
      serviceToken,
      timeoutMs,
    };
  }

  return {
    baseUrl: rawBaseUrl.replace(/\/+$/, ""),
    configured: true,
    error: null,
    ok: true,
    serviceToken,
    timeoutMs,
  };
}

export function joinCorePath(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
