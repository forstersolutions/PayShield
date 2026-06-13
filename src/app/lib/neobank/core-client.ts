import { NextResponse } from "next/server.js";
import type { AppSession } from "./auth.ts";
import { getCoreServiceConfig, joinCorePath } from "./core-config.ts";

type ForwardCoreInput = {
  body?: unknown;
  method: "GET" | "POST";
  path: string;
  request?: Request;
  session?: AppSession;
};

const maxForwardBytes = 64 * 1024;
const noStoreHeaders = {
  "cache-control": "no-store",
};

function jsonResponse(body: unknown, status: number, proxied = false) {
  return NextResponse.json(body, {
    headers: proxied
      ? {
          ...noStoreHeaders,
          "x-payshield-core-proxied": "true",
        }
      : noStoreHeaders,
    status,
  });
}

async function readForwardBody(input: ForwardCoreInput) {
  if (input.request) {
    const body = await input.request.text();
    const bytes = new TextEncoder().encode(body).byteLength;

    if (bytes > maxForwardBytes) {
      return {
        error: jsonResponse(
          {
            error: "Request body is too large.",
            service: "payshield-web-app",
          },
          413,
        ),
      };
    }

    return { body };
  }

  if (input.body === undefined) {
    return { body: undefined };
  }

  return { body: JSON.stringify(input.body) };
}

function safeCoreError(message: string, status = 502) {
  return jsonResponse(
    {
      error: message,
      service: "payshield-web-app",
    },
    status,
  );
}

function cleanHeaderValue(value: string | undefined, maxLength: number) {
  return value
    ?.replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export async function forwardCoreRequest(input: ForwardCoreInput) {
  const config = getCoreServiceConfig();

  if (!config.configured) {
    return null;
  }

  if (!config.ok) {
    return jsonResponse(
      {
        code: "core_service_misconfigured",
        error: config.error,
        service: "payshield-web-app",
      },
      503,
    );
  }

  const bodyResult = await readForwardBody(input);

  if (bodyResult.error) {
    return bodyResult.error;
  }

  const headers = new Headers({
    accept: "application/json",
  });

  if (bodyResult.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const providerSignature = input.request?.headers.get(
    "x-payshield-provider-signature",
  );

  if (providerSignature) {
    headers.set("x-payshield-provider-signature", providerSignature);
  }

  if (config.serviceToken) {
    headers.set("authorization", `Bearer ${config.serviceToken}`);
  }

  if (input.session) {
    headers.set("x-payshield-auth-mode", input.session.authMode);
    headers.set("x-payshield-user-id", input.session.userId);

    const clerkSubject = cleanHeaderValue(input.session.clerkSubject, 160);
    const email = cleanHeaderValue(input.session.email, 160);
    const name = cleanHeaderValue(input.session.name, 120);

    if (clerkSubject) {
      headers.set("x-payshield-clerk-subject", clerkSubject);
    }

    if (email) {
      headers.set("x-payshield-user-email", email);
    }

    if (name) {
      headers.set("x-payshield-user-name", name);
    }
  }

  let response: Response;

  try {
    response = await fetch(joinCorePath(config.baseUrl, input.path), {
      body: bodyResult.body,
      cache: "no-store",
      headers,
      method: input.method,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch {
    return safeCoreError("Configured PayShield core service is unavailable.");
  }

  try {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    return jsonResponse(payload, response.status, true);
  } catch {
    return safeCoreError(
      "Configured PayShield core service did not return a valid JSON response.",
    );
  }
}
