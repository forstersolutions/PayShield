import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluatePaidTrafficReadiness } from "../scripts/paid-traffic-readiness.mjs";

const expectedSiteUrl = "https://payshield-lime.vercel.app";
const homeHeaders = {
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};
const homeBody = `
  <title>PayShield | Paycheck Planning App</title>
  <link rel="canonical" href="https://payshield-lime.vercel.app" />
  <meta property="og:image" content="https://payshield-lime.vercel.app/images/payshield-social-card.jpg" />
  <main>
    <h1>Your paycheck gets an airlock before spending gets a vote.</h1>
    <p>Export plan.</p>
    <p>Open PayShield. Build the usable number. Export the household plan.</p>
  </main>
`;

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    allowDemoCapture: false,
    expectedSiteUrl,
    health: {
      ok: true,
      service: "payshield-web-app",
      siteUrl: expectedSiteUrl,
      waitlist: {
        mode: "webhook",
        paidTrafficReady: true,
        requireWebhook: true,
        webhookConfigured: true,
        webhookSigningConfigured: true,
      },
    },
    homeBody,
    homeHeaders,
    privacyBody: [
      "PayShield does not currently open deposit accounts.",
      "Campaign links may add allowlisted attribution fields such as utm_source and utm_campaign.",
      "Vercel Web Analytics and Speed Insights may process non-PII event metadata.",
      "PayShield does not send email addresses, names, bank details, or free-text financial notes to analytics.",
    ].join(" "),
    securityBody: [
      "Contact: https://github.com/forstersolutions/PayShield/security/advisories/new",
      "Policy: https://github.com/forstersolutions/PayShield/security/policy",
      "Canonical: https://payshield-lime.vercel.app/.well-known/security.txt",
    ].join("\n"),
    termsBody: "PayShield is not a bank.",
    validationBody: { error: "Accept the privacy and terms notice." },
    validationStatus: 400,
    ...overrides,
  };
}

test("passes when production webhook capture is paid-traffic ready", () => {
  const result = evaluatePaidTrafficReadiness(evidence());

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
  assert.equal(result.warnings.length, 0);
});

test("passes when production Upstash capture is paid-traffic ready", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      health: {
        ok: true,
        service: "payshield-web-app",
        siteUrl: expectedSiteUrl,
        waitlist: {
          mode: "upstash",
          paidTrafficReady: true,
          requireWebhook: true,
          storageConfigured: true,
          storageProvider: "upstash",
          webhookConfigured: false,
          webhookSigningConfigured: false,
        },
      },
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
});

test("passes when production Blob capture is paid-traffic ready", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      health: {
        ok: true,
        service: "payshield-web-app",
        siteUrl: expectedSiteUrl,
        waitlist: {
          mode: "blob",
          paidTrafficReady: true,
          requireWebhook: true,
          storageConfigured: true,
          storageProvider: "blob",
          webhookConfigured: false,
          webhookSigningConfigured: false,
        },
      },
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
});

test("fails demo capture in paid-traffic mode", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      health: {
        ok: true,
        service: "payshield-web-app",
        siteUrl: expectedSiteUrl,
        waitlist: {
          mode: "demo",
          paidTrafficReady: false,
          requireWebhook: false,
          webhookConfigured: false,
        },
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /paid-traffic-ready durable lead capture/,
  );
});

test("fails unsigned webhook capture in paid-traffic mode", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      health: {
        ok: false,
        service: "payshield-web-app",
        siteUrl: expectedSiteUrl,
        waitlist: {
          mode: "webhook",
          paidTrafficReady: false,
          requireWebhook: true,
          webhookConfigured: true,
          webhookSigningConfigured: false,
        },
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /paid-traffic-ready durable lead capture/,
  );
});

test("fails misconfigured webhook capture in paid-traffic mode", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      health: {
        ok: false,
        service: "payshield-web-app",
        siteUrl: expectedSiteUrl,
        waitlist: {
          mode: "webhook",
          paidTrafficReady: false,
          requireWebhook: true,
          webhookConfigured: true,
          webhookEndpointConfigured: false,
          webhookMisconfigured: true,
          webhookSigningConfigured: true,
        },
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.match(
    result.failures.join("\n"),
    /paid-traffic-ready durable lead capture/,
  );
});

test("allows demo-capture mode while warning about demo capture", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      allowDemoCapture: true,
      health: {
        ok: true,
        service: "payshield-web-app",
        siteUrl: expectedSiteUrl,
        waitlist: {
          mode: "demo",
          paidTrafficReady: false,
          requireWebhook: false,
          webhookConfigured: false,
          webhookSigningConfigured: false,
        },
      },
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
  assert.match(
    result.warnings.join("\n"),
    /paid-traffic-ready durable lead capture/,
  );
});

test("rejects operator-facing copy on the public page", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      homeBody: `${homeBody} waitlist webhook`,
    }),
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /waitlist webhook/);
});

test("requires public security disclosure metadata", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      securityBody: "Contact: https://example.com/security",
    }),
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /security\.txt/);
});

test("requires privacy disclosure for attribution and analytics", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      privacyBody: "PayShield does not currently open deposit accounts.",
    }),
  );

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /privacy/);
  assert.match(result.failures.join("\n"), /analytics|attribution/i);
});
