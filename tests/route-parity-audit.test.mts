import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  auditRouteParity,
  routeParityCoreOnly,
  webFacadeForCoreRoute,
} from "../scripts/route-parity-audit.mjs";

test("maps core app routes to Next API facades", () => {
  assert.deepEqual(webFacadeForCoreRoute("GET /app/bank-connections"), {
    corePath: "/app/bank-connections",
    coreRoute: "GET /app/bank-connections",
    file: "src/app/api/app/bank-connections/route.ts",
    method: "GET",
    webPath: "/api/app/bank-connections",
  });

  assert.deepEqual(webFacadeForCoreRoute("POST /app/bank-connections"), {
    corePath: "/app/bank-connections",
    coreRoute: "POST /app/bank-connections",
    file: "src/app/api/app/bank-connections/route.ts",
    method: "POST",
    webPath: "/api/app/bank-connections",
  });

  assert.deepEqual(webFacadeForCoreRoute("POST /app/money-profile"), {
    corePath: "/app/money-profile",
    coreRoute: "POST /app/money-profile",
    file: "src/app/api/app/money-profile/route.ts",
    method: "POST",
    webPath: "/api/app/money-profile",
  });

  assert.equal(webFacadeForCoreRoute("POST /token-vault/plaid"), null);
});

test("route parity audit passes for the current core money route manifest", () => {
  const audit = auditRouteParity();

  assert.equal(audit.ok, true);
  assert.equal(audit.failures.length, 0);
  assert.equal(
    audit.facades.some(
      (facade) =>
        facade.coreRoute === "GET /app/bank-connections" &&
        facade.file === "src/app/api/app/bank-connections/route.ts",
    ),
    true,
  );
  assert.equal(
    audit.facades.some(
      (facade) =>
        facade.coreRoute === "POST /app/bank-connections" &&
        facade.file === "src/app/api/app/bank-connections/route.ts",
    ),
    true,
  );
  assert.equal(
    audit.facades.some(
      (facade) =>
        facade.coreRoute === "POST /app/money-profile" &&
        facade.file === "src/app/api/app/money-profile/route.ts",
    ),
    true,
  );
  assert.deepEqual(
    audit.coreOnly.map((route: { coreRoute: string }) => route.coreRoute),
    [
      "POST /token-vault/plaid",
      "POST /plaid/webhooks",
      "POST /commercial/billing-events",
    ],
  );
});

test("route parity audit fails when a facade is missing or not core-forwarded", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "payshield-route-parity-"));

  try {
    const appMeDir = join(rootDir, "src/app/api/app/me");

    mkdirSync(appMeDir, { recursive: true });
    writeFileSync(
      join(appMeDir, "route.ts"),
      [
        "export async function GET() {",
        "  return Response.json({ path: '/api/app/me' });",
        "}",
      ].join("\n"),
    );

    const audit = auditRouteParity({
      coreRoutes: [
        "GET /app/me",
        "POST /app/bank-connections",
        "POST /token-vault/plaid",
      ],
      rootDir,
    });

    assert.equal(audit.ok, false);
    assert.equal(
      audit.failures.some((failure) =>
        failure.includes("src/app/api/app/me/route.ts does not forward"),
      ),
      true,
    );
    assert.equal(
      audit.failures.some((failure) =>
        failure.includes("src/app/api/app/bank-connections/route.ts"),
      ),
      true,
    );
    assert.deepEqual(routeParityCoreOnly(["POST /token-vault/plaid"]), [
      {
        coreRoute: "POST /token-vault/plaid",
        reason:
          "Signed token-vault receiver lives on the dedicated core service so access tokens never terminate in the Vercel frontend.",
      },
    ]);
  } finally {
    rmSync(rootDir, { force: true, recursive: true });
  }
});

test("route parity audit rejects a facade forwarded to the wrong core path", () => {
  const rootDir = mkdtempSync(join(tmpdir(), "payshield-route-parity-path-"));

  try {
    const appMeDir = join(rootDir, "src/app/api/app/me");

    mkdirSync(appMeDir, { recursive: true });
    writeFileSync(
      join(appMeDir, "route.ts"),
      [
        "import { forwardCoreRequest } from './core-client';",
        "export async function GET() {",
        "  return forwardCoreRequest({ method: 'GET', path: '/api/app/balances' });",
        "}",
      ].join("\n"),
    );

    const audit = auditRouteParity({
      coreRoutes: ["GET /app/me"],
      rootDir,
    });

    assert.equal(audit.ok, false);
    assert.equal(
      audit.failures.some((failure) => failure.includes("matching core path")),
      true,
    );
  } finally {
    rmSync(rootDir, { force: true, recursive: true });
  }
});
