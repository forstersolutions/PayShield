import { NextResponse } from "next/server.js";

export const dynamic = "force-dynamic";

function signingFingerprints() {
  return (process.env.PAYSHIELD_ANDROID_SHA256_CERT_FINGERPRINTS || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value));
}

export function GET() {
  const fingerprints = signingFingerprints();
  const body = fingerprints.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "com.graystontechnologies.payshield",
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]
    : [];

  return NextResponse.json(body, {
    headers: {
      "cache-control": "public, max-age=300, s-maxage=3600",
      "content-type": "application/json",
    },
  });
}
