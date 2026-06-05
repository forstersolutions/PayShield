import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseDockerPortOutput,
  summarizeDockerReceiverSmoke,
} from "../scripts/smoke-docker-receiver.mjs";

test("parses Docker port mappings into a localhost URL", () => {
  assert.deepEqual(parseDockerPortOutput("127.0.0.1:49211\n"), {
    host: "127.0.0.1",
    port: 49211,
    url: "http://127.0.0.1:49211",
  });
  assert.deepEqual(parseDockerPortOutput("0.0.0.0:49212\n"), {
    host: "127.0.0.1",
    port: 49212,
    url: "http://127.0.0.1:49212",
  });
});

test("rejects unparseable Docker port output", () => {
  assert.throws(
    () => parseDockerPortOutput("not-a-port"),
    /Unable to parse Docker port output/,
  );
});

test("summarizes Docker receiver smoke output without PII or secrets", () => {
  const result = summarizeDockerReceiverSmoke({
    checks: [
      "Dockerfile.receiver builds successfully",
      "container accepts signed payload and idempotent replay",
    ],
    eraseDryRun: {
      dryRun: true,
      emailHash: "025af00cf03d",
      remaining: 0,
      removed: 1,
    },
    health: {
      ok: true,
      service: "payshield-waitlist-receiver",
    },
    image: "payshield-waitlist-receiver:ci-smoke",
    summary: {
      byCampaign: {
        "receiver-smoke": 1,
      },
      byCampaignSource: {
        "webhook-test": 1,
      },
      bySegment: {
        Operations: 1,
      },
      files: {
        csv: true,
        ndjson: true,
      },
      firstReceivedAt: "2026-06-05T00:00:00.000Z",
      lastReceivedAt: "2026-06-05T00:00:00.000Z",
      malformedLines: [],
      ok: true,
      total: 1,
    },
    webhookResult: {
      body: {
        duplicate: false,
        email: "docker-smoke@example.com",
        ok: true,
      },
      ok: true,
      payload: {
        email: "docker-smoke@example.com",
      },
      replay: {
        body: {
          duplicate: true,
          email: "docker-smoke@example.com",
          ok: true,
        },
        ok: true,
        status: 200,
      },
      status: 202,
    },
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.ok, true);
  assert.equal(result.webhook.firstStatus, 202);
  assert.equal(result.webhook.replayStatus, 200);
  assert.equal(result.webhook.replayDuplicate, true);
  assert.equal(serialized.includes("docker-smoke@example.com"), false);
  assert.equal(serialized.includes("PAYSHIELD_WAITLIST_WEBHOOK_SECRET"), false);
});
