import { NextResponse } from "next/server.js";
import { createHouseholdActivationPacket } from "../../../lib/neobank/operations.ts";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(createHouseholdActivationPacket(), {
    headers: {
      "cache-control": "no-store",
    },
    status: 200,
  });
}
