import { NextRequest } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import {
  requireDurableCoreService,
  requiredCoreUnavailable,
} from "../../../../lib/neobank/core-required.ts";
import { readAppJsonPayload } from "../../../../lib/neobank/request-body.ts";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Card management",
      service: "payshield-card-management",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const payloadResult = await readAppJsonPayload(
      request,
      "payshield-card-management",
    );

    if (!payloadResult.ok) {
      return payloadResult.response;
    }

    const payload = payloadResult.payload;
    const coreResponse = await forwardCoreRequest({
      body: {
        idempotencyKey: cleanText(payload.idempotencyKey, 120),
        purpose: cleanText(payload.purpose, 40),
      },
      method: "POST",
      path: "/api/app/card/manage",
      session,
    });

    return (
      coreResponse ||
      requiredCoreUnavailable({
        message: "Card management requires the dedicated PayShield core service.",
        service: "payshield-card-management",
      })
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
