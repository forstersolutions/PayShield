import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  collectPaidTrafficEvidence,
  evaluatePaidTrafficReadiness,
  normalizeSiteUrl,
} from "./paid-traffic-readiness.mjs";
import { auditAnalyticsInstrumentation } from "./analytics-audit.mjs";
import { auditVercelEnvList } from "./vercel-env-audit.mjs";
import { runLeadCaptureDryRun } from "./lead-capture-dry-run.mjs";

const execFileAsync = promisify(execFile);
const defaultTimeoutMs = 10_000;

function usage() {
  return [
    "Usage: npm run launch:evidence -- https://your-domain.com --expect-site-url https://your-domain.com [--strict] [--timeout-ms 10000]",
    "",
    "Prints a redacted JSON launch evidence packet for the paid-traffic readiness issue.",
    "Default mode is prototype evidence mode: it passes when the public surface and local capture proof pass,",
    "while still reporting paidTrafficReady=false until signed durable production capture is configured.",
    "--strict exits nonzero unless production health and Vercel env prove paid-traffic-ready capture.",
  ].join("\n");
}

function flagValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));

  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  const next = args[index + 1];

  if (index === -1 || !next || next.startsWith("--")) {
    return "";
  }

  return next;
}

function parseCliArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const targetUrl = args.find((arg) => !arg.startsWith("--"));
  const timeoutMs = Number(flagValue(args, "--timeout-ms") || defaultTimeoutMs);
  const unknown = args.find(
    (arg) =>
      arg.startsWith("--") &&
      !["--expect-site-url", "--help", "--strict", "--timeout-ms", "-h"].includes(
        arg,
      ) &&
      !arg.startsWith("--expect-site-url=") &&
      !arg.startsWith("--timeout-ms="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  if (!targetUrl) {
    throw new Error("A production URL is required.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new Error("--timeout-ms must be a number between 1 and 60000.");
  }

  return {
    expectedSiteUrl: flagValue(args, "--expect-site-url"),
    help: false,
    strict: args.includes("--strict"),
    targetUrl,
    timeoutMs,
  };
}

async function getGitCommit() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    });

    return stdout.trim();
  } catch {
    return "";
  }
}

async function getVercelEnvAudit() {
  const { stdout } = await execFileAsync("npx", ["vercel", "env", "ls"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  return auditVercelEnvList({ text: stdout });
}

function summarizeLeadCaptureDryRun(result) {
  return {
    backup: result.backup,
    backupVerification: result.backupVerification,
    checks: result.checks,
    dataAudit: result.dataAudit,
    eraseDryRun: result.eraseDryRun,
    internalLogCounts: result.internalLogCounts,
    ok: result.ok,
    summary: result.summary,
  };
}

function waitlistPaidTrafficReady(health) {
  const waitlist = health?.waitlist ?? {};
  const webhookReady =
    waitlist.mode === "webhook" &&
    waitlist.webhookConfigured === true &&
    waitlist.webhookEndpointConfigured !== false &&
    waitlist.webhookMisconfigured !== true &&
    waitlist.webhookSigningConfigured === true;
  const storageReady =
    ["blob", "upstash"].includes(String(waitlist.mode)) &&
    waitlist.storageConfigured === true &&
    ["blob", "upstash"].includes(String(waitlist.storageProvider));

  return (
    (webhookReady || storageReady) &&
    waitlist.requireWebhook === true &&
    waitlist.paidTrafficReady === true
  );
}

export function summarizeLaunchReadiness({
  analyticsAudit = { ok: false },
  expectedSiteUrl = "",
  generatedAt = new Date().toISOString(),
  gitCommit = "",
  leadCaptureDryRun,
  publicEvidence,
  targetUrl,
  vercelEnvAudit,
}) {
  const normalizedTargetUrl = normalizeSiteUrl(targetUrl);
  const normalizedExpectedSiteUrl = expectedSiteUrl
    ? normalizeSiteUrl(expectedSiteUrl)
    : "";
  const prototypeReadiness = evaluatePaidTrafficReadiness({
    ...publicEvidence,
    allowPrototype: true,
    expectedSiteUrl: normalizedExpectedSiteUrl,
  });
  const strictReadiness = evaluatePaidTrafficReadiness({
    ...publicEvidence,
    allowPrototype: false,
    expectedSiteUrl: normalizedExpectedSiteUrl,
  });
  const health = publicEvidence.health ?? {};
  const productionCommit = health.vercel?.gitCommitSha ?? "";
  const commitMatches =
    Boolean(gitCommit && productionCommit) && gitCommit === productionCommit;
  const paidTrafficReady =
    strictReadiness.ok &&
    vercelEnvAudit.ok === true &&
    waitlistPaidTrafficReady(health);
  const gates = [
    {
      name: "prototypeLaunchSurface",
      ok: prototypeReadiness.ok,
    },
    {
      name: "localLeadCaptureDryRun",
      ok: leadCaptureDryRun.ok === true,
    },
    {
      name: "analyticsInstrumentationAudit",
      ok: analyticsAudit.ok === true,
    },
    {
      name: "productionCommitMatchesLocalGit",
      ok: commitMatches,
      productionCommit,
    },
    {
      missing: vercelEnvAudit.missing ?? [],
      name: "vercelProductionCaptureEnv",
      ok: vercelEnvAudit.ok === true,
      capturePath: vercelEnvAudit.capturePath ?? "",
      wrongEnvironment: vercelEnvAudit.wrongEnvironment ?? [],
    },
    {
      name: "signedDurableProductionCapture",
      ok: waitlistPaidTrafficReady(health),
      waitlist: health.waitlist ?? {},
    },
  ];
  const remainingGates = gates
    .filter((gate) => !gate.ok)
    .map((gate) => gate.name);

  return {
    generatedAt,
    gitCommit,
    ok:
      prototypeReadiness.ok &&
      leadCaptureDryRun.ok === true &&
      commitMatches,
    paidTrafficReady,
    production: {
      health,
      targetUrl: normalizedTargetUrl,
    },
    readiness: {
      prototype: {
        checks: prototypeReadiness.checks.length,
        failures: prototypeReadiness.failures,
        ok: prototypeReadiness.ok,
        warnings: prototypeReadiness.warnings,
      },
      strict: {
        checks: strictReadiness.checks.length,
        failures: strictReadiness.failures,
        ok: strictReadiness.ok,
        warnings: strictReadiness.warnings,
      },
    },
    remainingGates,
    gates,
    analyticsAudit,
    vercelEnv: vercelEnvAudit,
    leadCaptureDryRun: summarizeLeadCaptureDryRun(leadCaptureDryRun),
  };
}

export async function buildLaunchEvidence({
  expectedSiteUrl = "",
  targetUrl,
  timeoutMs = defaultTimeoutMs,
} = {}) {
  const [
    analyticsAudit,
    gitCommit,
    publicEvidence,
    vercelEnvAudit,
    leadCaptureDryRun,
  ] =
    await Promise.all([
      auditAnalyticsInstrumentation(),
      getGitCommit(),
      collectPaidTrafficEvidence({ targetUrl, timeoutMs }),
      getVercelEnvAudit(),
      runLeadCaptureDryRun(),
    ]);

  return summarizeLaunchReadiness({
    analyticsAudit,
    expectedSiteUrl,
    gitCommit,
    leadCaptureDryRun,
    publicEvidence,
    targetUrl,
    vercelEnvAudit,
  });
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = await buildLaunchEvidence({
    expectedSiteUrl: parsed.expectedSiteUrl,
    targetUrl: parsed.targetUrl,
    timeoutMs: parsed.timeoutMs,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok || (parsed.strict && !result.paidTrafficReady)) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Launch evidence collection failed.",
    );
    process.exit(1);
  });
}
