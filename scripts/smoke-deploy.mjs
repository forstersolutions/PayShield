const [targetUrl, ...flags] = process.argv.slice(2);
const submitTestLead = flags.includes("--submit-test");
const timeoutMs = 10_000;
const failures = [];

if (!targetUrl) {
  console.error("Usage: npm run smoke:deploy -- https://your-domain.com [--submit-test]");
  process.exit(1);
}

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

  return body;
}

async function expectAsset(path, expectedType, maxBytes) {
  const response = await expectStatus(path, 200, { method: "HEAD" });
  const contentType = response.headers.get("content-type") ?? "";
  const contentLength = Number(response.headers.get("content-length") ?? 0);

  if (!contentType.includes(expectedType)) {
    failures.push(`${path} content-type is ${contentType}; expected ${expectedType}`);
  }

  if (!contentLength || contentLength > maxBytes) {
    failures.push(`${path} content-length is ${contentLength}; expected <= ${maxBytes}`);
  }
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

async function submitLead() {
  const response = await expectStatus("/api/waitlist", 200, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
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
}

try {
  await expectText("/", [
    "PayShield | Protected Paycheck OS",
    "/manifest.webmanifest",
    "/icon.svg",
    "payshield-social-card.jpg",
    "payshield-product-mockup.avif",
    "Request pilot access",
    "Prototype only. PayShield is not a bank.",
  ]);
  await expectText("/privacy", [
    "Privacy Notice",
    "does not currently open deposit accounts",
  ]);
  await expectText("/terms", [
    "Terms",
    "PayShield is not a bank.",
  ]);
  await expectText("/robots.txt", ["User-Agent: *", "Sitemap:"]);
  await expectText("/sitemap.xml", ["/privacy", "/terms"]);
  await expectText("/manifest.webmanifest", ["PayShield", "/icon.svg"]);
  await expectAsset("/icon.svg", "image/svg+xml", 5_000);
  await expectAsset("/images/payshield-social-card.jpg", "image/jpeg", 250_000);
  await expectAsset("/images/payshield-product-mockup.avif", "image/avif", 125_000);
  await checkWaitlistValidation();

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
