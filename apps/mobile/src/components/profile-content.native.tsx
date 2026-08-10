import { UserProfileView } from "@clerk/expo/native";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PayShieldLogo } from "@/components/brand";
import { ActionButton, Panel } from "@/components/ui";
import { Colors, Spacing } from "@/constants/theme";
import { useSession } from "@/providers/session-provider";

export function ProfileContent() {
  const router = useRouter();
  const session = useSession();

  if (session.isDemo || !session.isConfigured) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.demo}>
          <PayShieldLogo compact />
          <Panel>
            <Text style={styles.title}>{session.displayName}</Text>
            <Text style={styles.body}>{session.email}</Text>
            <Text style={styles.body}>Profile security, email addresses, password recovery, active sessions, and account deletion are managed here.</Text>
            <ActionButton label="Done" onPress={() => router.back()} variant="secondary" />
          </Panel>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <UserProfileView isDismissible onDismiss={() => router.back()} style={styles.profile} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: Colors.canvas, flex: 1 },
  profile: { flex: 1 },
  demo: { gap: Spacing.xl, padding: Spacing.lg },
  title: { color: Colors.ink, fontSize: 21, fontWeight: "800" },
  body: { color: Colors.inkMuted, fontSize: 14, lineHeight: 21 },
});

