import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseVercelInspectOutput,
  parseVercelInspectResult,
  selectLatestCiRun,
  summarizeMarketStatus,
} from "../scripts/market-status.mjs";

const targetUrl = "https://payshield-lime.vercel.app";
const deploymentUrl = "https://payshield-abc123-james-projects.vercel.app";
const commit = "990a7a9010a11ece50ed60163b3d1656902efb5a";

const launchEvidence = {
  gitCommit: commit,
  ok: true,
  paidTrafficReady: false,
  production: {
    health: {
      ok: true,
      service: "payshield-web-app",
      siteUrl: targetUrl,
      vercel: {
        environment: "production",
        gitCommitSha: commit,
      },
      waitlist: {
        mode: "demo",
        paidTrafficReady: false,
        requireWebhook: false,
        webhookConfigured: false,
        webhookSigningConfigured: false,
      },
    },
    targetUrl,
  },
  readiness: {
    launchSurface: {
      checks: 32,
      failures: [],
      ok: true,
      warnings: ["/api/health does not report paid-traffic-ready durable lead capture"],
    },
    strict: {
      checks: 32,
      failures: ["/api/health does not report paid-traffic-ready durable lead capture"],
      ok: false,
      warnings: [],
    },
  },
  remainingGates: [
    "vercelProductionCaptureEnv",
    "signedDurableProductionCapture",
  ],
  vercelEnv: {
    configured: ["NEXT_PUBLIC_SITE_URL"],
    missing: [
      "PAYSHIELD_WAITLIST_WEBHOOK_URL",
      "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
      "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
    ],
    ok: false,
    wrongEnvironment: [],
  },
};

const passingCiRun = {
  conclusion: "success",
  createdAt: "2026-06-05T15:42:54Z",
  databaseId: 27024695786,
  displayTitle: "Add analytics evidence validation gate",
  headSha: commit,
  ok: true,
  status: "completed",
  url: "https://github.com/forstersolutions/PayShield/actions/runs/27024695786",
  workflowName: "CI",
};

const readyDeployment = {
  aliases: [
    targetUrl,
    "https://payshield-james-projects-397b955f.vercel.app",
  ],
  created: "Fri Jun 05 2026 11:42:54 GMT-0400 (Eastern Daylight Time)",
  id: "dpl_FyBh5ieGpaJuQtdvFoEuxWzroV1p",
  ok: true,
  ready: true,
  status: "Ready",
  target: "production",
  url: deploymentUrl,
};

function commercialHealthReady() {
  return {
    commercial: {
      checkoutConfigured: true,
      mode: "checkout",
      paidAccessReady: true,
      priceLabel: "$19/month",
      remainingGates: [],
      webhookSigningSecretConfigured: true,
    },
    moneyRails: {
      bankLinkReady: true,
      detectionMode: "plaid_transactions_sync",
      paycheckDetectionReady: true,
      plaidConfigured: true,
      remainingGates: [],
      tokenVaultConfigured: true,
      tokenVaultStoreReady: true,
      transferConfigured: true,
      transferReady: true,
    },
    neobank: {
      backendConfigured: true,
      clerkConfigured: true,
      liveMoneyReady: true,
      mode: "live_provider",
      postgresSchemaVerified: true,
      postgresSchemaVersion: "0007",
      providerConfigured: true,
      remainingGates: [],
    },
    ok: true,
    service: "payshield-web-app",
    siteUrl: targetUrl,
    vercel: {
      environment: "production",
      gitCommitSha: commit,
    },
    waitlist: {
      mode: "blob",
      paidTrafficReady: true,
      requireWebhook: true,
      storageConfigured: true,
      storageProvider: "blob",
    },
  };
}

test("selects the CI workflow instead of newer unrelated workflow runs", () => {
  const selected = selectLatestCiRun([
    {
      conclusion: "",
      createdAt: "2026-06-12T20:52:50Z",
      databaseId: 27442386751,
      displayTitle: "npm_and_yarn in / for dependency updates",
      headSha: commit,
      status: "in_progress",
      url: "https://github.com/forstersolutions/PayShield/actions/runs/27442386751",
      workflowName: "Dependabot Updates",
    },
    passingCiRun,
  ]);

  assert.equal(selected?.workflowName, "CI");
  assert.equal(selected?.ok, true);
  assert.equal(selected?.headSha, commit);
});

test("summarizes current production status without marking market ready", () => {
  const status = summarizeMarketStatus({
    generatedAt: "2026-06-05T15:45:00.000Z",
    githubLatestCiRun: passingCiRun,
    launchEvidence,
    localGit: {
      branch: "main",
      commit,
      dirty: false,
      ok: true,
    },
    targetUrl,
    vercelDeployment: readyDeployment,
  });

  assert.equal(status.ok, true);
  assert.equal(status.marketReady, false);
  assert.equal(status.commercialReady, false);
  assert.equal(status.paidTrafficReady, false);
  assert.equal(status.production.commitMatchesLocalGit, true);
  assert.equal(status.github.latestCiRun?.headSha, commit);
  assert.equal(
    status.remainingGates.includes("productionReceiverEvidence"),
    true,
  );
  assert.equal(status.remainingGates.includes("liveAnalyticsEvidence"), true);
  assert.equal(
    status.remainingGates.includes("signedDurableProductionCapture"),
    true,
  );
  assert.equal(status.remainingGates.includes("stripe_checkout"), true);
  assert.equal(status.issueSummaryMarkdown.includes(deploymentUrl), true);
  assert.equal(status.issueSummaryMarkdown.includes("Commercial readiness"), true);
  assert.equal(status.issueSummaryMarkdown.includes("shared-secret"), false);
  assert.equal(status.findings.length, 0);
});

test("commercial readiness is required even when go/no-go evidence says ready", () => {
  const status = summarizeMarketStatus({
    generatedAt: "2026-06-05T15:45:00.000Z",
    githubLatestCiRun: passingCiRun,
    launchEvidence: {
      ...launchEvidence,
      ok: true,
      paidTrafficReady: true,
      production: {
        ...launchEvidence.production,
        health: {
          ...launchEvidence.production.health,
          waitlist: {
            mode: "blob",
            paidTrafficReady: true,
            requireWebhook: true,
            storageConfigured: true,
            storageProvider: "blob",
          },
        },
      },
      remainingGates: [],
    },
    localGit: {
      branch: "main",
      commit,
      dirty: false,
      ok: true,
    },
    marketDecision: {
      marketReady: true,
      paidTrafficReady: true,
      remainingGates: [],
    },
    targetUrl,
    vercelDeployment: readyDeployment,
  });

  assert.equal(status.ok, true);
  assert.equal(status.marketReady, false);
  assert.equal(status.commercialReady, false);
  assert.equal(status.remainingGates.includes("stripe_checkout"), true);
  assert.equal(status.remainingGates.includes("live_money"), true);
});

test("market status can mark ready only when commercial and go/no-go gates both pass", () => {
  const status = summarizeMarketStatus({
    generatedAt: "2026-06-05T15:45:00.000Z",
    githubLatestCiRun: passingCiRun,
    launchEvidence: {
      ...launchEvidence,
      ok: true,
      paidTrafficReady: true,
      production: {
        ...launchEvidence.production,
        health: commercialHealthReady(),
      },
      remainingGates: [],
      vercelEnv: {
        configured: [],
        missing: [],
        ok: true,
        wrongEnvironment: [],
      },
    },
    localGit: {
      branch: "main",
      commit,
      dirty: false,
      ok: true,
    },
    marketDecision: {
      marketReady: true,
      paidTrafficReady: true,
      remainingGates: [],
    },
    targetUrl,
    vercelDeployment: readyDeployment,
  });

  assert.equal(status.ok, true);
  assert.equal(status.marketReady, true);
  assert.equal(status.commercialReady, true);
  assert.equal(status.remainingGates.length, 0);
});

test("flags stale CI and a deployment that is not aliased to the target URL", () => {
  const status = summarizeMarketStatus({
    githubLatestCiRun: {
      ...passingCiRun,
      headSha: "different",
      ok: true,
    },
    launchEvidence,
    localGit: {
      branch: "main",
      commit,
      dirty: false,
      ok: true,
    },
    targetUrl,
    vercelDeployment: {
      ...readyDeployment,
      aliases: ["https://other.example"],
    },
  });

  assert.equal(status.ok, false);
  assert.equal(
    status.remainingGates.includes("githubCiPassesOnProductionCommit"),
    true,
  );
  assert.equal(
    status.remainingGates.includes("vercelDeploymentAliasesTargetUrl"),
    true,
  );
});

test("uses production health as a fallback when Vercel inspect is unavailable", () => {
  const status = summarizeMarketStatus({
    githubLatestCiRun: passingCiRun,
    launchEvidence,
    localGit: {
      branch: "main",
      commit,
      dirty: false,
      ok: true,
    },
    targetUrl,
    vercelDeployment: {
      error: "Command failed: npx vercel inspect https://payshield-lime.vercel.app",
      ok: false,
      ready: false,
    },
  });

  assert.equal(status.ok, true);
  assert.equal(status.vercel.deployment.ready, true);
  assert.equal(status.vercel.deployment.source, "health-fallback");
  assert.equal(status.vercel.deployment.url, targetUrl);
  assert.equal(status.vercel.deployment.aliases.includes(targetUrl), true);
  assert.equal(
    status.remainingGates.includes("vercelDeploymentReady"),
    false,
  );
  assert.equal(
    status.remainingGates.includes("vercelDeploymentAliasesTargetUrl"),
    false,
  );
});

test("does not use the inspect fallback without production health proof", () => {
  const status = summarizeMarketStatus({
    githubLatestCiRun: passingCiRun,
    launchEvidence: {
      ...launchEvidence,
      production: {
        ...launchEvidence.production,
        health: {
          ...launchEvidence.production.health,
          vercel: {
            ...launchEvidence.production.health.vercel,
            environment: "preview",
          },
        },
      },
    },
    localGit: {
      branch: "main",
      commit,
      dirty: false,
      ok: true,
    },
    targetUrl,
    vercelDeployment: {
      error: "Command failed: npx vercel inspect https://payshield-lime.vercel.app",
      ok: false,
      ready: false,
    },
  });

  assert.equal(status.ok, false);
  assert.equal(status.vercel.deployment.ready, false);
  assert.equal(
    status.remainingGates.includes("vercelDeploymentReady"),
    true,
  );
  assert.equal(
    status.remainingGates.includes("vercelDeploymentAliasesTargetUrl"),
    true,
  );
});

test("flags a dirty local worktree", () => {
  const status = summarizeMarketStatus({
    githubLatestCiRun: passingCiRun,
    launchEvidence,
    localGit: {
      branch: "main",
      commit,
      dirty: true,
      ok: true,
      statusShort: "M  scripts/market-status.mjs",
    },
    targetUrl,
    vercelDeployment: readyDeployment,
  });

  assert.equal(status.ok, false);
  assert.equal(status.remainingGates.includes("localGitWorktreeClean"), true);
});

test("parses Vercel inspect output for status and aliases", () => {
  const inspectText = `
  General

    id\t\tdpl_FyBh5ieGpaJuQtdvFoEuxWzroV1p
    name\tpayshield
    target\tproduction
    status\t● Ready
    url\t\t${deploymentUrl}
    created\tFri Jun 05 2026 11:42:54 GMT-0400 (Eastern Daylight Time)

  Aliases

    ╶ ${targetUrl}
    ╶ https://payshield-git-main-james-projects-397b955f.vercel.app
`;
  const parsed = parseVercelInspectOutput(inspectText);

  assert.equal(parsed.id, "dpl_FyBh5ieGpaJuQtdvFoEuxWzroV1p");
  assert.equal(parsed.ready, true);
  assert.equal(parsed.status, "Ready");
  assert.equal(parsed.target, "production");
  assert.equal(parsed.url, deploymentUrl);
  assert.deepEqual(parsed.aliases, [
    targetUrl,
    "https://payshield-git-main-james-projects-397b955f.vercel.app",
  ]);
});

test("parses Vercel inspect details from stderr when stdout is only a prelude", () => {
  const parsed = parseVercelInspectResult({
    stderr: `
  General

    id\t\tdpl_stderr
    target\tproduction
    status\t● Ready
    url\t\t${deploymentUrl}

  Aliases

    ╶ ${targetUrl}
`,
    stdout: "Vercel CLI 54.9.1\n",
  });

  assert.equal(parsed.id, "dpl_stderr");
  assert.equal(parsed.ready, true);
  assert.equal(parsed.aliases.includes(targetUrl), true);
});
