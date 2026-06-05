import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createWaitlistWebhookTestPayload,
  sendSignedWebhookTest,
} from "./test-waitlist-webhook.mjs";
import {
  auditWaitlistData,
  eraseWaitlistEmail,
  summarizeWaitlistData,
} from "./waitlist-data-ops.mjs";

const execFileAsync = promisify(execFile);
const defaultImage = "payshield-waitlist-receiver:ci-smoke";
const defaultTimeoutMs = 30_000;
const receiverPort = "8787/tcp";
const smokeEmail = "docker-smoke@example.com";

function usage() {
  return [
    "Usage: npm run receiver:docker:smoke [--image payshield-waitlist-receiver:ci-smoke] [--skip-build] [--keep-data] [--keep-image] [--timeout-ms 30000]",
    "",
    "Builds and runs Dockerfile.receiver, mounts a temporary persistent /data/waitlist volume,",
    "checks receiver health, sends a signed replay smoke payload, verifies non-PII data summary and audit,",
    "and dry-runs deletion handling without printing the signing secret.",
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
        "--help",
        "--image",
        "--keep-data",
        "--keep-image",
        "--skip-build",
        "--timeout-ms",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--image=") &&
      !arg.startsWith("--timeout-ms="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  const timeoutMs = Number(flagValue(args, "--timeout-ms") || defaultTimeoutMs);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be a number between 1 and 120000.");
  }

  return {
    help: false,
    image: flagValue(args, "--image") || defaultImage,
    keepData: args.includes("--keep-data"),
    keepImage: args.includes("--keep-image"),
    skipBuild: args.includes("--skip-build"),
    timeoutMs,
  };
}

async function docker(args, options = {}) {
  return execFileAsync("docker", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    ...options,
  });
}

export function parseDockerPortOutput(output) {
  const line = output
    .split("\n")
    .map((value) => value.trim())
    .find(Boolean);
  const match = line?.match(/^(.*):(\d+)$/);

  if (!match) {
    throw new Error(`Unable to parse Docker port output: ${output.trim()}`);
  }

  const host = ["", "0.0.0.0", "::", "[::]"].includes(match[1])
    ? "127.0.0.1"
    : match[1];

  return {
    host,
    port: Number(match[2]),
    url: `http://${host}:${match[2]}`,
  };
}

async function waitForReceiverHealth({ healthUrl, timeoutMs }) {
  const started = Date.now();
  let lastError = "";

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(1_500),
      });
      const body = await response.json();

      if (
        response.status === 200 &&
        body?.ok === true &&
        body?.service === "payshield-waitlist-receiver"
      ) {
        return body;
      }

      lastError = `Unexpected health response: ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Health check failed";
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Receiver health check did not pass: ${lastError}`);
}

function requireCheck(checks, condition, message) {
  if (!condition) {
    throw new Error(`Docker receiver smoke failed: ${message}`);
  }

  checks.push(message);
}

export function summarizeDockerReceiverSmoke({
  checks,
  dataAudit,
  eraseDryRun,
  health,
  image,
  summary,
  webhookResult,
}) {
  return {
    checks,
    dataAudit,
    eraseDryRun: {
      dryRun: eraseDryRun.dryRun,
      emailHash: eraseDryRun.emailHash,
      remaining: eraseDryRun.remaining,
      removed: eraseDryRun.removed,
    },
    health,
    image,
    ok: true,
    summary,
    webhook: {
      firstStatus: webhookResult.status,
      replayDuplicate: webhookResult.replay?.body?.duplicate === true,
      replayStatus: webhookResult.replay?.status ?? null,
    },
  };
}

export async function runDockerReceiverSmoke({
  image = defaultImage,
  keepData = false,
  keepImage = false,
  skipBuild = false,
  timeoutMs = defaultTimeoutMs,
} = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-docker-receiver-"));
  const containerName = `payshield-receiver-smoke-${process.pid}-${Date.now()}`;
  const secret = `docker-smoke-${randomBytes(24).toString("hex")}`;
  const checks = [];
  let containerStarted = false;

  await chmod(dataDir, 0o777);

  try {
    if (!skipBuild) {
      await docker(["build", "-f", "Dockerfile.receiver", "-t", image, "."]);
      requireCheck(checks, true, "Dockerfile.receiver builds successfully");
    }

    await docker([
      "run",
      "-d",
      "--name",
      containerName,
      "-p",
      "127.0.0.1::8787",
      "-e",
      `PAYSHIELD_WAITLIST_WEBHOOK_SECRET=${secret}`,
      "-v",
      `${dataDir}:/data/waitlist`,
      image,
    ]);
    containerStarted = true;
    requireCheck(
      checks,
      true,
      "receiver container starts with a mounted /data/waitlist volume",
    );

    const portOutput = await docker(["port", containerName, receiverPort]);
    const mapped = parseDockerPortOutput(portOutput.stdout);
    const health = await waitForReceiverHealth({
      healthUrl: `${mapped.url}/health`,
      timeoutMs,
    });

    requireCheck(
      checks,
      health?.service === "payshield-waitlist-receiver",
      "receiver container health check returns payshield-waitlist-receiver",
    );

    const webhookResult = await sendSignedWebhookTest({
      payload: createWaitlistWebhookTestPayload({
        email: smokeEmail,
        now: new Date("2026-06-05T00:00:00.000Z"),
      }),
      replay: true,
      secret,
      timeoutMs,
      url: `${mapped.url}/payshield-waitlist`,
    });

    requireCheck(
      checks,
      webhookResult.status === 202 &&
        webhookResult.replay?.status === 200 &&
        webhookResult.replay?.body?.duplicate === true,
      "container accepts signed payload and idempotent replay",
    );

    const summary = await summarizeWaitlistData({ dataDir });

    requireCheck(
      checks,
      summary.ok === true &&
        summary.total === 1 &&
        summary.bySegment?.Operations === 1 &&
        summary.byCampaign?.["receiver-smoke"] === 1 &&
        summary.byCampaignSource?.["webhook-test"] === 1,
      "mounted receiver data summarizes one non-PII smoke lead",
    );

    const dataAudit = await auditWaitlistData({ dataDir });

    requireCheck(
      checks,
      dataAudit.ok === true &&
        dataAudit.csv?.rowCountMatches === true &&
        dataAudit.duplicateSubmissionIds === 0 &&
        dataAudit.missingRequired?.submissionId === 0 &&
        dataAudit.missingRequired?.consentText === 0 &&
        dataAudit.missingRequired?.privacyVersion === 0 &&
        dataAudit.missingRequired?.termsVersion === 0,
      "mounted receiver data audit verifies file integrity and metadata",
    );

    const eraseDryRun = await eraseWaitlistEmail({
      dataDir,
      dryRun: true,
      email: smokeEmail,
    });

    requireCheck(
      checks,
      eraseDryRun.dryRun === true &&
        eraseDryRun.removed === 1 &&
        eraseDryRun.remaining === 0,
      "mounted receiver data supports email deletion dry-run",
    );

    return summarizeDockerReceiverSmoke({
      checks,
      dataAudit,
      eraseDryRun,
      health,
      image,
      summary,
      webhookResult,
    });
  } finally {
    if (containerStarted) {
      await docker(["rm", "-f", containerName]).catch(() => undefined);
    }

    if (!keepImage && !skipBuild) {
      await docker(["image", "rm", image]).catch(() => undefined);
    }

    if (!keepData) {
      await rm(dataDir, { force: true, recursive: true });
    }
  }
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = await runDockerReceiverSmoke(parsed);

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Docker receiver smoke failed.",
    );
    process.exit(1);
  });
}
