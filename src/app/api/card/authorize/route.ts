import { NextRequest } from "next/server.js";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import {
  requireDurableCoreService,
  requiredCoreUnavailable,
} from "../../../lib/neobank/core-required.ts";

export async function POST(request: NextRequest) {
  const coreRequired = requireDurableCoreService({
    operation: "Card authorization decisions",
    service: "payshield-card-authorization",
  });

  if (coreRequired) {
    return coreRequired;
  }

  const coreResponse = await forwardCoreRequest({
    method: "POST",
    path: "/api/card/authorize",
    request,
  });

  if (coreResponse) {
    return coreResponse;
  }

  return requiredCoreUnavailable({
    message:
      "Card authorization decisions require the dedicated PayShield core service.",
    service: "payshield-card-authorization",
  });
}
