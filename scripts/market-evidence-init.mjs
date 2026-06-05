import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeSiteUrl } from "./paid-traffic-readiness.mjs";

const defaultDir = "launch-evidence";
const defaultSiteUrl = "https://payshield-lime.vercel.app";
const placeholderReceiverUrl = "https://your-webhook-url";
const placeholderDataDir = "/path/to/waitlist";
const placeholderBackupDir = "/secure/path";

function usage() {
  return [
    "Usage: npm run market:evidence:init -- [--dir launch-evidence] [--site-url https://payshield-lime.vercel.app] [--receiver-url https://receiver.example/payshield-waitlist] [--data-dir /path/to/waitlist] [--backup-dir /secure/path] [--force]",
    "",
    "Creates local ignored JSON templates and redacted commands for the final market go/no-go packet.",
    "The generated files are operator working files; do not commit them.",
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
        "--backup-dir",
        "--data-dir",
        "--dir",
        "--force",
        "--help",
        "--receiver-url",
        "--site-url",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--backup-dir=") &&
      !arg.startsWith("--data-dir=") &&
      !arg.startsWith("--dir=") &&
      !arg.startsWith("--receiver-url=") &&
      !arg.startsWith("--site-url="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  return {
    backupDir: flagValue(args, "--backup-dir") || placeholderBackupDir,
    dataDir: flagValue(args, "--data-dir") || placeholderDataDir,
    dir: flagValue(args, "--dir") || defaultDir,
    force: args.includes("--force"),
    help: false,
    receiverUrl: flagValue(args, "--receiver-url") || placeholderReceiverUrl,
    siteUrl: flagValue(args, "--site-url") || defaultSiteUrl,
  };
}

function validatePlainPath(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  if (/[\r\n]/.test(value)) {
    throw new Error(`${label} must be a single-line path.`);
  }

  return value.trim();
}

function isLocalhost(url) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
}

function safeHttpUrl(value, label, { allowLocalHttp = false } = {}) {
  const url = new URL(value);
  const localHttp = allowLocalHttp && url.protocol === "http:" && isLocalhost(url);

  if (url.protocol !== "https:" && !localHttp) {
    throw new Error(
      `${label} must use https. Localhost http is allowed only for local receiver proof.`,
    );
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

function commandValue(value) {
  return value.replace(/'/g, "'\\''");
}

function shellQuote(value) {
  return `'${commandValue(value)}'`;
}

function counselTemplate(generatedAt) {
  return {
    campaignCopyLintOk: false,
    generatedAt,
    ok: false,
    reviewedAt: "",
    reviewer: "",
    scope: ["privacy", "terms", "publicClaims", "campaignCopy"],
  };
}

function analyticsTemplate({ generatedAt, siteUrl }) {
  return {
    generatedAt,
    observedCampaignProperties: [
      "campaignMedium",
      "campaignName",
      "campaignSource",
      "hasCampaignAttribution",
    ],
    observedEventNames: [
      "Pilot Request Attempted",
      "Pilot Request Submitted",
    ],
    observedAt: "",
    ok: false,
    productionUrl: siteUrl,
    sanitizedCampaignMetadata: false,
    source: "Vercel Web Analytics and Speed Insights dashboard",
    speedInsightsProductionData: false,
    webAnalyticsPilotConversions: false,
  };
}

function managedReceiverTemplate({ generatedAt, receiverUrl }) {
  return {
    deletionProcessDocumented: false,
    durableStorage: false,
    exportProcessDocumented: false,
    generatedAt,
    ok: false,
    receiverName: "",
    receiverType: "managed",
    replayIdempotent: false,
    reviewedAt: "",
    reviewer: "",
    signatureVerified: false,
    storageOwner: "",
    storesAttribution: false,
    storesConsentFields: false,
    storesSubmissionId: false,
    target: {
      webhookUrl: receiverUrl,
    },
    webhookTest: {
      firstStatus: null,
      replayStatus: null,
      signedPayloadAccepted: false,
    },
  };
}

function upstashReceiverTemplate({ generatedAt, siteUrl }) {
  return {
    deletionProcessDocumented: false,
    durableStorage: false,
    exportProcessDocumented: false,
    generatedAt,
    health: {
      mode: "upstash",
      paidTrafficReady: false,
      storageConfigured: false,
    },
    ok: false,
    productionSubmit: {
      mode: "",
      status: null,
    },
    receiverType: "upstash",
    reviewedAt: "",
    reviewer: "",
    storageOwner: "",
    storesAttribution: false,
    storesConsentFields: false,
    storesEmailHashIndex: false,
    storesSubmissionId: false,
    target: {
      productionUrl: siteUrl,
    },
  };
}

function commandsMarkdown({
  analyticsFile,
  backupDir,
  counselFile,
  dataDir,
  envAuditCommand,
  managedReceiverTemplateFile,
  requiredCaptureSmokeCommand,
  receiverEvidenceFile,
  receiverUrl,
  siteUrl,
  upstashReceiverTemplateFile,
}) {
  const launchEvidenceCommand = [
    "npm run launch:evidence --",
    shellQuote(siteUrl),
    "--expect-site-url",
    shellQuote(siteUrl),
    "--strict",
  ].join(" ");
  const receiverEvidenceCommand = [
    "PAYSHIELD_WAITLIST_WEBHOOK_SECRET=...",
    "npm run receiver:evidence --",
    "--url",
    shellQuote(receiverUrl),
    "--data-dir",
    shellQuote(dataDir),
    "--backup-dir",
    shellQuote(backupDir),
    ">",
    shellQuote(receiverEvidenceFile),
  ].join(" ");
  const managedReceiverEvidenceCommand = [
    "npm run receiver:managed:check --",
    "--file",
    shellQuote(receiverEvidenceFile),
  ].join(" ");
  const upstashReceiverEvidenceCommand = [
    "npm run receiver:upstash:check --",
    "--file",
    shellQuote(receiverEvidenceFile),
  ].join(" ");
  const cutoverPlanCommand = [
    "PAYSHIELD_WAITLIST_WEBHOOK_SECRET=...",
    "npm run vercel:webhook:cutover --",
    "--site-url",
    shellQuote(siteUrl),
    "--receiver-evidence-file",
    shellQuote(receiverEvidenceFile),
  ].join(" ");
  const upstashCutoverPlanCommand = [
    "UPSTASH_REDIS_REST_URL=...",
    "UPSTASH_REDIS_REST_TOKEN=...",
    "npm run vercel:upstash:cutover --",
    "--site-url",
    shellQuote(siteUrl),
    "--receiver-evidence-file",
    shellQuote(receiverEvidenceFile),
  ].join(" ");
  const counselSignoffCommand = [
    "npm run counsel:signoff:check --",
    "--file",
    shellQuote(counselFile),
  ].join(" ");
  const analyticsEvidenceCommand = [
    "npm run analytics:evidence:check --",
    "--file",
    shellQuote(analyticsFile),
    "--site-url",
    shellQuote(siteUrl),
  ].join(" ");
  const goNoGoCommand = [
    "npm run market:go-no-go --",
    shellQuote(siteUrl),
    "--expect-site-url",
    shellQuote(siteUrl),
    "--receiver-evidence-file",
    shellQuote(receiverEvidenceFile),
    "--counsel-signoff-file",
    shellQuote(counselFile),
    "--analytics-evidence-file",
    shellQuote(analyticsFile),
  ].join(" ");
  const statusCommand = [
    "npm run market:status --",
    shellQuote(siteUrl),
    "--expect-site-url",
    shellQuote(siteUrl),
    "--receiver-evidence-file",
    shellQuote(receiverEvidenceFile),
    "--counsel-signoff-file",
    shellQuote(counselFile),
    "--analytics-evidence-file",
    shellQuote(analyticsFile),
  ].join(" ");

  return [
    "# PayShield Market Evidence Packet",
    "",
    "This directory is for local operator evidence and is ignored by git.",
    "Do not place lead emails, names, notes, webhook secrets, authorization headers, URL credentials, query tokens, or fragments in these files.",
    "",
    "1. Configure the hosted receiver or CRM endpoint, then prove signed durable capture.",
    "",
    "For the lightweight file receiver, run this from the operator host that can read the receiver data directory:",
    "",
    "```bash",
    receiverEvidenceCommand,
    "```",
    "",
    "For a managed CRM, Airtable, Slack, Make, Zapier, or internal webhook, copy the template to `receiver-evidence.json`, fill it after signed replay and storage review, then validate it:",
    "",
    "```bash",
    ["cp", shellQuote(managedReceiverTemplateFile), shellQuote(receiverEvidenceFile)].join(" "),
    managedReceiverEvidenceCommand,
    "```",
    "",
    "For Vercel Marketplace Upstash Redis capture, copy the Upstash template to `receiver-evidence.json`, fill it after `/api/health` and production submit proof, then validate it:",
    "",
    "```bash",
    ["cp", shellQuote(upstashReceiverTemplateFile), shellQuote(receiverEvidenceFile)].join(" "),
    upstashReceiverEvidenceCommand,
    "```",
    "",
    "2. Generate the redacted Vercel env cutover command sequence for the selected durable capture path.",
    "",
    "For signed webhook capture:",
    "",
    "```bash",
    cutoverPlanCommand,
    "```",
    "",
    "For Vercel Marketplace Upstash Redis capture:",
    "",
    "```bash",
    upstashCutoverPlanCommand,
    "```",
    "",
    "3. Configure Vercel Production durable capture env vars, then prove the live capture path.",
    "",
    "After redeploying production from the cutover plan, audit env configuration:",
    "",
    "```bash",
    envAuditCommand,
    "```",
    "",
    "Then run a required-capture production submit smoke:",
    "",
    "```bash",
    requiredCaptureSmokeCommand,
    "```",
    "",
    "Finally prove strict launch evidence:",
    "",
    "```bash",
    launchEvidenceCommand,
    "```",
    "",
    "4. Fill `counsel-signoff.json` only after counsel approves the current Privacy Notice, Terms, public claims, and campaign copy, then validate it:",
    "",
    "```bash",
    counselSignoffCommand,
    "```",
    "",
    "5. Fill `analytics-evidence.json` only after Vercel Web Analytics and Speed Insights show production data from a campaign-attributed pilot test, then validate it:",
    "",
    "```bash",
    analyticsEvidenceCommand,
    "```",
    "",
    "6. Run the final go/no-go gate without `--allow-not-ready`:",
    "",
    "```bash",
    goNoGoCommand,
    "```",
    "",
    "7. Refresh the readiness issue status snapshot after each launch commit or evidence update:",
    "",
    "```bash",
    statusCommand,
    "```",
    "",
    "Only attach redacted command outputs to the GitHub readiness issue.",
    "",
  ].join("\n");
}

function jsonWithNewline(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writePacketFile(path, content, force) {
  if (!force && existsSync(path)) {
    throw new Error(`${path} already exists. Use --force to overwrite it.`);
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function createMarketEvidencePacket({
  backupDir = placeholderBackupDir,
  dataDir = placeholderDataDir,
  dir = defaultDir,
  force = false,
  generatedAt = new Date().toISOString(),
  receiverUrl = placeholderReceiverUrl,
  siteUrl = defaultSiteUrl,
} = {}) {
  const evidenceDir = validatePlainPath(dir, "--dir");
  const normalizedSiteUrl = normalizeSiteUrl(safeHttpUrl(siteUrl, "--site-url"));
  const safeReceiverUrl = safeHttpUrl(receiverUrl, "--receiver-url", {
    allowLocalHttp: true,
  });
  const safeDataDir = validatePlainPath(dataDir, "--data-dir");
  const safeBackupDir = validatePlainPath(backupDir, "--backup-dir");
  const counselFile = join(evidenceDir, "counsel-signoff.json");
  const analyticsFile = join(evidenceDir, "analytics-evidence.json");
  const managedReceiverTemplateFile = join(
    evidenceDir,
    "managed-receiver-evidence-template.json",
  );
  const upstashReceiverTemplateFile = join(
    evidenceDir,
    "upstash-receiver-evidence-template.json",
  );
  const receiverEvidenceFile = join(evidenceDir, "receiver-evidence.json");
  const commandsFile = join(evidenceDir, "commands.md");
  const envAuditCommand = "npm run vercel:env:audit";
  const requiredCaptureSmokeCommand = [
    "npm run smoke:deploy --",
    shellQuote(normalizedSiteUrl),
    "--expect-site-url",
    shellQuote(normalizedSiteUrl),
    "--submit-test",
    "--require-webhook",
  ].join(" ");
  const files = [
    {
      content: jsonWithNewline(counselTemplate(generatedAt)),
      path: counselFile,
    },
    {
      content: jsonWithNewline(
        analyticsTemplate({
          generatedAt,
          siteUrl: normalizedSiteUrl,
        }),
      ),
      path: analyticsFile,
    },
    {
      content: jsonWithNewline(
        managedReceiverTemplate({
          generatedAt,
          receiverUrl: safeReceiverUrl,
        }),
      ),
      path: managedReceiverTemplateFile,
    },
    {
      content: jsonWithNewline(
        upstashReceiverTemplate({
          generatedAt,
          siteUrl: normalizedSiteUrl,
        }),
      ),
      path: upstashReceiverTemplateFile,
    },
    {
      content: commandsMarkdown({
        analyticsFile,
        backupDir: safeBackupDir,
        counselFile,
        dataDir: safeDataDir,
        envAuditCommand,
        managedReceiverTemplateFile,
        requiredCaptureSmokeCommand,
        receiverEvidenceFile,
        receiverUrl: safeReceiverUrl,
        siteUrl: normalizedSiteUrl,
        upstashReceiverTemplateFile,
      }),
      path: commandsFile,
    },
  ];

  for (const file of files) {
    await writePacketFile(file.path, file.content, force);
  }

  return {
    cutoverPlanCommand: [
      "PAYSHIELD_WAITLIST_WEBHOOK_SECRET=...",
      "npm run vercel:webhook:cutover --",
      "--site-url",
      shellQuote(normalizedSiteUrl),
      "--receiver-evidence-file",
      shellQuote(receiverEvidenceFile),
    ].join(" "),
    envAuditCommand,
    counselSignoffCommand: [
      "npm run counsel:signoff:check --",
      "--file",
      shellQuote(counselFile),
    ].join(" "),
    files: files.map((file) => file.path),
    generatedAt,
    goNoGoCommand: [
      "npm run market:go-no-go --",
      shellQuote(normalizedSiteUrl),
      "--expect-site-url",
      shellQuote(normalizedSiteUrl),
      "--receiver-evidence-file",
      shellQuote(receiverEvidenceFile),
      "--counsel-signoff-file",
      shellQuote(counselFile),
      "--analytics-evidence-file",
      shellQuote(analyticsFile),
    ].join(" "),
    managedReceiverEvidenceCommand: [
      "npm run receiver:managed:check --",
      "--file",
      shellQuote(receiverEvidenceFile),
    ].join(" "),
    managedReceiverTemplateFile,
    ok: true,
    receiverEvidenceFile,
    receiverEvidenceCommand: [
      "PAYSHIELD_WAITLIST_WEBHOOK_SECRET=...",
      "npm run receiver:evidence --",
      "--url",
      shellQuote(safeReceiverUrl),
      "--data-dir",
      shellQuote(safeDataDir),
      "--backup-dir",
      shellQuote(safeBackupDir),
      ">",
      shellQuote(receiverEvidenceFile),
    ].join(" "),
    requiredCaptureSmokeCommand,
    siteUrl: normalizedSiteUrl,
    statusCommand: [
      "npm run market:status --",
      shellQuote(normalizedSiteUrl),
      "--expect-site-url",
      shellQuote(normalizedSiteUrl),
      "--receiver-evidence-file",
      shellQuote(receiverEvidenceFile),
      "--counsel-signoff-file",
      shellQuote(counselFile),
      "--analytics-evidence-file",
      shellQuote(analyticsFile),
    ].join(" "),
    upstashReceiverEvidenceCommand: [
      "npm run receiver:upstash:check --",
      "--file",
      shellQuote(receiverEvidenceFile),
    ].join(" "),
    upstashCutoverPlanCommand: [
      "UPSTASH_REDIS_REST_URL=...",
      "UPSTASH_REDIS_REST_TOKEN=...",
      "npm run vercel:upstash:cutover --",
      "--site-url",
      shellQuote(normalizedSiteUrl),
      "--receiver-evidence-file",
      shellQuote(receiverEvidenceFile),
    ].join(" "),
    upstashReceiverTemplateFile,
  };
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = await createMarketEvidencePacket(parsed);

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Market evidence packet creation failed.",
    );
    process.exit(1);
  });
}
