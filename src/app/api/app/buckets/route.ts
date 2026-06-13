import { NextRequest, NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import {
  createNeobankSnapshot,
  isBucketId,
  neobankBuckets,
} from "../../../lib/neobank/demo-state.ts";
import type { BucketDefinition, BucketProtection } from "../../../lib/neobank/types.ts";

const protectionValues = new Set<BucketProtection>([
  "bill_only",
  "emergency",
  "hard_lock",
  "soft_lock",
]);

function toCents(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount) || amount < 0 || amount > 500_000) {
    return null;
  }

  return amount;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "custom_bucket"
  );
}

function normalizeBucketProfile(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) {
    return null;
  }

  const seen = new Set<string>();
  const normalized: BucketDefinition[] = [];

  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") {
      return null;
    }

    const record = item as Record<string, unknown>;
    const name = cleanText(record.name, 48);
    const due = cleanText(record.due, 40) || "Every check";
    const targetCents = toCents(record.targetCents);
    const protection = protectionValues.has(record.protection as BucketProtection)
      ? (record.protection as BucketProtection)
      : null;

    if (!name || targetCents === null || !protection) {
      return null;
    }

    const requestedId = cleanText(record.id, 48);
    const id = (isBucketId(requestedId)
      ? requestedId
      : requestedId.startsWith("custom_")
        ? requestedId
        : `custom_${slugify(requestedId || name)}`) as BucketDefinition["id"];

    if (id === "safe_spending" || seen.has(id)) {
      return null;
    }

    seen.add(id);
    normalized.push({
      due,
      id,
      name,
      priority: (index + 1) * 10,
      protection,
      targetCents,
    });
  }

  return normalized;
}

export async function GET() {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/buckets",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const snapshot = createNeobankSnapshot();

    return NextResponse.json(
      {
        buckets: snapshot.buckets,
        message: "Household bucket profile loaded for rule validation.",
        persisted: false,
        profilePersistence: "stateless_model",
        profileSource: "local_simulation",
        readiness: snapshot.readiness,
        templates: [
          "Rent",
          "Mortgage",
          "Utilities",
          "Insurance",
          "Vehicle",
          "Childcare",
          "Debt payoff",
          "Emergency",
          "Taxes",
        ],
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/buckets",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const payload = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      buckets?: unknown;
      bucketId?: unknown;
      targetCents?: unknown;
    };

    if (payload.action === "replace_profile") {
      const profile = normalizeBucketProfile(payload.buckets);

      if (!profile) {
        return NextResponse.json(
          {
            error:
              "Provide 1-12 protected buckets with name, targetCents, due, and protection.",
          },
          { status: 400 },
        );
      }

      const snapshot = createNeobankSnapshot();
      const protectedCents = profile.reduce(
        (total, bucket) => total + bucket.targetCents,
        0,
      );

      return NextResponse.json(
        {
          buckets: profile,
          message:
            "Bucket profile validated. Durable account sync requires the protected app backend.",
          persisted: false,
          profilePersistence: "stateless_model",
          profileSource: "local_simulation",
          protectedCents,
          readiness: snapshot.readiness,
          safeToSpendPreviewCents: Math.max(0, 300_000 - protectedCents),
          safeSpendRule: "Safe to Spend is computed only after protected buckets fund.",
        },
        {
          headers: {
            "cache-control": "no-store",
          },
        },
      );
    }

    const targetCents = toCents(payload.targetCents);

    if (!isBucketId(payload.bucketId) || targetCents === null) {
      return NextResponse.json(
        { error: "Provide bucketId and integer targetCents." },
        { status: 400 },
      );
    }

    if (payload.bucketId === "safe_spending") {
      return NextResponse.json(
        { error: "Safe spending is always the paycheck remainder." },
        { status: 400 },
      );
    }

    const snapshot = createNeobankSnapshot();
    const modeledBuckets = neobankBuckets.map((bucket) =>
      bucket.id === payload.bucketId ? { ...bucket, targetCents } : bucket,
    );

    return NextResponse.json(
      {
        bucket: modeledBuckets.find((bucket) => bucket.id === payload.bucketId),
        message:
          "Bucket target validated for the household control model.",
        persisted: false,
        profilePersistence: "stateless_model",
        profileSource: "local_simulation",
        readiness: snapshot.readiness,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
