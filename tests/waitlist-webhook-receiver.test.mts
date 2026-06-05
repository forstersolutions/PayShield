import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  createWaitlistWebhookReceiver,
  signPayShieldWebhook,
  verifyPayShieldSignature,
} from "../scripts/waitlist-webhook-receiver.mjs";

function listen(server: ReturnType<typeof createWaitlistWebhookReceiver>) {
  return new Promise<{
    close: () => Promise<void>;
    healthUrl: string;
    url: string;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      assert(address && typeof address === "object");
      const origin = `http://127.0.0.1:${address.port}`;
      resolve({
        close: () => new Promise((done) => server.close(() => done())),
        healthUrl: `${origin}/health`,
        url: `${origin}/payshield-waitlist`,
      });
    });
  });
}

test("verifies PayShield webhook signatures with replay tolerance", () => {
  const secret = "receiver-secret";
  const timestamp = "1770000000";
  const rawBody = JSON.stringify({ email: "lead@example.com" });
  const signature = signPayShieldWebhook({ rawBody, secret, timestamp });

  assert.equal(
    verifyPayShieldSignature({
      now: 1770000100,
      rawBody,
      secret,
      signature,
      timestamp,
    }),
    true,
  );
  assert.equal(
    verifyPayShieldSignature({
      now: 1770001000,
      rawBody,
      secret,
      signature,
      timestamp,
    }),
    false,
  );
  assert.equal(
    verifyPayShieldSignature({
      now: 1770000100,
      rawBody,
      secret,
      signature: "v1=bad",
      timestamp,
    }),
    false,
  );
});

test("persists signed waitlist submissions to NDJSON and CSV", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-waitlist-"));
  const secret = "receiver-secret";
  const server = createWaitlistWebhookReceiver({ dataDir, secret });
  const listener = await listen(server);
  const payload = {
    attribution: {
      landingPath: "/early-access",
      utmCampaign: "Household Launch",
      utmContent: "rent-card",
      utmMedium: "cpc",
      utmSource: "Paid Social",
      utmTerm: "123456789",
    },
    consentText:
      "I agree that PayShield can contact me about early access and handle my information under the Privacy Notice and Terms.",
    consentedAt: "2026-06-05T00:00:00.000Z",
    consentVersion: "early-access-contact-consent-2026-06-05",
    createdAt: "2026-06-05T00:00:00.000Z",
    email: "Lead@Example.com",
    name: "Pilot Lead",
    segment: "Household",
    message: "Rent first.",
    privacyVersion: "early-access-privacy-2026-06-05",
    source: "payshield-web-app",
    submissionId: "018f7f62-9878-4aab-9ed3-86368f7f4512",
    termsVersion: "early-access-terms-2026-06-05",
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));

  try {
    const response = await fetch(listener.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payshield-webhook-signature": signPayShieldWebhook({
          rawBody,
          secret,
          timestamp,
        }),
        "x-payshield-webhook-timestamp": timestamp,
      },
      body: rawBody,
    });
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 202);
    assert.equal(body.ok, true);
    assert.equal(body.duplicate, false);
    assert.equal(body.email, "lead@example.com");
    assert.equal(body.submissionId, "018f7f62-9878-4aab-9ed3-86368f7f4512");

    const ndjson = await readFile(join(dataDir, "waitlist.ndjson"), "utf8");
    const csv = await readFile(join(dataDir, "waitlist.csv"), "utf8");

    assert.match(ndjson, /"submissionId":"018f7f62-9878-4aab-9ed3-86368f7f4512"/);
    assert.match(ndjson, /"email":"lead@example.com"/);
    assert.match(ndjson, /"segment":"Household"/);
    assert.match(ndjson, /"privacyVersion":"early-access-privacy-2026-06-05"/);
    assert.match(ndjson, /"termsVersion":"early-access-terms-2026-06-05"/);
    assert.match(ndjson, /"utmCampaign":"Household Launch"/);
    assert.doesNotMatch(ndjson, /123456789/);
    assert.match(
      csv,
      /^submissionId,createdAt,email,name,segment,message,consentVersion,privacyVersion,termsVersion,consentedAt,consentText,source,utmSource,utmMedium,utmCampaign,utmContent,utmTerm,landingPath,receivedAt/m,
    );
    assert.match(csv, /"018f7f62-9878-4aab-9ed3-86368f7f4512"/);
    assert.match(csv, /"lead@example.com"/);
    assert.match(csv, /"Household Launch"/);
  } finally {
    await listener.close();
    await rm(dataDir, { recursive: true });
  }
});

test("does not duplicate persisted records when a signed submission is replayed", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-waitlist-"));
  const secret = "receiver-secret";
  const server = createWaitlistWebhookReceiver({ dataDir, secret });
  const listener = await listen(server);
  const payload = {
    consentText:
      "I agree that PayShield can contact me about early access and handle my information under the Privacy Notice and Terms.",
    consentedAt: "2026-06-05T00:00:00.000Z",
    consentVersion: "early-access-contact-consent-2026-06-05",
    createdAt: "2026-06-05T00:00:00.000Z",
    email: "Lead@Example.com",
    name: "Pilot Lead",
    segment: "Household",
    message: "Rent first.",
    privacyVersion: "early-access-privacy-2026-06-05",
    source: "payshield-web-app",
    submissionId: "018f7f62-9878-4aab-9ed3-86368f7f4513",
    termsVersion: "early-access-terms-2026-06-05",
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "x-payshield-submission-id": payload.submissionId,
    "x-payshield-webhook-signature": signPayShieldWebhook({
      rawBody,
      secret,
      timestamp,
    }),
    "x-payshield-webhook-timestamp": timestamp,
  };

  try {
    const first = await fetch(listener.url, {
      method: "POST",
      headers,
      body: rawBody,
    });
    const replay = await fetch(listener.url, {
      method: "POST",
      headers,
      body: rawBody,
    });

    assert.equal(first.status, 202);
    assert.deepEqual(await first.json(), {
      duplicate: false,
      ok: true,
      email: "lead@example.com",
      submissionId: payload.submissionId,
    });
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), {
      duplicate: true,
      ok: true,
      email: "lead@example.com",
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

test("reports receiver health without exposing secret or data path", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-waitlist-"));
  const server = createWaitlistWebhookReceiver({
    dataDir,
    secret: "receiver-secret",
  });
  const listener = await listen(server);

  try {
    const response = await fetch(listener.healthUrl);
    const body = (await response.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      service: "payshield-waitlist-receiver",
    });
    assert.equal(serialized.includes("receiver-secret"), false);
    assert.equal(serialized.includes(dataDir), false);
  } finally {
    await listener.close();
    await rm(dataDir, { recursive: true });
  }
});

test("rejects signed submissions without consent audit metadata", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-waitlist-"));
  const secret = "receiver-secret";
  const server = createWaitlistWebhookReceiver({ dataDir, secret });
  const listener = await listen(server);
  const payload = {
    createdAt: "2026-06-05T00:00:00.000Z",
    email: "Lead@Example.com",
    name: "Pilot Lead",
    segment: "Household",
    message: "Rent first.",
    consentVersion: "early-access-contact-consent-2026-06-05",
    privacyVersion: "early-access-privacy-2026-06-05",
    source: "payshield-web-app",
    submissionId: "018f7f62-9878-4aab-9ed3-86368f7f4514",
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));

  try {
    const response = await fetch(listener.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payshield-webhook-signature": signPayShieldWebhook({
          rawBody,
          secret,
          timestamp,
        }),
        "x-payshield-webhook-timestamp": timestamp,
      },
      body: rawBody,
    });
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 400);
    assert.equal(body.error, "Webhook body is missing required lead metadata.");
  } finally {
    await listener.close();
    await rm(dataDir, { recursive: true });
  }
});

test("rejects unsigned waitlist submissions", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "payshield-waitlist-"));
  const server = createWaitlistWebhookReceiver({
    dataDir,
    secret: "receiver-secret",
  });
  const listener = await listen(server);

  try {
    const response = await fetch(listener.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "lead@example.com" }),
    });
    const body = (await response.json()) as Record<string, unknown>;

    assert.equal(response.status, 401);
    assert.equal(body.error, "Invalid webhook signature.");
  } finally {
    await listener.close();
    await rm(dataDir, { recursive: true });
  }
});
