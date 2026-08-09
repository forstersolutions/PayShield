import { pathToFileURL } from "node:url";
import { normalizeSiteUrl } from "./url-utils.mjs";

const defaultTimeoutMs = 10_000;

function record(result, condition, success, failure) {
  if (condition) {
    result.checks.push(success);
  } else {
    result.failures.push(failure);
  }
}

export function evaluateCommercialReadiness({ health, membership } = {}) {
  const result = { checks: [], failures: [] };

  record(
    result,
    health?.ok === true && health?.service === "payshield-web-app",
    "Frontend health is ready.",
    "Frontend health is unavailable or invalid.",
  );
  record(
    result,
    membership?.service === "payshield-membership-status",
    "Membership status endpoint is valid.",
    "Membership status endpoint is invalid.",
  );
  record(
    result,
    membership?.available === true && membership?.status === "available",
    "Membership checkout and product controls are available.",
    "Membership checkout or product controls are not available.",
  );
  record(
    result,
    typeof membership?.membership?.priceLabel === "string" &&
      membership.membership.priceLabel.trim().length > 0,
    "Membership price is present.",
    "Membership price is missing.",
  );

  return {
    checks: result.checks,
    failures: result.failures,
    ok: result.failures.length === 0,
    service: "payshield-commercial-readiness",
  };
}

async function fetchJson(baseUrl, path, timeoutMs) {
  const response = await fetch(new URL(path, `${baseUrl}/`), {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null);

  if (!body || typeof body !== "object") {
    throw new Error(`${path} did not return JSON.`);
  }

  return { body, status: response.status };
}

export async function collectCommercialReadinessEvidence({
  targetUrl,
  timeoutMs = defaultTimeoutMs,
}) {
  const baseUrl = normalizeSiteUrl(targetUrl);
  const [health, membership] = await Promise.all([
    fetchJson(baseUrl, "/api/health", timeoutMs),
    fetchJson(baseUrl, "/api/public/billing/status", timeoutMs),
  ]);

  return {
    baseUrl,
    health: health.body,
    healthStatus: health.status,
    membership: membership.body,
    membershipStatus: membership.status,
  };
}

function usage() {
  return "Usage: npm run readiness:commercial -- https://your-domain.com [--timeout-ms 10000]";
}

function flagValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

async function main() {
  const args = process.argv.slice(2);
  const targetUrl = args.find((arg) => !arg.startsWith("--"));

  if (!targetUrl || args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    process.exitCode = targetUrl ? 0 : 1;
    return;
  }

  const timeoutMs = Number(flagValue(args, "--timeout-ms") || defaultTimeoutMs);

  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("--timeout-ms must be between 1 and 60000.");
  }

  const evidence = await collectCommercialReadinessEvidence({ targetUrl, timeoutMs });
  const result = evaluateCommercialReadiness(evidence);
  console.log(JSON.stringify({ ...result, targetUrl: evidence.baseUrl }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Commercial readiness failed.");
    process.exit(1);
  });
}
