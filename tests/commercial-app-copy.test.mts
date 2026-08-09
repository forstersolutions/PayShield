import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const consumerFiles = [
  "src/app/components/household-command-center.tsx",
  "src/app/components/household-money-workspace.tsx",
  "src/app/components/household-money-profile-panel.tsx",
  "src/app/components/bucket-control-panel.tsx",
  "src/app/components/payee-control-panel.tsx",
  "src/app/components/bill-payment-panel.tsx",
  "src/app/components/unlock-control-panel.tsx",
  "src/app/components/neobank-dashboard.tsx",
  "src/app/components/public-checkout-form.tsx",
  "src/app/components/site-footer.tsx",
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

test("commercial app copy avoids non-production positioning", async () => {
  const findings: string[] = [];

  for (const file of consumerFiles) {
    const source = await readFile(file, "utf8");

    for (const phrase of prohibitedConsumerPhrases) {
      if (phrase.test(source)) {
        findings.push(`${file} contains ${phrase}`);
      }
    }
  }

  assert.deepEqual(findings, []);
});

test("authenticated app identity uses stable Clerk subject instead of email", async () => {
  const auth = await readFile("src/app/lib/neobank/auth.ts", "utf8");

  assert.match(auth, /clerkSubject: session\.userId/);
  assert.match(auth, /userId: session\.userId/);
  assert.doesNotMatch(auth, /payShieldUserIdForEmail\(email\) \|\| session\.userId/);
});

test("app command center exposes the complete household money workspace", async () => {
  const appPage = await readFile("src/app/app/page.tsx", "utf8");
  const commandCenter = await readFile(
    "src/app/components/household-command-center.tsx",
    "utf8",
  );
  const workspace = await readFile(
    "src/app/components/household-money-workspace.tsx",
    "utf8",
  );

  assert.match(appPage, /getAppSession/);
  assert.match(appPage, /<HouseholdCommandCenter session=\{session\} \/>/);
  assert.doesNotMatch(appPage, /SiteFooter/);
  assert.match(commandCenter, /HouseholdMoneyWorkspace/);
  assert.doesNotMatch(commandCenter, /MoneyEngineConsole|MoneySetupConsole/);

  for (const label of ["Today", "Paycheck", "Buckets", "Bills", "Card", "Activity"]) {
    assert.match(workspace, new RegExp(`label: "${label}"`));
  }

  assert.match(workspace, /Safe to Spend/);
  assert.match(workspace, /HouseholdMoneyProfilePanel/);
  assert.match(workspace, /BucketControlPanel/);
  assert.match(workspace, /BillRoutingWorkspace/);
  assert.match(workspace, /UnlockControlPanel/);
  assert.match(workspace, /PAYSHIELD_OWNERSHIP_LINE/);
  assert.match(workspace, /GRAYSTON_SUPPORT_EMAIL/);
  assert.equal(workspace.match(/<PayShieldHeaderLogo/g)?.length, 1);
  assert.doesNotMatch(workspace, /href="\/launch"/);
});

test("consumer workspace wires revenue, bank, paycheck, card, transfer, and export actions", async () => {
  const workspace = await readFile(
    "src/app/components/household-money-workspace.tsx",
    "utf8",
  );
  const checkout = await readFile(
    "src/app/api/app/billing/checkout/route.ts",
    "utf8",
  );

  for (const path of [
    "/api/app/billing/checkout",
    "/api/app/billing/portal",
    "/api/app/bank-link/token",
    "/api/app/bank-link/exchange",
    "/api/app/paychecks/rules",
    "/api/app/paychecks/sync",
    "/api/app/onboarding/start",
    "/api/app/card/status",
    "/api/app/transfers",
    "/api/app/audit/export",
  ]) {
    assert.match(workspace, new RegExp(path.replaceAll("/", "\\/")));
  }

  assert.match(workspace, /Freeze card/);
  assert.match(workspace, /Unfreeze card/);
  assert.match(checkout, /requireCheckoutSession: true/);
  assert.match(checkout, /mode: "automatic"/);
  assert.match(checkout, /autoActivationReady/);
});

test("bill routing supports destination lifecycle and scheduled payment cancellation", async () => {
  const routing = await readFile(
    "src/app/components/bill-routing-workspace.tsx",
    "utf8",
  );
  const payees = await readFile(
    "src/app/components/payee-control-panel.tsx",
    "utf8",
  );
  const bills = await readFile(
    "src/app/components/bill-payment-panel.tsx",
    "utf8",
  );
  const payeeRoute = await readFile("src/app/api/app/payees/route.ts", "utf8");
  const cancelRoute = await readFile(
    "src/app/api/app/bill-payments/cancel/route.ts",
    "utf8",
  );

  assert.match(routing, /PayeeControlPanel/);
  assert.match(routing, /BillPaymentPanel/);
  assert.match(routing, /billPayments/);
  assert.match(routing, /onOperationsRefresh/);
  assert.match(payees, /Payment destinations/);
  assert.match(payees, /Verification pending/);
  assert.match(payees, /method: updatingServerRecord \? "PATCH" : "POST"/);
  assert.match(payees, /method: "DELETE"/);
  assert.match(payees, /Nothing was changed/);
  assert.doesNotMatch(payees, /localStorage/);
  assert.match(bills, /Schedule a bill/);
  assert.match(bills, /Upcoming/);
  assert.match(bills, /\/api\/app\/bill-payments\/cancel/);
  assert.match(bills, /Confirm/);
  assert.match(payeeRoute, /export async function POST/);
  assert.match(payeeRoute, /export async function PATCH/);
  assert.match(payeeRoute, /export async function DELETE/);
  assert.match(cancelRoute, /\/api\/app\/bill-payments\/cancel/);
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
  const dashboard = await readFile(
    "src/app/components/neobank-dashboard.tsx",
    "utf8",
  );

  assert.match(launchPage, /getOperatorSession/);
  assert.match(launchRoute, /getOperatorSession/);
  assert.match(launchRoute, /operatorAccessDeniedResponse/);
  assert.match(operatorAuth, /PAYSHIELD_OPERATOR_EMAILS/);
  assert.match(operatorAuth, /PAYSHIELD_OPERATOR_USER_IDS/);
  assert.doesNotMatch(dashboard, /href="\/launch"/);
  assert.match(dashboard, /Spend what&apos;s free\. Protect what&apos;s spoken for\./);
  assert.match(dashboard, /Your balance lies/);
});
