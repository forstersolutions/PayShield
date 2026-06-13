import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server.js";
import {
  appAuthNotConfiguredBody,
  getAppAccessReadiness,
} from "./app/lib/neobank/app-access.ts";

function isProtectedRoute(request: NextRequest) {
  const { pathname } = request.nextUrl;

  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/api/app" ||
    pathname.startsWith("/api/app/")
  );
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
    <title>PayShield App Access</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #050607; color: #f7f8fb; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(92vw, 680px); border: 1px solid rgba(255,255,255,.14); border-radius: 8px; background: linear-gradient(145deg, rgba(57,232,255,.08), rgba(255,178,55,.08)), rgba(10,12,14,.94); padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,.36); }
      p { color: #c9d0da; line-height: 1.65; }
      a { color: #39e8ff; font-weight: 800; }
      .actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
      .button { min-height: 42px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; padding: 0 14px; text-decoration: none; }
      .primary { background: linear-gradient(135deg, #fff, #dff7ff); color: #050607; }
      .secondary { border: 1px solid rgba(57,232,255,.28); background: rgba(57,232,255,.1); color: #dffaff; }
      code { color: #ffcf72; }
    </style>
  </head>
  <body>
    <main>
      <strong>PayShield</strong>
      <h1>App access is not configured.</h1>
      <p>Configure Clerk for authenticated household access, or set <code>PAYSHIELD_ALLOW_REVIEW_APP_ACCESS=true</code> only for a controlled review environment.</p>
      <p>Open the revenue and rails console for the exact Stripe, Clerk, Plaid, ledger, transfer, and verification setup that makes PayShield usable.</p>
      <div class="actions">
        <a class="button primary" href="/launch">Open launch console</a>
        <a class="button secondary" href="mailto:support@graystontechnologies.com">Contact Grayston support</a>
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
  const appAccess = getAppAccessReadiness();

  if (isProtectedRoute(request) && appAccess.locked) {
    return protectedAppUnavailableResponse(request);
  }

  if (!appAccess.clerkConfigured) {
    return NextResponse.next();
  }

  return runConfiguredClerkMiddleware(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
