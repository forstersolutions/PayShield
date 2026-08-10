import { NextRequest, NextResponse } from "next/server.js";
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

const androidPackageName = "com.graystontechnologies.payshield";

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireDurableCoreService({
      operation: "Bank account connection",
      service: "payshield-bank-link-token",
    });

    if (coreRequired) {
      return coreRequired;
    }

    const payloadResult = await readAppJsonPayload(
      request,
      "payshield-bank-link-token",
    );

    if (!payloadResult.ok) {
      return payloadResult.response;
    }

    const requestedPlatform = payloadResult.payload.platform;
    const platform =
      requestedPlatform === "android" || requestedPlatform === "ios"
        ? requestedPlatform
        : "web";
    const requestedAndroidPackage = payloadResult.payload.androidPackageName;

    if (
      platform === "android" &&
      typeof requestedAndroidPackage === "string" &&
      requestedAndroidPackage !== androidPackageName
    ) {
      return NextResponse.json(
        {
          error: "Android app identity does not match the PayShield release package.",
          service: "payshield-bank-link-token",
        },
        { headers: { "cache-control": "no-store" }, status: 400 },
      );
    }

    const coreResponse = await forwardCoreRequest({
      body: {
        androidPackageName:
          platform === "android" ? androidPackageName : undefined,
        origin: request.nextUrl.origin,
        platform,
      },
      method: "POST",
      path: "/api/app/bank-link/token",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    return requiredCoreUnavailable({
      message: "Bank account connection requires the dedicated PayShield core service.",
      service: "payshield-bank-link-token",
    });
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
