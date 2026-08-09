import { createHash } from "node:crypto";

const windowMs = 60_000;
const maxTrackedKeys = 2_000;
const maxRequestsPerIdentity = 6;
const maxRequestsPerAddress = 20;
const requestLog = new Map<string, number[]>();

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function clientAddress(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    ""
  ).slice(0, 120);
}

function prune(now: number) {
  const cutoff = now - windowMs;

  for (const [key, timestamps] of requestLog.entries()) {
    const recent = timestamps.filter((timestamp) => timestamp > cutoff);

    if (recent.length) {
      requestLog.set(key, recent);
    } else {
      requestLog.delete(key);
    }
  }

  while (requestLog.size > maxTrackedKeys) {
    const oldestKey = requestLog.keys().next().value;

    if (!oldestKey) {
      break;
    }

    requestLog.delete(oldestKey);
  }
}

function consume(key: string, limit: number, now: number) {
  const cutoff = now - windowMs;
  const recent = (requestLog.get(key) ?? []).filter(
    (timestamp) => timestamp > cutoff,
  );

  if (recent.length >= limit) {
    requestLog.set(key, recent);
    return {
      ok: false as const,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(((recent[0] ?? now) + windowMs - now) / 1_000),
      ),
    };
  }

  requestLog.set(key, [...recent, now]);
  return { ok: true as const, retryAfterSeconds: 0 };
}

export function checkPublicCheckoutRateLimit(
  request: Request,
  identityId: string,
) {
  const now = Date.now();
  const address = clientAddress(request);

  prune(now);

  if (address) {
    const addressResult = consume(
      `address:${digest(address)}`,
      maxRequestsPerAddress,
      now,
    );

    if (!addressResult.ok) {
      return addressResult;
    }
  }

  return consume(
    `identity:${digest(identityId)}`,
    maxRequestsPerIdentity,
    now,
  );
}
