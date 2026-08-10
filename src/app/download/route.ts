import { NextRequest, NextResponse } from "next/server.js";

import { getStoreLinks } from "../lib/store-links.ts";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const stores = getStoreLinks();
  const requestedStore = request.nextUrl.searchParams.get("store");
  const userAgent = request.headers.get("user-agent")?.toLowerCase() || "";
  const target =
    requestedStore === "ios"
      ? stores.appStoreUrl
      : requestedStore === "android"
        ? stores.playStoreUrl
        : /android/.test(userAgent)
          ? stores.playStoreUrl
          : /iphone|ipad|ipod/.test(userAgent)
            ? stores.appStoreUrl
            : "";

  if (target) {
    return NextResponse.redirect(target, 307);
  }

  return NextResponse.redirect(new URL("/#stores", request.url), 307);
}
