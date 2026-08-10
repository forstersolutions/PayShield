import { NextResponse } from "next/server.js";

export const dynamic = "force-static";

export function GET() {
  const teamId = process.env.PAYSHIELD_APPLE_TEAM_ID?.trim() || "PT89VGZ28C";

  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [
              `${teamId}.com.graystontechnologies.payshield`,
            ],
            components: [
              { "/": "/mobile", comment: "Open the PayShield app" },
              { "/": "/mobile/*", comment: "Open PayShield app routes" },
            ],
          },
        ],
      },
    },
    {
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=86400",
        "content-type": "application/json",
      },
    },
  );
}
