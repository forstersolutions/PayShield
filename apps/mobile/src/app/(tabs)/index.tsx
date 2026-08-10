import { useRouter } from "expo-router";
import {
  ArrowDownToLine,
  ChevronRight,
  CreditCard,
  Landmark,
  LockOpen,
  ReceiptText,
  ShieldCheck,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { BillRow, BucketRow, TimelineRow } from "@/components/money-rows";
import { TransferSheet, UnlockSheet } from "@/components/money-actions";
import {
  AppHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
  QuickAction,
  Screen,
  SectionHeading,
  StatusPill,
} from "@/components/ui";
import { Colors, Fonts, Radius, Spacing } from "@/constants/theme";
import { formatMoney, initials } from "@/lib/format";
import { useOperations } from "@/hooks/use-pay-shield";
import { useSession } from "@/providers/session-provider";

export default function HomeScreen() {
  const router = useRouter();
  const session = useSession();
  const operations = useOperations();
  const [transferOpen, setTransferOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [entrance] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(entrance, {
      damping: 18,
      mass: 0.7,
      stiffness: 115,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const data = operations.data;
  const buckets = data?.buckets ?? [];
  const protectedBuckets = buckets.filter((bucket) => bucket.id !== "safe_spending");
  const payees = data?.controls?.payees ?? [];
  const upcoming = (data?.operations?.billPayments ?? [])
    .filter((bill) => ["scheduled", "submitted"].includes(bill.status))
    .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor))
    .slice(0, 2);
  const timeline = (data?.timeline ?? []).slice(0, 3);
  const bankConnected = Boolean(data?.operations?.bankConnections?.length);
  const cardActive = ["active", "live"].includes(data?.card?.status ?? "");

  return (
    <Screen onRefresh={() => void operations.refetch()} refreshing={operations.isRefetching}>
      <AppHeader avatar={initials(session.displayName)} onAvatarPress={() => router.push("/profile")} />

      {operations.isLoading ? <LoadingState /> : null}
      {operations.error && !data ? <ErrorState message={operations.error.message} onRetry={() => void operations.refetch()} /> : null}

      {data ? (
        <>
          <Animated.View
            style={{
              opacity: entrance,
              transform: [
                {
                  translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
                },
              ],
            }}
          >
            <View style={styles.balanceHero}>
              <View style={styles.balanceTopline}>
                <View style={styles.balanceLabel}>
                  <ShieldCheck color={Colors.mint} size={18} />
                  <Text style={styles.balanceLabelText}>SAFE TO SPEND</Text>
                </View>
                <StatusPill label="Available now" tone="good" />
              </View>
              <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.balance}>
                {formatMoney(data.balances.safeToSpendCents, 2)}
              </Text>
              <View style={styles.protectedLine}>
                <View style={styles.protectedCopy}>
                  <Text style={styles.protectedAmount}>{formatMoney(data.balances.protectedCents)}</Text>
                  <Text style={styles.protectedText}>protected for what comes next</Text>
                </View>
                <View style={styles.miniShield}><ShieldCheck color={Colors.blue} size={21} /></View>
              </View>
            </View>
          </Animated.View>

          <View style={styles.quickActions}>
            <QuickAction color={Colors.blue} icon={ArrowDownToLine} label="Move money" onPress={() => setTransferOpen(true)} />
            <QuickAction color={Colors.gold} icon={ReceiptText} label="Pay a bill" onPress={() => router.push("/bills")} />
            <QuickAction color={Colors.coral} icon={LockOpen} label="Emergency" onPress={() => setUnlockOpen(true)} />
          </View>

          {!bankConnected ? (
            <Pressable onPress={() => router.push("/account")} style={({ pressed }) => [styles.setupBand, pressed && styles.pressed]}>
              <View style={styles.setupIcon}><Landmark color={Colors.gold} size={21} /></View>
              <View style={styles.setupCopy}>
                <Text style={styles.setupTitle}>Connect your paycheck account</Text>
                <Text style={styles.setupBody}>Turn on deposit detection and automatic protection.</Text>
              </View>
              <ChevronRight color={Colors.inkMuted} size={19} />
            </Pressable>
          ) : null}

          <View style={styles.section}>
            <SectionHeading
              action={<Pressable hitSlop={8} onPress={() => router.push("/plan")}><Text style={styles.link}>Edit plan</Text></Pressable>}
              detail={`${protectedBuckets.length} priorities funded from each paycheck`}
              title="Protected buckets"
            />
            <Panel style={styles.rowsPanel}>
              {protectedBuckets.map((bucket, index) => (
                <View key={bucket.id}>
                  {index ? <View style={styles.divider} /> : null}
                  <BucketRow bucket={bucket} index={index} onPress={() => router.push("/plan")} />
                </View>
              ))}
            </Panel>
          </View>

          <Panel style={styles.cardPanel} tone={cardActive ? "blue" : "warning"}>
            <View style={styles.cardVisual}>
              <View style={styles.cardBrand}>
                <ShieldCheck color={Colors.blue} size={19} />
                <Text style={styles.cardName}>PayShield</Text>
              </View>
              <Text style={styles.cardDigits}>•••• {data.card?.cardLast4 || "----"}</Text>
            </View>
            <View style={styles.cardCopy}>
              <StatusPill label={cardActive ? "Purchase protection on" : "Card locked"} tone={cardActive ? "good" : "warning"} />
              <Text style={styles.cardBody}>Every purchase checks the Safe to Spend balance before protected money.</Text>
            </View>
            <CreditCard color={Colors.inkFaint} size={22} />
          </Panel>

          <View style={styles.section}>
            <SectionHeading
              action={<Pressable hitSlop={8} onPress={() => router.push("/bills")}><Text style={styles.link}>See bills</Text></Pressable>}
              detail="Paid only from their assigned buckets"
              title="Coming up"
            />
            <Panel style={styles.rowsPanel}>
              {upcoming.length ? upcoming.map((bill, index) => (
                <View key={bill.id}>
                  {index ? <View style={styles.divider} /> : null}
                  <BillRow bill={bill} payee={payees.find((payee) => payee.id === bill.payeeId)} />
                </View>
              )) : <EmptyState body="Scheduled bills will appear here." icon={ReceiptText} title="Nothing scheduled" />}
            </Panel>
          </View>

          <View style={styles.section}>
            <SectionHeading
              action={<Pressable hitSlop={8} onPress={() => router.push("/activity")}><Text style={styles.link}>All activity</Text></Pressable>}
              title="Latest activity"
            />
            <Panel style={styles.rowsPanel}>
              {timeline.map((item, index) => (
                <View key={item.id}>
                  {index ? <View style={styles.divider} /> : null}
                  <TimelineRow item={item} />
                </View>
              ))}
            </Panel>
          </View>

          <TransferSheet buckets={buckets} onClose={() => setTransferOpen(false)} payees={payees} visible={transferOpen} />
          <UnlockSheet buckets={buckets} onClose={() => setUnlockOpen(false)} visible={unlockOpen} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceHero: { backgroundColor: "#14231E", borderColor: "rgba(114,221,183,0.20)", borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.lg, overflow: "hidden", padding: Spacing.xl },
  balanceTopline: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, justifyContent: "space-between" },
  balanceLabel: { alignItems: "center", flexDirection: "row", gap: 7 },
  balanceLabelText: { color: Colors.inkMuted, fontSize: 11, fontWeight: "800" },
  balance: { color: Colors.ink, fontFamily: Fonts.rounded, fontSize: 52, fontVariant: ["tabular-nums"], fontWeight: "800", lineHeight: 58 },
  protectedLine: { alignItems: "center", borderTopColor: Colors.line, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingTop: Spacing.lg },
  protectedCopy: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  protectedAmount: { color: Colors.blue, fontSize: 15, fontWeight: "800" },
  protectedText: { color: Colors.inkMuted, fontSize: 14 },
  miniShield: { alignItems: "center", backgroundColor: "rgba(110,145,255,0.12)", borderRadius: Radius.round, height: 38, justifyContent: "center", width: 38 },
  quickActions: { flexDirection: "row", gap: Spacing.md, justifyContent: "space-around" },
  setupBand: { alignItems: "center", backgroundColor: "#252115", borderColor: "rgba(241,198,111,0.22)", borderRadius: Radius.lg, borderWidth: 1, flexDirection: "row", gap: Spacing.md, padding: Spacing.lg },
  setupIcon: { alignItems: "center", backgroundColor: "rgba(241,198,111,0.10)", borderRadius: Radius.round, height: 44, justifyContent: "center", width: 44 },
  setupCopy: { flex: 1, gap: 3 },
  setupTitle: { color: Colors.ink, fontSize: 14, fontWeight: "700" },
  setupBody: { color: Colors.inkMuted, fontSize: 12, lineHeight: 17 },
  section: { gap: Spacing.md },
  link: { color: Colors.mint, fontSize: 13, fontWeight: "700" },
  rowsPanel: { gap: 0, paddingHorizontal: Spacing.lg, paddingVertical: 6 },
  divider: { backgroundColor: Colors.line, height: StyleSheet.hairlineWidth, marginLeft: 52 },
  cardPanel: { alignItems: "center", flexDirection: "row", gap: Spacing.md },
  cardVisual: { backgroundColor: "#0F1730", borderColor: "rgba(110,145,255,0.22)", borderRadius: Radius.md, borderWidth: 1, gap: Spacing.xl, minHeight: 92, padding: Spacing.md, width: 132 },
  cardBrand: { alignItems: "center", flexDirection: "row", gap: 5 },
  cardName: { color: Colors.ink, fontSize: 11, fontWeight: "800" },
  cardDigits: { color: Colors.inkMuted, fontFamily: Fonts.mono, fontSize: 11 },
  cardCopy: { flex: 1, gap: 8 },
  cardBody: { color: Colors.inkMuted, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.72 },
});
