import { NextResponse } from "next/server.js";
import { getWaitlistCaptureConfig } from "../../lib/waitlist-capture-config.ts";

export function GET() {
  const capture = getWaitlistCaptureConfig();
  const ok =
    (!capture.requireWebhook || capture.paidTrafficReady) &&
    !capture.storageMisconfigured &&
    !capture.webhookMisconfigured;

  return NextResponse.json(
    {
      ok,
      service: "payshield-web-app",
      siteUrl:
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://payshield.vercel.app",
      vercel: {
        environment: process.env.VERCEL_ENV ?? "local",
        gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      },
      waitlist: {
        mode: capture.mode,
        paidTrafficReady: capture.paidTrafficReady,
        requireWebhook: capture.requireWebhook,
        storageConfigured: capture.storageConfigured,
        storageMisconfigured: capture.storageMisconfigured,
        storageProvider: capture.storageProvider,
        webhookConfigured: capture.webhookConfigured,
        webhookEndpointConfigured: capture.webhookEndpointConfigured,
        webhookMisconfigured: capture.webhookMisconfigured,
        webhookSigningConfigured: capture.webhookSigningConfigured,
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
