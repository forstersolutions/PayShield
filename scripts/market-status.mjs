import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { buildLaunchEvidence } from "./launch-evidence.mjs";
import { evaluateCommercialReadiness } from "./commercial-readiness.mjs";
import {
  scanEvidenceForSensitiveValues,
  summarizeMarketGoNoGo,
} from "./market-go-no-go.mjs";
import { normalizeSiteUrl } from "./paid-traffic-readiness.mjs";
import { runVercelCli } from "./vercel-cli.mjs";

const execFileAsync = promisify(execFile);
const defaultBranch = "main";
const defaultCiWorkflowName = "CI";
const defaultRepository = "forstersolutions/PayShield";
const defaultTimeoutMs = 10_000;

function usage() {
  return [
    "Usage: npm run market:status -- https://your-domain.com --expect-site-url https://your-domain.com [options]",
    "",
    "Builds a redacted production status snapshot from health, Vercel deployment, GitHub CI, launch evidence, and go/no-go state.",
    "",
    "Options:",
    "  --repo forstersolutions/PayShield   GitHub repository for CI lookup",
    "  --branch main                       GitHub branch for CI lookup",
    "  --ci-workflow-name CI               GitHub Actions workflow used as the required CI gate",
    "  --receiver-evidence-file path      Optional JSON output from npm run receiver:evidence",
    "  --counsel-signoff-file path        Optional JSON legal/compliance sign-off record",
    "  --analytics-evidence-file path     Optional JSON live analytics evidence record",
    "  --timeout-ms 10000                 Network and CLI timeout",
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
      ![
        "--analytics-evidence-file",
        "--branch",
        "--ci-workflow-name",
        "--counsel-signoff-file",
        "--expect-site-url",
        "--help",
        "--receiver-evidence-file",
        "--repo",
        "--timeout-ms",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--analytics-evidence-file=") &&
      !arg.startsWith("--branch=") &&
      !arg.startsWith("--ci-workflow-name=") &&
      !arg.startsWith("--counsel-signoff-file=") &&
      !arg.startsWith("--expect-site-url=") &&
      !arg.startsWith("--receiver-evidence-file=") &&
      !arg.startsWith("--repo=") &&
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
    analyticsEvidenceFile: flagValue(args, "--analytics-evidence-file"),
    branch: flagValue(args, "--branch") || defaultBranch,
    ciWorkflowName: flagValue(args, "--ci-workflow-name") || defaultCiWorkflowName,
    counselSignoffFile: flagValue(args, "--counsel-signoff-file"),
    expectedSiteUrl: flagValue(args, "--expect-site-url"),
    help: false,
    receiverEvidenceFile: flagValue(args, "--receiver-evidence-file"),
    repository: flagValue(args, "--repo") || defaultRepository,
    targetUrl,
    timeoutMs,
  };
}

function stripAnsi(text) {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function inspectField(text, name) {
  const match = stripAnsi(text).match(new RegExp(`^\\s*${name}\\s+(.+)$`, "m"));
  return match ? match[1].trim() : "";
}

export function parseVercelInspectOutput(text) {
  const cleanText = stripAnsi(text);
  const status = inspectField(cleanText, "status").replace(/^●\s*/, "");
  const aliases = cleanText
    .split("\n")
    .map((line) => line.match(/^\s*╶\s+(https?:\/\/\S+)/)?.[1] ?? "")
    .filter(Boolean);

  return {
    aliases,
    created: inspectField(cleanText, "created"),
    id: inspectField(cleanText, "id"),
    ok: status === "Ready",
    ready: status === "Ready",
    status,
    target: inspectField(cleanText, "target"),
    url: inspectField(cleanText, "url"),
  };
}

export function parseVercelInspectResult({ stderr = "", stdout = "" } = {}) {
  return parseVercelInspectOutput([stdout, stderr].filter(Boolean).join("\n"));
}

function commandError(error) {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim();
  }

  return "unknown command error";
}

async function getLocalGit({ timeoutMs }) {
  try {
    const [commit, branch, status] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        timeout: timeoutMs,
      }),
      execFileAsync("git", ["branch", "--show-current"], {
        encoding: "utf8",
        timeout: timeoutMs,
      }),
      execFileAsync("git", ["status", "--short"], {
        encoding: "utf8",
        timeout: timeoutMs,
      }),
    ]);
    const statusShort = status.stdout.trim();

    return {
      branch: branch.stdout.trim(),
      commit: commit.stdout.trim(),
      dirty: statusShort.length > 0,
      ok: true,
      statusShort,
    };
  } catch (error) {
    return {
      error: commandError(error),
      ok: false,
    };
  }
}

export function selectLatestCiRun(runs, { workflowName = defaultCiWorkflowName } = {}) {
  if (!Array.isArray(runs) || runs.length === 0) {
    return undefined;
  }

  return (
    runs.find((run) => run?.workflowName === workflowName) ??
    runs.find((run) => run?.workflowName === defaultCiWorkflowName) ??
    runs[0]
  );
}

async function getLatestCiRun({ branch, repository, timeoutMs, workflowName }) {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      [
        "run",
        "list",
        "--repo",
        repository,
        "--branch",
        branch,
        "--limit",
        "10",
        "--json",
        "databaseId,status,conclusion,workflowName,headSha,url,createdAt,displayTitle",
      ],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        timeout: timeoutMs,
      },
    );
    const runs = JSON.parse(stdout);
    const selectedRun = selectLatestCiRun(runs, { workflowName });

    if (!selectedRun) {
      return {
        error: "No GitHub Actions runs found.",
        ok: false,
      };
    }

    return {
      ...selectedRun,
      ok:
        selectedRun.status === "completed" &&
        selectedRun.conclusion === "success",
    };
  } catch (error) {
    return {
      error: commandError(error),
      ok: false,
    };
  }
}

async function getVercelDeployment({ targetUrl, timeoutMs }) {
  try {
    const { stderr, stdout } = await runVercelCli(["inspect", targetUrl], {
      timeout: timeoutMs,
    });

    return parseVercelInspectResult({ stderr, stdout });
  } catch (error) {
    return {
      error: commandError(error),
      ok: false,
      ready: false,
    };
  }
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function safeNormalizeSiteUrl(input) {
  if (typeof input !== "string" || input.trim().length === 0) {
    return "";
  }

  try {
    return normalizeSiteUrl(input);
  } catch {
    return "";
  }
}

function resolveVercelDeploymentFromHealth({
  health,
  normalizedTargetUrl,
  vercelDeployment,
}) {
  const deployment = isObject(vercelDeployment) ? vercelDeployment : {};
  const healthSiteUrl = safeNormalizeSiteUrl(health.siteUrl);
  const healthProvesTarget =
    health.ok === true &&
    healthSiteUrl === normalizedTargetUrl &&
    health.vercel?.environment === "production" &&
    typeof health.vercel?.gitCommitSha === "string" &&
    health.vercel.gitCommitSha.length > 0;

  if (!deployment.error || !healthProvesTarget) {
    return deployment;
  }

  const aliases = Array.isArray(deployment.aliases) ? deployment.aliases : [];

  return {
    ...deployment,
    aliases: unique([...aliases, normalizedTargetUrl]),
    inspectError: deployment.error,
    ok: true,
    ready: true,
    source: "health-fallback",
    status: "Ready (verified by /api/health)",
    url: deployment.url || normalizedTargetUrl,
  };
}

function addCheck(checks, name, ok, detail = undefined) {
  const check = {
    name,
    ok: ok === true,
  };

  if (detail !== undefined) {
    check.detail = detail;
  }

  checks.push(check);
}

function buildIssueSummaryLines({
  branch,
  checks,
  commercialReadiness,
  generatedAt,
  github,
  launchEvidence,
  localGit,
  marketDecision,
  repository,
  targetUrl,
  vercelDeployment,
}) {
  const health = launchEvidence?.production?.health ?? {};
  const productionCommit = health.vercel?.gitCommitSha ?? "";
  const failedChecks = checks
    .filter((check) => check.ok !== true)
    .map((check) => check.name);
  const ciRun = github.latestCiRun ?? {};
  const ciState = ciRun.ok
    ? "passed"
    : `is ${ciRun.status ?? "unknown"}${ciRun.conclusion ? `/${ciRun.conclusion}` : ""}`;
  const deploymentUrl = vercelDeployment.url || targetUrl;
  const deploymentState = vercelDeployment.ready ? "Ready" : "not Ready";

  return [
    `Current evidence snapshot generated at ${generatedAt}:`,
    `- Production URL: ${targetUrl}`,
    `- Production commit: \`${productionCommit || "unknown"}\``,
    `- Local git commit: \`${localGit.commit || "unknown"}\` on branch \`${localGit.branch || branch}\` with worktree ${localGit.dirty === false ? "clean" : "not clean"}.`,
    `- Vercel deployment: ${deploymentUrl} is ${deploymentState} and aliases to ${targetUrl}.`,
    `- CI run: ${ciRun.url || `repository ${repository} branch ${branch}`} ${ciState} on commit \`${ciRun.headSha || "unknown"}\`.`,
    `- Launch evidence: \`ok: ${launchEvidence?.ok === true}\`, \`paidTrafficReady: ${launchEvidence?.paidTrafficReady === true}\`, remaining gates ${JSON.stringify(launchEvidence?.remainingGates ?? [])}.`,
    `- Commercial readiness: \`ok: ${commercialReadiness?.ok === true}\`, remaining gates ${JSON.stringify(commercialReadiness?.remainingGates ?? [])}.`,
    `- Market go/no-go: \`marketReady: ${marketDecision?.marketReady === true}\`, remaining gates ${JSON.stringify(marketDecision?.remainingGates ?? [])}.`,
    `- Market status snapshot checks: ${failedChecks.length === 0 ? "all passed" : `failing ${JSON.stringify(failedChecks)}`}.`,
  ];
}

/**
 * @param {{
 *   branch?: string;
 *   generatedAt?: string;
 *   githubLatestCiRun?: Record<string, any>;
 *   launchEvidence?: Record<string, any>;
 *   localGit?: Record<string, any>;
 *   marketDecision?: Record<string, any>;
 *   repository?: string;
 *   targetUrl: string;
 *   vercelDeployment?: Record<string, any>;
 * }} options
 */
export function summarizeMarketStatus({
  branch = defaultBranch,
  generatedAt = new Date().toISOString(),
  githubLatestCiRun,
  launchEvidence,
  localGit = {},
  marketDecision,
  repository = defaultRepository,
  targetUrl,
  vercelDeployment = {},
} = {}) {
  const normalizedTargetUrl = normalizeSiteUrl(targetUrl);
  const health = launchEvidence?.production?.health ?? {};
  const productionCommit = health.vercel?.gitCommitSha ?? "";
  const localCommit = localGit.commit || launchEvidence?.gitCommit || "";
  const resolvedVercelDeployment = resolveVercelDeploymentFromHealth({
    health,
    normalizedTargetUrl,
    vercelDeployment,
  });
  const latestCiRun = isObject(githubLatestCiRun) ? githubLatestCiRun : {};
  const ciPassesOnProductionCommit =
    latestCiRun.ok === true &&
    Boolean(productionCommit) &&
    latestCiRun.headSha === productionCommit;
  const productionCommitMatchesLocalGit =
    Boolean(productionCommit && localCommit) && productionCommit === localCommit;
  const deploymentAliases = Array.isArray(resolvedVercelDeployment.aliases)
    ? resolvedVercelDeployment.aliases
    : [];
  const deploymentAliasesTarget =
    resolvedVercelDeployment.url === normalizedTargetUrl ||
    deploymentAliases.includes(normalizedTargetUrl);
  const decision =
    marketDecision ??
    summarizeMarketGoNoGo({
      launchEvidence,
      targetUrl: normalizedTargetUrl,
    });
  const commercialReadiness = evaluateCommercialReadiness({
    expectedSiteUrl: normalizedTargetUrl,
    health,
  });
  const checks = [];

  addCheck(checks, "productionHealthOk", health.ok === true);
  addCheck(
    checks,
    "productionCommitMatchesLocalGit",
    productionCommitMatchesLocalGit,
    { localCommit, productionCommit },
  );
  addCheck(checks, "localGitWorktreeClean", localGit.dirty === false);
  addCheck(
    checks,
    "githubCiPassesOnProductionCommit",
    ciPassesOnProductionCommit,
    {
      conclusion: latestCiRun.conclusion ?? "",
      headSha: latestCiRun.headSha ?? "",
      status: latestCiRun.status ?? "",
      url: latestCiRun.url ?? "",
    },
  );
  addCheck(
    checks,
    "vercelDeploymentReady",
    resolvedVercelDeployment.ready === true ||
      resolvedVercelDeployment.ok === true,
    {
      inspectError: resolvedVercelDeployment.inspectError ?? "",
      source: resolvedVercelDeployment.source ?? "vercel-inspect",
      status: resolvedVercelDeployment.status ?? "",
      url: resolvedVercelDeployment.url ?? "",
    },
  );
  addCheck(checks, "vercelDeploymentAliasesTargetUrl", deploymentAliasesTarget, {
    aliases: deploymentAliases,
    source: resolvedVercelDeployment.source ?? "vercel-inspect",
    targetUrl: normalizedTargetUrl,
    url: resolvedVercelDeployment.url ?? "",
  });
  addCheck(checks, "publicLaunchEvidenceOk", launchEvidence?.ok === true);

  const failedStatusChecks = checks
    .filter((check) => check.ok !== true)
    .map((check) => check.name);
  const remainingGates = unique([
    ...(Array.isArray(decision.remainingGates) ? decision.remainingGates : []),
    ...(Array.isArray(commercialReadiness.remainingGates)
      ? commercialReadiness.remainingGates
      : []),
    ...(Array.isArray(launchEvidence?.remainingGates)
      ? launchEvidence.remainingGates
      : []),
    ...failedStatusChecks,
  ]);
  const github = {
    branch,
    latestCiRun,
    repository,
  };
  const issueSummaryLines = buildIssueSummaryLines({
    branch,
    checks,
    commercialReadiness,
    generatedAt,
    github,
    launchEvidence,
    localGit,
    marketDecision: decision,
    repository,
    targetUrl: normalizedTargetUrl,
    vercelDeployment: resolvedVercelDeployment,
  });
  const result = {
    checks,
    commercialReady: commercialReadiness.ok === true,
    commercialReadiness,
    generatedAt,
    github,
    issueSummaryMarkdown: issueSummaryLines.join("\n"),
    launchEvidence: {
      ok: launchEvidence?.ok === true,
      paidTrafficReady: launchEvidence?.paidTrafficReady === true,
      readiness: launchEvidence?.readiness ?? {},
      remainingGates: launchEvidence?.remainingGates ?? [],
      vercelEnv: {
        configured: launchEvidence?.vercelEnv?.configured ?? [],
        missing: launchEvidence?.vercelEnv?.missing ?? [],
        ok: launchEvidence?.vercelEnv?.ok === true,
        wrongEnvironment: launchEvidence?.vercelEnv?.wrongEnvironment ?? [],
      },
    },
    localGit,
    marketReady:
      decision.marketReady === true && commercialReadiness.ok === true,
    ok: checks.every((check) => check.ok === true),
    paidTrafficReady: launchEvidence?.paidTrafficReady === true,
    production: {
      commitMatchesLocalGit: productionCommitMatchesLocalGit,
      gitCommitSha: productionCommit,
      health,
      localCommit,
      targetUrl: normalizedTargetUrl,
    },
    remainingGates,
    targetUrl: normalizedTargetUrl,
    vercel: {
      deployment: resolvedVercelDeployment,
    },
    goNoGo: {
      gates: decision.gates ?? [],
      marketReady:
        decision.marketReady === true && commercialReadiness.ok === true,
      paidTrafficReady: decision.paidTrafficReady === true,
      remainingGates: decision.remainingGates ?? [],
    },
  };
  const findings = scanEvidenceForSensitiveValues(result);

  return {
    ...result,
    findings,
    ok: result.ok && findings.length === 0,
  };
}

async function readJsonFile(path, label) {
  if (!path) {
    return undefined;
  }

  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read ${label} JSON at ${path}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const [launchEvidence, localGit, githubLatestCiRun, vercelDeployment] =
    await Promise.all([
      buildLaunchEvidence({
        expectedSiteUrl: parsed.expectedSiteUrl,
        targetUrl: parsed.targetUrl,
        timeoutMs: parsed.timeoutMs,
      }),
      getLocalGit({ timeoutMs: parsed.timeoutMs }),
      getLatestCiRun({
        branch: parsed.branch,
        repository: parsed.repository,
        timeoutMs: parsed.timeoutMs,
        workflowName: parsed.ciWorkflowName,
      }),
      getVercelDeployment({
        targetUrl: parsed.targetUrl,
        timeoutMs: parsed.timeoutMs,
      }),
    ]);
  const [receiverEvidence, counselSignoff, analyticsEvidence] = await Promise.all([
    readJsonFile(parsed.receiverEvidenceFile, "receiver evidence"),
    readJsonFile(parsed.counselSignoffFile, "counsel sign-off"),
    readJsonFile(parsed.analyticsEvidenceFile, "analytics evidence"),
  ]);
  const marketDecision = summarizeMarketGoNoGo({
    analyticsEvidence,
    counselSignoff,
    launchEvidence,
    receiverEvidence,
    targetUrl: parsed.targetUrl,
  });
  const result = summarizeMarketStatus({
    branch: parsed.branch,
    ciWorkflowName: parsed.ciWorkflowName,
    githubLatestCiRun,
    launchEvidence,
    localGit,
    marketDecision,
    repository: parsed.repository,
    targetUrl: parsed.targetUrl,
    vercelDeployment,
  });

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Market status snapshot failed.",
    );
    process.exit(1);
  });
}
