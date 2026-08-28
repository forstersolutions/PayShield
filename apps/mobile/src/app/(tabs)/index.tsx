import { useRouter } from "expo-router";
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronRight,
  Circle,
  CreditCard,
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
  ProgressBar,
  QuickAction,
  Screen,
  SectionHeading,
  StatusPill,
} from "@/components/ui";
import { Colors, Fonts, Radius, Spacing } from "@/constants/theme";
import { formatMoney, initials } from "@/lib/format";
import { useOperations } from "@/hooks/use-pay-shield";
import { useSession } from "@/providers/session-provider";
import { useMembership } from "@/providers/membership-provider";

function SetupStep({
  complete,
  detail,
  onPress,
  title,
}: {
  complete: boolean;
  detail: string;
  onPress: () => void;
  title: string;
}) {
  const Icon = complete ? CheckCircle2 : Circle;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.setupStep, pressed && styles.pressed]}
    >
      <Icon color={complete ? Colors.mint : Colors.gold} size={21} />
      <View style={styles.setupStepCopy}>
        <Text style={styles.setupStepTitle}>{title}</Text>
        <Text style={styles.setupStepDetail}>{detail}</Text>
      </View>
      <ChevronRight color={Colors.inkFaint} size={18} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const session = useSession();
  const membership = useMembership();
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
  const cardAvailable = cardActive || ["frozen", "locked"].includes(data?.card?.status ?? "") || data?.readiness?.liveMoneyReady === true;
  const transferAvailable = payees.some((payee) => payee.status === "approved");
  const protectedFundsAvailable = protectedBuckets.some((bucket) => bucket.availableCents > 0);
  const planReady = Boolean(
    protectedBuckets.length &&
      data?.operations?.paycheckDetectionRules?.some((rule) => rule.status === "active"),
  );
  const billReady = payees.some((payee) => payee.status === "approved");
  const setupCompleteCount = [membership.active, bankConnected, planReady, billReady].filter(Boolean).length;

  return (
    <Screen onRefresh={() => void operations.refetch()} refreshing={operations.isRefetching}>
      <AppHeader avatar={initials(session.displayName)} onAvatarPress={() => router.push("/profile")} />

      {operations.isLoading ? <LoadingState /> : null}
      {operations.error && !data ? <ErrorState message={operations.error.message} onRetry={() => void operations.refetch()} /> : null}

      {data ? (
        <>
          {setupCompleteCount < 4 ? (
            <Panel style={styles.setupPanel} tone="warning">
              <View style={styles.setupHeader}>
                <View style={styles.setupHeaderCopy}>
                  <Text style={styles.setupEyebrow}>GET PAYSHIELD WORKING</Text>
                  <Text style={styles.setupHeading}>Finish your money setup</Text>
                </View>
                <Text style={styles.setupCount}>{setupCompleteCount}/4</Text>
              </View>
              <ProgressBar color={Colors.gold} progress={(setupCompleteCount / 4) * 100} />
              <View style={styles.setupSteps}>
                <SetupStep complete={membership.active} detail={membership.active ? "Household access is active" : "Activate your household membership"} onPress={() => router.push("/account")} title="Membership" />
                <SetupStep complete={bankConnected} detail={bankConnected ? "Income account connected" : "Connect where your paycheck arrives"} onPress={() => router.push("/account")} title="Paycheck account" />
                <SetupStep complete={planReady} detail={planReady ? "Automatic priorities are saved" : "Set pay, schedule, and funding order"} onPress={() => router.push("/plan")} title="Protection plan" />
                <SetupStep complete={billReady} detail={billReady ? "At least one destination is verified" : "Choose who can receive protected money"} onPress={() => router.push("/bills")} title="Bill destination" />
              </View>
            </Panel>
          ) : null}

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
            <QuickAction color={Colors.blue} icon={ArrowDownToLine} label="Move money" onPress={() => transferAvailable ? setTransferOpen(true) : router.push("/bills")} />
            <QuickAction color={Colors.gold} icon={ReceiptText} label="Pay a bill" onPress={() => router.push("/bills")} />
            <QuickAction color={Colors.coral} icon={LockOpen} label="Emergency" onPress={() => protectedFundsAvailable ? setUnlockOpen(true) : router.push("/plan")} />
          </View>

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

          {cardAvailable ? <Panel style={styles.cardPanel} tone={cardActive ? "blue" : "warning"}>
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
          </Panel> : null}

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
              {timeline.length ? timeline.map((item, index) => (
                <View key={item.id}>
                  {index ? <View style={styles.divider} /> : null}
                  <TimelineRow item={item} />
                </View>
              )) : <EmptyState body="Deposits, bills, card decisions, transfers, and unlocks will appear here." icon={ShieldCheck} title="No activity yet" />}
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
  protectedLine: { alignItems: "center", borderTopColor: Colors.line, borderTopWidth: 1, flexDirection: "row", gap: Spacing.md, justifyContent: "space-between", paddingTop: Spacing.lg },
  protectedCopy: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5, minWidth: 0 },
  protectedAmount: { color: Colors.blue, fontSize: 15, fontWeight: "800" },
  protectedText: { color: Colors.inkMuted, flexShrink: 1, fontSize: 14, lineHeight: 19 },
  miniShield: { alignItems: "center", backgroundColor: "rgba(110,145,255,0.12)", borderRadius: Radius.round, flexShrink: 0, height: 38, justifyContent: "center", width: 38 },
  quickActions: { flexDirection: "row", gap: Spacing.md, justifyContent: "space-around" },
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
  setupPanel: { gap: Spacing.md },
  setupHeader: { alignItems: "center", flexDirection: "row", gap: Spacing.md, justifyContent: "space-between" },
  setupHeaderCopy: { flex: 1, gap: 3 },
  setupEyebrow: { color: Colors.gold, fontSize: 10, fontWeight: "800" },
  setupHeading: { color: Colors.ink, fontSize: 18, fontWeight: "800" },
  setupCount: { color: Colors.gold, fontSize: 14, fontVariant: ["tabular-nums"], fontWeight: "800" },
  setupSteps: { gap: 2 },
  setupStep: { alignItems: "center", borderTopColor: Colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: Spacing.sm, minHeight: 56, paddingVertical: 8 },
  setupStepCopy: { flex: 1, gap: 2 },
  setupStepTitle: { color: Colors.ink, fontSize: 14, fontWeight: "700" },
  setupStepDetail: { color: Colors.inkMuted, fontSize: 11, lineHeight: 16 },
});
