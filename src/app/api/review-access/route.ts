import { NextRequest, NextResponse } from "next/server.js";
import {
  reviewAppAccessCookieName,
  reviewAppAccessCookieValue,
  reviewAppAccessTokenAccepted,
} from "../../lib/neobank/app-access.ts";

export const dynamic = "force-dynamic";

function cleanReturnPath(value: unknown) {
  if (typeof value !== "string") {
    return "/app";
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/app";
  }

  return trimmed.startsWith("/app") ? trimmed.slice(0, 180) : "/app";
}

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin), {
    status: 303,
  });
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("review_access_token") ?? "").trim();
  const returnTo = cleanReturnPath(form?.get("return_to"));

  if (!process.env.PAYSHIELD_REVIEW_APP_ACCESS_TOKEN?.trim()) {
    return redirectTo(request, "/app?access=not_configured");
  }

  if (!reviewAppAccessTokenAccepted(token)) {
    return redirectTo(request, "/app?access=invalid");
  }

  const response = redirectTo(request, returnTo);

  response.cookies.set({
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    name: reviewAppAccessCookieName,
    path: "/",
    sameSite: "strict",
    secure: request.nextUrl.protocol === "https:",
    value: reviewAppAccessCookieValue(token),
  });

  return response;
}
