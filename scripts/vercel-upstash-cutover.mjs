import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { normalizeSiteUrl } from "./paid-traffic-readiness.mjs";

const defaultSiteUrl = "https://payshield-lime.vercel.app";
const defaultRestUrlEnvName = "UPSTASH_REDIS_REST_URL";
const defaultTokenEnvName = "UPSTASH_REDIS_REST_TOKEN";
const defaultReceiverEvidenceFile = "launch-evidence/receiver-evidence.json";
const allowedEnvironments = new Set(["production"]);

function usage() {
  return [
    "Usage: UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npm run vercel:upstash:cutover -- [--site-url https://payshield-lime.vercel.app] [--environment production] [--rest-url-env UPSTASH_REDIS_REST_URL] [--token-env UPSTASH_REDIS_REST_TOKEN] [--receiver-evidence-file launch-evidence/receiver-evidence.json] [--apply-env]",
    "",
    "Validates local Upstash env references and prints a redacted Vercel Production Upstash cutover plan.",
    "--apply-env adds the Vercel Production env vars from local env values, still without printing the Upstash REST URL or token.",
    "The command never prints the Upstash REST URL or token values.",
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

  const unknown = args.find(
    (arg) =>
      arg.startsWith("--") &&
      ![
        "--environment",
        "--apply-env",
        "--help",
        "--receiver-evidence-file",
        "--rest-url-env",
        "--site-url",
        "--token-env",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--environment=") &&
      !arg.startsWith("--receiver-evidence-file=") &&
      !arg.startsWith("--rest-url-env=") &&
      !arg.startsWith("--site-url=") &&
      !arg.startsWith("--token-env="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  return {
    applyEnv: args.includes("--apply-env"),
    environment: flagValue(args, "--environment") || "production",
    help: false,
    receiverEvidenceFile:
      flagValue(args, "--receiver-evidence-file") || defaultReceiverEvidenceFile,
    restUrlEnvName: flagValue(args, "--rest-url-env") || defaultRestUrlEnvName,
    siteUrl: flagValue(args, "--site-url") || defaultSiteUrl,
    tokenEnvName: flagValue(args, "--token-env") || defaultTokenEnvName,
  };
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function shellEnvReference(name) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error("Environment variable names must be uppercase.");
  }

  return `"$${name}"`;
}

function redactedCommand(command, args) {
  return [command, ...args].join(" ");
}

function redactSensitiveText(text, secrets) {
  return secrets.reduce((redacted, secret) => {
    if (typeof secret !== "string" || secret.length === 0) {
      return redacted;
    }

    return redacted.split(secret).join("[redacted]");
  }, String(text || ""));
}

function publicSafeUrl(value, label) {
  const url = new URL(value);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      `${label} must not include credentials, query strings, or fragments.`,
    );
  }

  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";

  return url.toString();
}

function validateUpstashRestUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
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

function commandList({
  environment,
  receiverEvidenceFile,
  restUrlEnvName,
  siteUrl,
  tokenEnvName,
}) {
  const restUrlRef = shellEnvReference(restUrlEnvName);
  const tokenRef = shellEnvReference(tokenEnvName);
  const quotedSiteUrl = shellSingleQuote(siteUrl);
  const quotedReceiverEvidenceFile = shellSingleQuote(receiverEvidenceFile);

  return [
    {
      name: "setWaitlistStorage",
      command: `printf '%s' 'upstash' | npx vercel env add PAYSHIELD_WAITLIST_STORAGE ${environment}`,
    },
    {
      name: "setUpstashRestUrl",
      command: `printf '%s' ${restUrlRef} | npx vercel env add UPSTASH_REDIS_REST_URL ${environment} --sensitive`,
    },
    {
      name: "setUpstashRestToken",
      command: `printf '%s' ${tokenRef} | npx vercel env add UPSTASH_REDIS_REST_TOKEN ${environment} --sensitive`,
    },
    {
      name: "requireDurableCapture",
      command: `printf '%s' 'true' | npx vercel env add PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK ${environment}`,
    },
    {
      name: "redeployProduction",
      command: "npx vercel --prod",
    },
    {
      name: "auditVercelEnv",
      command: "npm run vercel:env:audit",
    },
    {
      name: "strictLaunchEvidence",
      command: `npm run launch:evidence -- ${quotedSiteUrl} --expect-site-url ${quotedSiteUrl} --strict`,
    },
    {
      name: "requiredCaptureSmoke",
      command: `npm run smoke:deploy -- ${quotedSiteUrl} --expect-site-url ${quotedSiteUrl} --submit-test --require-webhook`,
    },
    {
      name: "validateUpstashEvidence",
      command: `npm run receiver:upstash:check -- --file ${quotedReceiverEvidenceFile}`,
    },
  ];
}

function vercelEnvAddSteps({ environment, restUrlValue, tokenValue }) {
  return [
    {
      input: "upstash",
      name: "setWaitlistStorage",
      sensitive: false,
      variable: "PAYSHIELD_WAITLIST_STORAGE",
    },
    {
      input: restUrlValue,
      name: "setUpstashRestUrl",
      sensitive: true,
      variable: "UPSTASH_REDIS_REST_URL",
    },
    {
      input: tokenValue,
      name: "setUpstashRestToken",
      sensitive: true,
      variable: "UPSTASH_REDIS_REST_TOKEN",
    },
    {
      input: "true",
      name: "requireDurableCapture",
      sensitive: false,
      variable: "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
    },
  ].map((step) => ({
    ...step,
    args: [
      "vercel",
      "env",
      "add",
      step.variable,
      environment,
      ...(step.sensitive ? ["--sensitive"] : []),
    ],
    command: "npx",
  }));
}

async function runCommandWithInput({ args, command, input }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code,
        stderr,
        stdout,
      });
    });
    child.stdin.end(input);
  });
}

/**
 * @param {{
 *   environment?: string;
 *   generatedAt?: string;
 *   receiverEvidenceFile?: string;
 *   restUrlEnvName?: string;
 *   restUrlValue?: string;
 *   siteUrl?: string;
 *   tokenEnvName?: string;
 *   tokenValue?: string;
 * }} [options]
 */
export function buildVercelUpstashCutoverPlan({
  environment = "production",
  generatedAt = new Date().toISOString(),
  receiverEvidenceFile = defaultReceiverEvidenceFile,
  restUrlEnvName = defaultRestUrlEnvName,
  restUrlValue = process.env[restUrlEnvName],
  siteUrl = defaultSiteUrl,
  tokenEnvName = defaultTokenEnvName,
  tokenValue = process.env[tokenEnvName],
} = {}) {
  if (!allowedEnvironments.has(environment)) {
    throw new Error("--environment must be production for paid-traffic cutover.");
  }

  shellEnvReference(restUrlEnvName);
  shellEnvReference(tokenEnvName);

  const normalizedSiteUrl = normalizeSiteUrl(publicSafeUrl(siteUrl, "--site-url"));
  const checks = [];
  const restUrlPresent =
    typeof restUrlValue === "string" && restUrlValue.trim().length > 0;
  const tokenPresent =
    typeof tokenValue === "string" && tokenValue.trim().length > 0;

  addCheck(checks, "upstashRestUrlEnvPresent", restUrlPresent, {
    env: restUrlEnvName,
  });
  addCheck(checks, "upstashRestTokenEnvPresent", tokenPresent, {
    env: tokenEnvName,
  });
  addCheck(
    checks,
    "upstashRestUrlHttpsAndRedacted",
    restUrlPresent && validateUpstashRestUrl(restUrlValue),
  );

  const commands = commandList({
    environment,
    receiverEvidenceFile,
    restUrlEnvName,
    siteUrl: normalizedSiteUrl,
    tokenEnvName,
  });
  const serialized = JSON.stringify({
    commands,
    environment,
    receiverEvidenceFile,
    restUrlEnvName,
    siteUrl: normalizedSiteUrl,
    tokenEnvName,
  });
  const secretPrinted =
    (restUrlPresent && serialized.includes(restUrlValue)) ||
    (tokenPresent && serialized.includes(tokenValue));

  addCheck(checks, "upstashSecretsNotPrinted", secretPrinted === false);

  const remainingGates = checks
    .filter((check) => check.ok !== true)
    .map((check) => check.name);

  return {
    checks,
    commands,
    environment,
    generatedAt,
    ok: remainingGates.length === 0,
    readyForVercelCutover: remainingGates.length === 0,
    receiverEvidenceFile,
    remainingGates,
    restUrlEnvName,
    siteUrl: normalizedSiteUrl,
    tokenEnvName,
    vercelEnv: {
      required: [
        "PAYSHIELD_WAITLIST_STORAGE",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
        "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
      ],
    },
  };
}

/**
 * @param {{
 *   environment?: string;
 *   receiverEvidenceFile?: string;
 *   restUrlEnvName?: string;
 *   restUrlValue?: string;
 *   runCommand?: (options: {args: string[]; command: string; input: string}) => Promise<{code?: number | null; stderr?: string; stdout?: string}>;
 *   siteUrl?: string;
 *   tokenEnvName?: string;
 *   tokenValue?: string;
 * }} [options]
 */
export async function applyVercelUpstashEnv({
  environment = "production",
  receiverEvidenceFile = defaultReceiverEvidenceFile,
  restUrlEnvName = defaultRestUrlEnvName,
  restUrlValue = process.env[restUrlEnvName],
  runCommand = runCommandWithInput,
  siteUrl = defaultSiteUrl,
  tokenEnvName = defaultTokenEnvName,
  tokenValue = process.env[tokenEnvName],
} = {}) {
  const plan = buildVercelUpstashCutoverPlan({
    environment,
    receiverEvidenceFile,
    restUrlEnvName,
    restUrlValue,
    siteUrl,
    tokenEnvName,
    tokenValue,
  });

  if (!plan.ok) {
    return {
      applied: false,
      checks: plan.checks,
      ok: false,
      remainingGates: plan.remainingGates,
      steps: [],
    };
  }

  const secrets = [restUrlValue, tokenValue];
  const steps = [];

  for (const step of vercelEnvAddSteps({
    environment,
    restUrlValue,
    tokenValue,
  })) {
    const result = await runCommand({
      args: step.args,
      command: step.command,
      input: String(step.input),
    });
    const ok = result.code === 0;
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const redactedOutput = redactSensitiveText(output, secrets).trim();
    const summary = {
      command: redactedCommand(step.command, step.args),
      name: step.name,
      ok,
      sensitive: step.sensitive,
      variable: step.variable,
    };

    if (!ok) {
      summary.error = redactedOutput.slice(0, 1200);
      steps.push(summary);
      return {
        applied: false,
        ok: false,
        remainingGates: ["vercelEnvAddFailed"],
        steps,
      };
    }

    steps.push(summary);
  }

  return {
    applied: true,
    nextCommands: plan.commands
      .filter((step) =>
        [
          "redeployProduction",
          "auditVercelEnv",
          "strictLaunchEvidence",
          "requiredCaptureSmoke",
          "validateUpstashEvidence",
        ].includes(step.name),
      )
      .map((step) => step.command),
    ok: true,
    remainingGates: [],
    steps,
  };
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = buildVercelUpstashCutoverPlan({
    environment: parsed.environment,
    receiverEvidenceFile: parsed.receiverEvidenceFile,
    restUrlEnvName: parsed.restUrlEnvName,
    siteUrl: parsed.siteUrl,
    tokenEnvName: parsed.tokenEnvName,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(1);
  }

  if (parsed.applyEnv) {
    const application = await applyVercelUpstashEnv({
      environment: parsed.environment,
      receiverEvidenceFile: parsed.receiverEvidenceFile,
      restUrlEnvName: parsed.restUrlEnvName,
      siteUrl: parsed.siteUrl,
      tokenEnvName: parsed.tokenEnvName,
    });

    console.log(JSON.stringify({ vercelEnvApplication: application }, null, 2));

    if (!application.ok) {
      process.exit(1);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Vercel Upstash cutover plan failed.",
    );
    process.exit(1);
  });
}
