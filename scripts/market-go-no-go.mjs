import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { evaluateLiveAnalyticsEvidence } from "./check-analytics-evidence.mjs";
import { buildLaunchEvidence } from "./launch-evidence.mjs";
import { normalizeSiteUrl } from "./paid-traffic-readiness.mjs";

const defaultTimeoutMs = 10_000;
const requiredCounselScopes = [
  "privacy",
  "terms",
  "publicclaims",
  "campaigncopy",
];

const sensitivePatterns = [
  {
    finding: "email-like value",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  },
  {
    finding: "raw webhook secret environment assignment",
    pattern: /PAYSHIELD_WAITLIST_WEBHOOK_SECRET\s*=/i,
  },
  {
    finding: "raw Stripe live key-like value",
    pattern: /\b(?:sk|pk)_live_[A-Za-z0-9]{8,}\b/,
  },
  {
    finding: "raw webhook secret-like value",
    pattern: /\bwhsec_[A-Za-z0-9]{8,}\b/,
  },
  {
    finding: "authorization header-like value",
    pattern: /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}/i,
  },
  {
    finding: "raw smoke lead note",
    pattern: /Signed webhook smoke test\. Safe to delete\./i,
  },
];

function usage() {
  return [
    "Usage: npm run market:go-no-go -- https://your-domain.com --expect-site-url https://your-domain.com [options]",
    "",
    "Builds a redacted market launch go/no-go decision from strict production evidence and external sign-off files.",
    "",
    "Options:",
    "  --receiver-evidence-file path      JSON output from npm run receiver:evidence",
    "  --counsel-signoff-file path        JSON legal/compliance sign-off record",
    "  --analytics-evidence-file path     JSON live analytics evidence record",
    "  --allow-not-ready                  Exit 0 while reporting missing gates",
    "  --timeout-ms 10000                 Network timeout for production checks",
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
        "--allow-not-ready",
        "--analytics-evidence-file",
        "--counsel-signoff-file",
        "--expect-site-url",
        "--help",
        "--receiver-evidence-file",
        "--timeout-ms",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--analytics-evidence-file=") &&
      !arg.startsWith("--counsel-signoff-file=") &&
      !arg.startsWith("--expect-site-url=") &&
      !arg.startsWith("--receiver-evidence-file=") &&
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
    allowNotReady: args.includes("--allow-not-ready"),
    analyticsEvidenceFile: flagValue(args, "--analytics-evidence-file"),
    counselSignoffFile: flagValue(args, "--counsel-signoff-file"),
    expectedSiteUrl: flagValue(args, "--expect-site-url"),
    help: false,
    receiverEvidenceFile: flagValue(args, "--receiver-evidence-file"),
    targetUrl,
    timeoutMs,
  };
}

function pathLabel(path) {
  if (path.length === 0) {
    return "$";
  }

  return `$${path.map((part) => `[${JSON.stringify(part)}]`).join("")}`;
}

export function scanEvidenceForSensitiveValues(value, path = []) {
  const findings = [];

  if (typeof value === "string") {
    for (const { finding, pattern } of sensitivePatterns) {
      if (pattern.test(value)) {
        findings.push({
          finding,
          path: pathLabel(path),
        });
      }
    }

    return findings;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findings.push(...scanEvidenceForSensitiveValues(item, [...path, index]));
    });

    return findings;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      findings.push(...scanEvidenceForSensitiveValues(item, [...path, key]));
    }
  }

  return findings;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

function allChecksPass(checks) {
  return checks.every((check) => check.ok === true);
}

function isValidIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function publicUrl(value, label, findings) {
  if (typeof value !== "string" || value.length === 0) {
    findings.push({
      finding: `${label} is missing`,
      path: "$",
    });
    return "";
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      findings.push({
        finding: `${label} must use https for production evidence`,
        path: "$",
      });
    }

    if (url.username || url.password || url.search || url.hash) {
      findings.push({
        finding: `${label} must not include credentials, query strings, or fragments`,
        path: "$",
      });
    }

    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    findings.push({
      finding: `${label} is not a valid URL`,
      path: "$",
    });
    return "";
  }
}

function missingEvidence(label, flagName) {
  return {
    checks: [
      {
        detail: `Provide ${flagName}.`,
        name: `${label}Provided`,
        ok: false,
      },
    ],
    findings: [],
    ok: false,
    summary: {
      provided: false,
    },
  };
}

export function evaluateReceiverEvidence(evidence) {
  if (!isObject(evidence)) {
    return missingEvidence("receiverEvidence", "--receiver-evidence-file");
  }

  if (evidence.receiverType === "managed") {
    return evaluateManagedReceiverEvidence(evidence);
  }

  if (evidence.receiverType === "blob") {
    return evaluateBlobReceiverEvidence(evidence);
  }

  if (evidence.receiverType === "upstash") {
    return evaluateUpstashReceiverEvidence(evidence);
  }

  const checks = [];
  const findings = scanEvidenceForSensitiveValues(evidence);
  const health = isObject(evidence.health) ? evidence.health : {};
  const webhook = isObject(evidence.webhook) ? evidence.webhook : {};
  const summary = isObject(evidence.summary) ? evidence.summary : {};
  const dataAudit = isObject(evidence.dataAudit) ? evidence.dataAudit : {};
  const backup = isObject(evidence.backup) ? evidence.backup : {};
  const backupVerification = isObject(evidence.backupVerification)
    ? evidence.backupVerification
    : {};
  const eraseDryRun = isObject(evidence.eraseDryRun)
    ? evidence.eraseDryRun
    : {};
  const target = isObject(evidence.target) ? evidence.target : {};
  const webhookUrl = publicUrl(target.webhookUrl, "receiver webhook URL", findings);
  const healthUrl = publicUrl(target.healthUrl, "receiver health URL", findings);

  addCheck(checks, "receiverEvidenceOk", evidence.ok === true);
  addCheck(
    checks,
    "receiverHealthService",
    health.ok === true &&
      health.status >= 200 &&
      health.status < 300 &&
      health.service === "payshield-waitlist-receiver",
    health.service,
  );
  addCheck(
    checks,
    "signedWebhookReplay",
    webhook.firstStatus >= 200 &&
      webhook.firstStatus < 300 &&
      webhook.replayStatus >= 200 &&
      webhook.replayStatus < 300 &&
      webhook.replayDuplicate === true,
  );
  addCheck(
    checks,
    "receiverSummary",
    summary.ok === true && Number(summary.total) >= 1,
    { total: summary.total },
  );
  addCheck(
    checks,
    "receiverDataAudit",
    dataAudit.ok === true &&
      dataAudit.csv?.rowCountMatches === true &&
      dataAudit.duplicateSubmissionIds === 0 &&
      dataAudit.missingRequired?.submissionId === 0 &&
      dataAudit.missingRequired?.consentText === 0 &&
      dataAudit.missingRequired?.privacyVersion === 0 &&
      dataAudit.missingRequired?.termsVersion === 0,
  );
  addCheck(
    checks,
    "receiverBackup",
    backup.ok === true &&
      backup.audit?.ok === true &&
      Array.isArray(backup.copiedFiles) &&
      backup.copiedFiles.includes("waitlist.ndjson") &&
      backup.copiedFiles.includes("waitlist.csv"),
  );
  addCheck(
    checks,
    "receiverBackupVerification",
    backupVerification.ok === true &&
      backupVerification.checkedFiles?.["waitlist.ndjson"]?.sha256Match === true &&
      backupVerification.checkedFiles?.["waitlist.csv"]?.sha256Match === true,
  );
  addCheck(
    checks,
    "receiverDeletionDryRun",
    eraseDryRun.dryRun === true && Number(eraseDryRun.removed) >= 1,
    { removed: eraseDryRun.removed },
  );
  addCheck(
    checks,
    "receiverEvidenceRedacted",
    findings.length === 0,
    findings.map((finding) => finding.finding),
  );

  return {
    checks,
    findings,
    ok: allChecksPass(checks),
    summary: {
      backupId: backup.backupId ?? "",
      generatedAt: evidence.generatedAt ?? "",
      healthService: health.service ?? "",
      healthStatus: health.status ?? null,
      provided: true,
      total: summary.total ?? null,
      urls: {
        healthUrl,
        webhookUrl,
      },
    },
  };
}

function isHttpSuccess(status) {
  return Number(status) >= 200 && Number(status) < 300;
}

export function evaluateManagedReceiverEvidence(evidence) {
  if (!isObject(evidence)) {
    return missingEvidence("receiverEvidence", "--receiver-evidence-file");
  }

  const checks = [];
  const findings = scanEvidenceForSensitiveValues(evidence);
  const target = isObject(evidence.target) ? evidence.target : {};
  const webhookTest = isObject(evidence.webhookTest) ? evidence.webhookTest : {};
  const webhookUrl = publicUrl(
    target.webhookUrl,
    "managed receiver webhook URL",
    findings,
  );

  addCheck(checks, "managedReceiverEvidenceOk", evidence.ok === true);
  addCheck(checks, "managedReceiverType", evidence.receiverType === "managed");
  addCheck(
    checks,
    "managedReceiverNameRecorded",
    typeof evidence.receiverName === "string" &&
      evidence.receiverName.trim().length > 0,
  );
  addCheck(
    checks,
    "managedReceiverStorageOwnerRecorded",
    typeof evidence.storageOwner === "string" &&
      evidence.storageOwner.trim().length > 0,
  );
  addCheck(checks, "managedReceiverReviewedAt", isValidIsoDate(evidence.reviewedAt));
  addCheck(
    checks,
    "managedReceiverReviewerRecorded",
    typeof evidence.reviewer === "string" && evidence.reviewer.trim().length > 0,
  );
  addCheck(
    checks,
    "managedSignedWebhookReplay",
    webhookTest.signedPayloadAccepted === true &&
      isHttpSuccess(webhookTest.firstStatus) &&
      isHttpSuccess(webhookTest.replayStatus),
    {
      firstStatus: webhookTest.firstStatus ?? null,
      replayStatus: webhookTest.replayStatus ?? null,
    },
  );
  addCheck(checks, "managedSignatureVerification", evidence.signatureVerified === true);
  addCheck(checks, "managedDurableStorage", evidence.durableStorage === true);
  addCheck(checks, "managedConsentFieldsStored", evidence.storesConsentFields === true);
  addCheck(checks, "managedSubmissionIdStored", evidence.storesSubmissionId === true);
  addCheck(checks, "managedReplayIdempotent", evidence.replayIdempotent === true);
  addCheck(checks, "managedAttributionStored", evidence.storesAttribution === true);
  addCheck(
    checks,
    "managedDeletionProcessDocumented",
    evidence.deletionProcessDocumented === true,
  );
  addCheck(
    checks,
    "managedExportProcessDocumented",
    evidence.exportProcessDocumented === true,
  );
  addCheck(
    checks,
    "managedReceiverEvidenceRedacted",
    findings.length === 0,
    findings.map((finding) => finding.finding),
  );

  return {
    checks,
    findings,
    ok: allChecksPass(checks),
    summary: {
      provided: true,
      receiverName: evidence.receiverName ?? "",
      receiverType: "managed",
      reviewedAt: evidence.reviewedAt ?? "",
      reviewer: evidence.reviewer ?? "",
      storageOwner: evidence.storageOwner ?? "",
      total: null,
      urls: {
        webhookUrl,
      },
    },
  };
}

export function evaluateUpstashReceiverEvidence(evidence) {
  if (!isObject(evidence)) {
    return missingEvidence("receiverEvidence", "--receiver-evidence-file");
  }

  const checks = [];
  const findings = scanEvidenceForSensitiveValues(evidence);
  const target = isObject(evidence.target) ? evidence.target : {};
  const health = isObject(evidence.health) ? evidence.health : {};
  const productionSubmit = isObject(evidence.productionSubmit)
    ? evidence.productionSubmit
    : {};
  const productionUrl = publicUrl(
    target.productionUrl,
    "Upstash production URL",
    findings,
  );

  addCheck(checks, "upstashReceiverEvidenceOk", evidence.ok === true);
  addCheck(checks, "upstashReceiverType", evidence.receiverType === "upstash");
  addCheck(
    checks,
    "upstashStorageOwnerRecorded",
    typeof evidence.storageOwner === "string" &&
      evidence.storageOwner.trim().length > 0,
  );
  addCheck(checks, "upstashReviewedAt", isValidIsoDate(evidence.reviewedAt));
  addCheck(
    checks,
    "upstashReviewerRecorded",
    typeof evidence.reviewer === "string" && evidence.reviewer.trim().length > 0,
  );
  addCheck(
    checks,
    "upstashHealthReady",
    health.mode === "upstash" &&
      health.storageConfigured === true &&
      health.paidTrafficReady === true,
  );
  addCheck(
    checks,
    "upstashProductionSubmit",
    isHttpSuccess(productionSubmit.status) &&
      productionSubmit.mode === "upstash",
    {
      mode: productionSubmit.mode ?? "",
      status: productionSubmit.status ?? null,
    },
  );
  addCheck(checks, "upstashDurableStorage", evidence.durableStorage === true);
  addCheck(
    checks,
    "upstashConsentFieldsStored",
    evidence.storesConsentFields === true,
  );
  addCheck(
    checks,
    "upstashSubmissionIdStored",
    evidence.storesSubmissionId === true,
  );
  addCheck(
    checks,
    "upstashAttributionStored",
    evidence.storesAttribution === true,
  );
  addCheck(
    checks,
    "upstashEmailHashIndexStored",
    evidence.storesEmailHashIndex === true,
  );
  addCheck(
    checks,
    "upstashDeletionProcessDocumented",
    evidence.deletionProcessDocumented === true,
  );
  addCheck(
    checks,
    "upstashExportProcessDocumented",
    evidence.exportProcessDocumented === true,
  );
  addCheck(
    checks,
    "upstashReceiverEvidenceRedacted",
    findings.length === 0,
    findings.map((finding) => finding.finding),
  );

  return {
    checks,
    findings,
    ok: allChecksPass(checks),
    summary: {
      provided: true,
      receiverType: "upstash",
      reviewedAt: evidence.reviewedAt ?? "",
      reviewer: evidence.reviewer ?? "",
      storageOwner: evidence.storageOwner ?? "",
      storageProvider: "upstash",
      total: null,
      urls: {
        productionUrl,
      },
    },
  };
}

export function evaluateBlobReceiverEvidence(evidence) {
  if (!isObject(evidence)) {
    return missingEvidence("receiverEvidence", "--receiver-evidence-file");
  }

  const checks = [];
  const findings = scanEvidenceForSensitiveValues(evidence);
  const target = isObject(evidence.target) ? evidence.target : {};
  const health = isObject(evidence.health) ? evidence.health : {};
  const productionSubmit = isObject(evidence.productionSubmit)
    ? evidence.productionSubmit
    : {};
  const blob = isObject(evidence.blob) ? evidence.blob : {};
  const productionUrl = publicUrl(
    target.productionUrl,
    "Blob production URL",
    findings,
  );

  addCheck(checks, "blobReceiverEvidenceOk", evidence.ok === true);
  addCheck(checks, "blobReceiverType", evidence.receiverType === "blob");
  addCheck(
    checks,
    "blobStorageOwnerRecorded",
    typeof evidence.storageOwner === "string" &&
      evidence.storageOwner.trim().length > 0,
  );
  addCheck(checks, "blobReviewedAt", isValidIsoDate(evidence.reviewedAt));
  addCheck(
    checks,
    "blobReviewerRecorded",
    typeof evidence.reviewer === "string" && evidence.reviewer.trim().length > 0,
  );
  addCheck(
    checks,
    "blobHealthReady",
    health.mode === "blob" &&
      health.storageConfigured === true &&
      health.paidTrafficReady === true,
  );
  addCheck(
    checks,
    "blobProductionSubmit",
    isHttpSuccess(productionSubmit.status) &&
      productionSubmit.mode === "blob" &&
      typeof productionSubmit.receiptId === "string" &&
      productionSubmit.receiptId.length > 0,
    {
      mode: productionSubmit.mode ?? "",
      status: productionSubmit.status ?? null,
    },
  );
  addCheck(
    checks,
    "blobPrivateObjectVerified",
    blob.access === "private" &&
      typeof blob.pathname === "string" &&
      blob.pathname.length > 0 &&
      Number(blob.size) > 0,
  );
  addCheck(checks, "blobDurableStorage", evidence.durableStorage === true);
  addCheck(checks, "blobConsentFieldsStored", evidence.storesConsentFields === true);
  addCheck(checks, "blobSubmissionIdStored", evidence.storesSubmissionId === true);
  addCheck(checks, "blobAttributionStored", evidence.storesAttribution === true);
  addCheck(
    checks,
    "blobDeletionProcessDocumented",
    evidence.deletionProcessDocumented === true,
  );
  addCheck(
    checks,
    "blobExportProcessDocumented",
    evidence.exportProcessDocumented === true,
  );
  addCheck(
    checks,
    "blobReceiverEvidenceRedacted",
    findings.length === 0,
    findings.map((finding) => finding.finding),
  );

  return {
    checks,
    findings,
    ok: allChecksPass(checks),
    summary: {
      blobPathname: blob.pathname ?? "",
      provided: true,
      receiverType: "blob",
      reviewedAt: evidence.reviewedAt ?? "",
      reviewer: evidence.reviewer ?? "",
      storageOwner: evidence.storageOwner ?? "",
      storageProvider: "blob",
      total: null,
      urls: {
        productionUrl,
      },
    },
  };
}

function normalizedScopeValues(scope) {
  if (!Array.isArray(scope)) {
    return new Set();
  }

  return new Set(
    scope.map((value) =>
      String(value)
        .toLowerCase()
        .replace(/[\s_-]/g, ""),
    ),
  );
}

export function evaluateCounselSignoff(signoff) {
  if (!isObject(signoff)) {
    return missingEvidence("counselSignoff", "--counsel-signoff-file");
  }

  const checks = [];
  const findings = scanEvidenceForSensitiveValues(signoff);
  const scope = normalizedScopeValues(signoff.scope);
  const missingScopes = requiredCounselScopes.filter((name) => !scope.has(name));

  addCheck(checks, "counselSignoffOk", signoff.ok === true);
  addCheck(checks, "counselReviewedAt", isValidIsoDate(signoff.reviewedAt));
  addCheck(
    checks,
    "counselReviewerRecorded",
    typeof signoff.reviewer === "string" && signoff.reviewer.trim().length > 0,
  );
  addCheck(
    checks,
    "counselScopeComplete",
    missingScopes.length === 0,
    { missingScopes },
  );
  addCheck(
    checks,
    "campaignCopyLintOk",
    signoff.campaignCopyLintOk === true,
  );
  addCheck(
    checks,
    "counselSignoffRedacted",
    findings.length === 0,
    findings.map((finding) => finding.finding),
  );

  return {
    checks,
    findings,
    ok: allChecksPass(checks),
    summary: {
      missingScopes,
      provided: true,
      reviewedAt: signoff.reviewedAt ?? "",
      reviewer: signoff.reviewer ?? "",
    },
  };
}

export function evaluateAnalyticsEvidence(evidence, { targetUrl = "" } = {}) {
  return evaluateLiveAnalyticsEvidence(evidence, { targetUrl });
}

export function evaluateStrictLaunchEvidence(launchEvidence) {
  const checks = [];
  const remainingGates = Array.isArray(launchEvidence?.remainingGates)
    ? launchEvidence.remainingGates
    : [];

  addCheck(checks, "launchEvidenceOk", launchEvidence?.ok === true);
  addCheck(
    checks,
    "strictPaidTrafficReadiness",
    launchEvidence?.paidTrafficReady === true &&
      launchEvidence?.readiness?.strict?.ok === true,
  );
  addCheck(checks, "vercelProductionCaptureEnv", launchEvidence?.vercelEnv?.ok === true);
  addCheck(
    checks,
    "noLaunchEvidenceRemainingGates",
    remainingGates.length === 0,
    { remainingGates },
  );

  return {
    checks,
    ok: allChecksPass(checks),
    summary: {
      ok: launchEvidence?.ok === true,
      paidTrafficReady: launchEvidence?.paidTrafficReady === true,
      productionWaitlist: launchEvidence?.production?.health?.waitlist ?? {},
      remainingGates,
      strictReadinessOk: launchEvidence?.readiness?.strict?.ok === true,
      vercelEnvOk: launchEvidence?.vercelEnv?.ok === true,
    },
  };
}

export function summarizeMarketGoNoGo({
  analyticsEvidence,
  counselSignoff,
  generatedAt = new Date().toISOString(),
  launchEvidence,
  receiverEvidence,
  targetUrl,
}) {
  const normalizedTargetUrl = normalizeSiteUrl(targetUrl);
  const strictLaunch = evaluateStrictLaunchEvidence(launchEvidence);
  const receiver = evaluateReceiverEvidence(receiverEvidence);
  const counsel = evaluateCounselSignoff(counselSignoff);
  const analytics = evaluateAnalyticsEvidence(analyticsEvidence, {
    targetUrl: normalizedTargetUrl,
  });
  const gates = [
    {
      name: "strictProductionLaunchEvidence",
      ok: strictLaunch.ok,
    },
    {
      name: "productionReceiverEvidence",
      ok: receiver.ok,
    },
    {
      name: "counselSignoff",
      ok: counsel.ok,
    },
    {
      name: "liveAnalyticsEvidence",
      ok: analytics.ok,
    },
  ];
  const remainingGates = gates
    .filter((gate) => gate.ok !== true)
    .map((gate) => gate.name);
  const ok = remainingGates.length === 0;

  return {
    generatedAt,
    gates,
    marketReady: ok,
    ok,
    paidTrafficReady: ok,
    remainingGates,
    targetUrl: normalizedTargetUrl,
    evidence: {
      analytics,
      counsel,
      launch: strictLaunch,
      receiver,
    },
  };
}

async function readJsonFile(path, label) {
  if (!path) {
    return undefined;
  }

  let parsed;

  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read ${label} JSON at ${path}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  return parsed;
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const [launchEvidence, receiverEvidence, counselSignoff, analyticsEvidence] =
    await Promise.all([
      buildLaunchEvidence({
        expectedSiteUrl: parsed.expectedSiteUrl,
        targetUrl: parsed.targetUrl,
        timeoutMs: parsed.timeoutMs,
      }),
      readJsonFile(parsed.receiverEvidenceFile, "receiver evidence"),
      readJsonFile(parsed.counselSignoffFile, "counsel sign-off"),
      readJsonFile(parsed.analyticsEvidenceFile, "analytics evidence"),
    ]);
  const result = summarizeMarketGoNoGo({
    analyticsEvidence,
    counselSignoff,
    launchEvidence,
    receiverEvidence,
    targetUrl: parsed.targetUrl,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok && !parsed.allowNotReady) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Market go/no-go failed.");
    process.exit(1);
  });
}
