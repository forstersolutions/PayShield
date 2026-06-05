import { pathToFileURL } from "node:url";

const defaultTimeoutMs = 10_000;
const serviceName = "payshield-market-site";
const requiredHomeText = [
  "PayShield | Protected Paycheck OS",
  "Prototype ready for diligence",
  "Join the pilot list",
  "Prototype only. PayShield is not a bank.",
];
const publicCopyBannedPhrases = [
  "Vercel preview",
  "waitlist webhook",
  "Ship this frontend to Vercel",
  "Forward submissions to CRM",
  "Capture households",
  "Configure PAYSHIELD_WAITLIST_WEBHOOK_URL in Vercel",
];

function usage() {
  return [
    "Usage: npm run readiness:paid-traffic -- https://your-domain.com [--expect-site-url https://your-domain.com] [--allow-prototype] [--timeout-ms 10000]",
    "",
    "Default mode fails unless production lead capture is paid-traffic ready.",
    "--allow-prototype keeps the current prototype deploy auditable while warning about demo capture.",
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

  if (!targetUrl) {
    throw new Error("A production URL is required.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new Error("--timeout-ms must be a number between 1 and 60000.");
  }

  return {
    allowPrototype: args.includes("--allow-prototype"),
    expectedSiteUrl: flagValue(args, "--expect-site-url"),
    help: false,
    targetUrl,
    timeoutMs,
  };
}

export function normalizeSiteUrl(input) {
  const url = new URL(input);
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname}`;
}

function urlFor(baseUrl, path) {
  return new URL(path, `${baseUrl}/`).toString();
}

function getHeader(headers, name) {
  if (!headers) {
    return "";
  }

  if (typeof headers.get === "function") {
    return headers.get(name) ?? "";
  }

  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );

  return match ? String(match[1]) : "";
}

function record(collection, passed, message) {
  if (passed) {
    collection.checks.push(message);
  } else {
    collection.failures.push(message);
  }
}

function recordPaidTraffic(collection, passed, allowPrototype) {
  if (passed) {
    collection.checks.push(
      "/api/health reports paid-traffic-ready signed webhook capture",
    );
  } else if (allowPrototype) {
    collection.warnings.push(
      "/api/health does not report paid-traffic-ready signed webhook capture",
    );
  } else {
    collection.failures.push(
      "/api/health does not report paid-traffic-ready signed webhook capture",
    );
  }
}

/**
 * @param {{
 *   allowPrototype?: boolean;
 *   expectedSiteUrl?: string;
 *   health: Record<string, any>;
 *   homeBody: string;
 *   homeHeaders: Headers | Record<string, string>;
 *   privacyBody: string;
 *   termsBody: string;
 *   validationBody: Record<string, any>;
 *   validationStatus: number;
 * }} evidence
 */
export function evaluatePaidTrafficReadiness(evidence) {
  const result = {
    checks: [],
    failures: [],
    warnings: [],
  };
  const waitlist = evidence.health?.waitlist ?? {};
  const paidTrafficReady =
    waitlist.mode === "webhook" &&
    waitlist.webhookConfigured === true &&
    waitlist.webhookSigningConfigured === true &&
    waitlist.requireWebhook === true &&
    waitlist.paidTrafficReady === true;

  record(
    result,
    evidence.health?.service === serviceName,
    `/api/health reports service=${serviceName}`,
  );
  record(result, evidence.health?.ok === true, "/api/health reports ok=true");

  if (evidence.expectedSiteUrl) {
    record(
      result,
      evidence.health?.siteUrl === evidence.expectedSiteUrl,
      `/api/health siteUrl matches ${evidence.expectedSiteUrl}`,
    );
    record(
      result,
      evidence.homeBody.includes(`href="${evidence.expectedSiteUrl}`),
      `canonical metadata uses ${evidence.expectedSiteUrl}`,
    );
    record(
      result,
      evidence.homeBody.includes(
        `${evidence.expectedSiteUrl}/images/payshield-social-card.jpg`,
      ),
      "social image metadata uses the expected site URL",
    );
  }

  recordPaidTraffic(
    result,
    paidTrafficReady,
    evidence.allowPrototype,
  );

  for (const text of requiredHomeText) {
    record(result, evidence.homeBody.includes(text), `/ includes "${text}"`);
  }

  for (const phrase of publicCopyBannedPhrases) {
    record(
      result,
      !evidence.homeBody.includes(phrase),
      `/ does not expose public-copy banned phrase "${phrase}"`,
    );
  }

  record(
    result,
    getHeader(evidence.homeHeaders, "x-content-type-options") === "nosniff",
    "/ sends x-content-type-options=nosniff",
  );
  record(
    result,
    getHeader(evidence.homeHeaders, "referrer-policy") ===
      "strict-origin-when-cross-origin",
    "/ sends referrer-policy=strict-origin-when-cross-origin",
  );
  record(
    result,
    getHeader(evidence.homeHeaders, "x-frame-options") === "DENY",
    "/ sends x-frame-options=DENY",
  );
  record(
    result,
    getHeader(evidence.homeHeaders, "strict-transport-security") ===
      "max-age=31536000",
    "/ sends strict-transport-security=max-age=31536000",
  );

  const permissionsPolicy = getHeader(evidence.homeHeaders, "permissions-policy");
  for (const policy of ["camera=()", "microphone=()", "geolocation=()", "payment=()"]) {
    record(
      result,
      permissionsPolicy.includes(policy),
      `/ permissions-policy includes ${policy}`,
    );
  }

  record(
    result,
    evidence.privacyBody.includes("does not currently open deposit accounts"),
    "/privacy states the prototype does not open deposit accounts",
  );
  record(
    result,
    evidence.termsBody.includes("PayShield is not a bank."),
    "/terms states PayShield is not a bank",
  );
  record(
    result,
    evidence.validationStatus === 400 &&
      evidence.validationBody?.error === "Accept the pilot privacy and terms notice.",
    "/api/waitlist rejects missing consent without creating a persisted lead",
  );

  return {
    ...result,
    ok: result.failures.length === 0,
  };
}

async function fetchText(baseUrl, path, timeoutMs, init = {}) {
  const response = await fetch(urlFor(baseUrl, path), {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });

  return {
    body: await response.text(),
    headers: Object.fromEntries(response.headers.entries()),
    status: response.status,
  };
}

async function collectEvidence({ targetUrl, timeoutMs }) {
  const baseUrl = normalizeSiteUrl(targetUrl);
  const home = await fetchText(baseUrl, "/", timeoutMs);
  const privacy = await fetchText(baseUrl, "/privacy", timeoutMs);
  const terms = await fetchText(baseUrl, "/terms", timeoutMs);
  const health = await fetchText(baseUrl, "/api/health", timeoutMs);
  const validation = await fetchText(baseUrl, "/api/waitlist", timeoutMs, {
    body: JSON.stringify({
      consent: false,
      email: "readiness-validation@example.com",
      segment: "Household",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  return {
    baseUrl,
    health: JSON.parse(health.body),
    homeBody: home.body,
    homeHeaders: home.headers,
    privacyBody: privacy.body,
    termsBody: terms.body,
    validationBody: JSON.parse(validation.body),
    validationStatus: validation.status,
  };
}

function printResult({ baseUrl, result }) {
  console.log(`Paid traffic readiness audit for ${baseUrl}`);
  result.checks.forEach((check) => console.log(`PASS ${check}`));
  result.warnings.forEach((warning) => console.warn(`WARN ${warning}`));
  result.failures.forEach((failure) => console.error(`FAIL ${failure}`));
  console.log(
    JSON.stringify(
      {
        checks: result.checks.length,
        failures: result.failures,
        ok: result.ok,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  const evidence = await collectEvidence(args);
  const expectedSiteUrl = args.expectedSiteUrl
    ? normalizeSiteUrl(args.expectedSiteUrl)
    : "";
  const result = evaluatePaidTrafficReadiness({
    ...evidence,
    allowPrototype: args.allowPrototype,
    expectedSiteUrl,
  });

  printResult({ baseUrl: evidence.baseUrl, result });

  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Paid traffic readiness audit failed.",
    );
    process.exit(1);
  });
}
