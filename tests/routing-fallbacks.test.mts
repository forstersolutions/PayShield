import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { NextRequest } from "next/server.js";
import { POST as createBankLinkToken } from "../src/app/api/app/bank-link/token/route.ts";
import { POST as scheduleBillPayment } from "../src/app/api/app/bill-payments/route.ts";
import { GET as getAppMe } from "../src/app/api/app/me/route.ts";
import { POST as submitReviewAccess } from "../src/app/api/review-access/route.ts";
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
  const launchPage = await readFile("src/app/launch/page.tsx", "utf8");

  assert.match(appPage, /dynamic = "force-dynamic"/);
  assert.match(launchPage, /dynamic = "force-dynamic"/);
  await assert.rejects(access("src/app/loading.tsx"));
  await assert.rejects(access("src/app/app/loading.tsx"));
  await assert.rejects(access("src/app/launch/loading.tsx"));
  await assert.rejects(access("src/app/components/route-loading-shell.tsx"));
});

test("production app access fails closed without Clerk unless review access is explicit", async () => {
  const originalEnv = {
    allowReview: process.env.PAYSHIELD_ALLOW_REVIEW_APP_ACCESS,
    clerkPublishable: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    clerkSecret: process.env.CLERK_SECRET_KEY,
    reviewToken: process.env.PAYSHIELD_REVIEW_APP_ACCESS_TOKEN,
    vercelEnv: process.env.VERCEL_ENV,
  };

  try {
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.PAYSHIELD_ALLOW_REVIEW_APP_ACCESS;
    delete process.env.PAYSHIELD_REVIEW_APP_ACCESS_TOKEN;
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

    const billingWebhookProxyResponse = await proxy(
      new NextRequest("https://payshield.test/api/app/billing/webhook", {
        method: "POST",
      }),
      {} as never,
    );

    assert.equal(billingWebhookProxyResponse?.status, 200);
    assert.equal(
      billingWebhookProxyResponse?.headers.get("x-middleware-next"),
      "1",
    );

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
    assert.match(pageBody, /PayShield App Activation/);
    assert.match(pageBody, /Household app activation/);
    assert.match(pageBody, /Turn on secure app access/);
    assert.match(pageBody, /PAYSHIELD_ALLOW_REVIEW_APP_ACCESS=true/);
    assert.match(pageBody, /PAYSHIELD_REVIEW_APP_ACCESS_TOKEN/);
    assert.match(pageBody, /review_access_token/);
    assert.match(pageBody, /action="\/api\/review-access"/);
    assert.match(pageBody, /Owner review access/);
    assert.match(pageBody, /Accepted tokens are stored only as a hashed HTTP-only cookie/);
    assert.match(pageBody, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
    assert.match(pageBody, /CLERK_SECRET_KEY/);
    assert.match(pageBody, /payshield-logo-clean\.png/);
    assert.match(pageBody, /href="\/launch"/);
    assert.match(pageBody, /Open revenue \+ rails console/);
    assert.match(pageBody, /href="\/api\/health"/);
    assert.match(pageBody, /support@graystontechnologies\.com/);

    process.env.PAYSHIELD_REVIEW_APP_ACCESS_TOKEN = "owner-review-token-2026";

    const invalidFormResponse = await submitReviewAccess(
      new NextRequest("https://payshield.test/api/review-access", {
        body: new URLSearchParams({
          review_access_token: "wrong-review-token",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      }),
    );

    assert.equal(invalidFormResponse.status, 303);
    assert.equal(
      invalidFormResponse.headers.get("location"),
      "https://payshield.test/app?access=invalid",
    );
    assert.equal(invalidFormResponse.headers.get("set-cookie"), null);

    const validFormResponse = await submitReviewAccess(
      new NextRequest("https://payshield.test/api/review-access", {
        body: new URLSearchParams({
          return_to: "/app",
          review_access_token: "owner-review-token-2026",
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      }),
    );
    const validFormCookie = validFormResponse.headers
      .get("set-cookie")
      ?.split(";")[0];

    assert.equal(validFormResponse.status, 303);
    assert.equal(validFormResponse.headers.get("location"), "https://payshield.test/app");
    assert.match(validFormResponse.headers.get("set-cookie") ?? "", /payshield_review_access=/);
    assert.doesNotMatch(
      validFormResponse.headers.get("set-cookie") ?? "",
      /owner-review-token-2026/,
    );
    assert.match(validFormResponse.headers.get("set-cookie") ?? "", /HttpOnly/);
    assert.match(validFormResponse.headers.get("set-cookie") ?? "", /SameSite=strict/i);

    assert.ok(validFormCookie);

    const missingTokenResponse = await runProxy(
      new NextRequest("https://payshield.test/api/app/me"),
    );

    assert.equal(missingTokenResponse.status, 503);

    const invalidTokenResponse = await runProxy(
      new NextRequest(
        "https://payshield.test/api/app/me?review_access_token=wrong-review-token",
      ),
    );

    assert.equal(invalidTokenResponse.status, 503);

    const tokenStartResponse = await runProxy(
      new NextRequest(
        "https://payshield.test/app?review_access_token=owner-review-token-2026",
      ),
    );
    const reviewCookie = tokenStartResponse.headers
      .get("set-cookie")
      ?.split(";")[0];

    assert.equal(tokenStartResponse.status, 307);
    assert.equal(tokenStartResponse.headers.get("location"), "https://payshield.test/app");
    assert.match(tokenStartResponse.headers.get("set-cookie") ?? "", /payshield_review_access=/);
    assert.doesNotMatch(
      tokenStartResponse.headers.get("set-cookie") ?? "",
      /owner-review-token-2026/,
    );
    assert.match(tokenStartResponse.headers.get("set-cookie") ?? "", /HttpOnly/);
    assert.match(tokenStartResponse.headers.get("set-cookie") ?? "", /SameSite=strict/i);

    assert.ok(reviewCookie);

    const cookieAllowedResponse = await runProxy(
      new NextRequest("https://payshield.test/api/app/me", {
        headers: {
          cookie: reviewCookie,
        },
      }),
    );

    assert.notEqual(cookieAllowedResponse.status, 503);

    const headerAllowedResponse = await runProxy(
      new NextRequest("https://payshield.test/api/app/me", {
        headers: {
          "x-payshield-review-token": "owner-review-token-2026",
        },
      }),
    );

    assert.notEqual(headerAllowedResponse.status, 503);

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

    if (originalEnv.reviewToken === undefined) {
      delete process.env.PAYSHIELD_REVIEW_APP_ACCESS_TOKEN;
    } else {
      process.env.PAYSHIELD_REVIEW_APP_ACCESS_TOKEN = originalEnv.reviewToken;
    }

    if (originalEnv.vercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalEnv.vercelEnv;
    }
  }
});
