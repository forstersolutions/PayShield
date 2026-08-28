import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { test } from "node:test";
import { normalizeUrl, runDeploySmoke } from "../scripts/smoke-deploy.mjs";

const headers = {
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function send(
  response: ServerResponse,
  status: number,
  body: string,
  contentType = "text/html",
) {
  response.writeHead(status, { ...headers, "content-type": contentType });
  response.end(body);
}

async function target({ searchFallback = false } = {}) {
  const server = createServer((request, response) => {
    const path = new URL(request.url || "/", "http://localhost").pathname;

    if (path === "/") return send(response, 200, "PayShield Safe to Spend support@graystontechnologies.com");
    if (path === "/privacy") return send(response, 200, "Privacy Grayston Technologies support@graystontechnologies.com");
    if (path === "/terms") return send(response, 200, "Terms Grayston Technologies support@graystontechnologies.com");
    if (path === "/support") return send(response, 200, "Support Delete account support@graystontechnologies.com");
    if (path === "/download") {
      const userAgent = request.headers["user-agent"] || "";
      const location = /android/i.test(userAgent)
        ? searchFallback
          ? "https://play.google.com/store/search?q=PayShield&c=apps"
          : "https://play.google.com/store/apps/details?id=com.graystontechnologies.payshield"
        : searchFallback
          ? "https://apps.apple.com/us/search?term=PayShield"
          : "https://apps.apple.com/us/app/payshield/id123456789";
      response.writeHead(307, { ...headers, location });
      return response.end();
    }
    if (path === "/.well-known/apple-app-site-association") {
      return send(response, 200, JSON.stringify({ applinks: { details: [{ appIDs: ["PT89VGZ28C.com.graystontechnologies.payshield"] }] } }), "application/json");
    }
    if (path === "/.well-known/assetlinks.json") return send(response, 200, "[]", "application/json");
    if (path === "/api/health") return send(response, 200, JSON.stringify({ ok: true, service: "payshield-web-app", status: "healthy" }), "application/json");
    if (path === "/api/public/billing/status") return send(response, 200, JSON.stringify({ available: true, membership: { priceLabel: "$19/month" }, service: "payshield-membership-status", status: "available" }), "application/json");
    if (path === "/api/app/me") return send(response, 401, "{}", "application/json");
    if (path === "/api/app/billing/revenuecat/webhook") return send(response, 401, JSON.stringify({ service: "payshield-revenuecat-webhook" }), "application/json");
    if (path === "/api/waitlist") return send(response, 404, "not found", "text/plain");
    if (path === "/favicon.ico") return send(response, 200, "icon", "image/png");
    if (path === "/icon.svg") return send(response, 200, "<svg/>", "image/svg+xml");
    if (path === "/apple-icon.png") return send(response, 200, "png", "image/png");
    if (path === "/images/payshield-social-card.jpg") return send(response, 200, "jpg", "image/jpeg");
    if (path === "/manifest.webmanifest") return send(response, 200, "{}", "application/manifest+json");
    if (path === "/.well-known/security.txt" || path === "/robots.txt") return send(response, 200, "PayShield", "text/plain");
    if (path === "/sitemap.xml") return send(response, 200, "<xml/>", "application/xml");
    return send(response, 404, "not found", "text/plain");
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server failed");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test("normalizes deployment URLs and rejects credentials", () => {
  assert.equal(normalizeUrl("https://example.com/path/").toString(), "https://example.com/path");
  assert.throws(() => normalizeUrl("https://user:pass@example.com"), /without credentials/);
});

test("deployment smoke verifies the release surface without submitting data", async () => {
  const fixture = await target();

  try {
    const result = await runDeploySmoke({ targetUrl: fixture.url });
    assert.equal(result.ok, true, result.failures.join("\n"));
    assert.equal(result.failures.length, 0);
    assert.equal(result.checks.includes("obsolete intake route is absent"), true);
  } finally {
    fixture.server.close();
  }
});

test("deployment smoke rejects store search fallbacks", async () => {
  const fixture = await target({ searchFallback: true });

  try {
    const result = await runDeploySmoke({ targetUrl: fixture.url });
    assert.equal(result.ok, false);
    assert.equal(
      result.failures.some((failure) => failure.includes("direct apps.apple.com")),
      true,
    );
    assert.equal(
      result.failures.some((failure) => failure.includes("direct play.google.com")),
      true,
    );
  } finally {
    fixture.server.close();
  }
});
