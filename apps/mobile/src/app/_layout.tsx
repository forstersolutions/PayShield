import "../global.css";
import "react-native-reanimated";

import { Stack, ThemeProvider, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { Colors } from "@/constants/theme";
import { AppProvider } from "@/providers/app-provider";
import { useSession } from "@/providers/session-provider";

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 350, fade: true });

const navigationTheme = {
  dark: true,
  colors: {
    background: Colors.canvas,
    border: Colors.line,
    card: Colors.canvasRaised,
    notification: Colors.coral,
    primary: Colors.mint,
    text: Colors.ink,
  },
  fonts: {
    bold: { fontFamily: "system-ui", fontWeight: "700" as const },
    heavy: { fontFamily: "system-ui", fontWeight: "800" as const },
    medium: { fontFamily: "system-ui", fontWeight: "500" as const },
    regular: { fontFamily: "system-ui", fontWeight: "400" as const },
  },
};

function RootNavigator() {
  const session = useSession();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!session.isLoaded) return;
    SplashScreen.hide();
    const onAuthScreen = segments[0] === "auth";
    if (!session.isSignedIn && !onAuthScreen) router.replace("/auth");
    if (session.isSignedIn && onAuthScreen) router.replace("/");
  }, [router, segments, session.isLoaded, session.isSignedIn]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          animation: "fade_from_bottom",
          contentStyle: { backgroundColor: Colors.canvas },
          headerBackButtonDisplayMode: "minimal",
          headerStyle: { backgroundColor: Colors.canvasRaised },
          headerTintColor: Colors.ink,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ animation: "fade", headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false, presentation: "modal" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <AppProvider>
        <RootNavigator />
      </AppProvider>
    </ThemeProvider>
  );
}
