export const appAuthNotConfiguredCode = "app_auth_not_configured";

function envTrue(name: string, env: NodeJS.ProcessEnv = process.env) {
  return env[name]?.trim().toLowerCase() === "true";
}

function envPresent(name: string, env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env[name]?.trim());
}

export function clerkAppConfigured(env: NodeJS.ProcessEnv = process.env) {
  return (
    envPresent("CLERK_SECRET_KEY", env) &&
    envPresent("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", env)
  );
}

export function reviewAppAccessAllowed(env: NodeJS.ProcessEnv = process.env) {
  return (
    envTrue("PAYSHIELD_ALLOW_REVIEW_APP_ACCESS", env) ||
    env.VERCEL_ENV !== "production"
  );
}

export function getAppAccessReadiness(env: NodeJS.ProcessEnv = process.env) {
  const clerkConfigured = clerkAppConfigured(env);
  const reviewAccessAllowed = reviewAppAccessAllowed(env);
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
