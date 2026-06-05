import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { test } from "node:test";
import { NextRequest } from "next/server.js";
import { POST } from "../src/app/api/waitlist/route.ts";

const endpoint = "https://payshield.test/api/waitlist";

function makeRequest(
  payload: unknown,
  ip: string,
  headers: Record<string, string> = {},
) {
  const body = JSON.stringify(payload);

  return new NextRequest(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(body)),
      "x-forwarded-for": ip,
      ...headers,
    },
    body,
  });
}

async function parseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function startWebhook(status = 200) {
  const requests: Array<{
    body: Record<string, unknown>;
    secret: string | null;
  }> = [];

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
          string,
          unknown
        >,
        secret: request.headers["x-payshield-webhook-secret"]?.toString() ?? null,
      });
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: status < 400 }));
    });
  });

  return new Promise<{
    close: () => Promise<void>;
    requests: typeof requests;
    url: string;
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      assert(address && typeof address === "object");
      resolve({
        close: () => new Promise((done) => server.close(() => done())),
        requests,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

test("accepts a valid request in demo mode", async () => {
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET;

  const response = await POST(
    makeRequest(
      {
        email: "Lead@Example.com",
        name: " Pilot Lead ",
        segment: "Household",
        message: " Rent first. ",
        consent: true,
      },
      "198.51.100.10",
    ),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mode, "demo");
});

test("requires a valid email, allowed segment, and consent", async () => {
  const invalidEmail = await POST(
    makeRequest(
      { email: "bad", segment: "Household", consent: true },
      "198.51.100.11",
    ),
  );
  assert.equal(invalidEmail.status, 400);
  assert.equal((await parseJson(invalidEmail)).error, "Enter a valid email address.");

  const invalidSegment = await POST(
    makeRequest(
      { email: "lead@example.com", segment: "Unknown", consent: true },
      "198.51.100.12",
    ),
  );
  assert.equal(invalidSegment.status, 400);
  assert.equal((await parseJson(invalidSegment)).error, "Choose a pilot segment.");

  const missingConsent = await POST(
    makeRequest(
      { email: "lead@example.com", segment: "Household", consent: false },
      "198.51.100.13",
    ),
  );
  assert.equal(missingConsent.status, 400);
  assert.equal(
    (await parseJson(missingConsent)).error,
    "Accept the pilot privacy and terms notice.",
  );
});

test("filters honeypot submissions without forwarding", async () => {
  const webhook = await startWebhook();
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = webhook.url;

  try {
    const response = await POST(
      makeRequest(
        {
          email: "bot@example.com",
          segment: "Household",
          company: "Spam LLC",
          consent: true,
        },
        "198.51.100.14",
      ),
    );
    const body = await parseJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.mode, "filtered");
    assert.equal(webhook.requests.length, 0);
  } finally {
    delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
    await webhook.close();
  }
});

test("rejects oversized request bodies before parsing", async () => {
  const response = await POST(
    makeRequest(
      {
        email: "large@example.com",
        segment: "Household",
        consent: true,
        message: "x".repeat(11_000),
      },
      "198.51.100.15",
    ),
  );

  assert.equal(response.status, 413);
  assert.equal((await parseJson(response)).error, "Request body is too large.");
});

test("rate-limits the seventh request from the same client key", async () => {
  const statuses: number[] = [];

  for (let index = 0; index < 7; index += 1) {
    const response = await POST(
      makeRequest(
        { email: "rate@example.com", segment: "Household", consent: true },
        "198.51.100.16",
      ),
    );
    statuses.push(response.status);
    await response.text();
  }

  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429]);
});

test("forwards valid submissions to the configured webhook", async () => {
  const webhook = await startWebhook();
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = webhook.url;
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET = "shared-secret";

  try {
    const response = await POST(
      makeRequest(
        {
          email: "Partner@Example.com",
          name: "Partner Lead",
          segment: "Investor or partner",
          message: "Interested in a pilot.",
          consent: true,
        },
        "198.51.100.17",
      ),
    );
    const body = await parseJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.mode, "webhook");
    assert.equal(webhook.requests.length, 1);
    assert.equal(webhook.requests[0]?.secret, "shared-secret");
    assert.equal(webhook.requests[0]?.body.email, "partner@example.com");
    assert.equal(webhook.requests[0]?.body.segment, "Investor or partner");
    assert.equal(
      webhook.requests[0]?.body.consentVersion,
      "pilot-privacy-2026-06-05",
    );
  } finally {
    delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
    delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET;
    await webhook.close();
  }
});

test("returns a 502 when the configured webhook fails", async () => {
  const webhook = await startWebhook(500);
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = webhook.url;

  try {
    const response = await POST(
      makeRequest(
        { email: "fail@example.com", segment: "Household", consent: true },
        "198.51.100.18",
      ),
    );

    assert.equal(response.status, 502);
    assert.equal(
      (await parseJson(response)).error,
      "Unable to save this request. Try again shortly.",
    );
  } finally {
    delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
    await webhook.close();
  }
});
