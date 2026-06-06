import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildWebhookTestCliOutput,
  createWaitlistWebhookTestPayload,
  sendSignedWebhookTest,
} from "../scripts/test-waitlist-webhook.mjs";
import { createWaitlistWebhookReceiver } from "../scripts/waitlist-webhook-receiver.mjs";

function listen(server: ReturnType<typeof createWaitlistWebhookReceiver>) {
  return new Promise<{ close: () => Promise<void>; url: string }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      assert(address && typeof address === "object");
      resolve({
        close: () => new Promise((done) => server.close(() => done())),
        url: `http://127.0.0.1:${address.port}/payshield-waitlist`,
      });
    });
  });
}

test("sends a signed webhook smoke payload to a receiver", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-waitlist-test-"));
  const secret = "receiver-secret";
  const server = createWaitlistWebhookReceiver({ dataDir, secret });
  const listener = await listen(server);
  const payload = createWaitlistWebhookTestPayload({
    email: "Smoke@Example.com",
    now: new Date("2026-06-05T00:00:00.000Z"),
  });

  try {
    const result = await sendSignedWebhookTest({
      payload,
      secret,
      url: listener.url,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 202);
    assert.match(
      payload.submissionId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.deepEqual(result.body, {
      duplicate: false,
      ok: true,
      email: "smoke@example.com",
      submissionId: payload.submissionId,
    });

    const ndjson = await readFile(join(dataDir, "waitlist.ndjson"), "utf8");
    const csv = await readFile(join(dataDir, "waitlist.csv"), "utf8");

    assert.match(ndjson, /"email":"smoke@example.com"/);
    assert.match(ndjson, new RegExp(`"submissionId":"${payload.submissionId}"`));
    assert.match(ndjson, /"source":"payshield-webhook-test"/);
    assert.match(ndjson, /"consentVersion":"product-onboarding-contact-consent-2026-06-06"/);
    assert.match(ndjson, /"termsVersion":"paycheck-planning-terms-2026-06-06"/);
    assert.match(ndjson, /"utmCampaign":"receiver-smoke"/);
    assert.match(csv, /"Signed webhook smoke test\. Safe to delete\."/);
    assert.match(csv, /"webhook-test","ops","receiver-smoke"/);
  } finally {
    await listener.close();
    await rm(dataDir, { recursive: true });
  }
});

test("replays a signed webhook smoke payload without duplicating receiver data", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-waitlist-test-"));
  const secret = "receiver-secret";
  const server = createWaitlistWebhookReceiver({ dataDir, secret });
  const listener = await listen(server);
  const payload = createWaitlistWebhookTestPayload({
    email: "Replay@Example.com",
    now: new Date("2026-06-05T00:00:00.000Z"),
  });

  try {
    const result = await sendSignedWebhookTest({
      payload,
      replay: true,
      secret,
      url: listener.url,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 202);
    assert.deepEqual(result.body, {
      duplicate: false,
      ok: true,
      email: "replay@example.com",
      submissionId: payload.submissionId,
    });
    assert.equal("replay" in result, true);

    const replay = (result as typeof result & {
      replay: { body: unknown; ok: boolean; status: number };
    }).replay;

    assert.equal(replay.ok, true);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, {
      duplicate: true,
      ok: true,
      email: "replay@example.com",
      submissionId: payload.submissionId,
    });

    const ndjson = await readFile(join(dataDir, "waitlist.ndjson"), "utf8");
    const csv = await readFile(join(dataDir, "waitlist.csv"), "utf8");

    assert.equal(ndjson.trim().split("\n").length, 1);
    assert.equal(csv.trim().split("\n").length, 2);
  } finally {
    await listener.close();
    await rm(dataDir, { recursive: true });
  }
});

test("requires a webhook signing secret before sending", async () => {
  await assert.rejects(
    sendSignedWebhookTest({
      secret: "",
      url: "https://example.com/payshield-waitlist",
    }),
    /PAYSHIELD_WAITLIST_WEBHOOK_SECRET is required/,
  );
});

test("redacts lead PII from webhook smoke CLI output", () => {
  const payload = createWaitlistWebhookTestPayload({
    email: "Cli-Smoke@Example.com",
    now: new Date("2026-06-05T00:00:00.000Z"),
  });
  const output = buildWebhookTestCliOutput(
    {
      body: {
        duplicate: false,
        email: "cli-smoke@example.com",
        message: "Signed webhook smoke test. Safe to delete.",
        nested: ["cli-smoke@example.com"],
        ok: true,
        submissionId: payload.submissionId,
      },
      ok: true,
      payload,
      replay: {
        body: {
          duplicate: true,
          email: "cli-smoke@example.com",
          name: "PayShield Webhook Smoke",
          ok: true,
          submissionId: payload.submissionId,
        },
        ok: true,
        payload,
        status: 200,
      },
      status: 202,
    },
    "https://receiver.example/payshield-waitlist",
  );
  const redactedOutput = output as typeof output & {
    replayStatus: number;
  };
  const serialized = JSON.stringify(output);

  assert.equal(output.ok, true);
  assert.equal(output.status, 202);
  assert.equal(redactedOutput.replayStatus, 200);
  assert.match(output.emailHash, /^[a-f0-9]{12}$/);
  assert.equal(serialized.includes("cli-smoke@example.com"), false);
  assert.equal(serialized.includes("PayShield Webhook Smoke"), false);
  assert.equal(serialized.includes("Signed webhook smoke test"), false);
});
