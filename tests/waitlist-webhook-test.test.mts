import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
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
    assert.deepEqual(result.body, { ok: true, email: "smoke@example.com" });

    const ndjson = await readFile(join(dataDir, "waitlist.ndjson"), "utf8");
    const csv = await readFile(join(dataDir, "waitlist.csv"), "utf8");

    assert.match(ndjson, /"email":"smoke@example.com"/);
    assert.match(ndjson, /"source":"payshield-webhook-test"/);
    assert.match(ndjson, /"consentVersion":"pilot-contact-consent-2026-06-05"/);
    assert.match(ndjson, /"termsVersion":"pilot-terms-2026-06-05"/);
    assert.match(ndjson, /"utmCampaign":"receiver-smoke"/);
    assert.match(csv, /"Signed webhook smoke test\. Safe to delete\."/);
    assert.match(csv, /"webhook-test","ops","receiver-smoke"/);
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
