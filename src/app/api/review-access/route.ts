import { NextRequest, NextResponse } from "next/server.js";
import {
  reviewAppAccessCookieName,
  reviewAppAccessCookieValue,
  reviewAppAccessTokenAccepted,
} from "../../lib/neobank/app-access.ts";

export const dynamic = "force-dynamic";

const maxReviewAccessFormBytes = 4 * 1024;

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

async function readBoundedReviewForm(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (
    Number.isFinite(contentLength) &&
    contentLength > maxReviewAccessFormBytes
  ) {
    return null;
  }

  if (!request.body) {
    return new URLSearchParams();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      byteLength += value.byteLength;

      if (byteLength > maxReviewAccessFormBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new URLSearchParams(new TextDecoder().decode(bytes));
}

export async function POST(request: NextRequest) {
  const form = await readBoundedReviewForm(request);

  if (!form) {
    return NextResponse.json(
      {
        error: "Request body is too large.",
        service: "payshield-review-access",
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: 413,
      },
    );
  }

  const token = String(form.get("review_access_token") ?? "").trim();
  const returnTo = cleanReturnPath(form.get("return_to"));

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
