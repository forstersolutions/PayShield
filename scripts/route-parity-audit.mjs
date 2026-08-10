import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getCoreHealth } from "../services/core/product.mjs";

const coreOnlyRoutes = new Map([
  [
    "POST /token-vault/plaid",
    "Signed token-vault receiver lives on the dedicated core service so access tokens never terminate in the Vercel frontend.",
  ],
  [
    "POST /plaid/webhooks",
    "Plaid verification and durable sync queueing terminate on the dedicated core service.",
  ],
  [
    "POST /commercial/billing-events",
    "Verified store-billing webhooks are normalized by the frontend and then recorded through the authenticated core service.",
  ],
]);
const serviceName = "payshield-route-parity";

function parseCoreRoute(route) {
  const match = /^([A-Z]+)\s+(\/\S*)$/.exec(String(route).trim());

  if (!match) {
    return null;
  }

  return {
    method: match[1],
    path: match[2],
    route: `${match[1]} ${match[2]}`,
  };
}

export function webFacadeForCoreRoute(route) {
  const parsed = parseCoreRoute(route);

  if (!parsed || coreOnlyRoutes.has(parsed.route)) {
    return null;
  }

  return {
    corePath: parsed.path,
    coreRoute: parsed.route,
    file: `src/app/api${parsed.path}/route.ts`,
    method: parsed.method,
    webPath: `/api${parsed.path}`,
  };
}

function routeNeedsCoreForwarding(facade) {
  return (
    facade.webPath.startsWith("/api/app/") ||
    facade.webPath.startsWith("/api/card/") ||
    facade.webPath.startsWith("/api/provider/") ||
    facade.webPath.startsWith("/api/launch/")
  );
}

function methodExportPattern(method) {
  return new RegExp(`export\\s+async\\s+function\\s+${method}\\b`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function coreForwardPathPattern(facade) {
  const acceptedPaths = [facade.corePath, facade.webPath]
    .map(escapeRegExp)
    .join("|");

  return new RegExp(`\\bpath\\s*:\\s*["'](?:${acceptedPaths})["']`);
}

function evaluateFacade(rootDir, facade) {
  const fullPath = join(rootDir, facade.file);
  const failures = [];

  if (!existsSync(fullPath)) {
    return {
      ...facade,
      exists: false,
      failures: [`Missing web facade for ${facade.coreRoute}: ${facade.file}`],
      ok: false,
    };
  }

  const content = readFileSync(fullPath, "utf8");

  if (!methodExportPattern(facade.method).test(content)) {
    failures.push(`${facade.file} does not export ${facade.method}.`);
  }

  if (!content.includes(facade.webPath)) {
    failures.push(`${facade.file} does not reference ${facade.webPath}.`);
  }

  if (routeNeedsCoreForwarding(facade)) {
    if (!content.includes("forwardCoreRequest")) {
      failures.push(`${facade.file} does not forward to the dedicated core service.`);
    } else if (!coreForwardPathPattern(facade).test(content)) {
      failures.push(
        `${facade.file} does not forward ${facade.coreRoute} to its matching core path.`,
      );
    }
  }

  return {
    ...facade,
    exists: true,
    failures,
    ok: failures.length === 0,
  };
}

export function routeParityCoreOnly(routes) {
  return routes
    .map(parseCoreRoute)
    .filter(Boolean)
    .filter((route) => coreOnlyRoutes.has(route.route))
    .map((route) => ({
      coreRoute: route.route,
      reason: coreOnlyRoutes.get(route.route),
    }));
}

export function auditRouteParity({
  coreRoutes = getCoreHealth().routes,
  rootDir = process.cwd(),
} = {}) {
  const parsedRoutes = coreRoutes.map(parseCoreRoute);
  const invalidRoutes = coreRoutes.filter((route, index) => !parsedRoutes[index]);
  const facades = coreRoutes
    .map(webFacadeForCoreRoute)
    .filter(Boolean)
    .map((facade) => evaluateFacade(rootDir, facade));
  const failures = [
    ...invalidRoutes.map((route) => `Invalid core route format: ${route}`),
    ...facades.flatMap((facade) => facade.failures),
  ];

  return {
    checkedCoreRouteCount: coreRoutes.length,
    coreOnly: routeParityCoreOnly(coreRoutes),
    failures,
    facades,
    ok: failures.length === 0,
    service: serviceName,
  };
}

function printAudit(audit) {
  console.log(JSON.stringify(audit, null, 2));
}

async function main() {
  const audit = auditRouteParity();

  printAudit(audit);

  if (!audit.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Route parity audit failed.");
    process.exit(1);
  });
}
