import assert from "node:assert/strict";
import { test } from "node:test";
import { generateBlobReceiverEvidence } from "../scripts/blob-receiver-evidence.mjs";
import { evaluateBlobReceiverEvidenceFile } from "../scripts/check-blob-receiver-evidence.mjs";

const blobEvidence = {
  blob: {
    access: "private",
    contentType: "application/json",
    pathname: "payshield/waitlist/leads/receipt-123.json",
    size: 640,
  },
  deletionProcessDocumented: true,
  durableStorage: true,
  exportProcessDocumented: true,
  health: {
    mode: "blob",
    paidTrafficReady: true,
    storageConfigured: true,
  },
  ok: true,
  productionSubmit: {
    mode: "blob",
    receiptId: "receipt-123",
    status: 200,
  },
  receiverType: "blob",
  reviewedAt: "2026-06-05T00:00:00.000Z",
  reviewer: "Launch operator",
  storageOwner: "Revenue operations",
  storesAttribution: true,
  storesConsentFields: true,
  storesSubmissionId: true,
  target: {
    productionUrl: "https://payshield-lime.vercel.app",
  },
};

test("validates complete Blob receiver evidence", () => {
  const result = evaluateBlobReceiverEvidenceFile(blobEvidence);
  const summary = result.summary as {
    receiverType: string;
    storageProvider: string;
  };

  assert.equal(result.ok, true);
  assert.equal(result.findings.length, 0);
  assert.equal(summary.receiverType, "blob");
  assert.equal(summary.storageProvider, "blob");
});

test("requires Blob health, private object, and production submit proof", () => {
  const result = evaluateBlobReceiverEvidenceFile({
    ...blobEvidence,
    blob: {
      access: "public",
      pathname: "",
      size: 0,
    },
    health: {
      mode: "demo",
      paidTrafficReady: false,
      storageConfigured: false,
    },
    productionSubmit: {
      mode: "demo",
      receiptId: "",
      status: 200,
    },
  });
  const failedChecks = result.checks
    .filter((check: { ok: boolean }) => !check.ok)
    .map((check: { name: string }) => check.name);

  assert.equal(result.ok, false);
  assert.equal(failedChecks.includes("blobHealthReady"), true);
  assert.equal(failedChecks.includes("blobProductionSubmit"), true);
  assert.equal(failedChecks.includes("blobPrivateObjectVerified"), true);
});

test("generates redacted Blob receiver evidence from live smoke and private blob", async () => {
  const receiptId = "11111111-1111-4111-8111-111111111111";
  const requests: string[] = [];
  const result = await generateBlobReceiverEvidence({
    deletionProcessDocumented: true,
    exportProcessDocumented: true,
    fetchImpl: async (input, init) => {
      requests.push(String(input));

      if (String(input).endsWith("/api/health")) {
        return new Response(
          JSON.stringify({
            waitlist: {
              mode: "blob",
              paidTrafficReady: true,
              storageConfigured: true,
            },
          }),
          { status: 200 },
        );
      }

      assert.equal(
        JSON.stringify(init?.body).includes("BLOB_READ_WRITE_TOKEN"),
        false,
      );

      return new Response(
        JSON.stringify({
          mode: "blob",
          ok: true,
          receiptId,
        }),
        { status: 200 },
      );
    },
    generatedAt: "2026-06-05T00:00:00.000Z",
    getBlob: async (pathname, options) => {
      assert.equal(
        pathname,
        `payshield/waitlist/leads/${receiptId}.json`,
      );
      assert.equal(options.token, "blob-token");
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              JSON.stringify({
                attribution: {
                  landingPath: "/",
                  utmCampaign: "blob-evidence",
                  utmSource: "launch-proof",
                },
                consentText: "Consent",
                consentedAt: "2026-06-05T00:00:00.000Z",
                consentVersion: "product-onboarding-contact-consent-2026-06-06",
                email: "blob-proof@example.com",
                privacyVersion: "paycheck-planning-privacy-2026-06-06",
                submissionId: receiptId,
                termsVersion: "paycheck-planning-terms-2026-06-06",
              }),
            ),
          );
          controller.close();
        },
      });

      return {
        blob: {
          cacheControl: "",
          contentDisposition: "inline",
          contentType: "application/json",
          downloadUrl: "https://blob.test/download",
          etag: "etag",
          pathname,
          size: 512,
          uploadedAt: new Date("2026-06-05T00:00:00.000Z"),
          url: "https://blob.test/object",
        },
        headers: new Headers(),
        statusCode: 200,
        stream,
      };
    },
    reviewedAt: "2026-06-05T00:00:00.000Z",
    reviewer: "Launch operator",
    siteUrl: "https://payshield-lime.vercel.app",
    storageOwner: "Revenue operations",
    targetUrl: "https://payshield-lime.vercel.app",
    tokenValue: "blob-token",
  });
  const serialized = JSON.stringify(result.evidence);

  assert.equal(result.evidence.ok, true);
  assert.equal(requests.length, 2);
  assert.equal(serialized.includes("blob-token"), false);
  assert.equal(serialized.includes("blob-proof@example.com"), false);
});
