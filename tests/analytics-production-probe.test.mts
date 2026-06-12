import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);

function send(
  response: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
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

async function startAnalyticsProbeTarget() {
  const submissions: unknown[] = [];
  const server = createServer(async (request, response) => {
    const siteUrl = `http://${request.headers.host}`;
    const url = new URL(request.url ?? "/", siteUrl);

    if (url.pathname === "/") {
      send(response, 200, "PayShield campaign landing", {
        "content-type": "text/html",
      });
      return;
    }

    if (url.pathname === "/api/health") {
      send(
        response,
        200,
        JSON.stringify({
          ok: true,
          service: "payshield-web-app",
          siteUrl,
          waitlist: {
            mode: "blob",
            paidTrafficReady: true,
            storageConfigured: true,
          },
        }),
        { "content-type": "application/json" },
      );
      return;
    }

    if (url.pathname === "/api/waitlist" && request.method === "POST") {
      submissions.push(JSON.parse(await readBody(request)));
      send(
        response,
        200,
        JSON.stringify({
          ok: true,
          mode: "blob",
          receiptId: "receipt_123",
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
    submissions,
    url: `http://127.0.0.1:${address.port}`,
  };
}

test("analytics production probe writes redacted dashboard-confirmation draft", async () => {
  const target = await startAnalyticsProbeTarget();
  const dir = await mkdtemp(join(tmpdir(), "payshield-analytics-probe-"));
  const output = join(dir, "analytics-evidence.json");

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "scripts/analytics-production-probe.mjs",
        target.url,
        "--expect-site-url",
        target.url,
        "--output",
        output,
        "--skip-vercel-metrics",
        "--require-paid-traffic-ready",
      ],
      {
        cwd: process.cwd(),
      },
    );
    const evidence = JSON.parse(await readFile(output, "utf8"));
    const serialized = `${stdout}\n${JSON.stringify(evidence)}`;

    assert.equal(evidence.ok, false);
    assert.equal(evidence.productionUrl, target.url);
    assert.equal(evidence.probe.healthOk, true);
    assert.equal(evidence.probe.durableCapture, true);
    assert.equal(evidence.probe.productInquiryApiSubmitted, true);
    assert.equal(evidence.probe.receiptIdRecorded, true);
    assert.equal(evidence.probe.speedInsightsMetrics.status, "skipped");
    assert.equal(evidence.webAnalyticsPilotConversions, false);
    assert.equal(evidence.sanitizedCampaignMetadata, false);
    assert.equal(evidence.probe.campaign.campaignSource, "analytics-probe");
    assert.equal(target.submissions.length, 1);
    assert.doesNotMatch(serialized, /analytics-probe\+\d+@example\.com/);
    assert.doesNotMatch(serialized, /PayShield Analytics Probe/);
    assert.doesNotMatch(serialized, /Automated analytics evidence probe/);
    assert.doesNotMatch(serialized, /receipt_123/);
    assert.match(stdout, /dashboardConfirmationRequired/);
  } finally {
    await target.close();
    await rm(dir, { force: true, recursive: true });
  }
});
