import { createHash } from "node:crypto";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function payShieldUserIdForEmail(email: unknown) {
  const normalized = normalizeEmail(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return "";
  }

  const digest = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 32);

  return `email_${digest}`;
}

export function payShieldHouseholdIdForEmail(email: unknown) {
  const userId = payShieldUserIdForEmail(email);

  return userId ? `household_${userId}` : "";
}

