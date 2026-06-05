const args = process.argv.slice(2);
const targetUrl = args.find((arg) => !arg.startsWith("--"));
const submitTestLead = args.includes("--submit-test");
const requireWebhook = args.includes("--require-webhook");
const timeoutMs = 10_000;
const failures = [];

if (!targetUrl) {
  console.error(
    "Usage: npm run smoke:deploy -- https://your-domain.com [--expect-site-url https://your-domain.com] [--submit-test] [--require-webhook]",
  );
  process.exit(1);
}

if (requireWebhook && !submitTestLead) {
  console.error("--require-webhook must be used with --submit-test.");
  process.exit(1);
}

function flagValue(name) {
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

const expectedSiteUrlInput = flagValue("--expect-site-url");

let baseUrl;

try {
  baseUrl = new URL(targetUrl);
  baseUrl.hash = "";
  baseUrl.search = "";
  baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, "");
} catch {
  console.error(`Invalid URL: ${targetUrl}`);
  process.exit(1);
}

let expectedSiteUrl = "";

if (expectedSiteUrlInput) {
  try {
    const url = new URL(expectedSiteUrlInput);
    const pathname = url.pathname.replace(/\/+$/, "");
    expectedSiteUrl = `${url.origin}${pathname}`;
  } catch {
    console.error(`Invalid --expect-site-url: ${expectedSiteUrlInput}`);
    process.exit(1);
  }
}

function urlFor(path) {
  return new URL(path, `${baseUrl.origin}${baseUrl.pathname || "/"}`).toString();
}

async function request(path, init = {}) {
  return fetch(urlFor(path), {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function expectStatus(path, expectedStatus, init = {}) {
  const response = await request(path, init);

  if (response.status !== expectedStatus) {
    failures.push(`${path} returned ${response.status}; expected ${expectedStatus}`);
  }

  return response;
}

async function expectText(path, requiredText) {
  const response = await expectStatus(path, 200);
  const body = await response.text();

  for (const text of requiredText) {
    if (!body.includes(text)) {
      failures.push(`${path} is missing required text: ${text}`);
    }
  }

  return { body, response };
}

async function expectAsset(path, expectedType, maxBytes) {
  let response = await expectStatus(path, 200, { method: "HEAD" });
  let contentType = response.headers.get("content-type") ?? "";
  let contentLength = Number(response.headers.get("content-length") ?? 0);

  if (!contentType.includes(expectedType) || !contentLength) {
    response = await expectStatus(path, 200);
    contentType = response.headers.get("content-type") ?? contentType;
    contentLength =
      Number(response.headers.get("content-length") ?? 0) ||
      (await response.arrayBuffer()).byteLength;
  }

  if (!contentType.includes(expectedType)) {
    failures.push(`${path} content-type is ${contentType}; expected ${expectedType}`);
  }

  if (!contentLength || contentLength > maxBytes) {
    failures.push(`${path} content-length is ${contentLength}; expected <= ${maxBytes}`);
  }
}

async function expectMissingAsset(path) {
  await expectStatus(path, 404, { method: "HEAD" });
}

async function checkWaitlistValidation() {
  const response = await expectStatus("/api/waitlist", 400, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "smoke-validation@example.com",
      segment: "Household",
      consent: false,
    }),
  });
  const body = await response.json().catch(() => ({}));

  if (body.error !== "Accept the pilot privacy and terms notice.") {
    failures.push("/api/waitlist consent validation returned an unexpected body");
  }
}

async function checkHealth() {
  const response = await expectStatus("/api/health", 200);
  const body = await response.json().catch(() => ({}));

  if (body.service !== "payshield-market-site") {
    failures.push("/api/health returned an unexpected service name");
  }

  if (body.ok !== true) {
    failures.push("/api/health did not report ok=true");
  }

  if (!["demo", "webhook"].includes(String(body.waitlist?.mode))) {
    failures.push("/api/health returned an unexpected waitlist mode");
  }

  if (requireWebhook && body.waitlist?.paidTrafficReady !== true) {
    failures.push(
      "/api/health does not report paid-traffic-ready signed waitlist capture",
    );
  }

  if (requireWebhook && body.waitlist?.webhookSigningConfigured !== true) {
    failures.push("/api/health does not report signed webhook configuration");
  }
}

function expectHeader(response, path, name, expectedValue) {
  const actual = response.headers.get(name);

  if (actual !== expectedValue) {
    failures.push(
      `${path} ${name} header is ${actual || "missing"}; expected ${expectedValue}`,
    );
  }
}

function expectHeaderIncludes(response, path, name, expectedParts) {
  const actual = response.headers.get(name) ?? "";

  for (const part of expectedParts) {
    if (!actual.includes(part)) {
      failures.push(`${path} ${name} header is missing ${part}`);
    }
  }
}

function expectSecurityHeaders(response, path) {
  expectHeader(response, path, "x-content-type-options", "nosniff");
  expectHeader(response, path, "referrer-policy", "strict-origin-when-cross-origin");
  expectHeader(response, path, "x-frame-options", "DENY");
  expectHeader(response, path, "strict-transport-security", "max-age=31536000");
  expectHeaderIncludes(response, path, "permissions-policy", [
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
  ]);
}

function expectConfiguredSiteUrl(homeBody, robotsBody, sitemapBody, securityBody) {
  if (!expectedSiteUrl) {
    return;
  }

  const canonicalHref = `href="${expectedSiteUrl}/"`;
  const canonicalHrefWithoutSlash = `href="${expectedSiteUrl}"`;

  if (
    !homeBody.includes(canonicalHref) &&
    !homeBody.includes(canonicalHrefWithoutSlash)
  ) {
    failures.push(
      `/ canonical metadata does not match --expect-site-url ${expectedSiteUrl}`,
    );
  }

  if (
    !homeBody.includes(`${expectedSiteUrl}/images/payshield-social-card.jpg`)
  ) {
    failures.push(
      `/ social image metadata does not use --expect-site-url ${expectedSiteUrl}`,
    );
  }

  for (const path of ["", "/privacy", "/terms"]) {
    const expectedEntry = `${expectedSiteUrl}${path}`;

    if (!sitemapBody.includes(expectedEntry)) {
      failures.push(`/sitemap.xml is missing ${expectedEntry}`);
    }
  }

  if (!robotsBody.includes(`Sitemap: ${expectedSiteUrl}/sitemap.xml`)) {
    failures.push(`/robots.txt sitemap does not use ${expectedSiteUrl}`);
  }

  if (!securityBody.includes(`Canonical: ${expectedSiteUrl}/.well-known/security.txt`)) {
    failures.push(
      `/.well-known/security.txt canonical does not use ${expectedSiteUrl}`,
    );
  }
}

async function submitLead() {
  const response = await expectStatus("/api/waitlist", 200, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      attribution: {
        landingPath: "/",
        utmCampaign: "deploy-smoke",
        utmMedium: "ops",
        utmSource: "smoke-test",
      },
      email: `smoke+${Date.now()}@example.com`,
      name: "Deploy Smoke Test",
      segment: "Investor or partner",
      message: "Automated post-deploy smoke test.",
      consent: true,
    }),
  });
  const body = await response.json().catch(() => ({}));

  if (body.ok !== true || !["demo", "webhook"].includes(String(body.mode))) {
    failures.push("/api/waitlist submit test returned an unexpected body");
  }

  if (requireWebhook && body.mode !== "webhook") {
    failures.push(
      `/api/waitlist submit test returned mode ${String(
        body.mode ?? "missing",
      )}; expected webhook`,
    );
  }
}

try {
  const home = await expectText("/", [
    "PayShield | Protected Paycheck OS",
    "/manifest.webmanifest",
    "/icon.svg",
    "payshield-social-card.jpg",
    "payshield-product-mockup.avif",
    "Request pilot access",
    "Prototype only. PayShield is not a bank.",
  ]);
  expectSecurityHeaders(home.response, "/");

  await expectText("/privacy", [
    "Privacy Notice",
    "does not currently open deposit accounts",
  ]);
  await expectText("/terms", [
    "Terms",
    "PayShield is not a bank.",
  ]);
  const robots = await expectText("/robots.txt", ["User-Agent: *", "Sitemap:"]);
  const sitemap = await expectText("/sitemap.xml", ["/privacy", "/terms"]);
  const security = await expectText("/.well-known/security.txt", [
    "Contact: https://github.com/forstersolutions/PayShield/security/advisories/new",
    "Policy: https://github.com/forstersolutions/PayShield/security/policy",
    "Preferred-Languages: en",
    "Canonical:",
    "Expires:",
  ]);
  await expectText("/manifest.webmanifest", ["PayShield", "/icon.svg"]);
  await expectAsset("/icon.svg", "image/svg+xml", 5_000);
  await expectAsset("/images/payshield-social-card.jpg", "image/jpeg", 250_000);
  await expectAsset("/images/payshield-product-mockup.avif", "image/avif", 125_000);
  await expectMissingAsset("/file.svg");
  await expectMissingAsset("/globe.svg");
  await expectMissingAsset("/next.svg");
  await expectMissingAsset("/vercel.svg");
  await expectMissingAsset("/window.svg");
  await checkHealth();
  await checkWaitlistValidation();
  expectConfiguredSiteUrl(home.body, robots.body, sitemap.body, security.body);

  if (submitTestLead) {
    await submitLead();
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : "Unknown smoke-test failure");
}

if (failures.length) {
  console.error(`Deploy smoke checks failed for ${baseUrl.origin}${baseUrl.pathname}:`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Deploy smoke checks passed for ${baseUrl.origin}${baseUrl.pathname}${
    submitTestLead ? " with submit test" : ""
  }.`,
);
