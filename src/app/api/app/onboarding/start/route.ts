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

export async function POST() {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Provider onboarding",
      service: "payshield-provider-onboarding",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      body: {},
      method: "POST",
      path: "/api/app/onboarding/start",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message:
        "Provider onboarding requires the dedicated PayShield core service.",
      service: "payshield-provider-onboarding",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
