import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { generateUpstashReceiverEvidence } from "../scripts/upstash-receiver-evidence.mjs";
import { evaluateUpstashReceiverEvidenceFile } from "../scripts/check-upstash-receiver-evidence.mjs";

function emailHash(email: string) {
  return createHash("sha256")
    .update(email.toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function json(response: ServerResponse, status: number, body: unknown) {
  const serialized = JSON.stringify(body);

  response.writeHead(status, {
    "content-length": String(Buffer.byteLength(serialized)),
    "content-type": "application/json",
  });
  response.end(serialized);
}

async function startUpstashEvidenceTarget() {
  const prefix = "payshield:test";
  const records = new Map<string, Record<string, unknown>>();
  const submissions: string[] = [];
  const emailIndex = new Map<string, Set<string>>();
  let count = 0;
  let url = "";

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", url);

    if (requestUrl.pathname === "/api/health") {
      json(response, 200, {
        ok: true,
        service: "payshield-web-app",
        siteUrl: "https://payshield-lime.vercel.app",
        waitlist: {
          mode: "upstash",
          paidTrafficReady: true,
          storageConfigured: true,
        },
      });
      return;
    }

    if (requestUrl.pathname === "/api/waitlist" && request.method === "POST") {
      const payload = (await readJson(request)) as Record<string, unknown>;
      const submissionId = `submission-${(count += 1)}`;
      const email = String(payload.email);
      const createdAt = "2026-06-05T19:20:00.000Z";
      const record = {
        attribution: payload.attribution,
        consentText:
          "I agree that Grayston Technologies can contact me about PayShield onboarding and handle my information under the Privacy Notice and Terms.",
        consentedAt: createdAt,
        consentVersion: "grayston-product-onboarding-consent-2026-06-12",
        createdAt,
        email,
        message: payload.message,
        name: payload.name,
        privacyVersion: "paycheck-control-privacy-2026-06-12",
        segment: payload.segment,
        source: "payshield-web-app",
        submissionId,
        termsVersion: "paycheck-control-terms-2026-06-12",
      };
      const hash = emailHash(email);

      records.set(submissionId, record);
      submissions.push(submissionId);
      emailIndex.set(hash, new Set([...(emailIndex.get(hash) ?? []), submissionId]));
      json(response, 200, {
        message: "Pilot request received.",
        mode: "upstash",
        ok: true,
      });
      return;
    }

    if (requestUrl.pathname === "/multi-exec" && request.method === "POST") {
      const commands = (await readJson(request)) as unknown[][];
      const results = commands.map((command) => {
        const [name, key, arg1, arg2] = command.map(String);

        if (name === "ZREVRANGE" && key === `${prefix}:submissions`) {
          return {
            result: [...submissions].reverse().slice(Number(arg1), Number(arg2) + 1),
          };
        }

        if (name === "GET" && key.startsWith(`${prefix}:lead:`)) {
          const id = key.slice(`${prefix}:lead:`.length);

          return {
            result: records.has(id) ? JSON.stringify(records.get(id)) : null,
          };
        }

        if (name === "SISMEMBER" && key.startsWith(`${prefix}:email:`)) {
          const hash = key.slice(`${prefix}:email:`.length);

          return {
            result: emailIndex.get(hash)?.has(arg1) ? 1 : 0,
          };
        }

        return {
          error: "unsupported command",
        };
      });

      json(response, 200, results);
      return;
    }

    json(response, 404, { error: "not found" });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  assert(address && typeof address === "object");
  url = `http://127.0.0.1:${address.port}`;

  return {
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    prefix,
    url,
  };
}

test("generates redacted Upstash receiver evidence from production smoke storage", async () => {
  const target = await startUpstashEvidenceTarget();
  const token = "upstash-secret-token-value";

  try {
    const result = await generateUpstashReceiverEvidence({
      allowLocalHttp: true,
      deletionProcessDocumented: true,
      exportProcessDocumented: true,
      generatedAt: "2026-06-05T19:20:00.000Z",
      restUrlValue: target.url,
      reviewer: "Launch operator",
      siteUrl: "https://payshield-lime.vercel.app",
      storageOwner: "Revenue operations",
      storagePrefix: target.prefix,
      targetUrl: target.url,
      tokenValue: token,
    });
    const checked = evaluateUpstashReceiverEvidenceFile(result.evidence);
    const serialized = JSON.stringify(result);

    assert.equal(result.evidence.ok, true);
    assert.equal(result.validation.ok, true);
    assert.equal(checked.ok, true);
    assert.equal(result.evidence.durableStorage, true);
    assert.equal(result.evidence.storesConsentFields, true);
    assert.equal(result.evidence.storesSubmissionId, true);
    assert.equal(result.evidence.storesAttribution, true);
    assert.equal(result.evidence.storesEmailHashIndex, true);
    assert.equal(serialized.includes(token), false);
    assert.equal(serialized.includes(target.url), false);
    assert.equal(serialized.includes("@example.com"), false);
    assert.equal(serialized.includes("Upstash Evidence Probe"), false);
    assert.equal(serialized.includes("Automated Upstash evidence smoke test"), false);
  } finally {
    await target.close();
  }
});

test("keeps generated Upstash evidence closed until retention processes are documented", async () => {
  const target = await startUpstashEvidenceTarget();

  try {
    const result = await generateUpstashReceiverEvidence({
      allowLocalHttp: true,
      generatedAt: "2026-06-05T19:20:00.000Z",
      restUrlValue: target.url,
      reviewer: "Launch operator",
      siteUrl: "https://payshield-lime.vercel.app",
      storageOwner: "Revenue operations",
      storagePrefix: target.prefix,
      targetUrl: target.url,
      tokenValue: "upstash-secret-token-value",
    });
    const failedChecks = result.validation.checks
      .filter((check: { ok: boolean }) => !check.ok)
      .map((check: { name: string }) => check.name);

    assert.equal(result.evidence.ok, false);
    assert.equal(failedChecks.includes("upstashDeletionProcessDocumented"), true);
    assert.equal(failedChecks.includes("upstashExportProcessDocumented"), true);
  } finally {
    await target.close();
  }
});
