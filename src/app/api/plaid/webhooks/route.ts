import { NextRequest } from "next/server.js";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import {
  requireDurableCoreService,
  requiredCoreUnavailable,
} from "../../../lib/neobank/core-required.ts";

export async function POST(request: NextRequest) {
  const coreRequired = requireDurableCoreService({
    operation: "Plaid webhook ingestion",
    service: "payshield-plaid-webhook",
  });

  if (coreRequired) {
    return coreRequired;
  }

  const response = await forwardCoreRequest({
    method: "POST",
    path: "/api/plaid/webhooks",
    request,
  });

  return (
    response ??
    requiredCoreUnavailable({
      message: "Plaid webhook ingestion requires the PayShield core runtime.",
      service: "payshield-plaid-webhook",
    })
  );
}
