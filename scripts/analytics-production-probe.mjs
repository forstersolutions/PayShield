import { writeFile } from "node:fs/promises";
import {
  requiredLiveAnalyticsCampaignProperties,
  requiredLiveAnalyticsEventNames,
} from "./check-analytics-evidence.mjs";
import { runVercelCli } from "./vercel-cli.mjs";
const durableModes = new Set(["blob", "upstash", "webhook"]);
const timeoutMs = 12_000;

function usage() {
  return [
    "Usage: npm run analytics:probe -- https://payshield-lime.vercel.app --expect-site-url https://payshield-lime.vercel.app --output launch-evidence/analytics-evidence.json",
    "",
    "Runs a campaign-attributed production probe and writes a redacted analytics evidence draft.",
    "The draft still requires Vercel Web Analytics dashboard confirmation before final go/no-go.",
    "",
    "Options:",
    "  --expect-site-url url          Required production canonical URL",
    "  --output path                 Optional JSON output path",
    "  --project name-or-id          Vercel project for metrics probe (default: payshield)",
    "  --skip-vercel-metrics         Skip the optional Vercel metrics probe",
    "  --require-paid-traffic-ready  Fail unless /api/health reports paidTrafficReady",
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

function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const unknown = args.find(
    (arg) =>
      arg.startsWith("--") &&
      ![
        "--expect-site-url",
        "--help",
        "--output",
        "--project",
        "--require-paid-traffic-ready",
        "--skip-vercel-metrics",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--expect-site-url=") &&
      !arg.startsWith("--output=") &&
      !arg.startsWith("--project="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  const targetUrl = args.find((arg) => !arg.startsWith("--"));
  const expectedSiteUrl = flagValue(args, "--expect-site-url");

  if (!targetUrl) {
    throw new Error("target URL is required.");
  }

  if (!expectedSiteUrl) {
    throw new Error("--expect-site-url is required.");
  }

  return {
    expectedSiteUrl,
    help: false,
    output: flagValue(args, "--output"),
    project: flagValue(args, "--project") || "payshield",
    requirePaidTrafficReady: args.includes("--require-paid-traffic-ready"),
    skipVercelMetrics: args.includes("--skip-vercel-metrics"),
    targetUrl,
  };
}

function normalizeUrl(value, label) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must use http or https.`);
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not include credentials, query strings, or fragments.`);
  }

  const pathname = url.pathname.replace(/\/+$/, "");

  return `${url.origin}${pathname}`;
}

function probeUrl(baseUrl, path) {
  return new URL(path, `${baseUrl}/`).toString();
}

async function requestJson(baseUrl, path, init = {}) {
  const response = await fetch(probeUrl(baseUrl, path), {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));

  return { body, response };
}

async function requestText(baseUrl, path) {
  const response = await fetch(probeUrl(baseUrl, path), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text().catch(() => "");

  return { body, response };
}

function metricStatusFromError(error) {
  const combined = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`;

  if (combined.includes("payment_required")) {
    return "unavailable_observability_plus_required";
  }

  if (combined.includes("unauthorized") || combined.includes("not_authenticated")) {
    return "unavailable_not_authenticated";
  }

  return "unavailable";
}

async function probeVercelSpeedInsights(project) {
  try {
    const { stdout } = await runVercelCli(
      [
        "metrics",
        "vercel.speed_insights_metric.lcp",
        "--since",
        "24h",
        "--project",
        project,
        "--format",
        "json",
        "--no-color",
      ],
    );
    const rows = JSON.parse(stdout);
    const rowCount = Array.isArray(rows) ? rows.length : 0;

    return {
      attempted: true,
      metric: "vercel.speed_insights_metric.lcp",
      ok: rowCount > 0,
      project,
      rowCount,
      status: rowCount > 0 ? "observed" : "no_rows",
      window: "24h",
    };
  } catch (error) {
    return {
      attempted: true,
      metric: "vercel.speed_insights_metric.lcp",
      ok: false,
      project,
      rowCount: 0,
      status: metricStatusFromError(error),
      window: "24h",
    };
  }
}

export async function buildAnalyticsProbeEvidence({
  expectedSiteUrl,
  project = "payshield",
  requirePaidTrafficReady = false,
  skipVercelMetrics = false,
  targetUrl,
}) {
  const baseUrl = normalizeUrl(targetUrl, "target URL");
  const productionUrl = normalizeUrl(expectedSiteUrl, "--expect-site-url");

  if (baseUrl !== productionUrl) {
    throw new Error(
      `target URL ${baseUrl} does not match --expect-site-url ${productionUrl}.`,
    );
  }

  const generatedAt = new Date().toISOString();
  const campaign = {
    campaignMedium: "ops",
    campaignName: "analytics-evidence",
    campaignSource: "analytics-probe",
  };
  const health = await requestJson(baseUrl, "/api/health");

  if (health.response.status !== 200 || health.body?.ok !== true) {
    throw new Error("/api/health did not return ok=true.");
  }

  const healthSiteUrl = normalizeUrl(
    String(health.body?.siteUrl ?? productionUrl),
    "/api/health siteUrl",
  );
  const waitlistMode = String(health.body?.waitlist?.mode ?? "");
  const paidTrafficReady = health.body?.waitlist?.paidTrafficReady === true;

  if (healthSiteUrl !== productionUrl) {
    throw new Error(
      `/api/health siteUrl ${healthSiteUrl} does not match ${productionUrl}.`,
    );
  }

  if (requirePaidTrafficReady && !paidTrafficReady) {
    throw new Error("/api/health does not report waitlist.paidTrafficReady=true.");
  }

  const landing = await requestText(
    baseUrl,
    `/?utm_source=${campaign.campaignSource}&utm_medium=${campaign.campaignMedium}&utm_campaign=${campaign.campaignName}`,
  );

  if (landing.response.status !== 200) {
    throw new Error(`campaign-attributed landing page returned ${landing.response.status}.`);
  }

  const submit = await requestJson(baseUrl, "/api/waitlist", {
    body: JSON.stringify({
      attribution: {
        landingPath: "/",
        utmCampaign: campaign.campaignName,
        utmMedium: campaign.campaignMedium,
        utmSource: campaign.campaignSource,
      },
      company: "",
      consent: true,
      email: `analytics-probe+${Date.now()}@example.com`,
      message: "Automated analytics evidence probe.",
      name: "PayShield Analytics Probe",
      segment: "Investor or partner",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (submit.response.status !== 200 || submit.body?.ok !== true) {
    throw new Error(
      `/api/waitlist probe returned ${submit.response.status}; expected ok=true.`,
    );
  }

  const receiptMode = String(submit.body?.mode ?? "");
  const durableCapture = durableModes.has(waitlistMode) && paidTrafficReady;
  const metrics = skipVercelMetrics
    ? {
        attempted: false,
        metric: "vercel.speed_insights_metric.lcp",
        ok: false,
        project,
        rowCount: 0,
        status: "skipped",
        window: "24h",
      }
    : await probeVercelSpeedInsights(project);

  return {
    generatedAt,
    observedAt: "",
    observedCampaignProperties: requiredLiveAnalyticsCampaignProperties,
    observedEventNames: requiredLiveAnalyticsEventNames,
    ok: false,
    productionUrl,
    probe: {
      campaign,
      durableCapture,
      healthOk: true,
      landingPageRequested: true,
      paidTrafficReady,
      productInquiryApiSubmitted: true,
      receiptIdRecorded: Boolean(submit.body?.receiptId),
      receiptMode,
      sanitizedCampaignMetadataSubmitted: true,
      siteUrlMatchesExpected: true,
      speedInsightsMetrics: metrics,
      waitlistMode,
    },
    sanitizedCampaignMetadata: false,
    source: "Vercel Web Analytics and Speed Insights dashboard",
    speedInsightsProductionData: metrics.ok === true,
    webAnalyticsPilotConversions: false,
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const evidence = await buildAnalyticsProbeEvidence(parsed);
  const json = `${JSON.stringify(evidence, null, 2)}\n`;

  if (parsed.output) {
    await writeFile(parsed.output, json, "utf8");
    console.log(
      JSON.stringify(
        {
          ok: true,
          output: parsed.output,
          productionUrl: evidence.productionUrl,
          dashboardConfirmationRequired: true,
          probe: evidence.probe,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(json);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Analytics production probe failed.",
    );
    process.exit(1);
  });
}
