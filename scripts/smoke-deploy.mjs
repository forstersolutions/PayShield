import { pathToFileURL } from "node:url";

const securityHeaders = {
  "permissions-policy": ["camera=()", "microphone=()", "geolocation=()", "payment=()"],
  "referrer-policy": ["strict-origin-when-cross-origin"],
  "strict-transport-security": ["max-age=31536000"],
  "x-content-type-options": ["nosniff"],
  "x-frame-options": ["DENY"],
};
const rejectedCopy = [/early access/i, /paid beta/i, /prototype/i, /not a bank/i];

export function normalizeUrl(value) {
  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("Deployment URL must be an absolute HTTP(S) URL without credentials.");
  }

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url;
}

async function boundedBody(response, maxBytes = 2 * 1024 * 1024) {
  const buffer = await response.arrayBuffer();

  if (buffer.byteLength > maxBytes) {
    throw new Error(`Response exceeded ${maxBytes} bytes.`);
  }

  return new TextDecoder().decode(buffer);
}

export async function runDeploySmoke({ targetUrl, timeoutMs = 10_000 }) {
  const baseUrl = normalizeUrl(targetUrl);
  const checks = [];
  const failures = [];

  async function request(path, init = {}) {
    try {
      const response = await fetch(new URL(path, baseUrl), {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        ...init,
      });
      return response;
    } catch (error) {
      failures.push(`${path} request failed: ${error instanceof Error ? error.message : "network error"}`);
      return null;
    }
  }

  async function textPage(path, required) {
    const response = await request(path);

    if (!response) return "";

    const body = await boundedBody(response).catch((error) => {
      failures.push(`${path} could not be read: ${error.message}`);
      return "";
    });
    const ok = response.status === 200;
    checks.push(`${path} responds`);

    if (!ok) failures.push(`${path} returned HTTP ${response.status}.`);

    for (const marker of required) {
      if (!body.toLowerCase().includes(marker.toLowerCase())) {
        failures.push(`${path} is missing ${marker}.`);
      }
    }

    for (const pattern of rejectedCopy) {
      if (pattern.test(body)) failures.push(`${path} contains rejected copy ${pattern}.`);
    }

    for (const [name, expectedParts] of Object.entries(securityHeaders)) {
      const value = response.headers.get(name) || "";

      for (const expected of expectedParts) {
        if (!value.toLowerCase().includes(expected.toLowerCase())) {
          failures.push(`${path} ${name} is missing ${expected}.`);
        }
      }
    }

    return body;
  }

  await textPage("/", ["PayShield", "Safe to Spend", "support@graystontechnologies.com"]);
  await textPage("/privacy", ["Privacy", "Grayston Technologies", "support@graystontechnologies.com"]);
  await textPage("/terms", ["Terms", "Grayston Technologies", "support@graystontechnologies.com"]);

  const healthResponse = await request("/api/health");
  if (healthResponse) {
    const health = await healthResponse.json().catch(() => ({}));
    checks.push("public health is minimal");
    if (healthResponse.status !== 200 || health.ok !== true || health.service !== "payshield-web-app") {
      failures.push("/api/health returned an invalid health payload.");
    }
    const serialized = JSON.stringify(health);
    if (/secret|credential|database|waitlist|readiness/i.test(serialized)) {
      failures.push("/api/health exposes internal state.");
    }
  }

  const membershipResponse = await request("/api/public/billing/status");
  if (membershipResponse) {
    const membership = await membershipResponse.json().catch(() => ({}));
    if (
      membershipResponse.status !== 200 ||
      membership.service !== "payshield-membership-status" ||
      !["available", "unavailable"].includes(membership.status)
    ) {
      failures.push("/api/public/billing/status returned an invalid payload.");
    }
  }
  checks.push("membership status is public-safe");

  const accountResponse = await request("/api/app/me");
  if (accountResponse && ![200, 401, 403, 503].includes(accountResponse.status)) {
    failures.push(`/api/app/me returned unexpected HTTP ${accountResponse.status}.`);
  }
  checks.push("protected account route responds predictably");

  const removedWaitlist = await request("/api/waitlist", { method: "POST" });
  if (removedWaitlist && ![404, 405].includes(removedWaitlist.status)) {
    failures.push("Obsolete /api/waitlist endpoint is still active.");
  }
  checks.push("obsolete intake route is absent");

  const assets = [
    ["/favicon.ico", "image/"],
    ["/icon.svg", "image/svg+xml"],
    ["/apple-icon.png", "image/png"],
    ["/images/payshield-social-card.jpg", "image/jpeg"],
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/.well-known/security.txt", "text/plain"],
    ["/robots.txt", "text/plain"],
    ["/sitemap.xml", "application/xml"],
  ];

  for (const [path, contentType] of assets) {
    const response = await request(path);

    if (!response || response.status !== 200) {
      failures.push(`${path} is unavailable.`);
      continue;
    }

    if (!(response.headers.get("content-type") || "").includes(contentType)) {
      failures.push(`${path} has an unexpected content type.`);
    }
    checks.push(`${path} is available`);
  }

  return {
    checks,
    failures,
    ok: failures.length === 0,
    service: "payshield-deployment-smoke",
    targetUrl: `${baseUrl.origin}${baseUrl.pathname === "/" ? "" : baseUrl.pathname}`,
  };
}

function usage() {
  return "Usage: npm run smoke:deploy -- https://your-domain.com [--timeout-ms 10000]";
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

  const timeoutMs = Number(flagValue(args, "--timeout-ms") || 10_000);
  const result = await runDeploySmoke({ targetUrl, timeoutMs });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Deployment smoke failed.");
    process.exit(1);
  });
}
