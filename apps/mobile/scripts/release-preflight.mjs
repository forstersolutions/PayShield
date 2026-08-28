import { readFileSync } from "node:fs";

const requiredEnvironment = [
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
];
const missing = requiredEnvironment.filter(
  (name) => !process.env[name]?.trim(),
);
const easProjectId =
  process.env.EAS_PROJECT_ID?.trim() ||
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
  "";

if (!easProjectId) {
  missing.push("EAS_PROJECT_ID");
}
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  "https://payshield-lime.vercel.app";
let apiBaseUrlValid = false;

try {
  const url = new URL(apiBaseUrl);
  apiBaseUrlValid =
    url.protocol === "https:" && !url.username && !url.password;
} catch {
  apiBaseUrlValid = false;
}

const release = JSON.parse(
  readFileSync(
    new URL("../store/release-config.json", import.meta.url),
    "utf8",
  ),
);
const eas = JSON.parse(
  readFileSync(new URL("../eas.json", import.meta.url), "utf8"),
);
const configurationValid =
  release.application?.androidPackage ===
    "com.graystontechnologies.payshield" &&
  release.application?.appleBundleId ===
    "com.graystontechnologies.payshield" &&
  release.commerce?.entitlement === "payshield_pro" &&
  release.commerce?.productIds?.android === "payshield_monthly" &&
  release.commerce?.productIds?.ios ===
    "com.graystontechnologies.payshield.monthly" &&
  eas.build?.production?.android?.image ===
    "ubuntu-26.04-jdk-17-ndk-r27b-sdk-57" &&
  eas.build?.production?.ios?.image ===
    "macos-tahoe-26.5-xcode-26.6";
const projectIdValid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    easProjectId,
  );
const result = {
  apiBaseUrl,
  apiBaseUrlValid,
  configurationValid,
  externalInputsMissing: missing,
  projectIdValid,
  ok:
    missing.length === 0 &&
    apiBaseUrlValid &&
    configurationValid &&
    projectIdValid &&
    process.env.EXPO_PUBLIC_DEMO_MODE !== "true",
  service: "payshield-mobile-release-preflight",
};

console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exitCode = 1;
}
