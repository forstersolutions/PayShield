import { NextResponse } from "next/server.js";
import type { AppSession } from "./auth.ts";
import { getCoreServiceConfig } from "./core-config.ts";

const noStoreHeaders = {
  "cache-control": "no-store",
};

export function requiredCoreUnavailable(input: {
  code?: string;
  message: string;
  service: string;
}) {
  return NextResponse.json(
    {
      code: input.code ?? "core_service_required",
      error: input.message,
      service: input.service,
    },
    {
      headers: noStoreHeaders,
      status: 503,
    },
  );
}

export function requireDurableCoreService(input: {
  operation: string;
  service: string;
}) {
  const core = getCoreServiceConfig();

  if (!core.configured) {
    return requiredCoreUnavailable({
      message: `${input.operation} requires PAYSHIELD_CORE_API_URL so the operation is handled by the dedicated PayShield core service and recorded durably.`,
      service: input.service,
    });
  }

  if (!core.ok) {
    return requiredCoreUnavailable({
      code: "core_service_misconfigured",
      message: core.error,
      service: input.service,
    });
  }

  if (!core.serviceToken) {
    return requiredCoreUnavailable({
      code: "core_service_token_required",
      message: `${input.operation} requires PAYSHIELD_CORE_SERVICE_TOKEN so regulated operation writes are authenticated to the dedicated core service.`,
      service: input.service,
    });
  }

  return null;
}

export function requireCoreForSession(
  session: AppSession,
  input: { operation: string; service: string },
) {
  return session.authMode === "demo"
    ? null
    : requireDurableCoreService(input);
}
