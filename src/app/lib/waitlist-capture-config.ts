export type WaitlistMode = "blob" | "demo" | "upstash" | "webhook";

type Env = NodeJS.ProcessEnv;

function waitlistStorageMode(env: Env) {
  return env.PAYSHIELD_WAITLIST_STORAGE?.trim().toLowerCase() ?? "";
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLocalhost(url: URL) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
}

export function getWaitlistCaptureConfig(env: Env = process.env) {
  const storageMode = waitlistStorageMode(env);
  const webhookUrl = env.PAYSHIELD_WAITLIST_WEBHOOK_URL?.trim() ?? "";
  const webhook = webhookUrl ? parseUrl(webhookUrl) : null;
  const productionEnvironment = env.VERCEL_ENV === "production";
  const webhookUsesHttps = webhook?.protocol === "https:";
  const webhookUsesLocalHttp =
    webhook?.protocol === "http:" &&
    isLocalhost(webhook) &&
    !productionEnvironment;
  const webhookUsesSafeUrlShape = Boolean(
    webhook &&
      !webhook.username &&
      !webhook.password &&
      !webhook.search &&
      !webhook.hash,
  );
  const webhookEndpointConfigured =
    Boolean(webhook) &&
    Boolean(webhookUsesHttps || webhookUsesLocalHttp) &&
    webhookUsesSafeUrlShape;
  const mode: WaitlistMode =
    storageMode === "blob"
      ? "blob"
      : storageMode === "upstash"
        ? "upstash"
        : webhookUrl
          ? "webhook"
          : "demo";
  const requireWebhook = env.PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK === "true";
  const webhookSigningConfigured = Boolean(
    env.PAYSHIELD_WAITLIST_WEBHOOK_SECRET?.trim(),
  );
  const blobConfigured =
    mode === "blob" && Boolean(env.BLOB_READ_WRITE_TOKEN?.trim());
  const upstashConfigured =
    mode === "upstash" &&
    Boolean(env.UPSTASH_REDIS_REST_URL?.trim()) &&
    Boolean(env.UPSTASH_REDIS_REST_TOKEN?.trim());
  const storageConfigured =
    blobConfigured || upstashConfigured;
  const webhookMisconfigured = Boolean(webhookUrl) && !webhookEndpointConfigured;
  const storageMisconfigured =
    (mode === "blob" || mode === "upstash") && !storageConfigured;
  const durableCaptureConfigured =
    (mode === "webhook" && webhookEndpointConfigured && webhookSigningConfigured) ||
    storageConfigured;

  return {
    durableCaptureConfigured,
    mode,
    paidTrafficReady: durableCaptureConfigured && requireWebhook,
    productionEnvironment,
    requireWebhook,
    storageConfigured,
    storageMisconfigured,
    storageMode,
    storageProvider:
      mode === "blob" ? "blob" : mode === "upstash" ? "upstash" : null,
    webhook,
    webhookConfigured: Boolean(webhookUrl),
    webhookEndpointConfigured,
    webhookMisconfigured,
    webhookSigningConfigured,
    webhookUsesSafeUrlShape,
    webhookUrl,
  };
}
