import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { evaluateReceiverEvidence } from "./market-go-no-go.mjs";
import { normalizeSiteUrl } from "./paid-traffic-readiness.mjs";

const defaultSiteUrl = "https://payshield-lime.vercel.app";
const defaultSecretEnvName = "PAYSHIELD_WAITLIST_WEBHOOK_SECRET";
const allowedEnvironments = new Set(["production"]);

function usage() {
  return [
    "Usage: PAYSHIELD_WAITLIST_WEBHOOK_SECRET=... npm run vercel:webhook:cutover -- --receiver-evidence-file launch-evidence/receiver-evidence.json [--site-url https://payshield-lime.vercel.app] [--environment production] [--secret-env PAYSHIELD_WAITLIST_WEBHOOK_SECRET]",
    "",
    "Validates receiver evidence and prints a redacted Vercel Production webhook cutover plan.",
    "The command never prints the webhook signing secret.",
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
        "--help",
        "--receiver-evidence-file",
        "--secret-env",
        "--site-url",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--environment=") &&
      !arg.startsWith("--receiver-evidence-file=") &&
      !arg.startsWith("--secret-env=") &&
      !arg.startsWith("--site-url="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  const receiverEvidenceFile = flagValue(args, "--receiver-evidence-file");

  if (!receiverEvidenceFile) {
    throw new Error("--receiver-evidence-file is required.");
  }

  return {
    environment: flagValue(args, "--environment") || "production",
    help: false,
    receiverEvidenceFile,
    secretEnvName: flagValue(args, "--secret-env") || defaultSecretEnvName,
    siteUrl: flagValue(args, "--site-url") || defaultSiteUrl,
  };
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function shellEnvReference(name) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new Error("--secret-env must be an uppercase environment variable name.");
  }

  return `"$${name}"`;
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

function commandList({ environment, receiverWebhookUrl, secretEnvName, siteUrl }) {
  const secretRef = shellEnvReference(secretEnvName);
  const quotedSiteUrl = shellSingleQuote(siteUrl);

  return [
    {
      name: "setWebhookUrl",
      command: `printf '%s' ${shellSingleQuote(receiverWebhookUrl)} | npx vercel env add PAYSHIELD_WAITLIST_WEBHOOK_URL ${environment}`,
    },
    {
      name: "setWebhookSecret",
      command: `printf '%s' ${secretRef} | npx vercel env add PAYSHIELD_WAITLIST_WEBHOOK_SECRET ${environment} --sensitive`,
    },
    {
      name: "requireWebhook",
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
      name: "requiredWebhookSmoke",
      command: `npm run smoke:deploy -- ${quotedSiteUrl} --expect-site-url ${quotedSiteUrl} --submit-test --require-webhook`,
    },
  ];
}

/**
 * @param {{
 *   environment?: string;
 *   generatedAt?: string;
 *   receiverEvidence?: unknown;
 *   secretEnvName?: string;
 *   secretValue?: string;
 *   siteUrl?: string;
 * }} [options]
 */
export function buildVercelWebhookCutoverPlan({
  environment = "production",
  generatedAt = new Date().toISOString(),
  receiverEvidence,
  secretEnvName = defaultSecretEnvName,
  secretValue = process.env[secretEnvName],
  siteUrl = defaultSiteUrl,
} = {}) {
  if (!allowedEnvironments.has(environment)) {
    throw new Error("--environment must be production for paid-traffic cutover.");
  }

  shellEnvReference(secretEnvName);

  const normalizedSiteUrl = normalizeSiteUrl(publicSafeUrl(siteUrl, "--site-url"));
  const receiver = evaluateReceiverEvidence(receiverEvidence);
  const receiverWebhookUrl = receiver.summary?.urls?.webhookUrl ?? "";
  const checks = [];

  addCheck(checks, "receiverEvidenceReady", receiver.ok === true);
  addCheck(
    checks,
    "receiverWebhookUrlReady",
    typeof receiverWebhookUrl === "string" && receiverWebhookUrl.length > 0,
    receiverWebhookUrl,
  );
  addCheck(
    checks,
    "secretEnvPresent",
    typeof secretValue === "string" && secretValue.length > 0,
    { env: secretEnvName },
  );

  const commands = commandList({
    environment,
    receiverWebhookUrl,
    secretEnvName,
    siteUrl: normalizedSiteUrl,
  });
  const serialized = JSON.stringify({
    commands,
    environment,
    receiverWebhookUrl,
    secretEnvName,
    siteUrl: normalizedSiteUrl,
  });
  const secretPrinted =
    typeof secretValue === "string" &&
    secretValue.length > 0 &&
    serialized.includes(secretValue);

  addCheck(checks, "secretNotPrinted", secretPrinted === false);

  const remainingGates = checks
    .filter((check) => check.ok !== true)
    .map((check) => check.name);

  return {
    commands,
    environment,
    generatedAt,
    ok: remainingGates.length === 0,
    readyForVercelCutover: remainingGates.length === 0,
    receiver,
    receiverWebhookUrl,
    remainingGates,
    secretEnvName,
    siteUrl: normalizedSiteUrl,
    vercelEnv: {
      required: [
        "PAYSHIELD_WAITLIST_WEBHOOK_URL",
        "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
        "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
      ],
    },
    checks,
  };
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read receiver evidence JSON at ${path}: ${
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

  const receiverEvidence = await readJsonFile(parsed.receiverEvidenceFile);
  const result = buildVercelWebhookCutoverPlan({
    environment: parsed.environment,
    receiverEvidence,
    secretEnvName: parsed.secretEnvName,
    siteUrl: parsed.siteUrl,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Vercel webhook cutover plan failed.",
    );
    process.exit(1);
  });
}
