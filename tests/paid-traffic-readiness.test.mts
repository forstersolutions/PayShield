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
  <title>PayShield | Protected Paycheck OS</title>
  <link rel="canonical" href="https://payshield-lime.vercel.app" />
  <meta property="og:image" content="https://payshield-lime.vercel.app/images/payshield-social-card.jpg" />
  <main>
    <h2>Prototype ready for diligence</h2>
    <p>Join the pilot list or start a partner conversation.</p>
    <p>Prototype only. PayShield is not a bank.</p>
  </main>
`;

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    allowPrototype: false,
    expectedSiteUrl,
    health: {
      ok: true,
      service: "payshield-market-site",
      siteUrl: expectedSiteUrl,
      waitlist: {
        mode: "webhook",
        paidTrafficReady: true,
        requireWebhook: true,
        webhookConfigured: true,
      },
    },
    homeBody,
    homeHeaders,
    privacyBody: "PayShield does not currently open deposit accounts.",
    termsBody: "PayShield is not a bank.",
    validationBody: { error: "Accept the pilot privacy and terms notice." },
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

test("fails demo capture in paid-traffic mode", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      health: {
        ok: true,
        service: "payshield-market-site",
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
    /paid-traffic-ready webhook capture/,
  );
});

test("allows prototype mode while warning about demo capture", () => {
  const result = evaluatePaidTrafficReadiness(
    evidence({
      allowPrototype: true,
      health: {
        ok: true,
        service: "payshield-market-site",
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

  assert.equal(result.ok, true);
  assert.equal(result.failures.length, 0);
  assert.match(
    result.warnings.join("\n"),
    /paid-traffic-ready webhook capture/,
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
