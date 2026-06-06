import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { beforeEach, test } from "node:test";
import { NextRequest } from "next/server.js";
import { POST } from "../src/app/api/waitlist/route.ts";
import { setWaitlistBlobPutForTest } from "../src/app/lib/waitlist-blob-storage.ts";

const endpoint = "https://payshield.test/api/waitlist";
const originalFetch = globalThis.fetch;

beforeEach(() => {
  delete process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK;
  delete process.env.PAYSHIELD_WAITLIST_STORAGE;
  delete process.env.PAYSHIELD_WAITLIST_STORAGE_PREFIX;
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET;
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.VERCEL_ENV;
  globalThis.fetch = originalFetch;
  setWaitlistBlobPutForTest(null);
});

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
    rawBody: string;
    secret: string | null;
    signature: string | null;
    submissionId: string | null;
    timestamp: string | null;
  }> = [];

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");

      requests.push({
        body: JSON.parse(rawBody) as Record<string, unknown>,
        rawBody,
        secret: request.headers["x-payshield-webhook-secret"]?.toString() ?? null,
        signature:
          request.headers["x-payshield-webhook-signature"]?.toString() ?? null,
        submissionId:
          request.headers["x-payshield-submission-id"]?.toString() ?? null,
        timestamp:
          request.headers["x-payshield-webhook-timestamp"]?.toString() ?? null,
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
  assert.equal(
    body.message,
    "Request received in local capture mode.",
  );
  assert.equal(JSON.stringify(body).includes("PAYSHIELD_WAITLIST_WEBHOOK_URL"), false);
  assert.equal(JSON.stringify(body).includes("Vercel"), false);
});

test("fails closed when webhook persistence is required but missing", async () => {
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";

  const response = await POST(
    makeRequest(
      {
        email: "required@example.com",
        name: "Required Webhook",
        segment: "Employer",
        message: "Need durable lead capture.",
        consent: true,
      },
      "198.51.100.19",
    ),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 503);
  assert.equal(
    body.error,
    "Contact capture is temporarily unavailable. Try again shortly.",
  );
});

test("fails closed when webhook persistence is required but unsigned", async () => {
  const webhook = await startWebhook();
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = webhook.url;
  delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET;
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";

  try {
    const response = await POST(
      makeRequest(
        {
          email: "unsigned-required@example.com",
          name: "Unsigned Required",
          segment: "Employer",
          message: "Need signed durable lead capture.",
          consent: true,
        },
        "198.51.100.22",
      ),
    );
    const body = await parseJson(response);

    assert.equal(response.status, 503);
    assert.equal(
      body.error,
      "Contact capture is temporarily unavailable. Try again shortly.",
    );
    assert.equal(webhook.requests.length, 0);
  } finally {
    await webhook.close();
  }
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
  assert.equal((await parseJson(invalidSegment)).error, "Choose a contact segment.");

  const missingConsent = await POST(
    makeRequest(
      { email: "lead@example.com", segment: "Household", consent: false },
      "198.51.100.13",
    ),
  );
  assert.equal(missingConsent.status, 400);
  assert.equal(
    (await parseJson(missingConsent)).error,
    "Accept the privacy and terms notice.",
  );
});

test("rejects sensitive financial details in free-text fields", async () => {
  const ssn = await POST(
    makeRequest(
      {
        email: "sensitive@example.com",
        name: "Sensitive Lead",
        segment: "Household",
        message: "My SSN is 123-45-6789.",
        consent: true,
      },
      "198.51.100.20",
    ),
  );
  const accountNumber = await POST(
    makeRequest(
      {
        email: "account@example.com",
        name: "Account Lead",
        segment: "Household",
        message: "Account number 123456789 should be protected.",
        consent: true,
      },
      "198.51.100.21",
    ),
  );

  assert.equal(ssn.status, 400);
  assert.equal(accountNumber.status, 400);
  assert.equal(
    (await parseJson(ssn)).error,
    "Do not include bank, card, SSN, or other sensitive financial details.",
  );
  assert.equal(
    (await parseJson(accountNumber)).error,
    "Do not include bank, card, SSN, or other sensitive financial details.",
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
          attribution: {
            landingPath: "/?email=bad@example.com",
            utmCampaign: "Household Launch",
            utmContent: "card<a>",
            utmMedium: "cpc",
            utmSource: "Paid Social",
            utmTerm: "123-45-6789",
          },
          email: "Partner@Example.com",
          name: "Partner Lead",
          segment: "Investor or partner",
          message: "Interested in product onboarding.",
          consent: true,
        },
        "198.51.100.17",
      ),
    );
    const body = await parseJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.mode, "webhook");
    assert.equal(webhook.requests.length, 1);
    assert.equal(webhook.requests[0]?.secret, null);
    assert.match(webhook.requests[0]?.timestamp ?? "", /^\d+$/);
    assert.match(webhook.requests[0]?.signature ?? "", /^v1=[a-f0-9]{64}$/);
    assert.match(
      String(webhook.requests[0]?.body.submissionId ?? ""),
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.equal(
      webhook.requests[0]?.submissionId,
      webhook.requests[0]?.body.submissionId,
    );
    assert.equal(
      webhook.requests[0]?.signature,
      `v1=${createHmac("sha256", "shared-secret")
        .update(
          `${webhook.requests[0]?.timestamp}.${webhook.requests[0]?.rawBody}`,
        )
        .digest("hex")}`,
    );
    assert.equal(webhook.requests[0]?.body.email, "partner@example.com");
    assert.equal(webhook.requests[0]?.body.segment, "Investor or partner");
    assert.equal(
      webhook.requests[0]?.body.consentText,
      "I agree that PayShield can contact me about product onboarding and handle my information under the Privacy Notice and Terms.",
    );
    assert.match(String(webhook.requests[0]?.body.consentedAt ?? ""), /^\d{4}-/);
    assert.equal(
      webhook.requests[0]?.body.privacyVersion,
      "paycheck-planning-privacy-2026-06-06",
    );
    assert.equal(
      webhook.requests[0]?.body.termsVersion,
      "paycheck-planning-terms-2026-06-06",
    );
    assert.deepEqual(webhook.requests[0]?.body.attribution, {
      landingPath: "/",
      utmCampaign: "Household Launch",
      utmContent: "carda",
      utmMedium: "cpc",
      utmSource: "Paid Social",
    });
    assert.equal(
      webhook.requests[0]?.body.consentVersion,
      "product-onboarding-contact-consent-2026-06-06",
    );
  } finally {
    delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL;
    delete process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET;
    await webhook.close();
  }
});

test("stores valid submissions in Upstash Redis when Vercel-native storage is configured", async () => {
  const upstashCalls: Array<{
    body: string;
    headers: HeadersInit | undefined;
    url: string;
  }> = [];

  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";
  process.env.PAYSHIELD_WAITLIST_STORAGE = "upstash";
  process.env.PAYSHIELD_WAITLIST_STORAGE_PREFIX = "payshield:test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-secret";
  process.env.UPSTASH_REDIS_REST_URL = "https://known-lion.upstash.io";
  globalThis.fetch = async (input, init) => {
    const url = String(input);

    if (url.includes("upstash.io")) {
      upstashCalls.push({
        body: String(init?.body ?? ""),
        headers: init?.headers,
        url,
      });

      return new Response(
        JSON.stringify([{ result: "OK" }, { result: 1 }, { result: 1 }]),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    }

    return new Response("{}", { status: 204 });
  };

  const response = await POST(
    makeRequest(
      {
        attribution: {
          landingPath: "/?email=bad@example.com",
          utmCampaign: "Household Launch",
          utmMedium: "cpc",
          utmSource: "Paid Social",
        },
        email: "Storage@Example.com",
        name: "Storage Lead",
        segment: "Household",
        message: "Interested in product onboarding.",
        consent: true,
      },
      "198.51.100.23",
    ),
  );
  const body = await parseJson(response);
  const commands = JSON.parse(upstashCalls[0]?.body ?? "[]") as unknown[][];
  const lead = JSON.parse(String(commands[0]?.[2] ?? "{}")) as Record<
    string,
    unknown
  >;
  const serializedResponse = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mode, "upstash");
  assert.equal(body.message, "Product inquiry received.");
  assert.equal(upstashCalls.length, 1);
  assert.equal(upstashCalls[0]?.url, "https://known-lion.upstash.io/multi-exec");
  assert.equal(
    (upstashCalls[0]?.headers as Record<string, string>).authorization,
    "Bearer upstash-secret",
  );
  assert.equal(commands[0]?.[0], "SET");
  assert.match(String(commands[0]?.[1]), /^payshield:test:lead:/);
  assert.equal(commands[0]?.[3], "NX");
  assert.equal(commands[1]?.[0], "ZADD");
  assert.equal(commands[1]?.[1], "payshield:test:submissions");
  assert.equal(commands[2]?.[0], "SADD");
  assert.match(String(commands[2]?.[1]), /^payshield:test:email:[a-f0-9]{24}$/);
  assert.equal(lead.email, "storage@example.com");
  assert.equal(lead.segment, "Household");
  assert.deepEqual(lead.attribution, {
    landingPath: "/",
    utmCampaign: "Household Launch",
    utmMedium: "cpc",
    utmSource: "Paid Social",
  });
  assert.equal(
    lead.consentVersion,
    "product-onboarding-contact-consent-2026-06-06",
  );
  assert.equal(serializedResponse.includes("upstash-secret"), false);
});

test("stores valid submissions in private Vercel Blob when Blob storage is configured", async () => {
  const blobWrites: Array<{
    body: string;
    options: Record<string, unknown>;
    pathname: string;
  }> = [];

  process.env.BLOB_READ_WRITE_TOKEN = "blob-secret";
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";
  process.env.PAYSHIELD_WAITLIST_STORAGE = "blob";
  process.env.PAYSHIELD_WAITLIST_STORAGE_PREFIX = "payshield:test";
  setWaitlistBlobPutForTest(
    (async (pathname, body, options) => {
      blobWrites.push({
        body: String(body),
        options: options as unknown as Record<string, unknown>,
        pathname,
      });

      return {
        contentDisposition: "inline",
        contentType: "application/json",
        downloadUrl: `https://blob.test/${pathname}?download=1`,
        pathname,
        url: `https://blob.test/${pathname}`,
      };
    }) as Parameters<typeof setWaitlistBlobPutForTest>[0],
  );

  const response = await POST(
    makeRequest(
      {
        attribution: {
          landingPath: "/?email=bad@example.com",
          utmCampaign: "Household Launch",
          utmMedium: "cpc",
          utmSource: "Paid Social",
        },
        email: "Blob@Example.com",
        name: "Blob Lead",
        segment: "Household",
        message: "Interested in product onboarding.",
        consent: true,
      },
      "198.51.100.26",
    ),
  );
  const body = await parseJson(response);
  const lead = JSON.parse(blobWrites[0]?.body ?? "{}") as Record<
    string,
    unknown
  >;
  const serializedResponse = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.mode, "blob");
  assert.match(String(body.receiptId ?? ""), /^[0-9a-f-]{36}$/);
  assert.equal(body.message, "Product inquiry received.");
  assert.equal(blobWrites.length, 1);
  assert.match(blobWrites[0]?.pathname ?? "", /^payshield\/test\/leads\/[0-9a-f-]{36}\.json$/);
  assert.equal(blobWrites[0]?.options.access, "private");
  assert.equal(blobWrites[0]?.options.allowOverwrite, false);
  assert.equal(blobWrites[0]?.options.contentType, "application/json");
  assert.equal(blobWrites[0]?.options.token, "blob-secret");
  assert.equal(lead.email, "blob@example.com");
  assert.equal(lead.segment, "Household");
  assert.deepEqual(lead.attribution, {
    landingPath: "/",
    utmCampaign: "Household Launch",
    utmMedium: "cpc",
    utmSource: "Paid Social",
  });
  assert.equal(lead.submissionId, body.receiptId);
  assert.equal(lead.consentVersion, "product-onboarding-contact-consent-2026-06-06");
  assert.equal(serializedResponse.includes("blob-secret"), false);
});

test("fails closed when required production webhook URL is not HTTPS", async () => {
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL = "http://example.com/webhook";
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET = "shared-secret";
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";
  process.env.VERCEL_ENV = "production";

  const response = await POST(
    makeRequest(
      {
        email: "insecure-webhook@example.com",
        name: "Insecure Webhook",
        segment: "Employer",
        message: "Need durable lead capture.",
        consent: true,
      },
      "198.51.100.24",
    ),
  );
  const body = await parseJson(response);
  const serializedResponse = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(
    body.error,
    "Contact capture is temporarily unavailable. Try again shortly.",
  );
  assert.equal(serializedResponse.includes("http://example.com/webhook"), false);
  assert.equal(serializedResponse.includes("shared-secret"), false);
});

test("fails closed when webhook URL includes credentials, query strings, or fragments", async () => {
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_URL =
    "https://user:pass@example.com/webhook?token=secret#fragment";
  process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET = "shared-secret";
  process.env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK = "true";
  process.env.VERCEL_ENV = "production";

  const response = await POST(
    makeRequest(
      {
        email: "unsafe-webhook@example.com",
        name: "Unsafe Webhook",
        segment: "Employer",
        message: "Need durable lead capture.",
        consent: true,
      },
      "198.51.100.25",
    ),
  );
  const body = await parseJson(response);
  const serializedResponse = JSON.stringify(body);

  assert.equal(response.status, 503);
  assert.equal(
    body.error,
    "Contact capture is temporarily unavailable. Try again shortly.",
  );
  assert.equal(serializedResponse.includes("token=secret"), false);
  assert.equal(serializedResponse.includes("shared-secret"), false);
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
    await webhook.close();
  }
});
