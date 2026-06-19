import { NextResponse } from "next/server.js";
import { getCommercialReadiness } from "../../lib/commercial/billing.ts";
import { getMoneyRailReadiness } from "../../lib/neobank/money-rails.ts";
import { getWaitlistCaptureConfig } from "../../lib/waitlist-capture-config.ts";
import { getNeobankReadiness } from "../../lib/neobank/readiness.ts";
import { getAppAccessReadiness } from "../../lib/neobank/app-access.ts";

export function GET() {
  const capture = getWaitlistCaptureConfig();
  const commercial = getCommercialReadiness();
  const moneyRails = getMoneyRailReadiness();
  const neobank = getNeobankReadiness();
  const appAccess = getAppAccessReadiness();
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
      commercial: {
        activationCoreConfigured: commercial.activationCoreConfigured,
        activationCoreReady: commercial.activationCoreReady,
        activationCoreServiceAuthConfigured:
          commercial.activationCoreServiceAuthConfigured,
        checkoutConfigured: commercial.checkoutConfigured,
        checkoutOperationalReady: commercial.checkoutOperationalReady,
        mode: commercial.mode,
        paidAccessReady: commercial.paidAccessReady,
        paymentLinkMode: commercial.paymentLinkMode,
        priceLabel: commercial.priceLabel,
        productionLiveStripeReady: commercial.productionLiveStripeReady,
        remainingGates: commercial.missing,
        stripePriceConfigured: commercial.stripePriceConfigured,
        stripeSecretConfigured: commercial.stripeSecretConfigured,
        stripeSecretMode: commercial.stripeSecretMode,
        webhookEndpointPath: commercial.webhookEndpointPath,
        webhookSigningSecretConfigured:
          commercial.webhookSigningSecretConfigured,
      },
      appAccess: {
        clerkConfigured: appAccess.clerkConfigured,
        locked: appAccess.locked,
        mode: appAccess.mode,
        productionLocked: appAccess.productionLocked,
        reviewAccessAllowed: appAccess.reviewAccessAllowed,
      },
      moneyRails: {
        bankLinkReady: moneyRails.bankLinkReady,
        detectionMode: moneyRails.detectionMode,
        paycheckDetectionReady: moneyRails.paycheckDetectionReady,
        plaidConfigured: moneyRails.plaidConfigured,
        plaidEnv: moneyRails.plaidEnv,
        providerAdapterConfigured: moneyRails.providerAdapterConfigured,
        providerAdapterMissing: moneyRails.providerAdapterMissing,
        providerWebhookSigningConfigured:
          moneyRails.providerWebhookSigningConfigured,
        remainingGates: moneyRails.missing,
        tokenVaultConfigured: moneyRails.tokenVaultConfigured,
        tokenVaultStoreReady: moneyRails.tokenVaultStoreReady,
        transactionSyncReady: moneyRails.transactionSyncReady,
        transferConfigured: moneyRails.transferConfigured,
        transferReady: moneyRails.transferReady,
      },
      neobank: {
        backendConfigured: neobank.backendConfigured,
        clerkConfigured: neobank.clerkConfigured,
        liveMoneyReady: neobank.liveMoneyReady,
        mode: neobank.mode,
        postgresConfigured: neobank.postgresConfigured,
        postgresSchemaVerified: neobank.postgresSchemaVerified,
        postgresSchemaVersion: neobank.postgresSchemaVersion,
        providerConfigured: neobank.providerConfigured,
        remainingGates: neobank.gates
          .filter((gate) => !gate.ok)
          .map((gate) => gate.id),
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
