import { createServer } from "node:http";

const port = Number(process.env.PORT || process.env.PAYSHIELD_CORE_PORT || 8080);

function json(response, status, body) {
  const serialized = JSON.stringify(body, null, 2);

  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(serialized)),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(serialized);
}

function readiness() {
  const gates = {
    clerkAuth: Boolean(
      process.env.CLERK_SECRET_KEY &&
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    ),
    counselSignoff:
      process.env.PAYSHIELD_REGULATED_COUNSEL_SIGNOFF === "true",
    operationsRunbooks:
      process.env.PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED === "true",
    postgresLedger: Boolean(process.env.PAYSHIELD_LEDGER_DATABASE_URL),
    providerContract:
      process.env.PAYSHIELD_BAAS_CONTRACT_APPROVED === "true",
    providerCredentials: Boolean(
      process.env.PAYSHIELD_BAAS_PROVIDER && process.env.PAYSHIELD_BAAS_API_KEY,
    ),
    sponsorDisclosures:
      process.env.PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED === "true",
  };

  return {
    gates,
    liveMoneyReady:
      process.env.PAYSHIELD_LIVE_MONEY_ENABLED === "true" &&
      Object.values(gates).every(Boolean),
    service: "payshield-core",
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, {
      ok: true,
      ...readiness(),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/ready") {
    const status = readiness();

    json(response, status.liveMoneyReady ? 200 : 503, status);
    return;
  }

  json(response, 404, {
    error: "Not found",
    service: "payshield-core",
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`payshield-core listening on ${port}`);
});
