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

  if (pathname === "/api/app/billing/webhook") {
    return false;
  }

  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/api/app" ||
    pathname.startsWith("/api/app/")
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
      ? `<p class="notice danger">That review token was not accepted. Check the owner token and try again.</p>`
      : accessState === "not_configured"
        ? `<p class="notice danger">Review access is not configured for this deployment. Add <code>PAYSHIELD_REVIEW_APP_ACCESS_TOKEN</code> or activate Clerk.</p>`
        : "";
  const reviewAccessHelp = appAccess.reviewTokenConfigured
    ? "Enter the owner review token to open the app for this browser."
    : "Review access needs PAYSHIELD_REVIEW_APP_ACCESS_TOKEN before this form can unlock the app.";
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
    <title>PayShield App Activation</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          linear-gradient(115deg, rgba(18, 109, 255, .16), transparent 34%),
          radial-gradient(circle at 76% 18%, rgba(255, 178, 55, .14), transparent 28%),
          #050607;
        color: #f7f8fb;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body::before {
        position: fixed;
        inset: 0;
        pointer-events: none;
        content: "";
        background-image:
          linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px);
        background-size: 44px 44px;
        mask-image: linear-gradient(to bottom, rgba(0,0,0,.76), transparent 86%);
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
        width: min(54vw, 208px);
        height: auto;
        display: block;
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
        background:
          linear-gradient(145deg, rgba(57,232,255,.08), rgba(255,178,55,.075)),
          rgba(10,12,14,.94);
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
      .primary { background: linear-gradient(135deg, #fff, #dff7ff); color: #050607; }
      .secondary { border: 1px solid rgba(57,232,255,.28); background: rgba(57,232,255,.1); color: #dffaff; }
      .quiet { border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.055); color: #f7f8fb; }
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
        background: linear-gradient(135deg, #fff, #dff7ff);
        color: #050607;
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
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <a aria-label="PayShield home" href="/">
          <img class="logo" alt="PayShield" src="/images/payshield-logo-clean.png" />
        </a>
        <a class="support" href="mailto:support@graystontechnologies.com">support@graystontechnologies.com</a>
      </header>
      <div class="layout">
        <section class="panel hero">
          <span class="kicker">Household app activation</span>
          <h1>Turn on secure app access before household money controls open.</h1>
          <p class="lead">PayShield is ready to run the paid-access, bank-link, paycheck detection, protected bucket, transfer, card-decision, and audit workflow once authenticated access is configured.</p>
          <form class="token-form" action="/api/review-access" method="post" autocomplete="off">
            ${accessNotice}
            <label for="review_access_token">Owner review access</label>
            <div class="token-row">
              <input id="review_access_token" name="review_access_token" type="password" minlength="16" required placeholder="Enter owner token" />
              <button type="submit">Open app</button>
            </div>
            <input name="return_to" type="hidden" value="/app" />
            <p class="form-help">${reviewAccessHelp} Accepted tokens are stored only as a hashed HTTP-only cookie for eight hours.</p>
          </form>
          <div class="actions">
            <a class="button primary" href="/launch">Open revenue + rails console</a>
            <a class="button secondary" href="/">View product profile</a>
            <a class="button quiet" href="/api/health">Review production health</a>
          </div>
        </section>
        <aside class="stack">
          <div class="card">
            <strong>What is blocking this route?</strong>
            <span>Clerk app access has not been activated for this production deployment.</span>
          </div>
          <div class="card">
            <strong>What unlocks it?</strong>
            <span>Set <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code>. For owner review before Clerk is active, set a 16+ character <code>PAYSHIELD_REVIEW_APP_ACCESS_TOKEN</code> and use the owner access form on this page. Use <code>PAYSHIELD_ALLOW_REVIEW_APP_ACCESS=true</code> only for an isolated review deployment.</span>
          </div>
          <div class="card">
            <strong>Who operates PayShield?</strong>
            <span>PayShield is operated by Grayston Technologies. Product and support requests route to Grayston support.</span>
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
      status: 503,
    },
  );
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const reviewToken = reviewTokenFromRequest(request);
  const appAccess = getAppAccessReadiness(process.env, reviewToken);

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
