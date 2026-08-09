import { createNeobankSnapshot, isBucketId } from "./demo-state.ts";
import type {
  BucketBalance,
  BucketDefinition,
  BucketId,
  BucketProtection,
} from "./types.ts";

const bucketProfileProtectionValues = new Set<BucketProtection>([
  "bill_only",
  "emergency",
  "hard_lock",
  "soft_lock",
]);

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
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

function toIntegerCents(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(amount) || amount < 0 || amount > 2_000_000) {
    return null;
  }

  return amount;
}

function normalizeBucketId(value: unknown, name: string): BucketId {
  const requestedId = cleanText(value, 48);
  const fallbackId = `custom_${slugify(requestedId || name)}`;

  if (requestedId && requestedId !== "safe_spending" && isBucketId(requestedId)) {
    return requestedId;
  }

  return fallbackId as BucketId;
}

export function normalizeProtectedBucketProfile(value: unknown):
  | {
      buckets: BucketDefinition[];
      errors: [];
      ok: true;
    }
  | {
      buckets: null;
      errors: string[];
      ok: false;
    } {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) {
    return {
      buckets: null,
      errors: [
        "Provide 1-12 protected buckets with name, targetCents, due, and protection.",
      ],
      ok: false,
    };
  }

  const seen = new Set<string>();
  const buckets: BucketDefinition[] = [];
  const errors: string[] = [];

  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") {
      errors.push(`Bucket ${index + 1} must be an object.`);
      continue;
    }

    const record = item as Record<string, unknown>;
    const name = cleanText(record.name, 48);
    const targetCents = toIntegerCents(record.targetCents);
    const due = cleanText(record.due, 40) || "Every check";
    const protection = cleanText(record.protection, 40) as BucketProtection;
    const id = normalizeBucketId(record.id, name);

    if (!name) {
      errors.push(`Bucket ${index + 1} needs a name.`);
    }

    if (targetCents === null) {
      errors.push(
        `${name || `Bucket ${index + 1}`} needs integer targetCents from 0 to 2000000.`,
      );
    }

    if (!bucketProfileProtectionValues.has(protection)) {
      errors.push(
        `${name || `Bucket ${index + 1}`} needs bill_only, hard_lock, soft_lock, or emergency protection.`,
      );
    }

    if (id === "safe_spending") {
      errors.push("Safe to Spend is always computed as the paycheck remainder.");
    }

    if (seen.has(id)) {
      errors.push(`${name || `Bucket ${index + 1}`} duplicates bucket id ${id}.`);
    }

    seen.add(id);

    if (name && targetCents !== null && bucketProfileProtectionValues.has(protection)) {
      buckets.push({
        due,
        id,
        name,
        priority: (index + 1) * 10,
        protection,
        targetCents,
      });
    }
  }

  if (errors.length > 0 || buckets.length === 0) {
    return {
      buckets: null,
      errors: errors.length
        ? errors
        : [
            "Provide 1-12 protected buckets with name, targetCents, due, and protection.",
          ],
      ok: false,
    };
  }

  return {
    buckets,
    errors: [],
    ok: true,
  };
}

export function bucketBalancesFromProfile(
  profile: BucketDefinition[],
  sourceBuckets: BucketBalance[] = createNeobankSnapshot().buckets,
  paycheckAmountCents = 300_000,
) {
  const sourceById = new Map(sourceBuckets.map((bucket) => [bucket.id, bucket]));
  let remainingCents = Math.max(0, paycheckAmountCents);
  const protectedBuckets = profile
    .filter((bucket) => bucket.id !== "safe_spending")
    .sort((left, right) => left.priority - right.priority)
    .map<BucketBalance>((bucket) => {
      const source = sourceById.get(bucket.id);
      const fundedCents = Math.min(
        Math.max(0, remainingCents),
        Math.max(0, bucket.targetCents),
      );

      remainingCents -= fundedCents;

      return {
        ...bucket,
        availableCents: fundedCents,
        fundedCents,
        payeeId: source?.payeeId,
        shortCents: Math.max(0, bucket.targetCents - fundedCents),
      };
    });
  const safeToSpendCents = Math.max(0, remainingCents);

  return [
    ...protectedBuckets,
    {
      availableCents: safeToSpendCents,
      due: "Remainder",
      fundedCents: safeToSpendCents,
      id: "safe_spending" as const,
      name: "Safe to Spend",
      priority: 1000,
      protection: "spendable" as const,
      shortCents: 0,
      targetCents: 0,
    },
  ];
}
