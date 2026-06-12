import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import {
  authorizeCard,
  createBillPayment,
  createPayee,
  createUnlock,
  getBalances,
  getBucketProfile,
  getCoreHealth,
  getCoreReadiness,
  getProfile,
  handleProviderWebhook,
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

function assertCoreAuthorized(request) {
  const token = coreToken();

  if (!token) {
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
    return { value: {} };
  }

  try {
    return {
      value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
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

  const result = handler(parsed.value);
  json(response, result.status, result.body);
}

function writeResult(response, result) {
  json(response, result.status, result.body);
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
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "cache-control": "no-store",
      });
      response.end();
      return;
    }

    const auth = assertCoreAuthorized(request);

    if (!auth.ok) {
      json(response, auth.status, auth.body);
      return;
    }

    try {
      if (request.method === "GET" && path === "/app/me") {
        json(response, 200, getProfile());
        return;
      }

      if (request.method === "GET" && path === "/app/balances") {
        json(response, 200, getBalances());
        return;
      }

      if (request.method === "GET" && path === "/app/buckets") {
        json(response, 200, getBucketProfile());
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

      if (request.method === "POST" && path === "/app/onboarding/start") {
        writeResult(response, startOnboarding());
        return;
      }

      if (request.method === "POST" && path === "/app/payees") {
        await withJsonBody(request, response, createPayee);
        return;
      }

      if (request.method === "POST" && path === "/app/unlocks") {
        await withJsonBody(request, response, createUnlock);
        return;
      }

      if (request.method === "POST" && path === "/card/authorize") {
        await withJsonBody(request, response, authorizeCard);
        return;
      }

      if (request.method === "POST" && path === "/provider/webhooks") {
        await withJsonBody(request, response, handleProviderWebhook);
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
