import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { normalizeSiteUrl } from "./paid-traffic-readiness.mjs";

export const requiredLiveAnalyticsEventNames = [
  "Product Inquiry Attempted",
  "Product Inquiry Submitted",
];

export const requiredLiveAnalyticsCampaignProperties = [
  "campaignMedium",
  "campaignName",
  "campaignSource",
  "hasCampaignAttribution",
];

const durableProbeModes = new Set(["blob", "upstash", "webhook"]);

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
    finding: "authorization header-like value",
    pattern: /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}/i,
  },
  {
    finding: "raw query string",
    pattern: /\?[A-Za-z0-9_.~%+-]+=/,
  },
  {
    finding: "raw access note",
    pattern: /\b(?:rent|insurance|car note|routing|account|ssn)\b/i,
  },
];

function usage() {
  return [
    "Usage: npm run analytics:evidence:check -- --file launch-evidence/analytics-evidence.json --site-url https://payshield-lime.vercel.app",
    "",
    "Validates redacted live Vercel Web Analytics and Speed Insights evidence for final go/no-go.",
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
      !["--file", "--help", "--site-url", "-h"].includes(arg) &&
      !arg.startsWith("--file=") &&
      !arg.startsWith("--site-url="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  const file = flagValue(args, "--file");

  if (!file) {
    throw new Error("--file is required.");
  }

  return {
    file,
    help: false,
    siteUrl: flagValue(args, "--site-url"),
  };
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pathLabel(path) {
  if (path.length === 0) {
    return "$";
  }

  return `$${path.map((part) => `[${JSON.stringify(part)}]`).join("")}`;
}

function scanEvidenceForSensitiveValues(value, path = []) {
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

  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      findings.push(...scanEvidenceForSensitiveValues(item, [...path, key]));
    }
  }

  return findings;
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

function publicSafeUrl(value, label, findings) {
  if (typeof value !== "string" || value.length === 0) {
    findings.push({
      finding: `${label} is missing`,
      path: "$",
    });
    return "";
  }

  try {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
      findings.push({
        finding: `${label} must use http or https`,
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

    return normalizeSiteUrl(url.toString());
  } catch {
    findings.push({
      finding: `${label} is not a valid URL`,
      path: "$",
    });
    return "";
  }
}

function normalizedStringSet(value) {
  if (!Array.isArray(value)) {
    return new Set();
  }

  return new Set(
    value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function missingRequired(found, required) {
  return required.filter((item) => !found.has(item));
}

export function evaluateLiveAnalyticsEvidence(evidence, { targetUrl = "" } = {}) {
  if (!isObject(evidence)) {
    return {
      checks: [
        {
          detail: "Provide --file.",
          name: "analyticsEvidenceProvided",
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

  const checks = [];
  const findings = scanEvidenceForSensitiveValues(evidence);
  const productionUrl = publicSafeUrl(
    evidence.productionUrl,
    "analytics productionUrl",
    findings,
  );
  const expectedUrl = targetUrl
    ? normalizeSiteUrl(publicSafeUrl(targetUrl, "--site-url", findings))
    : "";
  const eventNames = normalizedStringSet(evidence.observedEventNames);
  const campaignProperties = normalizedStringSet(evidence.observedCampaignProperties);
  const probe = isObject(evidence.probe) ? evidence.probe : {};
  const probeCampaign = isObject(probe.campaign) ? probe.campaign : {};
  const missingEvents = missingRequired(
    eventNames,
    requiredLiveAnalyticsEventNames,
  );
  const missingCampaignProperties = missingRequired(
    campaignProperties,
    requiredLiveAnalyticsCampaignProperties,
  );

  addCheck(checks, "analyticsEvidenceOk", evidence.ok === true);
  addCheck(checks, "analyticsObservedAt", isValidIsoDate(evidence.observedAt));
  addCheck(
    checks,
    "analyticsSourceRecorded",
    typeof evidence.source === "string" && evidence.source.trim().length > 0,
  );
  addCheck(
    checks,
    "analyticsProductionUrl",
    Boolean(productionUrl) && (!expectedUrl || productionUrl === expectedUrl),
    { expectedUrl, productionUrl },
  );
  addCheck(
    checks,
    "webAnalyticsPilotConversions",
    evidence.webAnalyticsPilotConversions === true,
  );
  addCheck(
    checks,
    "sanitizedCampaignMetadata",
    evidence.sanitizedCampaignMetadata === true,
  );
  addCheck(
    checks,
    "speedInsightsProductionData",
    evidence.speedInsightsProductionData === true,
  );
  addCheck(
    checks,
    "requiredAnalyticsEventsObserved",
    missingEvents.length === 0,
    { missingEvents },
  );
  addCheck(
    checks,
    "requiredCampaignPropertiesObserved",
    missingCampaignProperties.length === 0,
    { missingCampaignProperties },
  );
  addCheck(
    checks,
    "analyticsEvidenceRedacted",
    findings.length === 0,
    findings.map((finding) => finding.finding),
  );
  addCheck(checks, "analyticsProductionProbeRecorded", isObject(evidence.probe));
  addCheck(
    checks,
    "analyticsProbeProductionHealth",
    probe.healthOk === true && probe.siteUrlMatchesExpected === true,
  );
  addCheck(
    checks,
    "analyticsProbeDurableCapture",
    probe.paidTrafficReady === true &&
      durableProbeModes.has(String(probe.waitlistMode ?? "")) &&
      probe.durableCapture === true,
    {
      paidTrafficReady: probe.paidTrafficReady === true,
      waitlistMode: probe.waitlistMode ?? "",
    },
  );
  addCheck(
    checks,
    "analyticsProbeCampaignSubmitted",
    probe.landingPageRequested === true &&
      probe.productInquiryApiSubmitted === true &&
      probe.receiptIdRecorded === true,
  );
  addCheck(
    checks,
    "analyticsProbeCampaignMetadata",
    probe.sanitizedCampaignMetadataSubmitted === true &&
      probeCampaign.campaignSource === "analytics-probe" &&
      probeCampaign.campaignMedium === "ops" &&
      probeCampaign.campaignName === "analytics-evidence",
  );

  return {
    checks,
    findings,
    ok: allChecksPass(checks),
    summary: {
      observedAt: evidence.observedAt ?? "",
      observedCampaignProperties: [...campaignProperties],
      observedEventNames: [...eventNames],
      productionUrl,
      provided: true,
      source: evidence.source ?? "",
    },
  };
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read analytics evidence JSON at ${path}: ${
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

  const evidence = await readJsonFile(parsed.file);
  const result = evaluateLiveAnalyticsEvidence(evidence, {
    targetUrl: parsed.siteUrl,
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
        : "Analytics evidence check failed.",
    );
    process.exit(1);
  });
}
