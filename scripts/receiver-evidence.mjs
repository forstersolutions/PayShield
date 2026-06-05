import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  createWaitlistWebhookTestPayload,
  sendSignedWebhookTest,
} from "./test-waitlist-webhook.mjs";
import {
  auditWaitlistData,
  backupWaitlistData,
  eraseWaitlistEmail,
  summarizeWaitlistData,
  verifyWaitlistBackup,
} from "./waitlist-data-ops.mjs";

const defaultTimeoutMs = 8_000;

function usage() {
  return [
    "Usage: PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run receiver:evidence -- --url https://receiver.example/payshield-waitlist --data-dir /path/to/waitlist --backup-dir /secure/path [--health-url https://receiver.example/health] [--timeout-ms 8000]",
    "",
    "Runs the production receiver evidence sequence without printing lead PII or the signing secret:",
    "health check, signed webhook send, signed replay, non-PII summary, file audit, backup, backup verification, and deletion dry-run.",
    "Run this on a host that can reach the receiver URL and read the receiver data directory.",
  ].join("\n");
}

function flagValue(args, index) {
  const arg = args[index];
  const equalsIndex = arg.indexOf("=");

  if (equalsIndex !== -1) {
    return {
      nextIndex: index,
      value: arg.slice(equalsIndex + 1),
    };
  }

  return {
    nextIndex: index + 1,
    value: args[index + 1] ?? "",
  };
}

function parseCliArgs(args) {
  let backupDir = "";
  let dataDir = "";
  let healthUrl = "";
  let timeoutMs = defaultTimeoutMs;
  let url = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (arg === "--backup-dir" || arg.startsWith("--backup-dir=")) {
      const parsed = flagValue(args, index);
      backupDir = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--data-dir" || arg.startsWith("--data-dir=")) {
      const parsed = flagValue(args, index);
      dataDir = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--health-url" || arg.startsWith("--health-url=")) {
      const parsed = flagValue(args, index);
      healthUrl = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--timeout-ms" || arg.startsWith("--timeout-ms=")) {
      const parsed = flagValue(args, index);
      timeoutMs = Number(parsed.value);
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--url" || arg.startsWith("--url=")) {
      const parsed = flagValue(args, index);
      url = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!url) {
      url = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!url) {
    throw new Error("--url is required.");
  }

  if (!dataDir) {
    throw new Error("--data-dir is required.");
  }

  if (!backupDir) {
    throw new Error("--backup-dir is required.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new Error("--timeout-ms must be a number between 1 and 60000.");
  }

  return {
    backupDir,
    dataDir,
    healthUrl,
    help: false,
    timeoutMs,
    url,
  };
}

function parseHttpUrl(value, label) {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  const url = new URL(value);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }

  return url;
}

function defaultHealthUrl(webhookUrl) {
  const url = parseHttpUrl(webhookUrl, "--url");

  url.username = "";
  url.password = "";
  url.pathname = "/health";
  url.search = "";
  url.hash = "";

  return url.toString();
}

function publicUrl(value, label) {
  const url = parseHttpUrl(value, label);

  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";

  return url.toString();
}

function publicSafeBackup(backup) {
  return {
    audit: backup.audit,
    backupId: backup.backupId,
    copiedFiles: backup.copiedFiles,
    generatedAt: backup.generatedAt,
    ok: backup.ok,
  };
}

function publicSafeBackupVerification(verification) {
  return {
    backupId: verification.backupId,
    checkedFiles: verification.checkedFiles,
    findings: verification.findings,
    manifest: verification.manifest,
    ok: verification.ok,
  };
}

function publicSafeEraseDryRun(eraseDryRun) {
  return {
    dryRun: eraseDryRun.dryRun,
    emailHash: eraseDryRun.emailHash,
    remaining: eraseDryRun.remaining,
    removed: eraseDryRun.removed,
  };
}

function requireCheck(checks, condition, message) {
  if (!condition) {
    throw new Error(`Receiver evidence failed: ${message}`);
  }

  checks.push(message);
}

async function fetchReceiverHealth({ healthUrl, timeoutMs }) {
  const response = await fetch(healthUrl, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));

  return {
    body,
    ok: response.ok,
    status: response.status,
  };
}

/**
 * @param {{
 *   backupDir?: string;
 *   dataDir?: string;
 *   healthUrl?: string;
 *   secret?: string;
 *   timeoutMs?: number;
 *   url?: string;
 * }} [options]
 */
export async function runReceiverEvidence({
  backupDir,
  dataDir,
  healthUrl,
  secret = process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET,
  timeoutMs = defaultTimeoutMs,
  url,
} = {}) {
  if (!backupDir) {
    throw new Error("A backup directory is required.");
  }

  if (!dataDir) {
    throw new Error("A receiver data directory is required.");
  }

  if (!secret) {
    throw new Error("PAYSHIELD_WAITLIST_WEBHOOK_SECRET is required.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new Error("timeoutMs must be a number between 1 and 60000.");
  }

  const webhookUrl = publicUrl(url, "--url");
  const receiverHealthUrl = publicUrl(healthUrl || defaultHealthUrl(webhookUrl), "--health-url");
  const checks = [];
  const email = `receiver-evidence+${randomUUID()}@example.com`;
  const payload = createWaitlistWebhookTestPayload({ email });

  const health = await fetchReceiverHealth({
    healthUrl: receiverHealthUrl,
    timeoutMs,
  });

  requireCheck(
    checks,
    health.ok === true &&
      health.body?.ok === true &&
      health.body?.service === "payshield-waitlist-receiver",
    "receiver health check returns payshield-waitlist-receiver",
  );

  const webhookResult = await sendSignedWebhookTest({
    payload,
    replay: true,
    secret,
    timeoutMs,
    url: webhookUrl,
  });

  requireCheck(
    checks,
    webhookResult.status >= 200 &&
      webhookResult.status < 300 &&
      webhookResult.replay?.status >= 200 &&
      webhookResult.replay?.status < 300 &&
      webhookResult.replay?.body?.duplicate === true,
    "receiver accepts signed payload and idempotent replay",
  );

  const summary = await summarizeWaitlistData({ dataDir });

  requireCheck(
    checks,
    summary.ok === true &&
      summary.total >= 1 &&
      summary.byCampaign?.["receiver-smoke"] >= 1 &&
      summary.byCampaignSource?.["webhook-test"] >= 1,
    "receiver data summary reports the signed smoke lead without PII",
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
    "receiver data audit verifies file integrity and required metadata",
  );

  const backup = await backupWaitlistData({ backupDir, dataDir });
  const backupVerification = await verifyWaitlistBackup({
    backupPath: backup.backupPath,
  });

  requireCheck(
    checks,
    backup.ok === true &&
      backup.audit?.ok === true &&
      backup.copiedFiles.includes("waitlist.ndjson") &&
      backup.copiedFiles.includes("waitlist.csv"),
    "receiver backup creates a redacted manifest for receiver files",
  );
  requireCheck(
    checks,
    backupVerification.ok === true &&
      backupVerification.checkedFiles?.["waitlist.ndjson"]?.sha256Match === true &&
      backupVerification.checkedFiles?.["waitlist.csv"]?.sha256Match === true,
    "receiver backup verification confirms manifest hashes",
  );

  const eraseDryRun = await eraseWaitlistEmail({
    dataDir,
    dryRun: true,
    email,
  });

  requireCheck(
    checks,
    eraseDryRun.dryRun === true &&
      eraseDryRun.removed === 1 &&
      eraseDryRun.remaining >= 0,
    "receiver deletion dry-run identifies the signed smoke lead",
  );

  const result = {
    backup: publicSafeBackup(backup),
    backupVerification: publicSafeBackupVerification(backupVerification),
    checks,
    dataAudit,
    eraseDryRun: publicSafeEraseDryRun(eraseDryRun),
    generatedAt: new Date().toISOString(),
    health: {
      ok: health.ok,
      service: health.body?.service ?? "",
      status: health.status,
    },
    ok: true,
    summary,
    target: {
      healthUrl: receiverHealthUrl,
      webhookUrl,
    },
    webhook: {
      firstStatus: webhookResult.status,
      replayDuplicate: webhookResult.replay?.body?.duplicate === true,
      replayStatus: webhookResult.replay?.status ?? null,
    },
  };
  const serialized = JSON.stringify(result);

  requireCheck(
    checks,
    !serialized.includes(email) &&
      !serialized.includes("Signed webhook smoke test. Safe to delete.") &&
      !serialized.includes(secret),
    "receiver evidence output does not print smoke lead PII or signing secret",
  );

  return result;
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = await runReceiverEvidence({
    backupDir: parsed.backupDir,
    dataDir: parsed.dataDir,
    healthUrl: parsed.healthUrl,
    timeoutMs: parsed.timeoutMs,
    url: parsed.url,
  });

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Receiver evidence failed.");
    process.exit(1);
  });
}
