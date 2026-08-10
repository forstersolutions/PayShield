import { AuthView } from "@clerk/expo/native";
import { Mail } from "lucide-react-native";
import { Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PayShieldLogo, PayShieldMark } from "@/components/brand";
import { ActionButton, Panel } from "@/components/ui";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { appConfig, authConfigured } from "@/lib/config";

export function AuthContent() {
  if (!authConfigured) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.unavailable}>
          <PayShieldLogo />
          <Panel style={styles.unavailablePanel} tone="warning">
            <Text style={styles.title}>Sign-in is unavailable</Text>
            <Text style={styles.body}>Contact Grayston support for account access.</Text>
            <ActionButton
              icon={Mail}
              label="Contact support"
              onPress={() => void Linking.openURL(`mailto:${appConfig.supportEmail}`)}
              variant="secondary"
            />
          </Panel>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.authHeader}>
        <Text style={styles.eyebrow}>Your paycheck, protected first</Text>
        <Text style={styles.headline}>Know what is safe to spend.</Text>
      </View>
      <View style={styles.authView}>
        <AuthView
          isDismissible={false}
          logo={<PayShieldMark size={66} />}
          logoMaxHeight={72}
          mode="signInOrUp"
        />
      </View>
      <Text style={styles.footer}>A Grayston Technologies product</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: Colors.canvas, flex: 1 },
  authHeader: { gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg },
  eyebrow: { color: Colors.gold, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  headline: { color: Colors.ink, fontFamily: Fonts.rounded, fontSize: 30, fontWeight: "800", lineHeight: 35 },
  authView: { flex: 1, marginTop: Spacing.md },
  footer: { color: Colors.inkFaint, fontSize: 11, padding: Spacing.lg, textAlign: "center" },
  unavailable: { flex: 1, gap: Spacing.xxl, justifyContent: "center", padding: Spacing.xl },
  unavailablePanel: { width: "100%" },
  title: { color: Colors.ink, fontFamily: Fonts.rounded, fontSize: 22, fontWeight: "800" },
  body: { color: Colors.inkMuted, fontSize: 15, lineHeight: 22 },
});

