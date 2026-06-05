import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { signPayShieldWebhook } from "./waitlist-webhook-receiver.mjs";

const defaultTimeoutMs = 8_000;

function usage() {
  return [
    "Usage: PAYSHIELD_WAITLIST_WEBHOOK_SECRET=shared-secret npm run webhook:test -- https://your-webhook-url [--email lead@example.com] [--timeout-ms 8000] [--replay]",
    "",
    "Sends one signed sample waitlist payload directly to a receiver URL.",
    "--replay sends the same signed payload twice to verify idempotent acceptance.",
    "Does not print the signing secret.",
  ].join("\n");
}

function flagValue(args, index) {
  const arg = args[index];
  const equalsIndex = arg.indexOf("=");

  if (equalsIndex !== -1) {
    return {
      nextIndex: index,
      value: arg.slice(equalsIndex + 1),
    };
  }

  return {
    nextIndex: index + 1,
    value: args[index + 1] ?? "",
  };
}

function parseCliArgs(args) {
  const positional = [];
  let email = "";
  let replay = false;
  let timeoutMs = defaultTimeoutMs;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (arg === "--email" || arg.startsWith("--email=")) {
      const parsed = flagValue(args, index);
      email = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--timeout-ms" || arg.startsWith("--timeout-ms=")) {
      const parsed = flagValue(args, index);
      timeoutMs = Number(parsed.value);
      index = parsed.nextIndex;
      continue;
    }

    if (arg === "--replay") {
      replay = true;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  if (positional.length !== 1) {
    throw new Error("Exactly one webhook URL is required.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new Error("--timeout-ms must be a number between 1 and 60000.");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("--email must be a valid email address.");
  }

  return {
    email,
    help: false,
    replay,
    timeoutMs,
    url: positional[0],
  };
}

function parseWebhookUrl(value) {
  if (!value) {
    throw new Error("Webhook URL is required.");
  }

  const url = new URL(value);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Webhook URL must use http or https.");
  }

  return url.toString();
}

function parseResponseBody(text) {
  if (!text) {
    return "";
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function responsePreview(body) {
  if (!body) {
    return "";
  }

  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

/**
 * @param {{ email?: string; now?: Date | number | string }} [options]
 */
export function createWaitlistWebhookTestPayload(options = {}) {
  const { email, now = new Date() } = options;
  const createdAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const token = createdAt.replace(/\D/g, "").slice(0, 14);

  return {
    attribution: {
      landingPath: "/",
      utmCampaign: "receiver-smoke",
      utmMedium: "ops",
      utmSource: "webhook-test",
    },
    consentText:
      "I agree that PayShield can contact me about the pilot and handle my information under the Privacy Notice and Terms.",
    consentedAt: createdAt,
    consentVersion: "pilot-contact-consent-2026-06-05",
    createdAt,
    email: email ?? `webhook-smoke+${token}@example.com`,
    name: "PayShield Webhook Smoke",
    segment: "Operations",
    message: "Signed webhook smoke test. Safe to delete.",
    privacyVersion: "pilot-privacy-2026-06-05",
    source: "payshield-webhook-test",
    submissionId: randomUUID(),
    termsVersion: "pilot-terms-2026-06-05",
  };
}

/**
 * @param {{
 *   payload?: ReturnType<typeof createWaitlistWebhookTestPayload>;
 *   replay?: boolean;
 *   secret?: string;
 *   timeoutMs?: number;
 *   timestamp?: string;
 *   url?: string;
 * }} [options]
 */
export async function sendSignedWebhookTest(options = {}) {
  const {
    payload,
    replay = false,
    secret = process.env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET,
    timeoutMs = defaultTimeoutMs,
    timestamp = String(Math.floor(Date.now() / 1000)),
    url,
  } = options;
  const targetUrl = parseWebhookUrl(url);

  if (!secret) {
    throw new Error("PAYSHIELD_WAITLIST_WEBHOOK_SECRET is required.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new Error("timeoutMs must be a number between 1 and 60000.");
  }

  const body = payload ?? createWaitlistWebhookTestPayload();
  const rawBody = JSON.stringify(body);
  const sendOnce = async () => {
    const response = await fetch(targetUrl, {
      body: rawBody,
      headers: {
        "content-type": "application/json",
        "user-agent": "payshield-webhook-test",
        ...(body.submissionId
          ? { "x-payshield-submission-id": body.submissionId }
          : {}),
        "x-payshield-webhook-signature": signPayShieldWebhook({
          rawBody,
          secret,
          timestamp,
        }),
        "x-payshield-webhook-timestamp": timestamp,
      },
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const responseBody = parseResponseBody(await response.text());

    return {
      body: responseBody,
      ok: response.ok,
      payload: body,
      status: response.status,
    };
  };

  const result = await sendOnce();

  if (!result.ok) {
    throw Object.assign(
      new Error(
        `Webhook smoke test failed with HTTP ${result.status}${
          result.body ? `: ${responsePreview(result.body)}` : ""
        }`,
      ),
      result,
    );
  }

  if (replay) {
    const replayResult = await sendOnce();

    if (!replayResult.ok) {
      throw Object.assign(
        new Error(
          `Webhook replay test failed with HTTP ${replayResult.status}${
            replayResult.body ? `: ${responsePreview(replayResult.body)}` : ""
          }`,
        ),
        {
          ...result,
          replay: replayResult,
        },
      );
    }

    return {
      ...result,
      replay: replayResult,
    };
  }

  return result;
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = await sendSignedWebhookTest({
    payload: createWaitlistWebhookTestPayload({ email: parsed.email || undefined }),
    replay: parsed.replay,
    timeoutMs: parsed.timeoutMs,
    url: parsed.url,
  });

  const output = {
    ok: true,
    receiverResponse: result.body,
    sentEmail: result.payload.email,
    status: result.status,
    url: parseWebhookUrl(parsed.url),
  };

  if (result.replay) {
    output.replayReceiverResponse = result.replay.body;
    output.replayStatus = result.replay.status;
  }

  console.log(
    JSON.stringify(
      output,
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Webhook smoke test failed.");
    process.exit(1);
  });
}
