import { headers } from "next/headers.js";
import { NextResponse } from "next/server.js";
import {
  appAuthNotConfiguredBody,
  clerkAppConfigured,
  reviewAppAccessAllowed,
} from "./app-access.ts";
import { demoUser } from "./demo-state.ts";

export type AppSession = {
  authMode: "clerk" | "demo";
  email: string;
  name: string;
  userId: string;
};

export class AppAuthNotConfiguredError extends Error {
  constructor() {
    super(appAuthNotConfiguredBody().error);
    this.name = "AppAuthNotConfiguredError";
  }
}

export function appSessionErrorBody(error: unknown) {
  if (error instanceof AppAuthNotConfiguredError) {
    return {
      body: appAuthNotConfiguredBody(),
      status: 503,
    };
  }

  if (error instanceof Error && error.message === "Unauthorized") {
    return {
      body: { error: "Unauthorized" },
      status: 401,
    };
  }

  return null;
}

export function appSessionErrorResponse(error: unknown) {
  const sessionError = appSessionErrorBody(error);

  if (!sessionError) {
    return null;
  }

  return NextResponse.json(sessionError.body, {
    headers: {
      "cache-control": "no-store",
    },
    status: sessionError.status,
  });
}

export function unauthorizedAppResponse() {
  return NextResponse.json(
    { error: "Unauthorized" },
    {
      headers: {
        "cache-control": "no-store",
      },
      status: 401,
    },
  );
}

function cleanIdentityText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

export async function getAppSession(): Promise<AppSession> {
  if (!clerkAppConfigured()) {
    if (!reviewAppAccessAllowed()) {
      throw new AppAuthNotConfiguredError();
    }

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
