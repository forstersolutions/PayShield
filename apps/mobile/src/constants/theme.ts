import { Platform } from "react-native";

export const Colors = {
  canvas: "#0B100F",
  canvasRaised: "#101714",
  surface: "#151D1A",
  surfaceRaised: "#1B2521",
  surfaceSoft: "#222E29",
  line: "rgba(231, 241, 235, 0.10)",
  lineStrong: "rgba(231, 241, 235, 0.18)",
  ink: "#F4F7F5",
  inkMuted: "#AAB7B0",
  inkFaint: "#74837B",
  mint: "#72DDB7",
  mintDeep: "#245E4C",
  blue: "#6E91FF",
  blueDeep: "#243B75",
  gold: "#F1C66F",
  coral: "#F58D7C",
  red: "#FF766F",
  white: "#FFFFFF",
  black: "#050706",
} as const;

export const BucketColors = [
  Colors.mint,
  Colors.blue,
  Colors.gold,
  Colors.coral,
  "#9B8CFF",
  "#66C9D3",
] as const;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  android: {
    sans: "sans-serif",
    rounded: "sans-serif-medium",
    mono: "monospace",
  },
  default: {
    sans: "system-ui",
    rounded: "system-ui",
    mono: "monospace",
  },
})!;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  jumbo: 48,
} as const;

export const Radius = {
  sm: 4,
  md: 6,
  lg: 8,
  round: 999,
} as const;

export const MaxContentWidth = 680;
export const TabBarHeight = Platform.OS === "ios" ? 84 : 72;

