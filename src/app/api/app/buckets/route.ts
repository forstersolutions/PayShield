import { NextRequest, NextResponse } from "next/server.js";
import {
  appSessionErrorResponse,
  getAppSession,
  unauthorizedAppResponse,
} from "../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../lib/neobank/core-client.ts";
import { requireCoreForSession } from "../../../lib/neobank/core-required.ts";
import {
  bucketBalancesFromProfile,
  normalizeProtectedBucketProfile,
} from "../../../lib/neobank/bucket-profile.ts";
import { readAppJsonPayload } from "../../../lib/neobank/request-body.ts";
import {
  createNeobankSnapshot,
} from "../../../lib/neobank/demo-state.ts";

const service = "payshield-bucket-controls";
const noStoreHeaders = {
  "cache-control": "no-store",
};

export async function GET() {
  try {
    const session = await getAppSession();
    const coreRequired = requireCoreForSession(session, {
      operation: "Bucket controls",
      service,
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "GET",
      path: "/api/app/buckets",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const snapshot = createNeobankSnapshot();

    return NextResponse.json(
      {
        buckets: snapshot.buckets,
        message: "Household bucket profile loaded for rule validation.",
        persisted: false,
        profilePersistence: "stateless_model",
        profileSource: "app_template_model",
        readiness: snapshot.readiness,
        templates: [
          "Rent",
          "Mortgage",
          "Utilities",
          "Insurance",
          "Vehicle",
          "Childcare",
          "Debt payoff",
          "Emergency",
          "Taxes",
        ],
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession();
    const coreRequired = requireCoreForSession(session, {
      operation: "Saving bucket controls",
      service,
    });

    if (coreRequired) {
      return coreRequired;
    }

    const coreResponse = await forwardCoreRequest({
      method: "POST",
      path: "/api/app/buckets",
      request,
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const payloadResult = await readAppJsonPayload(request, service);

    if (!payloadResult.ok) {
      return payloadResult.response;
    }

    if (payloadResult.payload.action !== "replace_profile") {
      return NextResponse.json(
        {
          error: "Use action=replace_profile with a protected bucket list.",
          service,
        },
        {
          headers: noStoreHeaders,
          status: 400,
        },
      );
    }

    const normalized = normalizeProtectedBucketProfile(
      payloadResult.payload.buckets,
    );

    if (!normalized.ok) {
      return NextResponse.json(
        {
          errors: normalized.errors,
          service,
        },
        {
          headers: noStoreHeaders,
          status: 400,
        },
      );
    }

    const snapshot = createNeobankSnapshot();
    const buckets = bucketBalancesFromProfile(
      normalized.buckets,
      snapshot.buckets,
      0,
    );
    const protectedCents = normalized.buckets.reduce(
      (total, bucket) => total + bucket.targetCents,
      0,
    );

    return NextResponse.json(
      {
        buckets,
        message: "Bucket preview updated for this session.",
        persisted: false,
        persistence: {
          persisted: false,
          persistence: "app_session_model",
          reason: "This preview is available for the current session only.",
        },
        profilePersistence: "app_session_model",
        profileSource: "app_session_model",
        protectedCents,
        readiness: snapshot.readiness,
        safeSpendRule: "Safe to Spend is computed only after protected buckets fund.",
        service,
      },
      {
        headers: noStoreHeaders,
        status: 200,
      },
    );
  } catch (error) {
    return appSessionErrorResponse(error) ?? unauthorizedAppResponse();
  }
}
