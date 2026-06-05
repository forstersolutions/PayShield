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
    backup: {
      audit: {
        ok: true,
        summary: {
          total: 1,
        },
      },
      backupId: "waitlist-backup-2026-06-05T00-00-00-000Z",
      copiedFiles: ["waitlist.ndjson", "waitlist.csv"],
      generatedAt: "2026-06-05T00:00:00.000Z",
      ok: true,
    },
    checks: [
      "Dockerfile.receiver builds successfully",
      "container accepts signed payload and idempotent replay",
      "mounted receiver data audit verifies file integrity and metadata",
      "mounted receiver data backup creates a redacted manifest",
    ],
    dataAudit: {
      allowEmpty: false,
      attribution: {
        recordsWithAttribution: 1,
        recordsWithCampaign: 1,
        recordsWithCampaignSource: 1,
        recordsWithLandingPath: 1,
      },
      csv: {
        exists: true,
        expectedRows: 1,
        headerOk: true,
        rowCount: 1,
        rowCountMatches: true,
      },
      duplicateSubmissionIds: 0,
      files: {
        csv: {
          bytes: 500,
          exists: true,
          sha256:
            "1111111111111111111111111111111111111111111111111111111111111111",
        },
        ndjson: {
          bytes: 350,
          exists: true,
          sha256:
            "2222222222222222222222222222222222222222222222222222222222222222",
        },
      },
      findings: [],
      malformedLines: [],
      missingRequired: {
        consentText: 0,
        consentedAt: 0,
        consentVersion: 0,
        createdAt: 0,
        email: 0,
        privacyVersion: 0,
        receivedAt: 0,
        segment: 0,
        source: 0,
        submissionId: 0,
        termsVersion: 0,
      },
      ok: true,
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
    },
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
  assert.equal(result.backup.ok, true);
  assert.equal(result.backup.copiedFiles.includes("waitlist.ndjson"), true);
  assert.equal(result.dataAudit.ok, true);
  assert.equal(result.dataAudit.files.ndjson.sha256.length, 64);
  assert.equal(serialized.includes("docker-smoke@example.com"), false);
  assert.equal(serialized.includes("PAYSHIELD_WAITLIST_WEBHOOK_SECRET"), false);
});
