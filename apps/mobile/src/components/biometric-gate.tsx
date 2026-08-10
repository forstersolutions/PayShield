import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Fingerprint } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PayShieldLogo } from "@/components/brand";
import { ActionButton } from "@/components/ui";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { biometricPreferenceKey } from "@/lib/config";
import { useSession } from "@/providers/session-provider";

export function BiometricGate({ children }: PropsWithChildren) {
  const session = useSession();
  const appState = useRef(AppState.currentState);
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(true);

  const authenticate = useCallback(async () => {
    if (Platform.OS === "web") {
      setLocked(false);
      setChecking(false);
      return;
    }

    const enabled = (await SecureStore.getItemAsync(biometricPreferenceKey)) === "enabled";
    if (!enabled || !session.isSignedIn) {
      setLocked(false);
      setChecking(false);
      return;
    }
    setLocked(true);
    setChecking(false);
    const result = await LocalAuthentication.authenticateAsync({
      biometricsSecurityLevel: "strong",
      cancelLabel: "Cancel",
      fallbackLabel: "Use device passcode",
      promptMessage: "Open PayShield",
    });
    if (result.success) setLocked(false);
  }, [session.isSignedIn]);

  useEffect(() => {
    const initialAuthentication = setTimeout(() => void authenticate(), 0);
    const subscription = AppState.addEventListener("change", (nextState) => {
      const returning = /inactive|background/.test(appState.current) && nextState === "active";
      appState.current = nextState;
      if (returning) void authenticate();
    });
    return () => {
      clearTimeout(initialAuthentication);
      subscription.remove();
    };
  }, [authenticate]);

  if (!locked || checking) return children;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <PayShieldLogo />
        <View style={styles.icon}><Fingerprint color={Colors.mint} size={36} /></View>
        <Text style={styles.title}>PayShield is locked</Text>
        <Text style={styles.body}>Confirm it&apos;s you to see balances and money controls.</Text>
        <ActionButton icon={Fingerprint} label="Unlock PayShield" onPress={() => void authenticate()} style={styles.button} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: Colors.canvas, flex: 1 },
  content: { alignItems: "center", flex: 1, gap: Spacing.lg, justifyContent: "center", padding: Spacing.xl },
  icon: { alignItems: "center", backgroundColor: "rgba(114,221,183,0.10)", borderRadius: 44, height: 88, justifyContent: "center", marginTop: Spacing.xl, width: 88 },
  title: { color: Colors.ink, fontFamily: Fonts.rounded, fontSize: 28, fontWeight: "800", textAlign: "center" },
  body: { color: Colors.inkMuted, fontSize: 15, lineHeight: 22, maxWidth: 320, textAlign: "center" },
  button: { marginTop: Spacing.sm, width: "100%" },
});
