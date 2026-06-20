import { NextRequest } from "next/server.js";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import {
  requireDurableCoreService,
  requiredCoreUnavailable,
} from "../../../lib/neobank/core-required.ts";

export async function POST(request: NextRequest) {
  const coreRequired = requireDurableCoreService({
    operation: "Provider webhook ingestion",
    service: "payshield-provider-webhook",
  });

  if (coreRequired) {
    return coreRequired;
  }

  const coreResponse = await forwardCoreRequest({
    method: "POST",
    path: "/api/provider/webhooks",
    request,
  });

  if (coreResponse) {
    return coreResponse;
  }

  return requiredCoreUnavailable({
    message:
      "Provider webhook ingestion requires the dedicated PayShield core service.",
    service: "payshield-provider-webhook",
  });
}
