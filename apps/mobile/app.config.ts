import type { ConfigContext, ExpoConfig } from "expo/config";

const bundleIdentifier = "com.graystontechnologies.payshield";
const productionHost = "payshield-lime.vercel.app";
const easProjectId =
  process.env.EAS_PROJECT_ID ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "PayShield",
  slug: "payshield",
  description:
    "Paycheck protection, customizable money buckets, bill routing, and one honest Safe to Spend balance.",
  version: "1.0.0",
  runtimeVersion: {
    policy: "appVersion",
  },
  orientation: "portrait",
  scheme: "payshield",
  userInterfaceStyle: "dark",
  icon: "./assets/brand/app-icon.png",
  platforms: ["ios", "android", "web"],
  plugins: [
    "expo-router",
    "@clerk/expo",
    "expo-secure-store",
    "expo-sharing",
    "@react-native-community/datetimepicker",
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Allow PayShield to use Face ID to protect access to your household money controls.",
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0B100F",
        image: "./assets/brand/splash-mark.png",
        imageWidth: 144,
        resizeMode: "contain",
      },
    ],
  ],
  ios: {
    bundleIdentifier,
    buildNumber: process.env.IOS_BUILD_NUMBER ?? "1",
    supportsTablet: false,
    associatedDomains: [`applinks:${productionHost}`],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleIdentifier,
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? "1"),
    adaptiveIcon: {
      backgroundColor: "#F8FBFF",
      foregroundImage: "./assets/brand/android-foreground.png",
      monochromeImage: "./assets/brand/android-monochrome.png",
    },
    predictiveBackGestureEnabled: true,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [
          {
            scheme: "https",
            host: productionHost,
            pathPrefix: "/mobile",
          },
        ],
      },
    ],
  },
  web: {
    output: "static",
    favicon: "./assets/brand/favicon.png",
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    apiBaseUrl:
      process.env.EXPO_PUBLIC_API_BASE_URL ??
      `https://${productionHost}`,
    supportEmail: "support@graystontechnologies.com",
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
});
