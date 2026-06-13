import { headers } from "next/headers.js";
import { demoUser } from "./demo-state.ts";
import { getNeobankReadiness } from "./readiness.ts";

export type AppSession = {
  authMode: "clerk" | "demo";
  email: string;
  name: string;
  userId: string;
};

function cleanIdentityText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

export async function getAppSession(): Promise<AppSession> {
  const readiness = getNeobankReadiness();

  if (!readiness.clerkConfigured) {
    return {
      authMode: "demo",
      email: demoUser.email,
      name: demoUser.name,
      userId: demoUser.id,
    };
  }

  const { auth, currentUser } = await import("@clerk/nextjs/server");
  const session = await auth();

  if (!session.userId) {
    throw new Error("Unauthorized");
  }

  const user = await currentUser();
  const email = cleanIdentityText(
    user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress,
    160,
  );
  const name = cleanIdentityText(
    user?.fullName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" "),
    120,
  );

  return {
    authMode: "clerk",
    email,
    name,
    userId: session.userId,
  };
}

export async function requestIdFromHeaders() {
  const headerList = await headers();

  return (
    headerList.get("x-request-id") ??
    headerList.get("x-vercel-id") ??
    "local-request"
  );
}
