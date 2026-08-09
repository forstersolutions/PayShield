import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyProtectedRouteResponse,
  parseProductionRouteSmokeArgs,
  productionSmokeRoutes,
  runProductionRouteSmoke,
} from "../scripts/production-route-smoke.mjs";

const targetUrl = "https://payshield.example";

function routeAudit(
  facades: Array<{ coreRoute: string; method: string; webPath: string }>,
) {
  return {
    checkedCoreRouteCount: facades.length,
    coreOnly: [],
    failures: [],
    facades,
    ok: true,
    service: "test-route-audit",
  };
}

test("production route smoke args default to configured production URL", () => {
  const args = parseProductionRouteSmokeArgs([], {
    NEXT_PUBLIC_SITE_URL: targetUrl,
  } as unknown as NodeJS.ProcessEnv);

  assert.equal(args.targetUrl, targetUrl);
  assert.equal(args.timeoutMs, 10_000);
});

test("production route smoke args accept timeout before positional URL", () => {
  const args = parseProductionRouteSmokeArgs([
    "--timeout-ms",
    "5000",
    targetUrl,
  ]);

  assert.equal(args.targetUrl, targetUrl);
  assert.equal(args.timeoutMs, 5_000);
});

test("production route smoke args reject missing production URL", () => {
  assert.throws(
    () => parseProductionRouteSmokeArgs([], {} as unknown as NodeJS.ProcessEnv),
    /production URL is required/i,
  );
});

test("protected route status classifier requires fail-closed behavior", () => {
  assert.deepEqual(classifyProtectedRouteResponse(503), {
    classification: "fail_closed",
    ok: true,
  });
  assert.deepEqual(classifyProtectedRouteResponse(401), {
    classification: "fail_closed",
    ok: true,
  });
  assert.deepEqual(classifyProtectedRouteResponse(200), {
    classification: "accidentally_open",
    ok: false,
  });
  assert.deepEqual(classifyProtectedRouteResponse(307), {
    classification: "redirected",
    ok: false,
  });
  assert.deepEqual(classifyProtectedRouteResponse(404), {
    classification: "missing_route",
    ok: false,
  });
  assert.deepEqual(classifyProtectedRouteResponse(500), {
    classification: "server_error",
    ok: false,
  });
});

test("production route list includes money facades and excludes core-only custody routes", () => {
  const routes = productionSmokeRoutes(
    routeAudit([
      {
        coreRoute: "POST /app/bank-connections",
        method: "POST",
        webPath: "/api/app/bank-connections",
      },
      {
        coreRoute: "POST /token-vault/plaid",
        method: "POST",
        webPath: "/api/token-vault/plaid",
      },
      {
        coreRoute: "GET /health",
        method: "GET",
        webPath: "/api/health",
      },
      {
        coreRoute: "POST /card/authorize",
        method: "POST",
        webPath: "/api/card/authorize",
      },
    ]),
  );

  assert.equal(
    routes.some((route) => route.webPath === "/api/app/bank-connections"),
    true,
  );
  assert.equal(
    routes.some((route) => route.webPath === "/api/card/authorize"),
    true,
  );
  assert.equal(
    routes.some((route) => route.webPath === "/api/app/billing/webhook"),
    true,
  );
  assert.equal(
    routes.some((route) => route.webPath === "/api/token-vault/plaid"),
    false,
  );
});

test("production route smoke passes when deployed protected routes fail closed", async () => {
  const originalFetch = globalThis.fetch;
  const seen: Array<{ method?: string; path: string }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push({ method: init?.method, path: url.pathname });

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        service: "payshield-web-app",
      });
    }

    return Response.json(
      {
        code: "app_auth_not_configured",
        service: "payshield-app-access",
      },
      { status: 503 },
    );
  }) as typeof fetch;

  try {
    const smoke = await runProductionRouteSmoke({
      routeAudit: routeAudit([
          {
            coreRoute: "GET /app/me",
            method: "GET",
            webPath: "/api/app/me",
          },
          {
            coreRoute: "POST /app/bank-connections",
            method: "POST",
            webPath: "/api/app/bank-connections",
          },
          {
            coreRoute: "POST /app/bank-link/token",
            method: "POST",
            webPath: "/api/app/bank-link/token",
          },
          {
            coreRoute: "POST /app/buckets",
            method: "POST",
            webPath: "/api/app/buckets",
          },
          {
            coreRoute: "POST /app/money-profile",
            method: "POST",
            webPath: "/api/app/money-profile",
          },
          {
            coreRoute: "POST /app/paychecks/rules",
            method: "POST",
            webPath: "/api/app/paychecks/rules",
          },
          {
            coreRoute: "POST /app/paychecks/detect",
            method: "POST",
            webPath: "/api/app/paychecks/detect",
          },
          {
            coreRoute: "POST /app/paychecks/sync",
            method: "POST",
            webPath: "/api/app/paychecks/sync",
          },
          {
            coreRoute: "POST /app/transfers",
            method: "POST",
            webPath: "/api/app/transfers",
          },
          {
            coreRoute: "POST /card/authorize",
            method: "POST",
            webPath: "/api/card/authorize",
          },
          {
            coreRoute: "POST /provider/webhooks",
            method: "POST",
            webPath: "/api/provider/webhooks",
          },
        ]),
      targetUrl,
      timeoutMs: 1_000,
    });

    assert.equal(smoke.ok, true);
    assert.equal(smoke.health.ok, true);
    assert.equal(smoke.summary.failClosed, smoke.checkedRoutes);
    assert.equal(
      smoke.checks.some((check) => check.webPath === "/api/app/bank-connections"),
      true,
    );
    assert.equal(
      smoke.checks.some((check) => check.webPath === "/api/app/billing/webhook"),
      true,
    );
    assert.equal(
      seen.some((request) => request.path === "/api/app/transfers"),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("production route smoke fails missing, open, and server-error routes", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }

    if (url.pathname === "/api/app/bank-link/token") {
      return Response.json({ opened: true });
    }

    if (url.pathname === "/api/app/paychecks/sync") {
      return Response.json({ error: "missing" }, { status: 404 });
    }

    if (url.pathname === "/api/app/transfers") {
      return Response.json({ error: "boom" }, { status: 500 });
    }

    return Response.json({ code: "app_auth_not_configured" }, { status: 503 });
  }) as typeof fetch;

  try {
    const smoke = await runProductionRouteSmoke({
      routeAudit: routeAudit([
          {
            coreRoute: "POST /app/bank-link/token",
            method: "POST",
            webPath: "/api/app/bank-link/token",
          },
          {
            coreRoute: "POST /app/paychecks/sync",
            method: "POST",
            webPath: "/api/app/paychecks/sync",
          },
          {
            coreRoute: "POST /app/transfers",
            method: "POST",
            webPath: "/api/app/transfers",
          },
        ]),
      targetUrl,
      timeoutMs: 1_000,
    });

    assert.equal(smoke.ok, false);
    assert.equal(smoke.summary.accidentallyOpen, 1);
    assert.equal(smoke.summary.missing, 1);
    assert.equal(smoke.summary.serverErrors, 1);
    assert.equal(
      smoke.failures.some((failure) =>
        failure.includes("POST /api/app/bank-link/token returned 200"),
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
