import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server.js";
import {
  appAuthNotConfiguredBody,
  getAppAccessReadiness,
  reviewAppAccessCookieValue,
  reviewAppAccessCookieName,
  reviewAppAccessQueryParam,
} from "./app/lib/neobank/app-access.ts";

function isProtectedRoute(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/api/app/billing/webhook" ||
    pathname === "/api/app/billing/revenuecat/webhook"
  ) {
    return false;
  }

  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/launch" ||
    pathname.startsWith("/launch/") ||
    pathname === "/api/app" ||
    pathname.startsWith("/api/app/") ||
    pathname === "/api/launch" ||
    pathname.startsWith("/api/launch/")
  );
}

function isProtectedApiWrite(request: NextRequest) {
  return (
    isProtectedRoute(request) &&
    request.nextUrl.pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())
  );
}

function trustedWriteOrigin(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    const accepted = new Set([request.nextUrl.origin]);
    const configuredSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();

    if (configuredSite) {
      accepted.add(new URL(configuredSite).origin);
    }

    return accepted.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function crossSiteWriteResponse() {
  return NextResponse.json(
    {
      code: "cross_site_request_rejected",
      error: "This request could not be verified.",
      service: "payshield-request-protection",
    },
    {
      headers: { "cache-control": "no-store" },
      status: 403,
    },
  );
}

function reviewTokenFromRequest(request: NextRequest) {
  return (
    request.nextUrl.searchParams.get(reviewAppAccessQueryParam) ??
    request.headers.get("x-payshield-review-token") ??
    request.cookies.get(reviewAppAccessCookieName)?.value ??
    null
  );
}

function requestHasReviewQueryToken(request: NextRequest) {
  return request.nextUrl.searchParams.has(reviewAppAccessQueryParam);
}

function stripReviewQueryToken(request: NextRequest) {
  const nextUrl = request.nextUrl.clone();

  nextUrl.searchParams.delete(reviewAppAccessQueryParam);

  return nextUrl;
}

function attachReviewCookie(
  response: NextResponse,
  request: NextRequest,
  tokenAccepted: boolean,
) {
  const reviewToken = request.nextUrl.searchParams.get(reviewAppAccessQueryParam);

  if (!reviewToken || !tokenAccepted) {
    return response;
  }

  response.cookies.set({
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    name: reviewAppAccessCookieName,
    path: "/",
    sameSite: "strict",
    secure: request.nextUrl.protocol === "https:",
    value: reviewAppAccessCookieValue(reviewToken),
  });

  return response;
}

async function runConfiguredClerkMiddleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const { clerkMiddleware } = await import("@clerk/nextjs/server");
  const configuredMiddleware = clerkMiddleware(async (auth, protectedRequest) => {
    if (isProtectedRoute(protectedRequest)) {
      await auth.protect();
    }
  });

  return configuredMiddleware(request, event);
}

function protectedAppUnavailableResponse(request: NextRequest) {
  const body = appAuthNotConfiguredBody();
  const accessState = request.nextUrl.searchParams.get("access");
  const appAccess = getAppAccessReadiness();
  const accessNotice =
    accessState === "invalid"
      ? `<p class="notice danger">That access token was not accepted. Check the token and try again.</p>`
      : accessState === "not_configured"
        ? `<p class="notice danger">We could not verify secure account access. Contact Grayston support.</p>`
        : "";
  const reviewAccessHelp = appAccess.reviewTokenConfigured
    ? "Enter your PayShield access token to open the app on this browser."
    : "Contact Grayston support to restore household access.";
  const headers = {
    "cache-control": "no-store",
  };

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(body, {
      headers,
      status: 503,
    });
  }

  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>PayShield Secure Access</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: #0c100f;
        color: #f7f8fb;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body::before {
        display: none;
      }
      main {
        position: relative;
        z-index: 1;
        width: min(94vw, 1120px);
        margin: 0 auto;
        padding: 18px 0 38px;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 68px;
      }
      .logo {
        display: inline-flex;
        height: 42px;
        align-items: center;
        gap: 6px;
        color: #f5f7f6;
        font-size: 20px;
        font-weight: 650;
        line-height: 1;
        text-decoration: none;
      }
      .logo img {
        width: 42px;
        height: 42px;
        object-fit: contain;
      }
      .logo b {
        color: #2f8cff;
        font-weight: 650;
      }
      .support {
        color: #dffaff;
        font-size: 14px;
        font-weight: 850;
        text-decoration: none;
      }
      .layout {
        min-height: calc(100vh - 124px);
        display: grid;
        align-items: center;
        gap: 18px;
        grid-template-columns: minmax(0, 1.08fr) minmax(320px, .92fr);
      }
      .panel {
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 8px;
        background: #141a18;
        box-shadow: 0 24px 80px rgba(0,0,0,.36);
      }
      .hero {
        padding: clamp(24px, 4vw, 42px);
      }
      .kicker {
        display: inline-flex;
        min-height: 34px;
        align-items: center;
        border: 1px solid rgba(57,232,255,.3);
        border-radius: 8px;
        background: rgba(57,232,255,.1);
        color: #dffaff;
        padding: 0 12px;
        font-size: 12px;
        font-weight: 950;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 22px 0 0;
        max-width: 760px;
        color: #fff;
        font-size: clamp(40px, 7vw, 76px);
        line-height: .96;
        letter-spacing: 0;
      }
      p {
        color: #c9d0da;
        line-height: 1.65;
      }
      .lead {
        max-width: 700px;
        margin: 20px 0 0;
        font-size: clamp(16px, 2vw, 19px);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 26px;
      }
      .button {
        min-height: 46px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        padding: 0 16px;
        text-decoration: none;
        font-weight: 950;
      }
      .primary { background: #f5f7f6; color: #0c100f; }
      .secondary { border: 1px solid rgba(57,232,255,.28); background: rgba(57,232,255,.1); color: #dffaff; }
      .quiet { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.055); color: #f7f8fb; }
      .unlock-strip {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        margin-top: 22px;
      }
      .unlock-step {
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 8px;
        background: rgba(0,0,0,.32);
        min-height: 96px;
        padding: 12px;
      }
      .unlock-step b {
        color: #68f0c2;
        display: block;
        font-size: 12px;
        font-weight: 950;
        text-transform: uppercase;
      }
      .unlock-step span {
        color: #f7f8fb;
        display: block;
        font-size: 14px;
        font-weight: 900;
        line-height: 1.35;
        margin-top: 8px;
      }
      .token-form {
        display: grid;
        gap: 10px;
        margin-top: 24px;
        max-width: 640px;
        border: 1px solid rgba(57,232,255,.24);
        border-radius: 8px;
        background: rgba(57,232,255,.08);
        padding: 14px;
      }
      .is-hidden { display: none; }
      .token-form label {
        color: #fff;
        font-size: 13px;
        font-weight: 950;
        text-transform: uppercase;
      }
      .token-row {
        display: grid;
        gap: 10px;
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .token-row input {
        min-width: 0;
        height: 46px;
        border: 1px solid rgba(255,255,255,.16);
        border-radius: 8px;
        background: rgba(0,0,0,.44);
        color: #fff;
        font: inherit;
        font-weight: 800;
        outline: none;
        padding: 0 12px;
      }
      .token-row input:focus {
        border-color: rgba(57,232,255,.72);
        box-shadow: 0 0 0 3px rgba(57,232,255,.12);
      }
      .token-row button {
        min-height: 46px;
        border: 0;
        border-radius: 8px;
        background: #f5f7f6;
        color: #0c100f;
        cursor: pointer;
        font: inherit;
        font-weight: 950;
        padding: 0 16px;
      }
      .form-help {
        margin: 0;
        color: #aab3c2;
        font-size: 13px;
      }
      .notice {
        margin: 0;
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 14px;
        font-weight: 850;
      }
      .danger {
        border: 1px solid rgba(255,107,53,.35);
        background: rgba(255,107,53,.12);
        color: #ffd2c2;
      }
      .stack {
        display: grid;
        gap: 12px;
      }
      .card {
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 8px;
        background: rgba(0,0,0,.32);
        padding: 16px;
      }
      .card strong {
        display: block;
        color: #fff;
        font-size: 16px;
      }
      .card span {
        display: block;
        margin-top: 7px;
        color: #aab3c2;
        font-size: 14px;
        line-height: 1.55;
      }
      .paycheck-preview {
        border: 1px solid rgba(104,240,194,.26);
        background: #14201c;
      }
      .paycheck-preview strong {
        color: #dffaff;
      }
      .money-row {
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        border-top: 1px solid rgba(255,255,255,.1);
        margin-top: 10px;
        padding-top: 10px;
      }
      .money-row:first-of-type {
        border-top: 0;
      }
      .money-row i {
        align-items: center;
        background: rgba(57,232,255,.12);
        border-radius: 8px;
        color: #dffaff;
        display: grid;
        font-style: normal;
        font-size: 12px;
        font-weight: 950;
        height: 32px;
        justify-items: center;
      }
      .money-row em {
        color: #f7f8fb;
        display: block;
        font-style: normal;
        font-size: 14px;
        font-weight: 950;
      }
      .money-row small {
        color: #8f99aa;
        display: block;
        font-size: 12px;
        font-weight: 800;
        margin-top: 2px;
      }
      .money-row strong {
        color: #fff;
        font-size: 14px;
        text-align: right;
      }
      .money-row.safe i {
        background: rgba(104,240,194,.15);
        color: #9af7d5;
      }
      .money-row.safe small,
      .money-row.safe strong {
        color: #cffff0;
      }
      code {
        color: #ffcf72;
        font-weight: 850;
        word-break: break-word;
      }
      @media (max-width: 840px) {
        header { align-items: flex-start; flex-direction: column; }
        .layout { grid-template-columns: 1fr; min-height: auto; padding-top: 18px; }
        .support { min-height: 40px; display: inline-flex; align-items: center; }
        .token-row { grid-template-columns: 1fr; }
        .unlock-strip { grid-template-columns: 1fr 1fr; }
      }
      @media (max-width: 520px) {
        .unlock-strip { grid-template-columns: 1fr; }
        .money-row { grid-template-columns: 32px minmax(0, 1fr); }
        .money-row strong { grid-column: 2; text-align: left; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <a aria-label="PayShield home" class="logo" href="/">
          <img alt="" src="/images/payshield-mark.png" /><span><b>Pay</b>Shield</span>
        </a>
        <a class="support" href="mailto:support@graystontechnologies.com">support@graystontechnologies.com</a>
      </header>
      <div class="layout">
        <section class="panel hero">
          <span class="kicker">Secure household access</span>
          <h1>Open your PayShield account.</h1>
          <p class="lead">Sign in to see Safe to Spend, manage paycheck rules, protect household obligations, schedule approved bills, and control your PayShield card.</p>
          <div class="unlock-strip" aria-label="PayShield setup sequence">
            <div class="unlock-step"><b>01 Account</b><span>Secure access keeps household controls private.</span></div>
            <div class="unlock-step"><b>02 Paycheck</b><span>Recognize deposits and fund priorities in order.</span></div>
            <div class="unlock-step"><b>03 Protection</b><span>Keep obligations outside everyday spending.</span></div>
            <div class="unlock-step"><b>04 Control</b><span>Manage cards, bills, transfers, and recovery.</span></div>
          </div>
          <form class="token-form ${appAccess.reviewTokenConfigured ? "" : "is-hidden"}" action="/api/review-access" method="post" autocomplete="off">
            ${accessNotice}
            <label for="review_access_token">Access token</label>
            <div class="token-row">
              <input id="review_access_token" name="review_access_token" type="password" minlength="16" required placeholder="Enter access token" />
              <button type="submit">Open app</button>
            </div>
            <input name="return_to" type="hidden" value="/app" />
            <p class="form-help">${reviewAccessHelp} This browser stays authorized for eight hours after a valid token is accepted.</p>
          </form>
          <div class="actions">
            <a class="button primary" href="/">Return to PayShield</a>
            <a class="button secondary" href="mailto:support@graystontechnologies.com">Contact support</a>
            <a class="button quiet" href="/privacy">Privacy</a>
          </div>
        </section>
        <aside class="stack">
          <div class="card">
            <strong>Your PayShield membership</strong>
            <span>Billing, household access, and money controls stay tied to one secure account.</span>
          </div>
          <div class="card paycheck-preview">
            <strong>Your paycheck order</strong>
            <span>Your own bucket targets fund by priority, then the remainder becomes Safe to Spend.</span>
            <div class="money-row"><i>1</i><span><em>Required bills</em><small>Approved destinations only</small></span><strong>First</strong></div>
            <div class="money-row"><i>2</i><span><em>Household goals</em><small>Your custom protection rules</small></span><strong>Next</strong></div>
            <div class="money-row safe"><i>3</i><span><em>Safe to Spend</em><small>Remainder after protection</small></span><strong>Last</strong></div>
          </div>
          <div class="card">
            <strong>How does it connect to banks?</strong>
            <span>The app opens a secure bank connection, saves payroll rules, and uses linked activity to recognize paycheck deposits.</span>
          </div>
          <div class="card">
            <strong>How does it protect money?</strong>
            <span>Buckets, approved payees, transfer requests, card checks, unlocks, and audit export all run inside the app flow operated by Grayston Technologies.</span>
          </div>
        </aside>
      </div>
    </main>
  </body>
</html>`,
    {
      headers: {
        ...headers,
        "content-type": "text/html; charset=utf-8",
      },
      status: 200,
    },
  );
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const reviewToken = reviewTokenFromRequest(request);
  const appAccess = getAppAccessReadiness(process.env, reviewToken);

  if (isProtectedApiWrite(request) && !trustedWriteOrigin(request)) {
    return crossSiteWriteResponse();
  }

  if (isProtectedRoute(request) && appAccess.locked) {
    return protectedAppUnavailableResponse(request);
  }

  if (
    isProtectedRoute(request) &&
    appAccess.reviewTokenAccepted &&
    requestHasReviewQueryToken(request) &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    return attachReviewCookie(
      NextResponse.redirect(stripReviewQueryToken(request)),
      request,
      appAccess.reviewTokenAccepted,
    );
  }

  if (!appAccess.clerkConfigured) {
    return attachReviewCookie(
      NextResponse.next(),
      request,
      appAccess.reviewTokenAccepted,
    );
  }

  return runConfiguredClerkMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
