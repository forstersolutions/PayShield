import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { NextRequest } from "next/server.js";
import { POST as createBankLinkToken } from "../src/app/api/app/bank-link/token/route.ts";
import { POST as scheduleBillPayment } from "../src/app/api/app/bill-payments/route.ts";
import { GET as getAppMe } from "../src/app/api/app/me/route.ts";
import proxy from "../src/proxy.ts";

const fallbackFiles = [
  "src/app/not-found.tsx",
  "src/app/error.tsx",
  "src/app/global-error.tsx",
];

async function runProxy(request: NextRequest) {
  const response = (await proxy(request, {} as never)) as Response | null;

  assert.ok(response instanceof Response);

  return response;
}

test("route fallbacks provide branded recovery paths", async () => {
  for (const file of fallbackFiles) {
    const text = await readFile(file, "utf8");

    assert.match(text, /PayShield/);
    assert.doesNotMatch(text, /prototype|paid beta|early access/i);
  }

  const notFound = await readFile("src/app/not-found.tsx", "utf8");
  assert.match(notFound, /This screen is not in the PayShield control surface/);
  assert.equal(notFound.includes('href="/app"'), true);
  assert.match(notFound, /Product profile/);
  assert.match(notFound, /GRAYSTON_SUPPORT_EMAIL/);

  const routeError = await readFile("src/app/error.tsx", "utf8");
  assert.match(routeError, /unstable_retry/);
  assert.match(routeError, /Contact Grayston support/);

  const globalError = await readFile("src/app/global-error.tsx", "utf8");
  assert.match(globalError, /<html lang="en">/);
  assert.match(globalError, /unstable_retry/);
});

test("app route serves the operating screen instead of the root loading shell", async () => {
  const appPage = await readFile("src/app/app/page.tsx", "utf8");

  assert.match(appPage, /dynamic = "force-dynamic"/);
  await assert.rejects(access("src/app/loading.tsx"));
});

test("production app access fails closed without Clerk unless review access is explicit", async () => {
  const originalEnv = {
    allowReview: process.env.PAYSHIELD_ALLOW_REVIEW_APP_ACCESS,
    clerkPublishable: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    clerkSecret: process.env.CLERK_SECRET_KEY,
    vercelEnv: process.env.VERCEL_ENV,
  };

  try {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.PAYSHIELD_ALLOW_REVIEW_APP_ACCESS;
    process.env.VERCEL_ENV = "production";

    const apiResponse = await runProxy(
      new NextRequest("https://payshield.test/api/app/me"),
    );
    const apiBody = (await apiResponse.json()) as Record<string, unknown>;
    const readiness = apiBody.readiness as Record<string, unknown>;

    assert.equal(apiResponse.status, 503);
    assert.equal(apiBody.code, "app_auth_not_configured");
    assert.equal(readiness.mode, "locked");
    assert.equal(readiness.productionLocked, true);

    const directMeResponse = await getAppMe();
    const directMeBody = (await directMeResponse.json()) as Record<
      string,
      unknown
    >;

    assert.equal(directMeResponse.status, 503);
    assert.equal(directMeBody.code, "app_auth_not_configured");

    const bankLinkResponse = await createBankLinkToken(
      new NextRequest("https://payshield.test/api/app/bank-link/token", {
        method: "POST",
      }),
    );
    const bankLinkBody = (await bankLinkResponse.json()) as Record<
      string,
      unknown
    >;

    assert.equal(bankLinkResponse.status, 503);
    assert.equal(bankLinkBody.code, "app_auth_not_configured");

    const billPaymentResponse = await scheduleBillPayment(
      new NextRequest("https://payshield.test/api/app/bill-payments", {
        body: JSON.stringify({
          amountCents: 1_000,
          payeeId: "landlord_rent",
          scheduledFor: "2026-07-01",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const billPaymentBody = (await billPaymentResponse.json()) as Record<
      string,
      unknown
    >;

    assert.equal(billPaymentResponse.status, 503);
    assert.equal(billPaymentBody.code, "app_auth_not_configured");

    const pageResponse = await runProxy(
      new NextRequest("https://payshield.test/app"),
    );
    const pageBody = await pageResponse.text();

    assert.equal(pageResponse.status, 503);
    assert.match(pageBody, /App access is not configured/);
    assert.match(pageBody, /PAYSHIELD_ALLOW_REVIEW_APP_ACCESS=true/);

    process.env.PAYSHIELD_ALLOW_REVIEW_APP_ACCESS = "true";

    const allowedResponse = await runProxy(
      new NextRequest("https://payshield.test/api/app/me"),
    );

    assert.notEqual(allowedResponse.status, 503);
  } finally {
    if (originalEnv.clerkSecret === undefined) {
      delete process.env.CLERK_SECRET_KEY;
    } else {
      process.env.CLERK_SECRET_KEY = originalEnv.clerkSecret;
    }

    if (originalEnv.clerkPublishable === undefined) {
      delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
        originalEnv.clerkPublishable;
    }

    if (originalEnv.allowReview === undefined) {
      delete process.env.PAYSHIELD_ALLOW_REVIEW_APP_ACCESS;
    } else {
      process.env.PAYSHIELD_ALLOW_REVIEW_APP_ACCESS = originalEnv.allowReview;
    }

    if (originalEnv.vercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalEnv.vercelEnv;
    }
  }
});
