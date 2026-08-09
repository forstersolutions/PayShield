import { NextResponse } from "next/server.js";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "payshield-web-app",
      status: "healthy",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
      status: 200,
    },
  );
}
