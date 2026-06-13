import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const customerFacingFiles = [
  "src/app/components/household-command-center.tsx",
  "src/app/components/money-operations-panel.tsx",
  "src/app/api/app/billing/checkout/route.ts",
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
