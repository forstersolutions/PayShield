import { NextResponse } from "next/server.js";

export const maxCommercialRequestBytes = 16 * 1024;

type PayloadResult =
  | {
      ok: true;
      payload: Record<string, unknown>;
    }
  | {
      ok: false;
      response: NextResponse;
    };
type ErrorResult = Extract<PayloadResult, { ok: false }>;

function noStoreJson(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    headers: {
      "cache-control": "no-store",
    },
    status,
  });
}

function errorResult(
  message: string,
  service: string,
  status: number,
): ErrorResult {
  return {
    ok: false,
    response: noStoreJson(
      {
        error: message,
        service,
      },
      status,
    ),
  };
}

async function readBoundedRequestText(
  request: Request,
  service: string,
  maxBytes = maxCommercialRequestBytes,
): Promise<
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (
    Number.isFinite(contentLength) &&
    contentLength > maxBytes
  ) {
    return errorResult("Request body is too large.", service, 413);
  }

  if (!request.body) {
    return {
      ok: true,
      text: "",
    };
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

      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => {});
        return errorResult("Request body is too large.", service, 413);
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

  return {
    ok: true,
    text: new TextDecoder().decode(bytes),
  };
}

function parseJsonObject(text: string) {
  if (!text.trim()) {
    return {};
  }

  const payload = JSON.parse(text) as unknown;

  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function parseUrlEncodedObject(text: string) {
  if (!text.trim()) {
    return {};
  }

  return Object.fromEntries(new URLSearchParams(text).entries());
}

export async function readCommercialJsonPayload(
  request: Request,
  service: string,
): Promise<PayloadResult> {
  const body = await readBoundedRequestText(request, service);

  if (!body.ok) {
    return body;
  }

  try {
    return {
      ok: true,
      payload: parseJsonObject(body.text),
    };
  } catch {
    return errorResult("Invalid request body.", service, 400);
  }
}

export async function readCommercialCheckoutPayload(
  request: Request,
  service: string,
): Promise<PayloadResult> {
  const body = await readBoundedRequestText(request, service);

  if (!body.ok) {
    return body;
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      return {
        ok: true,
        payload: parseJsonObject(body.text),
      };
    }

    if (contentType.includes("application/x-www-form-urlencoded")) {
      return {
        ok: true,
        payload: parseUrlEncodedObject(body.text),
      };
    }

    return {
      ok: true,
      payload: {},
    };
  } catch {
    return errorResult("Invalid request body.", service, 400);
  }
}
