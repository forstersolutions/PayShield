import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateUpstashReceiverEvidence } from "./market-go-no-go.mjs";
import { normalizeSiteUrl } from "./paid-traffic-readiness.mjs";

const defaultSiteUrl = "https://payshield-lime.vercel.app";
const defaultRestUrlEnvName = "UPSTASH_REDIS_REST_URL";
const defaultTokenEnvName = "UPSTASH_REDIS_REST_TOKEN";
const defaultStoragePrefix = "payshield:waitlist";
const timeoutMs = 10_000;
const valueOptions = new Set([
  "--output",
  "--recent-limit",
  "--rest-url-env",
  "--reviewed-at",
  "--reviewer",
  "--site-url",
  "--storage-owner",
  "--storage-prefix",
  "--token-env",
]);

function usage() {
  return [
    "Usage: UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... npm run receiver:upstash:evidence -- https://payshield-lime.vercel.app --reviewer 'Launch operator' --storage-owner 'Revenue operations' --deletion-process-documented --export-process-documented [--output launch-evidence/receiver-evidence.json]",
    "",
    "Submits a production smoke lead, verifies the redacted Upstash Redis record and email-hash index, and emits receiver evidence for final market go/no-go.",
    "The command never prints the smoke lead email, Upstash REST URL, or Upstash token.",
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
        "--deletion-process-documented",
        "--export-process-documented",
        "--help",
        "--output",
        "--recent-limit",
        "--rest-url-env",
        "--reviewed-at",
        "--reviewer",
        "--site-url",
        "--storage-owner",
        "--storage-prefix",
        "--token-env",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--output=") &&
      !arg.startsWith("--recent-limit=") &&
      !arg.startsWith("--rest-url-env=") &&
      !arg.startsWith("--reviewed-at=") &&
      !arg.startsWith("--reviewer=") &&
      !arg.startsWith("--site-url=") &&
      !arg.startsWith("--storage-owner=") &&
      !arg.startsWith("--storage-prefix=") &&
      !arg.startsWith("--token-env="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (valueOptions.has(arg)) {
      index += 1;
      continue;
    }

    if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }

  const targetUrl = positional[0] || defaultSiteUrl;

  return {
    deletionProcessDocumented: args.includes("--deletion-process-documented"),
    exportProcessDocumented: args.includes("--export-process-documented"),
    help: false,
    output: flagValue(args, "--output"),
    recentLimit: Number(flagValue(args, "--recent-limit") || 25),
    restUrlEnvName: flagValue(args, "--rest-url-env") || defaultRestUrlEnvName,
    reviewedAt: flagValue(args, "--reviewed-at"),
    reviewer: flagValue(args, "--reviewer"),
    siteUrl: flagValue(args, "--site-url") || targetUrl,
    storageOwner: flagValue(args, "--storage-owner"),
    storagePrefix: flagValue(args, "--storage-prefix") || defaultStoragePrefix,
    targetUrl,
    tokenEnvName: flagValue(args, "--token-env") || defaultTokenEnvName,
  };
}

function isLocalhost(url) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
}

function safeHttpUrl(value, label, { allowLocalHttp = false } = {}) {
  const url = new URL(value);
  const localHttp =
    allowLocalHttp && url.protocol === "http:" && isLocalhost(url);

  if (url.protocol !== "https:" && !localHttp) {
    throw new Error(`${label} must use https.`);
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

function normalizeBaseUrl(value, { allowLocalHttp = false } = {}) {
  const url = new URL(safeHttpUrl(value, "--target-url", { allowLocalHttp }));

  url.pathname = url.pathname.replace(/\/+$/, "");

  return url.toString().replace(/\/+$/, "");
}

function urlFor(baseUrl, path) {
  return new URL(path, `${baseUrl}/`).toString();
}

function cleanStoragePrefix(value) {
  return String(value || defaultStoragePrefix)
    .trim()
    .replace(/[^A-Za-z0-9:_-]/g, "")
    .replace(/:+/g, ":")
    .replace(/^:+|:+$/g, "")
    .slice(0, 80) || defaultStoragePrefix;
}

function leadEmailHash(email) {
  return createHash("sha256")
    .update(email.toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

function commandResult(value, index = 0) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const item = value[index];

  if (!item || typeof item !== "object" || item.error) {
    return undefined;
  }

  return item.result;
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

function upstashEndpoint(restUrl, { allowLocalHttp = false } = {}) {
  const endpoint = new URL(
    safeHttpUrl(restUrl, "UPSTASH_REDIS_REST_URL", { allowLocalHttp }),
  );

  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/multi-exec`;

  return endpoint.toString();
}

async function upstashMultiExec({
  allowLocalHttp = false,
  commands,
  fetchImpl,
  restUrl,
  token,
}) {
  const response = await fetchJson(fetchImpl, upstashEndpoint(restUrl, { allowLocalHttp }), {
    body: JSON.stringify(commands),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (response.status < 200 || response.status >= 300) {
    return [];
  }

  return Array.isArray(response.body) ? response.body : [];
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasConsentFields(record) {
  return [
    "consentText",
    "consentedAt",
    "consentVersion",
    "privacyVersion",
    "termsVersion",
  ].every((field) => typeof record?.[field] === "string" && record[field].length > 0);
}

function hasAttribution(record) {
  return (
    isObject(record?.attribution) &&
    ["utmSource", "utmMedium", "utmCampaign", "landingPath"].every(
      (field) =>
        typeof record.attribution[field] === "string" &&
        record.attribution[field].length > 0,
    )
  );
}

async function findSmokeRecord({
  allowLocalHttp,
  email,
  fetchImpl,
  recentLimit,
  restUrl,
  storagePrefix,
  token,
}) {
  if (!restUrl || !token) {
    return {
      emailHashIndexStored: false,
      record: null,
      recentSubmissionCount: 0,
    };
  }

  const prefix = cleanStoragePrefix(storagePrefix);
  const submissionsKey = `${prefix}:submissions`;
  const idsResponse = await upstashMultiExec({
    allowLocalHttp,
    commands: [["ZREVRANGE", submissionsKey, "0", String(Math.max(0, recentLimit - 1))]],
    fetchImpl,
    restUrl,
    token,
  });
  const submissionIds = commandResult(idsResponse);
  const ids = Array.isArray(submissionIds)
    ? submissionIds.map((id) => String(id)).filter(Boolean)
    : [];

  if (!ids.length) {
    return {
      emailHashIndexStored: false,
      record: null,
      recentSubmissionCount: 0,
    };
  }

  const recordResponses = await upstashMultiExec({
    allowLocalHttp,
    commands: ids.map((id) => ["GET", `${prefix}:lead:${id}`]),
    fetchImpl,
    restUrl,
    token,
  });
  const records = recordResponses
    .map((_, index) => commandResult(recordResponses, index))
    .map((raw) => {
      try {
        return typeof raw === "string" ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })
    .filter(isObject);
  const record = records.find((candidate) => candidate.email === email) ?? null;

  if (!record?.submissionId) {
    return {
      emailHashIndexStored: false,
      record: null,
      recentSubmissionCount: ids.length,
    };
  }

  const emailKey = `${prefix}:email:${leadEmailHash(email)}`;
  const indexResponse = await upstashMultiExec({
    allowLocalHttp,
    commands: [["SISMEMBER", emailKey, record.submissionId]],
    fetchImpl,
    restUrl,
    token,
  });
  const indexResult = commandResult(indexResponse);

  return {
    emailHashIndexStored: indexResult === 1 || indexResult === "1",
    record,
    recentSubmissionCount: ids.length,
  };
}

function finalizeEvidence(evidence) {
  const candidate = {
    ...evidence,
    ok: true,
  };
  const validation = evaluateUpstashReceiverEvidence(candidate);

  return {
    evidence: {
      ...candidate,
      ok: validation.ok,
    },
    validation,
  };
}

export async function generateUpstashReceiverEvidence({
  allowLocalHttp = false,
  deletionProcessDocumented = false,
  exportProcessDocumented = false,
  fetchImpl = globalThis.fetch,
  generatedAt = new Date().toISOString(),
  recentLimit = 25,
  restUrlValue = process.env[defaultRestUrlEnvName],
  reviewedAt = generatedAt,
  reviewer = "",
  siteUrl = defaultSiteUrl,
  storageOwner = "",
  storagePrefix = process.env.PAYSHIELD_WAITLIST_STORAGE_PREFIX ??
    defaultStoragePrefix,
  targetUrl = siteUrl,
  tokenValue = process.env[defaultTokenEnvName],
} = {}) {
  const baseUrl = normalizeBaseUrl(targetUrl, { allowLocalHttp });
  const productionUrl = normalizeSiteUrl(
    safeHttpUrl(siteUrl, "--site-url", { allowLocalHttp }),
  );
  const proofId = randomUUID().replace(/-/g, "").slice(0, 16);
  const email = `upstash-proof+${proofId}@example.com`;
  const health = await fetchJson(fetchImpl, urlFor(baseUrl, "/api/health"));
  const waitlist = isObject(health.body.waitlist) ? health.body.waitlist : {};
  const submit = await fetchJson(fetchImpl, urlFor(baseUrl, "/api/waitlist"), {
    body: JSON.stringify({
      attribution: {
        landingPath: "/",
        utmCampaign: "upstash-evidence",
        utmMedium: "ops",
        utmSource: "launch-proof",
      },
      consent: true,
      email,
      message: "Automated Upstash evidence smoke test. Safe to delete.",
      name: "Upstash Evidence Probe",
      segment: "Investor or partner",
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const storage = await findSmokeRecord({
    allowLocalHttp,
    email,
    fetchImpl,
    recentLimit,
    restUrl: restUrlValue ?? "",
    storagePrefix,
    token: tokenValue ?? "",
  });
  const record = storage.record;
  const evidenceBase = {
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
      status: submit.status,
    },
    receiverType: "upstash",
    reviewedAt,
    reviewer,
    storageOwner,
    storesAttribution: hasAttribution(record),
    storesConsentFields: hasConsentFields(record),
    storesEmailHashIndex: storage.emailHashIndexStored,
    storesSubmissionId:
      typeof record?.submissionId === "string" && record.submissionId.length > 0,
    target: {
      productionUrl,
    },
  };

  return finalizeEvidence(evidenceBase);
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = await generateUpstashReceiverEvidence({
    deletionProcessDocumented: parsed.deletionProcessDocumented,
    exportProcessDocumented: parsed.exportProcessDocumented,
    recentLimit: parsed.recentLimit,
    restUrlValue: process.env[parsed.restUrlEnvName],
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
        : "Upstash receiver evidence generation failed.",
    );
    process.exit(1);
  });
}
