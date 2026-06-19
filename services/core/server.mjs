import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import {
  authorizeCard,
  createBankLinkToken,
  createBillPayment,
  createDirectDepositSetup,
  createPayee,
  savePaycheckDetectionRule,
  createTransferIntent,
  createUnlock,
  detectPaycheck,
  exchangeBankPublicToken,
  getBalances,
  getBillingStatus,
  getBucketProfile,
  getCoreHealth,
  getCoreReadiness,
  getHouseholdActivation,
  getHouseholdAuditExport,
  getHouseholdOperations,
  getProfile,
  handleProviderWebhook,
  receiveTokenVaultHandoff,
  recordBankConnection,
  recordCommercialBillingEvent,
  recordCommercialCheckoutIntent,
  resolveReconciliationException,
  saveBucketProfile,
  startOnboarding,
} from "./product.mjs";

const port = Number(process.env.PORT || process.env.PAYSHIELD_CORE_PORT || 8080);
const maxJsonBytes = 64 * 1024;

function json(response, status, body) {
  const serialized = JSON.stringify(body, null, 2);

  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(serialized)),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(serialized);
}

function normalizePath(pathname) {
  if (pathname.startsWith("/api/")) {
    return pathname.slice(4);
  }

  return pathname;
}

function coreToken() {
  return process.env.PAYSHIELD_CORE_SERVICE_TOKEN?.trim() || "";
}

function envTrue(name) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function coreServiceTokenRequired() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    envTrue("PAYSHIELD_LIVE_MONEY_ENABLED") ||
    envTrue("PAYSHIELD_CORE_REQUIRE_SERVICE_TOKEN")
  );
}

function assertCoreAuthorized(request) {
  const token = coreToken();

  if (!token) {
    if (coreServiceTokenRequired()) {
      return {
        body: {
          code: "core_service_token_required",
          error:
            "PAYSHIELD_CORE_SERVICE_TOKEN must be configured before protected core routes can run in production or live-money mode.",
          service: "payshield-core",
        },
        ok: false,
        status: 503,
      };
    }

    return { ok: true };
  }

  const expected = `Bearer ${token}`;

  if (request.headers.authorization !== expected) {
    return {
      body: {
        error: "Unauthorized",
        service: "payshield-core",
      },
      ok: false,
      status: 401,
    };
  }

  return { ok: true };
}

function cleanHeader(value, maxLength = 160) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").slice(0, maxLength);
}

function requestActor(request) {
  return {
    authMode: cleanHeader(request.headers["x-payshield-auth-mode"], 40),
    clerkSubject: cleanHeader(request.headers["x-payshield-clerk-subject"], 160),
    email: cleanHeader(request.headers["x-payshield-user-email"], 160),
    name: cleanHeader(request.headers["x-payshield-user-name"], 120),
    userId: cleanHeader(request.headers["x-payshield-user-id"], 160),
  };
}

async function readJson(request) {
  let bytes = 0;
  const chunks = [];

  for await (const chunk of request) {
    bytes += chunk.length;

    if (bytes > maxJsonBytes) {
      return {
        error: "Request body is too large.",
        status: 413,
      };
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return { rawBody: "", value: {} };
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  try {
    return {
      rawBody,
      value: JSON.parse(rawBody),
    };
  } catch {
    return {
      error: "Request body must be valid JSON.",
      status: 400,
    };
  }
}

async function withJsonBody(request, response, handler) {
  const parsed = await readJson(request);

  if (parsed.error) {
    json(response, parsed.status, {
      error: parsed.error,
      service: "payshield-core",
    });
    return;
  }

  const value =
    parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value)
      ? {
          ...parsed.value,
          __payshieldActor: requestActor(request),
        }
      : parsed.value;
  const result = await handler(value);
  json(response, result.status, result.body);
}

async function withSignedJsonBody(request, response, handler) {
  const parsed = await readJson(request);

  if (parsed.error) {
    json(response, parsed.status, {
      error: parsed.error,
      service: "payshield-core",
    });
    return;
  }

  const value =
    parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value)
      ? {
          ...parsed.value,
          __payshieldRawBody: parsed.rawBody,
          __payshieldSignature: cleanHeader(
            request.headers["x-payshield-signature"],
            320,
          ),
        }
      : parsed.value;
  const result = await handler(value);

  json(response, result.status, result.body);
}

async function withProviderWebhookBody(request, response, handler) {
  const parsed = await readJson(request);

  if (parsed.error) {
    json(response, parsed.status, {
      error: parsed.error,
      service: "payshield-core",
    });
    return;
  }

  const value =
    parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value)
      ? {
          ...parsed.value,
          __payshieldActor: requestActor(request),
          __payshieldProviderRawBody: parsed.rawBody,
          __payshieldProviderSignature: cleanHeader(
            request.headers["x-payshield-provider-signature"],
            320,
          ),
        }
      : parsed.value;
  const result = await handler(value);

  json(response, result.status, result.body);
}

async function writeResult(response, result) {
  const resolved = await result;

  json(response, resolved.status, resolved.body);
}

export function createCoreServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === "/health") {
      json(response, 200, getCoreHealth());
      return;
    }

    if (request.method === "GET" && path === "/ready") {
      const readiness = getCoreReadiness(process.env, { coreOnline: true });

      json(response, readiness.liveMoneyReady ? 200 : 503, {
        readiness,
        service: "payshield-core",
      });
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-headers": "authorization, content-type, x-payshield-provider-signature, x-payshield-signature",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "cache-control": "no-store",
      });
      response.end();
      return;
    }

    if (request.method === "POST" && path === "/token-vault/plaid") {
      await withSignedJsonBody(request, response, receiveTokenVaultHandoff);
      return;
    }

    const auth = assertCoreAuthorized(request);

    if (!auth.ok) {
      json(response, auth.status, auth.body);
      return;
    }

    const actor = requestActor(request);

    try {
      if (request.method === "GET" && path === "/app/me") {
        json(response, 200, getProfile(process.env, actor));
        return;
      }

      if (request.method === "GET" && path === "/app/balances") {
        await writeResult(response, getBalances(process.env, actor));
        return;
      }

      if (request.method === "GET" && path === "/app/activation") {
        await writeResult(response, getHouseholdActivation(process.env, actor));
        return;
      }

      if (request.method === "GET" && path === "/app/billing/status") {
        await writeResult(response, getBillingStatus(process.env, actor));
        return;
      }

      if (request.method === "GET" && path === "/app/buckets") {
        await writeResult(response, getBucketProfile(process.env, actor));
        return;
      }

      if (request.method === "GET" && path === "/app/operations") {
        await writeResult(response, getHouseholdOperations(process.env, actor));
        return;
      }

      if (request.method === "GET" && path === "/app/audit/export") {
        await writeResult(response, getHouseholdAuditExport(process.env, actor));
        return;
      }

      if (request.method === "POST" && path === "/app/buckets") {
        await withJsonBody(request, response, saveBucketProfile);
        return;
      }

      if (request.method === "POST" && path === "/app/bill-payments") {
        await withJsonBody(request, response, createBillPayment);
        return;
      }

      if (request.method === "POST" && path === "/app/billing/checkout") {
        await withJsonBody(request, response, recordCommercialCheckoutIntent);
        return;
      }

      if (request.method === "POST" && path === "/app/direct-deposit") {
        await withJsonBody(request, response, createDirectDepositSetup);
        return;
      }

      if (request.method === "POST" && path === "/app/bank-link/token") {
        await withJsonBody(request, response, createBankLinkToken);
        return;
      }

      if (request.method === "POST" && path === "/app/bank-link/exchange") {
        await withJsonBody(request, response, exchangeBankPublicToken);
        return;
      }

      if (request.method === "POST" && path === "/app/bank-connections") {
        await withJsonBody(request, response, recordBankConnection);
        return;
      }

      if (request.method === "POST" && path === "/commercial/billing-events") {
        await withJsonBody(request, response, recordCommercialBillingEvent);
        return;
      }

      if (request.method === "POST" && path === "/app/onboarding/start") {
        await writeResult(response, startOnboarding(process.env, actor));
        return;
      }

      if (request.method === "POST" && path === "/app/payees") {
        await withJsonBody(request, response, createPayee);
        return;
      }

      if (request.method === "POST" && path === "/app/paychecks/rules") {
        await withJsonBody(request, response, savePaycheckDetectionRule);
        return;
      }

      if (request.method === "POST" && path === "/app/paychecks/detect") {
        await withJsonBody(request, response, detectPaycheck);
        return;
      }

      if (request.method === "POST" && path === "/app/transfers") {
        await withJsonBody(request, response, createTransferIntent);
        return;
      }

      if (request.method === "POST" && path === "/app/unlocks") {
        await withJsonBody(request, response, createUnlock);
        return;
      }

      if (request.method === "POST" && path === "/app/reconciliation/resolve") {
        await withJsonBody(request, response, resolveReconciliationException);
        return;
      }

      if (request.method === "POST" && path === "/card/authorize") {
        await withJsonBody(request, response, authorizeCard);
        return;
      }

      if (request.method === "POST" && path === "/provider/webhooks") {
        await withProviderWebhookBody(request, response, handleProviderWebhook);
        return;
      }

      json(response, 404, {
        error: "Not found",
        service: "payshield-core",
      });
    } catch (error) {
      json(response, 400, {
        error: error instanceof Error ? error.message : "Core request failed.",
        service: "payshield-core",
      });
    }
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  createCoreServer().listen(port, "0.0.0.0", () => {
    console.log(`payshield-core listening on ${port}`);
  });
}
