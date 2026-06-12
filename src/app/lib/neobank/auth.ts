import { headers } from "next/headers.js";
import { demoUser } from "./demo-state.ts";
import { getNeobankReadiness } from "./readiness.ts";

export type AppSession = {
  authMode: "clerk" | "demo";
  userId: string;
};

export async function getAppSession(): Promise<AppSession> {
  const readiness = getNeobankReadiness();

  if (!readiness.clerkConfigured) {
    return {
      authMode: "demo",
      userId: demoUser.id,
    };
  }

  const { auth } = await import("@clerk/nextjs/server");
  const session = await auth();

  if (!session.userId) {
    throw new Error("Unauthorized");
  }

  return {
    authMode: "clerk",
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
