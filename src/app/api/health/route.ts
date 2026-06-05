import { NextResponse } from "next/server.js";

type WaitlistMode = "demo" | "webhook";

function getWaitlistMode(): WaitlistMode {
  return process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL ? "webhook" : "demo";
}

export function GET() {
  const waitlistMode = getWaitlistMode();
  const requireWebhook = process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK === "true";
  const webhookConfigured = waitlistMode === "webhook";
  const paidTrafficReady = webhookConfigured && requireWebhook;
  const ok = !requireWebhook || webhookConfigured;

  return NextResponse.json(
    {
      ok,
      service: "payshield-market-site",
      siteUrl:
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://payshield.vercel.app",
      vercel: {
        environment: process.env.VERCEL_ENV ?? "local",
        gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      },
      waitlist: {
        mode: waitlistMode,
        paidTrafficReady,
        requireWebhook,
        webhookConfigured,
      },
    },
    {
      headers: {
        "cache-control": "no-store",
      },
      status: ok ? 200 : 503,
    },
  );
}
