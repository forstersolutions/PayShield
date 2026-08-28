type CoreServiceConfig =
  | {
      configured: true;
      error: null;
      mode: "in_process";
      ok: true;
      serviceToken: string;
      timeoutMs: number;
    }
  | {
      configured: true;
      error: string;
      mode: "in_process";
      ok: false;
      serviceToken: string;
      timeoutMs: number;
    }
  | {
      baseUrl: string;
      configured: true;
      error: null;
      mode: "remote";
      ok: true;
      serviceToken: string;
      timeoutMs: number;
    }
  | {
      configured: true;
      error: string;
      mode: "remote";
      ok: false;
      serviceToken: string;
      timeoutMs: number;
    }
  | {
      configured: false;
      error: null;
      mode: "none";
      ok: false;
      serviceToken: string;
      timeoutMs: number;
    };

const defaultCoreTimeoutMs = 8_000;

function databaseConfigured(env: NodeJS.ProcessEnv) {
  return Boolean(
    env.PAYSHIELD_LEDGER_DATABASE_URL?.trim() ||
      ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"].every((name) =>
        Boolean(env[name]?.trim()),
      ),
  );
}

function inProcessCoreError(env: NodeJS.ProcessEnv) {
  if (!databaseConfigured(env)) {
    return "PAYSHIELD_LEDGER_DATABASE_URL must use the Supabase transaction pooler before the Vercel core runtime can start.";
  }

  const databaseUrl = env.PAYSHIELD_LEDGER_DATABASE_URL?.trim();

  if (env.VERCEL_ENV === "production" && databaseUrl) {
    try {
      const url = new URL(databaseUrl);

      if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !url.hostname.endsWith(".pooler.supabase.com")
      ) {
        return "Vercel Production must use the Supabase transaction-pooler PostgreSQL URL.";
      }
    } catch {
      return "PAYSHIELD_LEDGER_DATABASE_URL must be a valid PostgreSQL URL.";
    }
  }

  if (env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED?.trim().toLowerCase() !== "true") {
    return "PAYSHIELD_LEDGER_SCHEMA_VERIFIED must be true after the Supabase migrations are verified.";
  }

  if (env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION?.trim() !== "0022") {
    return "PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION must be 0022.";
  }

  if (env.PAYSHIELD_SUPABASE_SECURITY_VERIFIED?.trim().toLowerCase() !== "true") {
    return "PAYSHIELD_SUPABASE_SECURITY_VERIFIED must be true after forced RLS and Data API isolation are verified.";
  }

  return null;
}

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
  const runtime = env.PAYSHIELD_CORE_RUNTIME?.trim().toLowerCase() ?? "";

  if (runtime === "vercel") {
    const error = inProcessCoreError(env);

    if (error) {
      return {
        configured: true,
        error,
        mode: "in_process",
        ok: false,
        serviceToken,
        timeoutMs,
      };
    }

    return {
      configured: true,
      error: null,
      mode: "in_process",
      ok: true,
      serviceToken,
      timeoutMs,
    };
  }

  if (runtime && runtime !== "remote") {
    return {
      configured: true,
      error: "PAYSHIELD_CORE_RUNTIME must be vercel or remote.",
      mode: "remote",
      ok: false,
      serviceToken,
      timeoutMs,
    };
  }

  if (!rawBaseUrl) {
    return {
      configured: false,
      error: null,
      mode: "none",
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
      mode: "remote",
      ok: false,
      serviceToken,
      timeoutMs,
    };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return {
      configured: true,
      error: "PAYSHIELD_CORE_API_URL must use HTTP or HTTPS.",
      mode: "remote",
      ok: false,
      serviceToken,
      timeoutMs,
    };
  }

  if (env.VERCEL_ENV === "production" && url.protocol !== "https:") {
    return {
      configured: true,
      error: "PAYSHIELD_CORE_API_URL must use HTTPS in Vercel Production.",
      mode: "remote",
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
      mode: "remote",
      ok: false,
      serviceToken,
      timeoutMs,
    };
  }

  return {
    baseUrl: rawBaseUrl.replace(/\/+$/, ""),
    configured: true,
    error: null,
    mode: "remote",
    ok: true,
    serviceToken,
    timeoutMs,
  };
}

export function joinCorePath(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
