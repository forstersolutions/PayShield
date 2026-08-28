import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server.js";

import { GET as getAppleAssociation } from "../src/app/.well-known/apple-app-site-association/route.ts";
import { GET as getAndroidAssociation } from "../src/app/.well-known/assetlinks.json/route.ts";
import { GET as getDownload } from "../src/app/download/route.ts";
import { getStoreLinks } from "../src/app/lib/store-links.ts";

test("store links accept only official HTTPS listing hosts", () => {
  const originalApple = process.env.NEXT_PUBLIC_APP_STORE_URL;
  const originalPlay = process.env.NEXT_PUBLIC_PLAY_STORE_URL;

  try {
    process.env.NEXT_PUBLIC_APP_STORE_URL = "https://apps.apple.com/us/app/payshield/id123456789";
    process.env.NEXT_PUBLIC_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.graystontechnologies.payshield";

    const configured = getStoreLinks();
    assert.equal(configured.appStoreConfigured, true);
    assert.equal(configured.playStoreConfigured, true);

    process.env.NEXT_PUBLIC_APP_STORE_URL = "https://apps.apple.com/us/search?term=PayShield";
    process.env.NEXT_PUBLIC_PLAY_STORE_URL = "https://play.google.com/store/search?q=PayShield&c=apps";

    const searchFallbacks = getStoreLinks();
    assert.equal(searchFallbacks.appStoreConfigured, false);
    assert.equal(searchFallbacks.playStoreConfigured, false);

    process.env.NEXT_PUBLIC_APP_STORE_URL = "https://example.com/fake-app";
    process.env.NEXT_PUBLIC_PLAY_STORE_URL = "http://play.google.com/store/apps/details?id=fake";

    const rejected = getStoreLinks();
    assert.equal(rejected.appStoreConfigured, false);
    assert.equal(rejected.playStoreConfigured, false);
    assert.match(rejected.appStoreUrl, /^https:\/\/apps\.apple\.com\/us\/search/);
    assert.match(rejected.playStoreUrl, /^https:\/\/play\.google\.com\/store\/search/);
  } finally {
    if (originalApple === undefined) delete process.env.NEXT_PUBLIC_APP_STORE_URL;
    else process.env.NEXT_PUBLIC_APP_STORE_URL = originalApple;
    if (originalPlay === undefined) delete process.env.NEXT_PUBLIC_PLAY_STORE_URL;
    else process.env.NEXT_PUBLIC_PLAY_STORE_URL = originalPlay;
  }
});

test("download route sends each mobile platform to its store", () => {
  const ios = getDownload(new NextRequest("https://payshield.test/download", {
    headers: { "user-agent": "Mozilla/5.0 (iPhone)" },
  }));
  const android = getDownload(new NextRequest("https://payshield.test/download", {
    headers: { "user-agent": "Mozilla/5.0 (Linux; Android 16)" },
  }));
  const desktop = getDownload(new NextRequest("https://payshield.test/download", {
    headers: { "user-agent": "Mozilla/5.0 (Macintosh)" },
  }));

  assert.match(ios.headers.get("location") || "", /^https:\/\/apps\.apple\.com/);
  assert.match(android.headers.get("location") || "", /^https:\/\/play\.google\.com/);
  assert.equal(desktop.headers.get("location"), "https://payshield.test/#stores");
});

test("universal-link manifests bind only the PayShield native identifiers", async () => {
  const appleResponse = getAppleAssociation();
  const apple = await appleResponse.json();
  assert.deepEqual(apple.applinks.details[0].appIDs, [
    "PT89VGZ28C.com.graystontechnologies.payshield",
  ]);
  assert.deepEqual(
    apple.applinks.details[0].components.map((item: { "/": string }) => item["/"]),
    ["/mobile", "/mobile/*"],
  );

  const originalFingerprints = process.env.PAYSHIELD_ANDROID_SHA256_CERT_FINGERPRINTS;
  try {
    delete process.env.PAYSHIELD_ANDROID_SHA256_CERT_FINGERPRINTS;
    assert.deepEqual(await getAndroidAssociation().json(), []);

    process.env.PAYSHIELD_ANDROID_SHA256_CERT_FINGERPRINTS = Array(32).fill("AB").join(":");
    const android = await getAndroidAssociation().json();
    assert.equal(android[0].target.package_name, "com.graystontechnologies.payshield");
    assert.equal(android[0].target.sha256_cert_fingerprints.length, 1);
  } finally {
    if (originalFingerprints === undefined) delete process.env.PAYSHIELD_ANDROID_SHA256_CERT_FINGERPRINTS;
    else process.env.PAYSHIELD_ANDROID_SHA256_CERT_FINGERPRINTS = originalFingerprints;
  }
});
