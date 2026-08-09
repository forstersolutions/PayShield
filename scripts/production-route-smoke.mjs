import { pathToFileURL } from "node:url";
import { auditRouteParity } from "./route-parity-audit.mjs";
import { normalizeSiteUrl } from "./url-utils.mjs";

const defaultTimeoutMs = 10_000;
const defaultProductionUrl =
  process.env.PAYSHIELD_PRODUCTION_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
const serviceName = "payshield-production-route-smoke";

const acceptableFailClosedStatuses = new Set([
  400,
  401,
  402,
  403,
  405,
  413,
  415,
  422,
  423,
  424,
  429,
  503,
]);

const extraProtectedRoutes = [
  {
    coreRoute: "POST /app/billing/webhook",
    method: "POST",
    reason: "Stripe webhook must reject unsigned smoke payloads instead of opening or disappearing.",
    webPath: "/api/app/billing/webhook",
  },
];
export const requiredMoneyRouteMarkers = [
  "/api/app/bank-connections",
  "/api/app/bank-link/token",
  "/api/app/paychecks/rules",
  "/api/app/paychecks/sync",
  "/api/app/paychecks/detect",
  "/api/app/buckets",
  "/api/app/money-profile",
  "/api/app/transfers",
  "/api/card/authorize",
  "/api/provider/webhooks",
];

function usage() {
  return [
    "Usage: npm run production:routes -- [https://production-url] [--timeout-ms 10000]",
    "",
    "Calls deployed PayShield money-control routes without credentials and requires deliberate fail-closed responses.",
    "Defaults the target URL from PAYSHIELD_PRODUCTION_URL or NEXT_PUBLIC_SITE_URL when no URL is passed.",
  ].join("\n");
}

function flagValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));

  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  const next = args[index + 1];

  if (index === -1 || !next || next.startsWith("--")) {
    return "";
  }

  return next;
}

function positionalArgs(args) {
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    if (arg === "--timeout-ms" && args[index + 1] && !args[index + 1].startsWith("--")) {
      index += 1;
    }
  }

  return positionals;
}

export function parseProductionRouteSmokeArgs(args, env = process.env) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const unknown = args.find(
    (arg) =>
      arg.startsWith("--") &&
      !["--help", "--timeout-ms", "-h"].includes(arg) &&
      !arg.startsWith("--timeout-ms="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  const targetUrl =
    positionalArgs(args)[0] ||
    env.PAYSHIELD_PRODUCTION_URL ||
    env.NEXT_PUBLIC_SITE_URL ||
    "";
  const timeoutMs = Number(flagValue(args, "--timeout-ms") || defaultTimeoutMs);

  if (!targetUrl) {
    throw new Error(
      "A production URL is required. Pass it as an argument or set PAYSHIELD_PRODUCTION_URL/NEXT_PUBLIC_SITE_URL.",
    );
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new Error("--timeout-ms must be a number between 1 and 60000.");
  }

  return {
    help: false,
    targetUrl,
    timeoutMs,
  };
}

function routeSortKey(route) {
  return `${route.webPath} ${route.method}`;
}

export function productionSmokeRoutes(routeAudit = auditRouteParity()) {
  const facades = routeAudit.facades
    .filter((facade) =>
      [
        "/api/app/",
        "/api/card/",
        "/api/provider/",
        "/api/launch/",
      ].some((prefix) => facade.webPath.startsWith(prefix)),
    )
    .map((facade) => ({
      coreRoute: facade.coreRoute,
      method: facade.method,
      webPath: facade.webPath,
    }));

  const byRoute = new Map(
    [...facades, ...extraProtectedRoutes].map((route) => [
      `${route.method} ${route.webPath}`,
      route,
    ]),
  );

  return [...byRoute.values()].sort((a, b) =>
    routeSortKey(a).localeCompare(routeSortKey(b)),
  );
}

function smokePayload(route) {
  if (route.webPath === "/api/card/authorize") {
    return {
      amountCents: 1200,
      idempotencyKey: "production-route-smoke-card",
      merchantId: "smoke-merchant",
      merchantName: "Route Smoke Check",
      mcc: "5812",
      transactionId: "route-smoke-card-auth",
    };
  }

  if (route.webPath === "/api/app/buckets") {
    return {
      action: "smoke",
      buckets: [],
      idempotencyKey: "production-route-smoke-buckets",
    };
  }

  if (route.webPath === "/api/app/paychecks/rules") {
    return {
      expectedFrequency: "biweekly",
      idempotencyKey: "production-route-smoke-paycheck-rule",
      minimumAmountCents: 100,
      providerName: "plaid",
      ruleName: "Route smoke rule",
      status: "active",
      transactionNamePattern: "SMOKE",
    };
  }

  if (route.webPath === "/api/app/paychecks/detect") {
    return {
      amountCents: 100,
      employerName: "Route Smoke Payroll",
      idempotencyKey: "production-route-smoke-detection",
      receivedAt: new Date(0).toISOString(),
    };
  }

  if (route.webPath === "/api/app/money-profile") {
    return {
      employerName: "Route Smoke Payroll",
      expectedFrequency: "biweekly",
      idempotencyKey: "production-route-smoke-money-profile",
      nextPayday: "2026-07-03",
      paycheckAmountCents: 10000,
      requestedTransferCents: 100,
    };
  }

  if (route.webPath === "/api/app/transfers") {
    return {
      amountCents: 100,
      destinationPayeeId: "smoke-payee",
      idempotencyKey: "production-route-smoke-transfer",
      sourceBucketId: "rent",
    };
  }

  if (route.webPath === "/api/launch/gate-evidence") {
    return {
      evidence: "production route smoke",
      gateId: "route_smoke",
      idempotencyKey: "production-route-smoke-gate-evidence",
      status: "recorded",
    };
  }

  return {
    idempotencyKey: `production-route-smoke-${route.webPath.replace(/[^a-z0-9]+/gi, "-")}`,
    smoke: true,
  };
}

function requestInit(route, timeoutMs) {
  const headers = {
    accept: "application/json",
  };

  if (route.method === "GET") {
    return {
      headers,
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    };
  }

  return {
    body: JSON.stringify(smokePayload(route)),
    headers: {
      ...headers,
      "content-type": "application/json",
      "x-payshield-provider-signature": "t=1,v1=invalid-route-smoke",
      "stripe-signature": "t=1,v1=invalid-route-smoke",
    },
    method: route.method,
    signal: AbortSignal.timeout(timeoutMs),
  };
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await response.json().catch(() => ({}))) ?? {};
  }

  const text = await response.text().catch(() => "");

  return {
    bodyPreview: text.replace(/\s+/g, " ").trim().slice(0, 260),
  };
}

export function classifyProtectedRouteResponse(status) {
  if (acceptableFailClosedStatuses.has(status)) {
    return {
      classification: "fail_closed",
      ok: true,
    };
  }

  if (status >= 200 && status < 300) {
    return {
      classification: "accidentally_open",
      ok: false,
    };
  }

  if (status >= 300 && status < 400) {
    return {
      classification: "redirected",
      ok: false,
    };
  }

  if (status === 404) {
    return {
      classification: "missing_route",
      ok: false,
    };
  }

  if (status >= 500) {
    return {
      classification: "server_error",
      ok: false,
    };
  }

  return {
    classification: "unexpected_status",
    ok: false,
  };
}

async function smokeRoute({ baseUrl, route, timeoutMs }) {
  const url = new URL(route.webPath, `${baseUrl}/`);

  try {
    const response = await fetch(url, requestInit(route, timeoutMs));
    const body = await parseResponseBody(response);
    const classified = classifyProtectedRouteResponse(response.status);

    return {
      bodyCode:
        typeof body.code === "string"
          ? body.code
          : typeof body.errorCode === "string"
            ? body.errorCode
            : undefined,
      bodyService: typeof body.service === "string" ? body.service : undefined,
      classification: classified.classification,
      coreRoute: route.coreRoute,
      expected: "400/401/402/403/405/413/415/422/423/424/429/503 fail-closed",
      method: route.method,
      ok: classified.ok,
      status: response.status,
      webPath: route.webPath,
    };
  } catch (error) {
    return {
      classification: "request_failed",
      coreRoute: route.coreRoute,
      error:
        error instanceof Error
          ? error.message.replace(/\s+/g, " ").slice(0, 220)
          : "Request failed.",
      expected: "reachable route with deliberate fail-closed response",
      method: route.method,
      ok: false,
      status: 0,
      webPath: route.webPath,
    };
  }
}

async function smokeHealth({ baseUrl, timeoutMs }) {
  const url = new URL("/api/health", `${baseUrl}/`);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await parseResponseBody(response);

    return {
      bodyService: typeof body.service === "string" ? body.service : undefined,
      classification: response.ok ? "ready" : "unhealthy",
      ok: response.ok,
      status: response.status,
      webPath: "/api/health",
    };
  } catch (error) {
    return {
      classification: "request_failed",
      error:
        error instanceof Error
          ? error.message.replace(/\s+/g, " ").slice(0, 220)
          : "Health request failed.",
      ok: false,
      status: 0,
      webPath: "/api/health",
    };
  }
}

export async function runProductionRouteSmoke(input) {
  const baseUrl = normalizeSiteUrl(input.targetUrl || defaultProductionUrl);
  const timeoutMs = input.timeoutMs ?? defaultTimeoutMs;
  const routeAudit = input.routeAudit ?? auditRouteParity();
  const routes = productionSmokeRoutes(routeAudit);
  const missingRequiredRouteMarkers = requiredMoneyRouteMarkers.filter(
    (marker) => !routes.some((route) => route.webPath === marker),
  );
  const [health, checks] = await Promise.all([
    smokeHealth({ baseUrl, timeoutMs }),
    Promise.all(routes.map((route) => smokeRoute({ baseUrl, route, timeoutMs }))),
  ]);
  const failures = [
    ...(routeAudit.ok
      ? []
      : (routeAudit.failures?.length
          ? routeAudit.failures
          : ["Route parity audit failed before production smoke."])),
    ...(health.ok ? [] : [`/api/health returned ${health.status}`]),
    ...missingRequiredRouteMarkers.map(
      (marker) => `Required production route smoke target is missing: ${marker}`,
    ),
    ...checks
      .filter((check) => !check.ok)
      .map(
        (check) =>
          `${check.method} ${check.webPath} returned ${check.status} (${check.classification})`,
      ),
  ];

  return {
    baseUrl,
    checkedRoutes: checks.length,
    checks,
    failures,
    health,
    missingRequiredRouteMarkers,
    ok: failures.length === 0,
    routeAuditOk: routeAudit.ok,
    service: serviceName,
    summary: {
      accidentallyOpen: checks.filter(
        (check) => check.classification === "accidentally_open",
      ).length,
      failClosed: checks.filter((check) => check.classification === "fail_closed")
        .length,
      missing: checks.filter((check) => check.classification === "missing_route")
        .length,
      serverErrors: checks.filter((check) => check.classification === "server_error")
        .length,
    },
  };
}

function printSmoke(smoke) {
  console.log(JSON.stringify(smoke, null, 2));
}

async function main() {
  const args = parseProductionRouteSmokeArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  const smoke = await runProductionRouteSmoke(args);

  printSmoke(smoke);

  if (!smoke.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Production route smoke failed.",
    );
    process.exit(1);
  });
}
