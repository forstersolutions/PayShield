import Constants from "expo-constants";
import { Platform } from "react-native";

const extra = Constants.expoConfig?.extra ?? {};

export const appConfig = {
  apiBaseUrl: String(
    process.env.EXPO_PUBLIC_API_BASE_URL ??
      extra.apiBaseUrl ??
      "https://payshield-lime.vercel.app",
  ).replace(/\/$/, ""),
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  demoMode: process.env.EXPO_PUBLIC_DEMO_MODE === "true",
  revenueCatApiKey:
    Platform.OS === "ios"
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? ""
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "",
  revenueCatEntitlementId:
    process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? "payshield_pro",
  supportEmail: String(extra.supportEmail ?? "support@graystontechnologies.com"),
  privacyUrl: "https://payshield-lime.vercel.app/privacy",
  termsUrl: "https://payshield-lime.vercel.app/terms",
} as const;

export const authConfigured = appConfig.clerkPublishableKey.startsWith("pk_");
export const biometricPreferenceKey = "payshield.biometric-lock";
