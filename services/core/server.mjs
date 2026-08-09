import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { closeDatabasePool, databaseConfigured } from "./database.mjs";
import {
  archivePayee,
  authorizeCard,
  cancelBillPayment,
  createBankLinkToken,
  createBillPayment,
  createDirectDepositSetup,
  createPayee,
  savePaycheckDetectionRule,
  createTransferIntent,
  createUnlock,
  detectPaycheck,
  exchangeBankPublicToken,
  getBankConnections,
  getBalances,
  getBillingStatus,
  getBucketProfile,
  getCoreReadiness,
  getHouseholdActivation,
  getHouseholdAuditExport,
  getHouseholdMoneyProfile,
  getHouseholdControlPlan,
  getHouseholdOperations,
  getProfile,
  handleProviderWebhook,
  processPlaidSyncJobs,
  receiveTokenVaultHandoff,
  recordBankConnection,
  recordCommercialBillingEvent,
  recordCommercialCheckoutIntent,
  recordProductionGateEvidence,
  resolveReconciliationException,
  saveBucketProfile,
  saveHouseholdMoneyProfile,
  setCardStatus,
  startOnboarding,
  startPayeeVerification,
  syncLinkedBankPaychecks,
  updatePayee,
} from "./product.mjs";

const port = Number(process.env.PORT || process.env.PAYSHIELD_CORE_PORT || 8080);
const maxJsonBytes = 64 * 1024;

function plaidWorkerIntervalMs() {
  const parsed = Number(process.env.PAYSHIELD_PLAID_SYNC_WORKER_INTERVAL_MS);

  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 60_000
    ? parsed
    : 5_000;
}

function plaidWorkerEnabled() {
  return (
    databaseConfigured(process.env) &&
    process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED?.trim().toLowerCase() ===
      "true" &&
    process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION?.trim() === "0019" &&
    process.env.PAYSHIELD_PLAID_SYNC_WORKER_ENABLED?.trim().toLowerCase() !==
      "false"
  );
}

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
  const provided = request.headers.authorization || "";
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
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

  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    json(response, 400, {
      error: "Request body must be a JSON object.",
      service: "payshield-core",
    });
    return;
  }

  const value = {
    ...parsed.value,
    __payshieldActor: requestActor(request),
  };
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

  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    json(response, 400, {
      error: "Request body must be a JSON object.",
      service: "payshield-core",
    });
    return;
  }

  const value = {
    ...parsed.value,
    __payshieldRawBody: parsed.rawBody,
    __payshieldSignature: cleanHeader(
      request.headers["x-payshield-signature"],
      320,
    ),
  };
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

  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    json(response, 400, {
      accepted: false,
      error: "Request body must be a JSON object.",
      service: "payshield-core",
    });
    return;
  }

  const value = {
    ...parsed.value,
    __payshieldActor: requestActor(request),
    __payshieldProviderRawBody: parsed.rawBody,
    __payshieldProviderSignature: cleanHeader(
      request.headers["x-payshield-provider-signature"],
      320,
    ),
    __payshieldPlaidVerification: cleanHeader(
      request.headers["plaid-verification"],
      4096,
    ),
  };
  const result = await handler(value);

  json(response, result.status, result.body);
}

async function writeResult(response, result) {
  const resolved = await result;

  json(response, resolved.status, resolved.body);
}

export function createCoreServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    const path = normalizePath(url.pathname);

    if (request.method === "GET" && path === "/health") {
      json(response, 200, {
        ok: true,
        service: "payshield-core",
        status: "healthy",
      });
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-headers": "authorization, content-type, plaid-verification, x-payshield-provider-signature, x-payshield-signature",
        "access-control-allow-methods": "DELETE,GET,PATCH,POST,OPTIONS",
        "cache-control": "no-store",
      });
      response.end();
      return;
    }

    if (request.method === "POST" && path === "/token-vault/plaid") {
      await withSignedJsonBody(request, response, receiveTokenVaultHandoff);
      return;
    }

    if (request.method === "POST" && path === "/card/authorize") {
      await withProviderWebhookBody(request, response, authorizeCard);
      return;
    }

    if (request.method === "POST" && path === "/provider/webhooks") {
      await withProviderWebhookBody(request, response, handleProviderWebhook);
      return;
    }

    if (request.method === "POST" && path === "/plaid/webhooks") {
      await withProviderWebhookBody(request, response, (payload) =>
        handleProviderWebhook(
          {
            ...payload,
            __payshieldProviderSource: "plaid",
            providerName: "plaid",
          },
          process.env,
        ),
      );
      return;
    }

    const auth = assertCoreAuthorized(request);

    if (!auth.ok) {
      json(response, auth.status, auth.body);
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

    const actor = requestActor(request);

    try {
      if (request.method === "GET" && path === "/app/me") {
        await writeResult(response, getProfile(process.env, actor));
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

      if (request.method === "GET" && path === "/app/control-plan") {
        await writeResult(response, getHouseholdControlPlan(process.env, actor));
        return;
      }

      if (request.method === "GET" && path === "/app/money-profile") {
        await writeResult(response, getHouseholdMoneyProfile(process.env, actor));
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

      if (request.method === "POST" && path === "/app/control-plan") {
        await withJsonBody(request, response, (payload) =>
          getHouseholdControlPlan(process.env, payload.__payshieldActor, payload),
        );
        return;
      }

      if (request.method === "POST" && path === "/app/money-profile") {
        await withJsonBody(request, response, saveHouseholdMoneyProfile);
        return;
      }

      if (request.method === "POST" && path === "/app/bill-payments") {
        await withJsonBody(request, response, createBillPayment);
        return;
      }

      if (
        request.method === "POST" &&
        path === "/app/bill-payments/cancel"
      ) {
        await withJsonBody(request, response, cancelBillPayment);
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

      if (request.method === "GET" && path === "/app/bank-connections") {
        await writeResult(
          response,
          getBankConnections(process.env, requestActor(request)),
        );
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

      if (request.method === "PATCH" && path === "/app/payees") {
        await withJsonBody(request, response, updatePayee);
        return;
      }

      if (request.method === "DELETE" && path === "/app/payees") {
        await withJsonBody(request, response, archivePayee);
        return;
      }

      if (request.method === "POST" && path === "/app/payees/verify") {
        await withJsonBody(request, response, startPayeeVerification);
        return;
      }

      if (request.method === "POST" && path === "/app/card/status") {
        await withJsonBody(request, response, setCardStatus);
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

      if (request.method === "POST" && path === "/app/paychecks/sync") {
        await withJsonBody(request, response, syncLinkedBankPaychecks);
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

      if (request.method === "POST" && path === "/launch/gate-evidence") {
        await withJsonBody(request, response, recordProductionGateEvidence);
        return;
      }

      json(response, 404, {
        error: "Not found",
        service: "payshield-core",
      });
    } catch (error) {
      console.error("payshield-core request failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        method: request.method,
        path,
      });
      json(response, 500, {
        code: "core_request_failed",
        error: "Core request failed.",
        service: "payshield-core",
      });
    }
  });

  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;
  server.requestTimeout = 20_000;

  return server;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const server = createCoreServer();
  let shuttingDown = false;
  let plaidWorkerActive = false;
  let plaidWorkerTimer = null;

  const runPlaidWorker = async () => {
    if (plaidWorkerActive || shuttingDown || !plaidWorkerEnabled()) {
      return;
    }

    plaidWorkerActive = true;

    try {
      await processPlaidSyncJobs(process.env);
    } catch (error) {
      console.error("payshield-core Plaid sync worker failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    } finally {
      plaidWorkerActive = false;
    }
  };

  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`payshield-core received ${signal}; draining requests`);

    if (plaidWorkerTimer) {
      clearInterval(plaidWorkerTimer);
    }

    const forcedExit = setTimeout(() => process.exit(1), 25_000);
    forcedExit.unref();

    server.close(async (error) => {
      try {
        await closeDatabasePool();
      } catch {
        process.exitCode = 1;
      }

      clearTimeout(forcedExit);
      process.exit(error || process.exitCode ? 1 : 0);
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  server.listen(port, "0.0.0.0", () => {
    console.log(`payshield-core listening on ${port}`);

    if (plaidWorkerEnabled()) {
      plaidWorkerTimer = setInterval(
        runPlaidWorker,
        plaidWorkerIntervalMs(),
      );
      plaidWorkerTimer.unref();
      void runPlaidWorker();
    }
  });
}
