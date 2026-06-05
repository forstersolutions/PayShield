import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { get } from "@vercel/blob";
import { evaluateBlobReceiverEvidence } from "./market-go-no-go.mjs";
import { normalizeSiteUrl } from "./paid-traffic-readiness.mjs";

const defaultSiteUrl = "https://payshield-lime.vercel.app";
const defaultStoragePrefix = "payshield:waitlist";
const defaultTokenEnvName = "BLOB_READ_WRITE_TOKEN";
const timeoutMs = 10_000;

function usage() {
  return [
    "Usage: BLOB_READ_WRITE_TOKEN=... npm run receiver:blob:evidence -- https://payshield-lime.vercel.app --reviewer 'Launch operator' --storage-owner 'Revenue operations' --deletion-process-documented --export-process-documented [--output launch-evidence/receiver-evidence.json]",
    "",
    "Submits a production smoke lead, verifies the redacted private Vercel Blob record, and emits receiver evidence for final market go/no-go.",
    "The output does not print lead PII or the Blob read-write token.",
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
  const unknown = args.find(
    (arg) =>
      arg.startsWith("--") &&
      ![
        "--allow-local-http",
        "--blob-token-env",
        "--deletion-process-documented",
        "--export-process-documented",
        "--help",
        "--output",
        "--reviewed-at",
        "--reviewer",
        "--site-url",
        "--storage-owner",
        "--storage-prefix",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--blob-token-env=") &&
      !arg.startsWith("--output=") &&
      !arg.startsWith("--reviewed-at=") &&
      !arg.startsWith("--reviewer=") &&
      !arg.startsWith("--site-url=") &&
      !arg.startsWith("--storage-owner=") &&
      !arg.startsWith("--storage-prefix="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  if (!targetUrl) {
    throw new Error("A production URL is required.");
  }

  return {
    allowLocalHttp: args.includes("--allow-local-http"),
    deletionProcessDocumented: args.includes("--deletion-process-documented"),
    exportProcessDocumented: args.includes("--export-process-documented"),
    help: false,
    output: flagValue(args, "--output"),
    reviewedAt: flagValue(args, "--reviewed-at"),
    reviewer: flagValue(args, "--reviewer"),
    siteUrl: flagValue(args, "--site-url") || targetUrl,
    storageOwner: flagValue(args, "--storage-owner"),
    storagePrefix: flagValue(args, "--storage-prefix") || defaultStoragePrefix,
    targetUrl,
    tokenEnvName: flagValue(args, "--blob-token-env") || defaultTokenEnvName,
  };
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeHttpUrl(value, label, { allowLocalHttp = false } = {}) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  const localhost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    url.hostname,
  );

  if (url.protocol !== "https:" && !(allowLocalHttp && localhost)) {
    throw new Error(`${label} must use https. Localhost http is allowed only for tests.`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      `${label} must not include credentials, query strings, or fragments.`,
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function urlFor(baseUrl, path) {
  return new URL(path, `${baseUrl.origin}${baseUrl.pathname || "/"}`).toString();
}

async function fetchJson(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));

  return {
    body,
    status: response.status,
  };
}

function cleanBlobStoragePrefix(value) {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9:_/-]/g, "")
      .replace(/[:/]+/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .slice(0, 100) || "payshield/waitlist"
  );
}

function waitlistBlobPathname({ prefix = defaultStoragePrefix, submissionId }) {
  const safeSubmissionId = String(submissionId ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 80);

  if (!safeSubmissionId) {
    throw new Error("Production submit did not return a durable receiptId.");
  }

  return `${cleanBlobStoragePrefix(prefix)}/leads/${safeSubmissionId}.json`;
}

async function readBlobJson({ getBlob = get, pathname, token }) {
  if (!token) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required for Blob receiver evidence.");
  }

  const result = await getBlob(pathname, {
    access: "private",
    token,
    useCache: false,
  });

  if (!result || result.statusCode !== 200 || !result.stream) {
    return {
      blob: null,
      record: null,
    };
  }

  const text = await new Response(result.stream).text();

  return {
    blob: result.blob,
    record: JSON.parse(text),
  };
}

function hasConsentFields(record) {
  return (
    typeof record?.consentText === "string" &&
    typeof record?.consentedAt === "string" &&
    typeof record?.consentVersion === "string" &&
    typeof record?.privacyVersion === "string" &&
    typeof record?.termsVersion === "string"
  );
}

function hasAttribution(record) {
  return (
    isObject(record?.attribution) &&
    typeof record.attribution.utmCampaign === "string" &&
    typeof record.attribution.utmSource === "string"
  );
}

function finalizeEvidence(evidence) {
  const candidate = {
    ...evidence,
    ok: true,
  };
  const validation = evaluateBlobReceiverEvidence(candidate);

  return {
    evidence: {
      ...candidate,
      ok: validation.ok,
    },
    validation,
  };
}

export async function generateBlobReceiverEvidence({
  allowLocalHttp = false,
  deletionProcessDocumented = false,
  exportProcessDocumented = false,
  fetchImpl = globalThis.fetch,
  generatedAt = new Date().toISOString(),
  getBlob = get,
  reviewedAt = generatedAt,
  reviewer = "",
  siteUrl = defaultSiteUrl,
  storageOwner = "",
  storagePrefix = process.env.PAYSHIELD_WAITLIST_STORAGE_PREFIX ??
    defaultStoragePrefix,
  targetUrl = siteUrl,
  tokenValue = process.env[defaultTokenEnvName],
} = {}) {
  const baseUrl = new URL(safeHttpUrl(targetUrl, "--target-url", { allowLocalHttp }));
  const productionUrl = normalizeSiteUrl(
    safeHttpUrl(siteUrl, "--site-url", { allowLocalHttp }),
  );
  const proofId = randomUUID().replace(/-/g, "").slice(0, 16);
  const email = `blob-proof+${proofId}@example.com`;
  const health = await fetchJson(fetchImpl, urlFor(baseUrl, "/api/health"));
  const waitlist = isObject(health.body.waitlist) ? health.body.waitlist : {};
  const submit = await fetchJson(fetchImpl, urlFor(baseUrl, "/api/waitlist"), {
    body: JSON.stringify({
      attribution: {
        landingPath: "/",
        utmCampaign: "blob-evidence",
        utmMedium: "ops",
        utmSource: "launch-proof",
      },
      consent: true,
      email,
      message: "Automated Blob evidence smoke test. Safe to delete.",
      name: "Blob Evidence Probe",
      segment: "Investor or partner",
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const receiptId =
    typeof submit.body.receiptId === "string" ? submit.body.receiptId : "";
  const pathname = waitlistBlobPathname({
    prefix: storagePrefix,
    submissionId: receiptId,
  });
  const storage = await readBlobJson({
    getBlob,
    pathname,
    token: tokenValue ?? "",
  });
  const record = storage.record;
  const evidenceBase = {
    blob: {
      access: "private",
      contentType: storage.blob?.contentType ?? "",
      pathname,
      size: storage.blob?.size ?? 0,
    },
    deletionProcessDocumented,
    durableStorage: Boolean(record),
    exportProcessDocumented,
    generatedAt,
    health: {
      mode: String(waitlist.mode ?? ""),
      paidTrafficReady: waitlist.paidTrafficReady === true,
      storageConfigured: waitlist.storageConfigured === true,
    },
    productionSubmit: {
      mode: String(submit.body.mode ?? ""),
      receiptId,
      status: submit.status,
    },
    receiverType: "blob",
    reviewedAt,
    reviewer,
    storageOwner,
    storesAttribution: hasAttribution(record),
    storesConsentFields: hasConsentFields(record),
    storesSubmissionId: record?.submissionId === receiptId && receiptId.length > 0,
    target: {
      productionUrl,
    },
  };
  const result = finalizeEvidence(evidenceBase);
  const serialized = JSON.stringify(result.evidence);

  if (
    serialized.includes(email) ||
    serialized.includes("Automated Blob evidence smoke test") ||
    (typeof tokenValue === "string" &&
      tokenValue.length > 0 &&
      serialized.includes(tokenValue))
  ) {
    throw new Error("Blob receiver evidence output included a sensitive value.");
  }

  return result;
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = await generateBlobReceiverEvidence({
    allowLocalHttp: parsed.allowLocalHttp,
    deletionProcessDocumented: parsed.deletionProcessDocumented,
    exportProcessDocumented: parsed.exportProcessDocumented,
    reviewedAt: parsed.reviewedAt || undefined,
    reviewer: parsed.reviewer,
    siteUrl: parsed.siteUrl,
    storageOwner: parsed.storageOwner,
    storagePrefix: parsed.storagePrefix,
    targetUrl: parsed.targetUrl,
    tokenValue: process.env[parsed.tokenEnvName],
  });
  const output = JSON.stringify(result.evidence, null, 2);

  if (parsed.output) {
    await mkdir(dirname(parsed.output), { recursive: true });
    await writeFile(parsed.output, `${output}\n`, "utf8");
    console.log(
      JSON.stringify(
        {
          ok: result.evidence.ok,
          output: parsed.output,
          validation: result.validation,
        },
        null,
        2,
      ),
    );
    if (!result.evidence.ok) {
      process.exit(1);
    }
    return;
  }

  console.log(output);

  if (!result.evidence.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Blob receiver evidence generation failed.",
    );
    process.exit(1);
  });
}
