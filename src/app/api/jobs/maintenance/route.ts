import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server.js";
import { requireDurableCoreService } from "../../../lib/neobank/core-required.ts";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const provided = request.headers.get("authorization") ?? "";

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const expectedBuffer = Buffer.from(`Bearer ${secret}`);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized", service: "payshield-maintenance" },
      { headers: { "cache-control": "no-store" }, status: 401 },
    );
  }

  const coreRequired = requireDurableCoreService({
    operation: "Background maintenance",
    service: "payshield-maintenance",
  });

  if (coreRequired) {
    return coreRequired;
  }

  try {
    const core = await import("../../../../../services/core/dispatcher.mjs");
    const result = await core.runCoreMaintenance(process.env);

    return NextResponse.json(
      { ok: true, result, service: "payshield-maintenance" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("PayShield maintenance failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return NextResponse.json(
      {
        error: "Maintenance could not be completed.",
        service: "payshield-maintenance",
      },
      { headers: { "cache-control": "no-store" }, status: 500 },
    );
  }
}
