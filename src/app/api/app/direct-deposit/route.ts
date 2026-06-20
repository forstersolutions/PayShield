import { NextRequest } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import {
  requireDurableCoreService,
  requiredCoreUnavailable,
} from "../../../lib/neobank/core-required.ts";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Direct deposit setup",
      service: "payshield-direct-deposit-setup",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const payload = (await request.json().catch(() => ({}))) as {
      idempotencyKey?: unknown;
      providerAccountId?: unknown;
      providerCustomerId?: unknown;
      providerName?: unknown;
    };
    const coreResponse = await forwardCoreRequest({
      body: {
        idempotencyKey: cleanText(payload.idempotencyKey, 120),
        providerAccountId: cleanText(payload.providerAccountId, 160),
        providerCustomerId: cleanText(payload.providerCustomerId, 160),
        providerName: cleanText(payload.providerName, 40),
      },
      method: "POST",
      path: "/api/app/direct-deposit",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message:
        "Direct deposit setup requires the dedicated PayShield core service.",
      service: "payshield-direct-deposit-setup",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
