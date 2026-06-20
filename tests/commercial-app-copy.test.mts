import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const customerFacingFiles = [
  "src/app/components/household-command-center.tsx",
  "src/app/components/money-engine-console.tsx",
  "src/app/components/money-setup-console.tsx",
  "src/app/components/money-operations-panel.tsx",
  "src/app/components/payee-control-panel.tsx",
  "src/app/components/bill-routing-workspace.tsx",
  "src/app/launch/page.tsx",
  "src/app/api/app/billing/checkout/route.ts",
  "src/app/api/app/billing/portal/route.ts",
  "src/app/lib/commercial/billing.ts",
  ".env.example",
];

const prohibitedPhrases = [
  /paid beta/i,
  /early access/i,
  /prototype/i,
  /simulation controls/i,
  /simulated/i,
  /demo payroll/i,
  /PAYSHIELD_BETA/,
];

test("commercial app copy avoids non-production positioning", async () => {
  const findings: string[] = [];

  for (const file of customerFacingFiles) {
    const text = await readFile(file, "utf8");

    for (const phrase of prohibitedPhrases) {
      if (phrase.test(text)) {
        findings.push(`${file} contains ${phrase}`);
      }
    }
  }

  assert.deepEqual(findings, []);
});

test("app command center exposes a guided real-money setup surface", async () => {
  const appPage = await readFile("src/app/app/page.tsx", "utf8");
  const commandCenter = await readFile(
    "src/app/components/household-command-center.tsx",
    "utf8",
  );
  const setupConsole = await readFile(
    "src/app/components/money-setup-console.tsx",
    "utf8",
  );
  const dashboard = await readFile(
    "src/app/components/neobank-dashboard.tsx",
    "utf8",
  );
  const moneyEngine = await readFile(
    "src/app/components/money-engine-console.tsx",
    "utf8",
  );
  const operations = await readFile("src/app/lib/neobank/operations.ts", "utf8");

  assert.match(appPage, /HouseholdCommandCenter/);
  assert.match(commandCenter, /getCommercialReadiness/);
  assert.match(commandCenter, /getMoneyRailReadiness/);
  assert.match(commandCenter, /MoneyEngineConsole/);
  assert.match(commandCenter, /MoneySetupConsole/);
  assert.match(commandCenter, /createHouseholdActivationPacket/);
  assert.match(moneyEngine, /Money engine console/);
  assert.match(moneyEngine, /Charge the household\. Then protect every paycheck\./);
  assert.match(moneyEngine, /Monthly recurring revenue/);
  assert.match(moneyEngine, /Target households/);
  assert.match(moneyEngine, /Every row is an app action/);
  assert.match(moneyEngine, /stage\.primaryEndpoint/);
  assert.match(moneyEngine, /stage\.actionHref/);
  assert.match(setupConsole, /Money setup console/);
  assert.match(setupConsole, /\/api\/app\/activation/);
  assert.match(setupConsole, /The shortest route from subscription to protected paycheck/);
  assert.match(setupConsole, /Next executable move/);
  assert.match(setupConsole, /Activation workbench/);
  assert.match(setupConsole, /Vercel setup/);
  assert.match(setupConsole, /setupCommands/);
  assert.match(setupConsole, /Remaining gates/);
  assert.match(setupConsole, /Proof commands/);
  assert.match(operations, /npx vercel env add/);
  assert.match(operations, /\/api\/launch\/activation/);
  assert.match(setupConsole, /Per household access/);
  assert.match(setupConsole, /Endpoint backed/);
  assert.match(commandCenter, /Household setup/);
  assert.match(commandCenter, /Revenue \+ real money controls/);
  assert.match(
    commandCenter,
    /Charge the household\. Connect the paycheck\. Protect the money\./,
  );
  assert.match(commandCenter, /Actual operating flow/);
  assert.match(commandCenter, /Six actions make the product work/);
  assert.match(commandCenter, /Collect payment/);
  assert.match(commandCenter, /POST \/api\/app\/bank-link\/token/);
  assert.match(commandCenter, /POST \/api\/app\/paychecks\/sync/);
  assert.match(commandCenter, /POST \/api\/app\/paychecks\/rules/);
  assert.match(commandCenter, /POST \/api\/app\/buckets/);
  assert.match(commandCenter, /POST \/api\/app\/transfers/);
  assert.match(commandCenter, /Next best action/);
  assert.match(commandCenter, /Turn on paid access/);
  assert.match(commandCenter, /Connect the bank source/);
  assert.match(commandCenter, /Sync linked-bank activity/);
  assert.match(commandCenter, /Detect the paycheck/);
  assert.match(commandCenter, /Audit export/);
  assert.match(dashboard, /Real operating path/);
  assert.match(dashboard, /Make money, connect banks, detect payroll, protect funds/);
  assert.match(dashboard, /Start checkout/);
  assert.match(dashboard, /Open app flow/);
  assert.match(dashboard, /Owner setup/);
  assert.match(dashboard, /POST \/api\/public\/billing\/checkout/);
  assert.match(dashboard, /POST \/api\/app\/bank-link\/token/);
  assert.match(dashboard, /POST \/api\/app\/paychecks\/sync/);
  assert.match(dashboard, /POST \/api\/app\/transfers/);
  assert.match(dashboard, /MoneyEngineConsole/);
});

test("money operations surface shows revenue, rails, records, and export", async () => {
  const moneyOperations = await readFile(
    "src/app/components/money-operations-panel.tsx",
    "utf8",
  );

  assert.match(moneyOperations, /The revenue and money-control operating lane/);
  assert.match(moneyOperations, /Use PayShield/);
  assert.match(moneyOperations, /Four controls run the money product/);
  assert.match(moneyOperations, /Charge the household/);
  assert.match(moneyOperations, /Connect banks/);
  assert.match(moneyOperations, /Detect paychecks/);
  assert.match(moneyOperations, /Move protected funds/);
  assert.match(moneyOperations, /CapabilityCard/);
  assert.match(moneyOperations, /Money path/);
  assert.match(moneyOperations, /Detailed rail diagnostics/);
  assert.match(moneyOperations, /Runnable lanes/);
  assert.match(moneyOperations, /Setup blockers/);
  assert.match(moneyOperations, /Exception queue/);
  assert.match(moneyOperations, /Operations ledger/);
  assert.match(moneyOperations, /Export audit/);
  assert.match(moneyOperations, /Activate paid access/);
  assert.match(moneyOperations, /Manage billing/);
  assert.match(moneyOperations, /Connect banks/);
  assert.match(moneyOperations, /Sync bank activity/);
  assert.match(moneyOperations, /POST \/api\/app\/paychecks\/sync/);
  assert.match(moneyOperations, /Detect paychecks/);
  assert.match(moneyOperations, /Rule check ready/);
  assert.match(moneyOperations, /Provider activation/);
  assert.match(moneyOperations, /Protect the money/);
  assert.match(moneyOperations, /POST \/api\/app\/buckets/);
  assert.match(moneyOperations, /Control spending/);
  assert.match(moneyOperations, /POST \/api\/card\/authorize/);
  assert.match(moneyOperations, /Move protected funds/);
  assert.match(moneyOperations, /Approved destination/);
  assert.match(
    moneyOperations,
    /Only payees approved for the selected protected bucket appear\s+here/,
  );
  assert.match(moneyOperations, /Approve a payee for this bucket/);
});

test("bill routing workspace exposes protected payee setup before scheduling", async () => {
  const workspace = await readFile(
    "src/app/components/bill-routing-workspace.tsx",
    "utf8",
  );
  const payeeControls = await readFile(
    "src/app/components/payee-control-panel.tsx",
    "utf8",
  );
  const commandCenter = await readFile(
    "src/app/components/household-command-center.tsx",
    "utf8",
  );
  const dashboard = await readFile(
    "src/app/components/neobank-dashboard.tsx",
    "utf8",
  );

  assert.match(workspace, /PayeeControlPanel/);
  assert.match(workspace, /BillPaymentPanel/);
  assert.match(workspace, /onPayeeSaved/);
  assert.match(payeeControls, /Payee controls/);
  assert.match(payeeControls, /Save payee control/);
  assert.match(payeeControls, /\/api\/app\/payees/);
  assert.match(payeeControls, /payshield\.payee-controls\.draft/);
  assert.match(payeeControls, /Approve exactly who protected buckets can pay/);
  assert.match(payeeControls, /Provider pending/);
  assert.match(commandCenter, /BillRoutingWorkspace/);
  assert.match(commandCenter, /Approve destinations/);
  assert.match(commandCenter, /POST \/api\/app\/payees/);
  assert.match(dashboard, /BillRoutingWorkspace/);
});

test("launch console exposes the commercial money path outside locked app access", async () => {
  const launchPage = await readFile("src/app/launch/page.tsx", "utf8");
  const footer = await readFile("src/app/components/site-footer.tsx", "utf8");

  assert.match(launchPage, /dynamic = "force-dynamic"/);
  assert.match(launchPage, /index: false/);
  assert.match(launchPage, /PayShield Revenue \+ Rails Console/);
  assert.match(launchPage, /Make the app earn, connect, detect, protect, and move/);
  assert.match(launchPage, /Activation workbench/);
  assert.match(launchPage, /Blocker map/);
  assert.match(
    launchPage,
    /What can be configured now versus what needs external approval/,
  );
  assert.match(launchPage, /Revenue activation/);
  assert.match(launchPage, /Bank link and token custody/);
  assert.match(launchPage, /Core ledger and household auth/);
  assert.match(launchPage, /Provider, counsel, and live-money gates/);
  assert.match(launchPage, /copy-safe/);
  assert.match(launchPage, /MoneyEngineConsole/);
  assert.match(launchPage, /PublicCheckoutForm/);
  assert.match(launchPage, /getCommercialReadiness/);
  assert.match(launchPage, /getMoneyRailReadiness/);
  assert.match(launchPage, /getAppAccessReadiness/);
  assert.match(launchPage, /createHouseholdActivationPacket/);
  assert.match(launchPage, /STRIPE_SECRET_KEY/);
  assert.match(launchPage, /PAYSHIELD_COMMERCIAL_PRICE_ID/);
  assert.match(launchPage, /CLERK_SECRET_KEY/);
  assert.match(launchPage, /PAYSHIELD_REVIEW_APP_ACCESS_TOKEN/);
  assert.match(launchPage, /review_access_token/);
  assert.match(launchPage, /PLAID_CLIENT_ID/);
  assert.match(launchPage, /PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL/);
  assert.match(launchPage, /PAYSHIELD_PROVIDER_WEBHOOK_SECRET/);
  assert.match(launchPage, /PAYSHIELD_TRANSFER_ENABLED/);
  assert.match(launchPage, /PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE/);
  assert.match(launchPage, /PAYSHIELD_LIVE_MONEY_ENABLED/);
  assert.match(launchPage, /setupCommands/);
  assert.match(launchPage, /POST \/api\/app\/billing\/checkout/);
  assert.match(launchPage, /POST \/api\/app\/bank-link\/token/);
  assert.match(launchPage, /POST \/api\/app\/paychecks\/sync/);
  assert.match(launchPage, /POST \/api\/provider\/webhooks/);
  assert.match(launchPage, /POST \/api\/app\/transfers/);
  assert.match(launchPage, /POST \/api\/card\/authorize/);
  assert.match(launchPage, /npm run market:status/);
  assert.match(footer, /href="\/launch"/);
});
