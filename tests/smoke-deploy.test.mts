import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);

const securityHeaders = {
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

function html(siteUrl: string) {
  return [
    "<html><head>",
    `<link rel="canonical" href="${siteUrl}/">`,
    `<meta property="og:image" content="${siteUrl}/images/payshield-social-card.jpg">`,
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<link rel="icon" href="/icon.svg">',
    "</head><body>",
    "PayShield by Grayston | Paycheck Control App",
    "/manifest.webmanifest",
    "/icon.svg",
    "payshield-social-card.jpg",
    "Safe to Spend",
    "Paycheck control software by Grayston Technologies.",
    "Bucket control studio",
    "Bill routing",
    "Provider readiness",
    "support@graystontechnologies.com",
    "</body></html>",
  ].join("");
}

function send(
  response: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    ...securityHeaders,
    "content-length": String(Buffer.byteLength(body)),
    ...headers,
  });
  response.end(body);
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function startSmokeTarget() {
  const server = createServer(async (request, response) => {
    const siteUrl = `http://${request.headers.host}`;
    const url = new URL(request.url ?? "/", siteUrl);

    if (url.pathname === "/") {
      send(response, 200, html(siteUrl), { "content-type": "text/html" });
      return;
    }

    if (url.pathname === "/privacy") {
      send(
        response,
        200,
        [
          "Privacy Notice",
          "PayShield is operated by Grayston Technologies.",
          "utm_source",
          "Vercel Web Analytics",
          "does not send email addresses, names, bank details",
          "free-text financial notes to analytics",
          "support@graystontechnologies.com",
        ].join("\n"),
        { "content-type": "text/html" },
      );
      return;
    }

    if (url.pathname === "/terms") {
      send(
        response,
        200,
        [
          "Terms",
          "Provider-enabled services",
          "Account opening, card controls, and money movement stay locked until approved provider credentials, disclosures, and operating controls are active.",
        ].join("\n"),
        { "content-type": "text/html" },
      );
      return;
    }

    if (url.pathname === "/robots.txt") {
      send(response, 200, `User-Agent: *\nSitemap: ${siteUrl}/sitemap.xml`, {
        "content-type": "text/plain",
      });
      return;
    }

    if (url.pathname === "/sitemap.xml") {
      send(
        response,
        200,
        `${siteUrl}\n${siteUrl}/privacy\n${siteUrl}/terms`,
        { "content-type": "application/xml" },
      );
      return;
    }

    if (url.pathname === "/.well-known/security.txt") {
      send(
        response,
        200,
        [
          "Contact: mailto:support@graystontechnologies.com",
          "Policy: https://github.com/forstersolutions/PayShield/security/policy",
          "Preferred-Languages: en",
          `Canonical: ${siteUrl}/.well-known/security.txt`,
          "Expires: 2027-06-05T00:00:00.000Z",
        ].join("\n"),
        { "content-type": "text/plain" },
      );
      return;
    }

    if (url.pathname === "/manifest.webmanifest") {
      send(response, 200, '{"name":"PayShield","icons":[{"src":"/icon.svg"}]}', {
        "content-type": "application/manifest+json",
      });
      return;
    }

    if (url.pathname === "/icon.svg") {
      send(response, 200, "<svg></svg>", { "content-type": "image/svg+xml" });
      return;
    }

    if (url.pathname === "/images/payshield-social-card.jpg") {
      send(response, 200, "jpg", { "content-type": "image/jpeg" });
      return;
    }

    if (url.pathname === "/api/health") {
      send(
        response,
        200,
        JSON.stringify({
          ok: true,
          service: "payshield-web-app",
          waitlist: {
            mode: "upstash",
            paidTrafficReady: true,
            storageConfigured: true,
          },
        }),
        { "content-type": "application/json" },
      );
      return;
    }

    if (url.pathname === "/api/waitlist" && request.method === "POST") {
      const payload = JSON.parse(await readBody(request)) as { consent?: boolean };

      if (payload.consent !== true) {
        send(
          response,
          400,
          JSON.stringify({ error: "Accept the privacy and terms notice." }),
          { "content-type": "application/json" },
        );
        return;
      }

      send(response, 200, JSON.stringify({ ok: true, mode: "upstash" }), {
        "content-type": "application/json",
      });
      return;
    }

    if (url.pathname === "/api/app/bill-payments" && request.method === "POST") {
      send(
        response,
        200,
        JSON.stringify({
          decision: {
            accepted: true,
            bucketId: "rent",
            providerStatus: "blocked",
          },
        }),
        { "content-type": "application/json" },
      );
      return;
    }

    send(response, 404, "Not found", { "content-type": "text/plain" });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  assert(address && typeof address === "object");

  return {
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    url: `http://127.0.0.1:${address.port}`,
  };
}

test("post-deploy smoke accepts Upstash durable submit mode", async () => {
  const target = await startSmokeTarget();

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "scripts/smoke-deploy.mjs",
        target.url,
        "--expect-site-url",
        target.url,
        "--submit-test",
        "--require-webhook",
      ],
      {
        cwd: process.cwd(),
      },
    );

    assert.match(stdout, /Deploy smoke checks passed/);
    assert.match(stdout, /with submit test/);
  } finally {
    await target.close();
  }
});
