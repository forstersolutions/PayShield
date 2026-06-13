import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const customerFacingFiles = [
  "src/app/components/household-command-center.tsx",
  "src/app/components/money-operations-panel.tsx",
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

  assert.match(appPage, /HouseholdCommandCenter/);
  assert.match(commandCenter, /getCommercialReadiness/);
  assert.match(commandCenter, /getMoneyRailReadiness/);
  assert.match(commandCenter, /Household setup/);
  assert.match(commandCenter, /Next best action/);
  assert.match(commandCenter, /Turn on paid access/);
  assert.match(commandCenter, /Connect the bank source/);
  assert.match(commandCenter, /Detect the paycheck/);
  assert.match(commandCenter, /Audit export/);
});

test("money operations surface shows revenue, rails, records, and export", async () => {
  const moneyOperations = await readFile(
    "src/app/components/money-operations-panel.tsx",
    "utf8",
  );

  assert.match(moneyOperations, /The revenue and money-control operating lane/);
  assert.match(moneyOperations, /Live rail stack/);
  assert.match(moneyOperations, /Runnable lanes/);
  assert.match(moneyOperations, /Setup blockers/);
  assert.match(moneyOperations, /Operations ledger/);
  assert.match(moneyOperations, /Export audit/);
  assert.match(moneyOperations, /Activate paid access/);
  assert.match(moneyOperations, /Manage billing/);
  assert.match(moneyOperations, /Connect banks/);
  assert.match(moneyOperations, /Detect paychecks/);
  assert.match(moneyOperations, /Move protected funds/);
});
