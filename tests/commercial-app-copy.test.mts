import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const consumerFiles = [
  "src/app/components/download-gateway.tsx",
  "src/app/components/site-footer.tsx",
  "apps/mobile/src/app/(tabs)/index.tsx",
  "apps/mobile/src/app/(tabs)/plan.tsx",
  "apps/mobile/src/app/(tabs)/bills.tsx",
  "apps/mobile/src/app/(tabs)/activity.tsx",
  "apps/mobile/src/app/(tabs)/account.tsx",
  "apps/mobile/src/components/money-actions.tsx",
];

const prohibitedConsumerPhrases = [
  /paid beta/i,
  /early access/i,
  /prototype/i,
  /simulation controls/i,
  /simulated/i,
  /demo payroll/i,
  /provider pending/i,
  /provider execution/i,
  /core ledger/i,
  /setup console/i,
];

test("commercial mobile and download copy avoids non-production positioning", async () => {
  const findings: string[] = [];

  for (const file of consumerFiles) {
    const source = await readFile(file, "utf8");

    for (const phrase of prohibitedConsumerPhrases) {
      if (phrase.test(source)) findings.push(`${file} contains ${phrase}`);
    }
  }

  assert.deepEqual(findings, []);
});

test("website is a store-download gateway and the legacy web app cannot open", async () => {
  const homePage = await readFile("src/app/page.tsx", "utf8");
  const appPage = await readFile("src/app/app/page.tsx", "utf8");
  const gateway = await readFile(
    "src/app/components/download-gateway.tsx",
    "utf8",
  );
  const downloadRoute = await readFile("src/app/download/route.ts", "utf8");

  assert.match(homePage, /<DownloadGateway \/>/);
  assert.match(appPage, /redirect\("\/download"\)/);
  assert.match(gateway, /Download on the/);
  assert.match(gateway, /Google Play/);
  assert.match(gateway, /payshield-mobile-home\.png/);
  assert.match(gateway, /PAYSHIELD_OWNERSHIP_LINE/);
  assert.equal(gateway.match(/<PayShieldHeaderLogo/g)?.length, 1);
  assert.match(downloadRoute, /iphone\|ipad\|ipod/);
  assert.match(downloadRoute, /android/);
});

test("native identity and subscription access use stable authenticated user IDs", async () => {
  const webAuth = await readFile("src/app/lib/neobank/auth.ts", "utf8");
  const nativeSession = await readFile(
    "apps/mobile/src/providers/session-provider.tsx",
    "utf8",
  );
  const membership = await readFile(
    "apps/mobile/src/providers/membership-provider.tsx",
    "utf8",
  );

  assert.match(webAuth, /clerkSubject: session\.userId/);
  assert.match(webAuth, /userId: session\.userId/);
  assert.match(nativeSession, /userId: auth\.userId/);
  assert.match(membership, /appUserID: session\.userId/);
  assert.match(membership, /purchasePackage/);
  assert.match(membership, /restorePurchases/);
});

test("native app wires every customer money workflow", async () => {
  const home = await readFile("apps/mobile/src/app/(tabs)/index.tsx", "utf8");
  const plan = await readFile("apps/mobile/src/app/(tabs)/plan.tsx", "utf8");
  const bills = await readFile("apps/mobile/src/app/(tabs)/bills.tsx", "utf8");
  const activity = await readFile("apps/mobile/src/app/(tabs)/activity.tsx", "utf8");
  const account = await readFile("apps/mobile/src/app/(tabs)/account.tsx", "utf8");

  assert.match(home, /Safe to Spend/);
  assert.match(home, /TransferSheet/);
  assert.match(home, /UnlockSheet/);
  assert.match(plan, /replace_profile/);
  assert.match(plan, /New protected bucket/);
  assert.match(bills, /\/api\/app\/payees/);
  assert.match(bills, /\/api\/app\/bill-payments/);
  assert.match(activity, /\/api\/app\/audit\/export/);
  assert.match(account, /\/api\/app\/bank-link\/token/);
  assert.match(account, /\/api\/app\/bank-link\/exchange/);
  assert.match(account, /\/api\/app\/onboarding\/start/);
  assert.match(account, /\/api\/app\/card\/status/);
});

test("RevenueCat webhooks persist native store access through the core", async () => {
  const route = await readFile(
    "src/app/api/app/billing/revenuecat/webhook/route.ts",
    "utf8",
  );
  const parser = await readFile(
    "src/app/lib/commercial/revenuecat-webhook.ts",
    "utf8",
  );

  assert.match(route, /verifyRevenueCatAuthorization/);
  assert.match(route, /\/api\/commercial\/billing-events/);
  assert.match(parser, /INITIAL_PURCHASE/);
  assert.match(parser, /CANCELLATION/);
  assert.match(parser, /EXPIRATION/);
  assert.match(parser, /BILLING_ISSUE/);
  assert.match(parser, /payshield_pro/);
});

test("launch controls stay operator-only and outside the consumer flow", async () => {
  const launchPage = await readFile("src/app/launch/page.tsx", "utf8");
  const launchRoute = await readFile(
    "src/app/api/launch/activation/route.ts",
    "utf8",
  );
  const operatorAuth = await readFile(
    "src/app/lib/neobank/operator-auth.ts",
    "utf8",
  );
  const gateway = await readFile(
    "src/app/components/download-gateway.tsx",
    "utf8",
  );

  assert.match(launchPage, /getOperatorSession/);
  assert.match(launchRoute, /getOperatorSession/);
  assert.match(launchRoute, /operatorAccessDeniedResponse/);
  assert.match(operatorAuth, /PAYSHIELD_OPERATOR_EMAILS/);
  assert.match(operatorAuth, /PAYSHIELD_OPERATOR_USER_IDS/);
  assert.doesNotMatch(gateway, /href="\/launch"/);
});
