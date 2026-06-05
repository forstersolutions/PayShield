import { NextResponse } from "next/server.js";

type WaitlistMode = "demo" | "upstash" | "webhook";

function getWaitlistMode(): WaitlistMode {
  if (process.env.PAYSHIELD_WAITLIST_STORAGE?.trim().toLowerCase() === "upstash") {
    return "upstash";
  }

  return process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL ? "webhook" : "demo";
}

export function GET() {
  const waitlistMode = getWaitlistMode();
  const requireWebhook = process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK === "true";
  const webhookConfigured = waitlistMode === "webhook";
  const webhookSigningConfigured = Boolean(
    process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET?.trim(),
  );
  const storageConfigured =
    waitlistMode === "upstash" &&
    Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim()) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  const durableCaptureConfigured =
    (webhookConfigured && webhookSigningConfigured) || storageConfigured;
  const paidTrafficReady =
    durableCaptureConfigured && requireWebhook;
  const storageMisconfigured = waitlistMode === "upstash" && !storageConfigured;
  const ok = (!requireWebhook || paidTrafficReady) && !storageMisconfigured;

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
        storageConfigured,
        storageMisconfigured,
        storageProvider: waitlistMode === "upstash" ? "upstash" : null,
        webhookConfigured,
        webhookSigningConfigured,
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
