import { NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import { requireCoreForSession } from "../../../../lib/neobank/core-required.ts";
import { createHouseholdAuditPacket } from "../../../../lib/neobank/operations.ts";

const exportHeaders = {
  "cache-control": "no-store",
  "content-disposition": 'attachment; filename="payshield-household-audit.json"',
};

export async function GET() {
  try {
    const session = await getAppSession();
    const coreRequired = requireCoreForSession(session, {
      operation: "Account activity export",
      service: "payshield-household-audit",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/audit/export",
      session,
    });

    if (coreResponse) {
      const payload = (await coreResponse.json().catch(() => ({}))) as unknown;

      return NextResponse.json(payload, {
        headers: {
          ...exportHeaders,
          "x-payshield-core-proxied":
            coreResponse.headers.get("x-payshield-core-proxied") ?? "true",
        },
        status: coreResponse.status,
      });
    }

    return NextResponse.json(createHouseholdAuditPacket(session), {
      headers: exportHeaders,
      status: 200,
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
