import { Download, Mail } from "lucide-react-native";
import { Linking, StyleSheet, Text, View } from "react-native";

import { PayShieldLogo } from "@/components/brand";
import { ActionButton, Panel } from "@/components/ui";
import { Colors, Fonts, MaxContentWidth, Spacing } from "@/constants/theme";
import { appConfig } from "@/lib/config";

export function AuthContent() {
  return (
    <View style={styles.root}>
      <PayShieldLogo />
      <Panel style={styles.panel} tone="mint">
        <Text style={styles.title}>PayShield is built for your phone.</Text>
        <Text style={styles.body}>Download the native app for secure account access, bank connection, and money controls.</Text>
        <ActionButton icon={Download} label="View app downloads" onPress={() => void Linking.openURL(appConfig.apiBaseUrl)} />
        <ActionButton icon={Mail} label="Contact support" onPress={() => void Linking.openURL(`mailto:${appConfig.supportEmail}`)} variant="secondary" />
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center", backgroundColor: Colors.canvas, flex: 1, gap: Spacing.xxl, justifyContent: "center", padding: Spacing.xl },
  panel: { maxWidth: MaxContentWidth, width: "100%" },
  title: { color: Colors.ink, fontFamily: Fonts.rounded, fontSize: 26, fontWeight: "800" },
  body: { color: Colors.inkMuted, fontSize: 16, lineHeight: 24 },
});

