import { createHash, timingSafeEqual } from "node:crypto";

export const appAuthNotConfiguredCode = "app_auth_not_configured";
export const reviewAppAccessCookieName = "payshield_review_access";
export const reviewAppAccessQueryParam = "review_access_token";
const reviewCookieDigestPrefix = "sha256:";

function envTrue(name: string, env: NodeJS.ProcessEnv = process.env) {
  return env[name]?.trim().toLowerCase() === "true";
}

function envPresent(name: string, env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env[name]?.trim());
}

function safeTokenEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function digestReviewToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function reviewAppAccessCookieValue(token: string) {
  return `${reviewCookieDigestPrefix}${digestReviewToken(token.trim())}`;
}

function reviewTokenConfigured(env: NodeJS.ProcessEnv = process.env) {
  return envPresent("PAYSHIELD_REVIEW_APP_ACCESS_TOKEN", env);
}

export function reviewAppAccessTokenAccepted(
  token: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  const expected = env.PAYSHIELD_REVIEW_APP_ACCESS_TOKEN?.trim();
  const submitted = token?.trim();

  if (
    expected &&
    submitted?.startsWith(reviewCookieDigestPrefix) &&
    expected.length >= 16
  ) {
    return safeTokenEqual(
      submitted,
      `${reviewCookieDigestPrefix}${digestReviewToken(expected)}`,
    );
  }

  return Boolean(
    expected &&
      submitted &&
      expected.length >= 16 &&
      safeTokenEqual(submitted, expected),
  );
}

export function clerkAppConfigured(env: NodeJS.ProcessEnv = process.env) {
  return (
    envPresent("CLERK_SECRET_KEY", env) &&
    envPresent("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", env)
  );
}

export function reviewAppAccessAllowed(
  env: NodeJS.ProcessEnv = process.env,
  reviewToken?: string | null,
) {
  return (
    envTrue("PAYSHIELD_ALLOW_REVIEW_APP_ACCESS", env) ||
    env.VERCEL_ENV !== "production" ||
    reviewAppAccessTokenAccepted(reviewToken, env)
  );
}

export function getAppAccessReadiness(
  env: NodeJS.ProcessEnv = process.env,
  reviewToken?: string | null,
) {
  const clerkConfigured = clerkAppConfigured(env);
  const tokenConfigured = reviewTokenConfigured(env);
  const tokenAccepted = reviewAppAccessTokenAccepted(reviewToken, env);
  const reviewAccessAllowed = reviewAppAccessAllowed(env, reviewToken);
  const locked = !clerkConfigured && !reviewAccessAllowed;

  return {
    clerkConfigured,
    locked,
    missing: locked
      ? ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]
      : [],
    mode: clerkConfigured ? "clerk" : reviewAccessAllowed ? "review" : "locked",
    productionLocked: locked && env.VERCEL_ENV === "production",
    reviewAccessAllowed,
    reviewTokenAccepted: tokenAccepted,
    reviewTokenConfigured: tokenConfigured,
  };
}

export function appAuthNotConfiguredBody(
  env: NodeJS.ProcessEnv = process.env,
) {
  return {
    code: appAuthNotConfiguredCode,
    error:
      "PayShield app access is not configured. Configure Clerk or explicitly allow controlled review access.",
    readiness: getAppAccessReadiness(env),
    service: "payshield-app-access",
  };
}
