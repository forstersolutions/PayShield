import { NextRequest, NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { getCoreServiceConfig } from "../../../lib/neobank/core-config.ts";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "cache-control": "no-store",
};

function coreEvidenceUnavailable(message: string, code = "core_service_required") {
  return NextResponse.json(
    {
      code,
      error: message,
      service: "payshield-production-gate-evidence",
    },
    {
      headers: noStoreHeaders,
      status: 503,
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const core = getCoreServiceConfig();

    if (!core.configured) {
      return coreEvidenceUnavailable(
        "Production gate evidence requires PAYSHIELD_CORE_API_URL so approvals are recorded in the durable core service.",
      );
    }

    if (!core.ok) {
      return coreEvidenceUnavailable(core.error, "core_service_misconfigured");
    }

    if (!core.serviceToken) {
      return coreEvidenceUnavailable(
        "Production gate evidence requires PAYSHIELD_CORE_SERVICE_TOKEN so approval writes are authenticated to the durable core service.",
        "core_service_token_required",
      );
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/launch/gate-evidence",
      request,
      session,
    });

    return (
      coreResponse ??
      coreEvidenceUnavailable(
        "Production gate evidence requires the durable core service.",
      )
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
