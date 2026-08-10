import { NextRequest, NextResponse } from "next/server.js";

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/download", request.url), 307);
}
