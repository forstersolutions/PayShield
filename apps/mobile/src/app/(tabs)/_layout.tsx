import { Redirect, Tabs } from "expo-router";
import {
  Activity,
  CircleUserRound,
  House,
  Layers3,
  ReceiptText,
  type LucideIcon,
} from "lucide-react-native";
import { Platform } from "react-native";

import { Colors, Fonts } from "@/constants/theme";
import { useSession } from "@/providers/session-provider";

function TabIcon({ Icon, color }: { Icon: LucideIcon; color: string }) {
  return <Icon color={color} size={22} strokeWidth={2.1} />;
}

export default function TabLayout() {
  const session = useSession();
  if (session.isLoaded && !session.isSignedIn) return <Redirect href="/auth" />;

  return (
    <Tabs
      screenOptions={{
        animation: "fade",
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.canvas },
        tabBarActiveTintColor: Colors.mint,
        tabBarInactiveTintColor: Colors.inkFaint,
        tabBarLabelStyle: {
          fontFamily: Fonts.sans,
          fontSize: 10,
          fontWeight: "700",
          paddingTop: 2,
        },
        tabBarStyle: {
          backgroundColor: Colors.canvasRaised,
          borderTopColor: Colors.line,
          height: Platform.OS === "ios" ? 84 : 68,
          paddingBottom: Platform.OS === "ios" ? 22 : 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarIcon: ({ color }) => <TabIcon Icon={House} color={String(color)} />, title: "Home" }} />
      <Tabs.Screen name="plan" options={{ tabBarIcon: ({ color }) => <TabIcon Icon={Layers3} color={String(color)} />, title: "Plan" }} />
      <Tabs.Screen name="bills" options={{ tabBarIcon: ({ color }) => <TabIcon Icon={ReceiptText} color={String(color)} />, title: "Bills" }} />
      <Tabs.Screen name="activity" options={{ tabBarIcon: ({ color }) => <TabIcon Icon={Activity} color={String(color)} />, title: "Activity" }} />
      <Tabs.Screen name="account" options={{ tabBarIcon: ({ color }) => <TabIcon Icon={CircleUserRound} color={String(color)} />, title: "Account" }} />
    </Tabs>
  );
}
