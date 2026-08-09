import type { AppSession } from "./auth.ts";
import type { NeobankSnapshot } from "./types.ts";

function householdIdForUser(snapshot: NeobankSnapshot, userId: string) {
  if (userId === snapshot.user.id) {
    return snapshot.householdId;
  }

  const suffix = userId.replace(/[^A-Za-z0-9:_-]/g, "_").slice(0, 96);

  return `household_${suffix || "user"}`;
}

export function userForSession(
  snapshot: NeobankSnapshot,
  session?: AppSession,
) {
  return {
    ...snapshot.user,
    email: session?.email || snapshot.user.email,
    id: session?.userId ?? snapshot.user.id,
    name: session?.name || snapshot.user.name,
  };
}

export function householdForSession(
  snapshot: NeobankSnapshot,
  session?: AppSession,
) {
  const user = userForSession(snapshot, session);

  return {
    authMode: session?.authMode ?? "demo",
    clerkSubject: session?.clerkSubject ?? null,
    email: user.email,
    householdId: householdIdForUser(snapshot, user.id),
    kycStatus: user.kycStatus,
    name: user.name,
    profileAccess: user.profileAccess,
    userId: user.id,
  };
}
