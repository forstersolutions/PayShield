import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server.js";
import { GET as getActivation } from "../src/app/api/app/activation/route.ts";
import { GET as exportAudit } from "../src/app/api/app/audit/export/route.ts";
import { GET as getBalances } from "../src/app/api/app/balances/route.ts";
import {
  GET as getBankConnections,
  POST as recordBankConnection,
} from "../src/app/api/app/bank-connections/route.ts";
import { POST as exchangeBankLink } from "../src/app/api/app/bank-link/exchange/route.ts";
import { POST as createBankLinkToken } from "../src/app/api/app/bank-link/token/route.ts";
import { POST as openBillingPortal } from "../src/app/api/app/billing/portal/route.ts";
import { GET as getBillingStatus } from "../src/app/api/app/billing/status/route.ts";
import { POST as scheduleBillPayment } from "../src/app/api/app/bill-payments/route.ts";
import {
  GET as getBuckets,
  POST as saveBuckets,
} from "../src/app/api/app/buckets/route.ts";
import { POST as setupDirectDeposit } from "../src/app/api/app/direct-deposit/route.ts";
import { POST as startOnboarding } from "../src/app/api/app/onboarding/start/route.ts";
import { POST as createPayee } from "../src/app/api/app/payees/route.ts";
import { POST as detectPaycheck } from "../src/app/api/app/paychecks/detect/route.ts";
import { POST as savePaycheckRule } from "../src/app/api/app/paychecks/rules/route.ts";
import { POST as syncPaychecks } from "../src/app/api/app/paychecks/sync/route.ts";
import { POST as createTransfer } from "../src/app/api/app/transfers/route.ts";
import { POST as unlockBucket } from "../src/app/api/app/unlocks/route.ts";
import {
  GET as getControlPlan,
  POST as generateControlPlan,
} from "../src/app/api/app/control-plan/route.ts";
import {
  GET as getMoneyProfile,
  POST as saveMoneyProfile,
} from "../src/app/api/app/money-profile/route.ts";
import { POST as recordLaunchGateEvidence } from "../src/app/api/launch/gate-evidence/route.ts";
import { GET as getOperations } from "../src/app/api/app/operations/route.ts";
import { POST as authorizeCard } from "../src/app/api/card/authorize/route.ts";
import { POST as providerWebhook } from "../src/app/api/provider/webhooks/route.ts";

const endpoint = "https://payshield.test";
const envKeys = [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "PAYSHIELD_ALLOW_OPERATOR_REVIEW_ACCESS",
  "PAYSHIELD_CORE_API_URL",
  "PAYSHIELD_CORE_SERVICE_TOKEN",
  "PAYSHIELD_CORE_TIMEOUT_MS",
  "STRIPE_SECRET_KEY",
  "VERCEL_ENV",
];

beforeEach(() => {
  for (const key of envKeys) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of envKeys) {
    delete process.env[key];
  }
});

function makeRequest(path: string, payload: unknown) {
  return new NextRequest(`${endpoint}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

function makeProviderWebhookRequest(path: string, payload: unknown) {
  return new NextRequest(`${endpoint}${path}`, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
      "x-payshield-provider-signature": "t=1234567890,v1=abcdef",
    },
    method: "POST",
  });
}

async function parseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function withCoreProxyServer<T>(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  fn: (baseUrl: string) => Promise<T>,
) {
  const server = createServer(handler);

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test("app API delegates balances to configured core service with token and session context", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.authMode = request.headers["x-payshield-auth-mode"];
      captured.userEmail = request.headers["x-payshield-user-email"];
      captured.method = request.method;
      captured.userName = request.headers["x-payshield-user-name"];
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          buckets: [],
          coreDelegated: true,
          safeToSpendCents: 12_345,
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-secret";

      const response = await getBalances();
      const body = await parseJson(response);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(body.safeToSpendCents, 12_345);
      assert.equal(captured.authorization, "Bearer core-secret");
      assert.equal(captured.authMode, "demo");
      assert.equal(captured.userEmail, "private-household@example.com");
      assert.equal(captured.userId, "user_demo_001");
      assert.equal(captured.userName, "PayShield household");
      assert.equal(captured.method, "GET");
      assert.equal(captured.url, "/api/app/balances");
    },
  );
});

test("operations API delegates household records to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.method = request.method;
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          balances: { safeToSpendCents: 44_000 },
          coreDelegated: true,
          service: "payshield-household-operations",
          timeline: [],
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-ops-secret";

      const response = await getOperations();
      const body = await parseJson(response);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(captured.authorization, "Bearer core-ops-secret");
      assert.equal(captured.method, "GET");
      assert.equal(captured.url, "/api/app/operations");
      assert.equal(captured.userId, "user_demo_001");
    },
  );
});

test("control-plan API delegates household plan reads to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.method = request.method;
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          coreDelegated: true,
          service: "payshield-household-control-plan",
          summary: {
            projectedSafeToSpendCents: 88_000,
          },
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-control-secret";

      const response = await getControlPlan();
      const body = await parseJson(response);
      const summary = body.summary as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(summary.projectedSafeToSpendCents, 88_000);
      assert.equal(captured.authorization, "Bearer core-control-secret");
      assert.equal(captured.method, "GET");
      assert.equal(captured.url, "/api/app/control-plan");
      assert.equal(captured.userId, "user_demo_001");
    },
  );
});

test("control-plan API delegates generated paycheck plans to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          coreDelegated: true,
          detectionRule: {
            ruleName: "Core payroll rule",
          },
          service: "payshield-household-control-plan",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-control-post-secret";

      const response = await generateControlPlan(
        makeRequest("/api/app/control-plan", {
          employerName: "Core Payroll",
          paycheckAmountCents: 240_000,
        }),
      );
      const body = await parseJson(response);
      const requestBody = JSON.parse(String(captured.body)) as Record<
        string,
        unknown
      >;
      const detectionRule = body.detectionRule as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(detectionRule.ruleName, "Core payroll rule");
      assert.equal(captured.authorization, "Bearer core-control-post-secret");
      assert.equal(captured.method, "POST");
      assert.equal(captured.url, "/api/app/control-plan");
      assert.equal(captured.userId, "user_demo_001");
      assert.equal(requestBody.employerName, "Core Payroll");
      assert.equal(requestBody.paycheckAmountCents, 240_000);
    },
  );
});

test("money-profile API delegates profile reads to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.method = request.method;
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          coreDelegated: true,
          profile: {
            employerName: "Core Payroll",
            paycheckAmountCents: 240_000,
          },
          service: "payshield-household-money-profile",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-profile-secret";

      const response = await getMoneyProfile();
      const body = await parseJson(response);
      const profile = body.profile as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(profile.employerName, "Core Payroll");
      assert.equal(captured.authorization, "Bearer core-profile-secret");
      assert.equal(captured.method, "GET");
      assert.equal(captured.url, "/api/app/money-profile");
      assert.equal(captured.userId, "user_demo_001");
    },
  );
});

test("money-profile API delegates durable profile saves to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          coreDelegated: true,
          persisted: true,
          profile: {
            employerName: "Core Payroll",
            paycheckAmountCents: 240_000,
          },
          service: "payshield-household-money-profile",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-profile-save-secret";

      const response = await saveMoneyProfile(
        makeRequest("/api/app/money-profile", {
          employerName: "Core Payroll",
          expectedFrequency: "biweekly",
          paycheckAmountCents: 240_000,
          requestedTransferCents: 15_000,
        }),
      );
      const body = await parseJson(response);
      const requestBody = JSON.parse(String(captured.body)) as Record<
        string,
        unknown
      >;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(body.persisted, true);
      assert.equal(captured.authorization, "Bearer core-profile-save-secret");
      assert.equal(captured.method, "POST");
      assert.equal(captured.url, "/api/app/money-profile");
      assert.equal(captured.userId, "user_demo_001");
      assert.equal(requestBody.employerName, "Core Payroll");
      assert.equal(requestBody.paycheckAmountCents, 240_000);
    },
  );
});

test("activation API delegates operator checklist to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.method = request.method;
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          activationPlan: {
            nextStageKey: "revenue",
          },
          coreDelegated: true,
          service: "payshield-activation-console",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-activation-secret";

      const response = await getActivation();
      const body = await parseJson(response);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(captured.authorization, "Bearer core-activation-secret");
      assert.equal(captured.method, "GET");
      assert.equal(captured.url, "/api/app/activation");
      assert.equal(captured.userId, "user_demo_001");
    },
  );
});

test("launch gate evidence API delegates approval records to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          accepted: true,
          coreDelegated: true,
          evidence: {
            gateId: "counsel_signoff",
            scope: "counsel",
            status: "approved",
          },
          service: "payshield-production-gate-evidence",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-gate-evidence-secret";
      process.env.PAYSHIELD_ALLOW_OPERATOR_REVIEW_ACCESS = "true";

      const response = await recordLaunchGateEvidence(
        makeRequest("/api/launch/gate-evidence", {
          approvedBy: "Grayston Operations",
          evidenceRef: "notion-counsel-signoff-2026-06",
          evidenceSummary:
            "Redacted counsel approval summary for production launch controls.",
          gateId: "counsel_signoff",
          scope: "counsel",
          status: "approved",
        }),
      );
      const body = await parseJson(response);
      const forwardedBody = JSON.parse(String(captured.body)) as Record<
        string,
        unknown
      >;
      const evidence = body.evidence as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(evidence.gateId, "counsel_signoff");
      assert.equal(captured.authorization, "Bearer core-gate-evidence-secret");
      assert.equal(captured.method, "POST");
      assert.equal(captured.url, "/api/launch/gate-evidence");
      assert.equal(captured.userId, "user_demo_001");
      assert.equal(forwardedBody.approvedBy, "Grayston Operations");
      assert.equal(forwardedBody.gateId, "counsel_signoff");
    },
  );
});

test("billing status API delegates paid-access state to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.method = request.method;
      captured.url = request.url;

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          commercialAccess: {
            priceLabel: "$19/month",
            state: "active",
          },
          coreDelegated: true,
          service: "payshield-billing-status",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-billing-secret";

      const response = await getBillingStatus();
      const body = await parseJson(response);
      const commercialAccess = body.commercialAccess as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(commercialAccess.state, "active");
      assert.equal(captured.authorization, "Bearer core-billing-secret");
      assert.equal(captured.method, "GET");
      assert.equal(captured.url, "/api/app/billing/status");
    },
  );
});

test("billing portal uses durable core customer state for Stripe self service", async () => {
  const captured: Record<string, unknown> = {};
  const originalFetch = globalThis.fetch;

  await withCoreProxyServer(
    (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.method = request.method;
      captured.url = request.url;

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          commercialAccess: {
            priceLabel: "$19/month",
            providerCustomerId: "cus_core_active",
            state: "active",
          },
          coreDelegated: true,
          service: "payshield-billing-status",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-portal-secret";
      process.env.STRIPE_SECRET_KEY = "sk_test_portal";

      globalThis.fetch = async (input, init) => {
        const url = String(input);

        if (url === "https://api.stripe.com/v1/billing_portal/sessions") {
          captured.stripeBody = String(init?.body ?? "");
          captured.stripeVersion = String(
            (init?.headers as Record<string, string>)?.["stripe-version"] ?? "",
          );

          return new Response(
            JSON.stringify({
              id: "bps_core_customer",
              url: "https://billing.stripe.com/p/session/test_core",
            }),
            {
              headers: { "content-type": "application/json" },
              status: 200,
            },
          );
        }

        return originalFetch(input, init);
      };

      try {
        const response = await openBillingPortal(
          makeRequest("/api/app/billing/portal", {
            returnPath: "/app?billing=manage",
          }),
        );
        const body = await parseJson(response);
        const stripeBody = new URLSearchParams(String(captured.stripeBody));

        assert.equal(response.status, 200);
        assert.equal(body.url, "https://billing.stripe.com/p/session/test_core");
        assert.equal(body.portalSessionId, "bps_core_customer");
        assert.equal(captured.authorization, "Bearer core-portal-secret");
        assert.equal(captured.method, "GET");
        assert.equal(captured.url, "/api/app/billing/status");
        assert.equal(captured.stripeVersion, "2026-02-25.clover");
        assert.equal(stripeBody.get("customer"), "cus_core_active");
        assert.equal(
          stripeBody.get("return_url"),
          "https://payshield.test/app?billing=manage",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});

test("bank link token API delegates Plaid Link setup to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.authMode = request.headers["x-payshield-auth-mode"];
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.url = request.url;

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          coreDelegated: true,
          linkToken: "link-sandbox-core",
          service: "payshield-bank-link-token",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-bank-link-secret";

      const response = await createBankLinkToken(
        makeRequest("/api/app/bank-link/token", {
          androidPackageName: "com.graystontechnologies.payshield",
          platform: "android",
        }),
      );
      const body = await parseJson(response);
      const forwardedBody = JSON.parse(String(captured.body || "{}")) as Record<
        string,
        unknown
      >;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(body.linkToken, "link-sandbox-core");
      assert.equal(captured.authorization, "Bearer core-bank-link-secret");
      assert.equal(captured.authMode, "demo");
      assert.equal(captured.method, "POST");
      assert.equal(captured.url, "/api/app/bank-link/token");
      assert.equal(
        forwardedBody.androidPackageName,
        "com.graystontechnologies.payshield",
      );
      assert.equal(forwardedBody.origin, endpoint);
      assert.equal(forwardedBody.platform, "android");
    },
  );
});

test("bank link exchange API delegates public token exchange to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.url = request.url;

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          bankConnection: {
            institutionName: "Core Bank",
            tokenVaultStatus: "ready",
          },
          coreDelegated: true,
          service: "payshield-bank-link-exchange",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-exchange-secret";

      const response = await exchangeBankLink(
        makeRequest("/api/app/bank-link/exchange", {
          accountId: "acc_core",
          institutionName: "Core Bank",
          publicToken: "public-sandbox-token",
        }),
      );
      const body = await parseJson(response);
      const forwardedBody = JSON.parse(String(captured.body || "{}")) as Record<
        string,
        unknown
      >;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(
        (body.bankConnection as Record<string, unknown>).tokenVaultStatus,
        "ready",
      );
      assert.equal(captured.authorization, "Bearer core-exchange-secret");
      assert.equal(captured.method, "POST");
      assert.equal(captured.url, "/api/app/bank-link/exchange");
      assert.equal(forwardedBody.publicToken, "public-sandbox-token");
      assert.equal(forwardedBody.accountId, "acc_core");
    },
  );
});

test("bank connection API delegates provider connection records to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          accepted: true,
          bankConnection: {
            institutionName: "Core Bank",
            providerAccountId: "acc_core",
            providerItemId: "item_core",
            status: "connected",
          },
          coreDelegated: true,
          service: "payshield-bank-connections",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-bank-connection-secret";

      const response = await recordBankConnection(
        makeRequest("/api/app/bank-connections", {
          accountId: "acc_core",
          accountMask: "1234",
          institutionName: "Core Bank",
          itemId: "item_core",
          providerName: "plaid",
          tokenSecretRef: "vault://plaid/item_core",
        }),
      );
      const body = await parseJson(response);
      const forwardedBody = JSON.parse(String(captured.body || "{}")) as Record<
        string,
        unknown
      >;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(body.service, "payshield-bank-connections");
      assert.equal(captured.authorization, "Bearer core-bank-connection-secret");
      assert.equal(captured.method, "POST");
      assert.equal(captured.url, "/api/app/bank-connections");
      assert.equal(captured.userId, "user_demo_001");
      assert.equal(forwardedBody.accountId, "acc_core");
      assert.equal(forwardedBody.itemId, "item_core");
      assert.equal(forwardedBody.tokenSecretRef, "vault://plaid/item_core");
    },
  );
});

test("bank connection API loads connected sources from configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.method = request.method;
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          bankConnections: [
            {
              accountMask: "1234",
              institutionName: "Core Bank",
              providerAccountId: "acc_core",
              status: "connected",
            },
          ],
          coreDelegated: true,
          service: "payshield-bank-connections",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-bank-connection-secret";

      const response = await getBankConnections();
      const body = await parseJson(response);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(body.service, "payshield-bank-connections");
      assert.equal(captured.authorization, "Bearer core-bank-connection-secret");
      assert.equal(captured.method, "GET");
      assert.equal(captured.url, "/api/app/bank-connections");
      assert.equal(captured.userId, "user_demo_001");
      assert.equal(
        (body.bankConnections as Array<Record<string, unknown>>)[0]
          .institutionName,
        "Core Bank",
      );
    },
  );
});

test("paycheck detection rule API delegates durable rule storage to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.url = request.url;
      captured.userId = request.headers["x-payshield-user-id"];

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          coreDelegated: true,
          persisted: true,
          rule: {
            id: "rule_core",
            ruleName: "Core payroll",
          },
          service: "payshield-paycheck-detection-rules",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-rule-secret";

      const response = await savePaycheckRule(
        makeRequest("/api/app/paychecks/rules", {
          employerNamePattern: "CORE PAYROLL",
          expectedFrequency: "biweekly",
          minimumAmountCents: 150_000,
          ruleName: "Core payroll",
        }),
      );
      const body = await parseJson(response);
      const forwardedBody = JSON.parse(String(captured.body || "{}")) as Record<
        string,
        unknown
      >;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(body.persisted, true);
      assert.equal(captured.authorization, "Bearer core-rule-secret");
      assert.equal(captured.method, "POST");
      assert.equal(captured.url, "/api/app/paychecks/rules");
      assert.equal(captured.userId, "user_demo_001");
      assert.equal(forwardedBody.ruleName, "Core payroll");
      assert.equal(forwardedBody.minimumAmountCents, 150_000);
    },
  );
});

test("paycheck detection API delegates ledger posting to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.url = request.url;

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          coreDelegated: true,
          protectedCents: 155_000,
          safeToSpendCents: 145_000,
          service: "payshield-paycheck-detection",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-detect-secret";

      const response = await detectPaycheck(
        makeRequest("/api/app/paychecks/detect", {
          amountCents: 300_000,
          employerName: "Core Payroll",
          idempotencyKey: "core-route-paycheck",
        }),
      );
      const body = await parseJson(response);
      const forwardedBody = JSON.parse(String(captured.body || "{}")) as Record<
        string,
        unknown
      >;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(body.safeToSpendCents, 145_000);
      assert.equal(captured.authorization, "Bearer core-detect-secret");
      assert.equal(captured.method, "POST");
      assert.equal(captured.url, "/api/app/paychecks/detect");
      assert.equal(forwardedBody.employerName, "Core Payroll");
      assert.equal(forwardedBody.amountCents, 300_000);
    },
  );
});

test("linked-bank paycheck sync API delegates transaction sync to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.url = request.url;

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          coreDelegated: true,
          detectionCount: 1,
          service: "payshield-paycheck-transaction-sync",
          sync: {
            addedCount: 2,
            modifiedCount: 0,
            pageCount: 1,
            removedCount: 0,
          },
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-sync-secret";

      const response = await syncPaychecks(
        makeRequest("/api/app/paychecks/sync", {
          maxPages: 1,
        }),
      );
      const body = await parseJson(response);
      const forwardedBody = JSON.parse(String(captured.body || "{}")) as Record<
        string,
        unknown
      >;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(body.detectionCount, 1);
      assert.equal(captured.authorization, "Bearer core-sync-secret");
      assert.equal(captured.method, "POST");
      assert.equal(captured.url, "/api/app/paychecks/sync");
      assert.equal(forwardedBody.maxPages, 1);
    },
  );
});

test("audit export delegates to configured core service and remains downloadable", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.method = request.method;
      captured.url = request.url;

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          coreDelegated: true,
          exportVersion: "payshield-household-audit-v1",
          service: "payshield-audit-export",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-audit-secret";

      const response = await exportAudit();
      const body = await parseJson(response);

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(
        response.headers
          .get("content-disposition")
          ?.includes("payshield-household-audit.json"),
        true,
      );
      assert.equal(body.coreDelegated, true);
      assert.equal(captured.authorization, "Bearer core-audit-secret");
      assert.equal(captured.method, "GET");
      assert.equal(captured.url, "/api/app/audit/export");
    },
  );
});

test("card authorization delegates request body to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.providerSignature =
        request.headers["x-payshield-provider-signature"];
      captured.url = request.url;

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          decision: {
            approved: false,
            approvedAmountCents: 0,
            code: "insufficient_safe_spend",
            reason: "Core decision",
          },
          mode: "core_ledger",
          service: "payshield-card-authorization",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = `${baseUrl}/core`;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-card-secret";

      const response = await authorizeCard(
        makeProviderWebhookRequest("/api/card/authorize", {
          amountCents: 180_000,
          idempotencyKey: "proxied-card-180000",
          merchantName: "Furniture store",
        }),
      );
      const body = await parseJson(response);
      const requestBody = JSON.parse(String(captured.body)) as Record<
        string,
        unknown
      >;
      const decision = body.decision as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(captured.authorization, "Bearer core-card-secret");
      assert.equal(captured.method, "POST");
      assert.equal(captured.providerSignature, "t=1234567890,v1=abcdef");
      assert.equal(captured.url, "/core/api/card/authorize");
      assert.equal(requestBody.amountCents, 180_000);
      assert.equal(requestBody.merchantName, "Furniture store");
      assert.equal(decision.code, "insufficient_safe_spend");
    },
  );
});

test("protected app money mutations delegate to configured core service", async () => {
  const captured: Array<Record<string, unknown>> = [];

  await withCoreProxyServer(
    async (request, response) => {
      captured.push({
        authorization: request.headers.authorization,
        authMode: request.headers["x-payshield-auth-mode"],
        body: await readRequestBody(request),
        method: request.method,
        url: request.url,
        userId: request.headers["x-payshield-user-id"],
      });

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          coreDelegated: true,
          ok: true,
          service: "payshield-core-proxy-test",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-money-secret";

      const cases: Array<{
        bodyIncludes?: string;
        call: () => Promise<Response>;
        method: string;
        url: string;
      }> = [
        {
          call: () => getBuckets(),
          method: "GET",
          url: "/api/app/buckets",
        },
        {
          bodyIncludes: "custom_childcare",
          call: () =>
            saveBuckets(
              makeRequest("/api/app/buckets", {
                action: "replace_profile",
                buckets: [
                  {
                    due: "Every check",
                    id: "custom_childcare",
                    name: "Childcare",
                    protection: "hard_lock",
                    targetCents: 20_000,
                  },
                ],
              }),
            ),
          method: "POST",
          url: "/api/app/buckets",
        },
        {
          bodyIncludes: "{}",
          call: () => startOnboarding(),
          method: "POST",
          url: "/api/app/onboarding/start",
        },
        {
          bodyIncludes: "core-direct-deposit-proxy",
          call: () =>
            setupDirectDeposit(
              makeRequest("/api/app/direct-deposit", {
                idempotencyKey: "core-direct-deposit-proxy",
                providerAccountId: "acct_123",
              }),
            ),
          method: "POST",
          url: "/api/app/direct-deposit",
        },
        {
          bodyIncludes: "New landlord",
          call: () =>
            createPayee(
              makeRequest("/api/app/payees", {
                allowedBucketId: "rent",
                maxCents: 95_000,
                name: "New landlord",
              }),
            ),
          method: "POST",
          url: "/api/app/payees",
        },
        {
          bodyIncludes: "payee_abc_apartments",
          call: () =>
            createTransfer(
              makeRequest("/api/app/transfers", {
                amountCents: 25_000,
                destinationPayeeId: "payee_abc_apartments",
                sourceBucketId: "rent",
              }),
            ),
          method: "POST",
          url: "/api/app/transfers",
        },
        {
          bodyIncludes: "Emergency repair",
          call: () =>
            unlockBucket(
              makeRequest("/api/app/unlocks", {
                amountCents: 20_000,
                bucketId: "rent",
                mode: "slow_free",
                reason: "Emergency repair",
              }),
            ),
          method: "POST",
          url: "/api/app/unlocks",
        },
      ];

      for (const routeCase of cases) {
        const response = await routeCase.call();
        const body = await parseJson(response);

        assert.equal(response.status, 200);
        assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
        assert.equal(body.coreDelegated, true);
      }

      assert.equal(captured.length, cases.length);

      for (const [index, routeCase] of cases.entries()) {
        const request = captured[index];

        assert.equal(request.authorization, "Bearer core-money-secret");
        assert.equal(request.authMode, "demo");
        assert.equal(request.method, routeCase.method);
        assert.equal(request.url, routeCase.url);
        assert.equal(request.userId, "user_demo_001");

        if (routeCase.bodyIncludes) {
          assert.equal(String(request.body).includes(routeCase.bodyIncludes), true);
        }
      }
    },
  );
});

test("bill payment route delegates request body to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.authMode = request.headers["x-payshield-auth-mode"];
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.url = request.url;

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          decision: {
            accepted: true,
            amountCents: 50_000,
            bucketId: "rent",
            code: "scheduled",
            providerStatus: "blocked",
            reason: "Core bill payment decision",
          },
          mode: "core_ledger",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-bill-secret";

      const response = await scheduleBillPayment(
        makeRequest("/api/app/bill-payments", {
          amountCents: 50_000,
          payeeId: "payee_abc_apartments",
          scheduledFor: "2026-07-01",
        }),
      );
      const body = await parseJson(response);
      const requestBody = JSON.parse(String(captured.body)) as Record<
        string,
        unknown
      >;
      const decision = body.decision as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(captured.authorization, "Bearer core-bill-secret");
      assert.equal(captured.authMode, "demo");
      assert.equal(captured.method, "POST");
      assert.equal(captured.url, "/api/app/bill-payments");
      assert.equal(requestBody.payeeId, "payee_abc_apartments");
      assert.equal(decision.code, "scheduled");
    },
  );
});

test("provider webhook route forwards provider signature to configured core service", async () => {
  const captured: Record<string, unknown> = {};

  await withCoreProxyServer(
    async (request, response) => {
      captured.authorization = request.headers.authorization;
      captured.body = await readRequestBody(request);
      captured.method = request.method;
      captured.providerSignature =
        request.headers["x-payshield-provider-signature"];
      captured.url = request.url;

      response.writeHead(202, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          accepted: true,
          coreDelegated: true,
          mode: "processed",
          service: "payshield-provider-webhook",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-provider-secret";

      const response = await providerWebhook(
        makeProviderWebhookRequest("/api/provider/webhooks", {
          eventId: "evt_provider_proxy",
          type: "transactions.sync",
        }),
      );
      const body = await parseJson(response);
      const requestBody = JSON.parse(String(captured.body)) as Record<
        string,
        unknown
      >;

      assert.equal(response.status, 202);
      assert.equal(response.headers.get("x-payshield-core-proxied"), "true");
      assert.equal(body.coreDelegated, true);
      assert.equal(captured.authorization, "Bearer core-provider-secret");
      assert.equal(captured.method, "POST");
      assert.equal(captured.providerSignature, "t=1234567890,v1=abcdef");
      assert.equal(captured.url, "/api/provider/webhooks");
      assert.equal(requestBody.eventId, "evt_provider_proxy");
    },
  );
});

test("configured core service URL with secret-bearing parts fails closed", async () => {
  process.env.PAYSHIELD_CORE_API_URL = "https://user:secret@example.com/core";

  const response = await authorizeCard(
    makeRequest("/api/card/authorize", {
      amountCents: 8_000,
      merchantName: "Grocery market",
    }),
  );
  const body = await parseJson(response);
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(body.code, "core_service_misconfigured");
  assert.equal(serialized.includes("user:secret"), false);
});

test("configured core service non-JSON response fails closed", async () => {
  await withCoreProxyServer(
    (_request, response) => {
      response.writeHead(200, {
        "content-type": "text/plain",
      });
      response.end("not-json");
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-non-json-secret";

      const response = await authorizeCard(
        makeRequest("/api/card/authorize", {
          amountCents: 8_000,
          merchantName: "Grocery market",
        }),
      );
      const body = await parseJson(response);

      assert.equal(response.status, 502);
      assert.equal(
        body.error,
        "Configured PayShield core service did not return a valid JSON response.",
      );
    },
  );
});

test("configured core service oversized JSON response fails closed", async () => {
  await withCoreProxyServer(
    (_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify({
          payload: "x".repeat(300_000),
          service: "oversized-core-response",
        }),
      );
    },
    async (baseUrl) => {
      process.env.PAYSHIELD_CORE_API_URL = baseUrl;
      process.env.PAYSHIELD_CORE_SERVICE_TOKEN = "core-oversized-secret";

      const response = await authorizeCard(
        makeRequest("/api/card/authorize", {
          amountCents: 8_000,
          merchantName: "Grocery market",
        }),
      );
      const body = await parseJson(response);
      const serialized = JSON.stringify(body);

      assert.equal(response.status, 502);
      assert.equal(
        body.error,
        "Configured PayShield core service response is too large.",
      );
      assert.equal(serialized.includes("oversized-core-response"), false);
      assert.equal(response.headers.get("x-payshield-core-proxied"), null);
    },
  );
});
