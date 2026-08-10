import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { Download, History } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Platform, Share, StyleSheet, Text, View } from "react-native";

import { TimelineRow } from "@/components/money-rows";
import {
  ActionButton,
  AppHeader,
  EmptyState,
  InlineMessage,
  LoadingState,
  PageHeading,
  Panel,
  Screen,
  SegmentedControl,
} from "@/components/ui";
import { Colors, Fonts, Spacing } from "@/constants/theme";
import { formatMoney, initials } from "@/lib/format";
import type { OperationsPacket, TimelineItem } from "@/lib/types";
import { useOperations, usePayShieldApi } from "@/hooks/use-pay-shield";
import { useSession } from "@/providers/session-provider";

type ActivityFilter = "all" | "protected" | "spending" | "bills";

const filters = [
  { label: "All", value: "all" },
  { label: "Protected", value: "protected" },
  { label: "Spending", value: "spending" },
  { label: "Bills", value: "bills" },
] as const;

function matches(item: TimelineItem, filter: ActivityFilter) {
  if (filter === "all") return true;
  if (filter === "protected") return ["paycheck", "buckets", "unlock", "transfer"].some((rail) => item.rail.includes(rail));
  if (filter === "spending") return item.rail.includes("card");
  return item.rail.includes("bill");
}

export default function ActivityScreen() {
  const router = useRouter();
  const session = useSession();
  const operations = useOperations();
  const request = usePayShieldApi();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const timeline = useMemo(() => (operations.data?.timeline ?? []).filter((item) => matches(item, filter)), [filter, operations.data?.timeline]);

  async function exportActivity() {
    setExporting(true);
    setMessage("");
    setError("");
    try {
      const payload = await request<OperationsPacket>("/api/app/audit/export");
      const contents = JSON.stringify(payload, null, 2);
      const filename = `payshield-activity-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === "web") {
        await Share.share({ message: contents, title: filename });
      } else {
        const file = new File(Paths.cache, filename);
        if (file.exists) file.delete();
        file.create();
        file.write(contents);
        if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
        await Sharing.shareAsync(file.uri, { dialogTitle: "Export PayShield activity", mimeType: "application/json", UTI: "public.json" });
      }
      setMessage("Activity export is ready.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Activity could not be exported.");
    } finally {
      setExporting(false);
    }
  }

  const data = operations.data;
  const scheduledTotal = (data?.operations?.billPayments ?? []).filter((bill) => ["scheduled", "submitted"].includes(bill.status)).reduce((sum, bill) => sum + bill.amountCents, 0);

  return (
    <Screen onRefresh={() => void operations.refetch()} refreshing={operations.isRefetching}>
      <AppHeader avatar={initials(session.displayName)} onAvatarPress={() => router.push("/profile")} />
      <PageHeading
        action={<ActionButton icon={Download} label="Export" loading={exporting} onPress={() => void exportActivity()} variant="secondary" />}
        body="Every deposit, protection decision, bill, transfer, and unlock in one record."
        eyebrow="Activity"
        title="A clear trail for every dollar."
      />
      <InlineMessage message={message} />
      <InlineMessage message={error} tone="error" />

      {operations.isLoading ? <LoadingState label="Loading activity..." /> : null}
      {data ? (
        <>
          <View style={styles.stats}>
            <Panel style={styles.stat} tone="mint">
              <Text style={styles.statLabel}>PROTECTED NOW</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={styles.statAmount}>{formatMoney(data.balances.protectedCents)}</Text>
            </Panel>
            <Panel style={styles.stat} tone="blue">
              <Text style={styles.statLabel}>BILLS AHEAD</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={styles.statAmount}>{formatMoney(scheduledTotal)}</Text>
            </Panel>
          </View>

          <SegmentedControl onChange={setFilter} options={filters} value={filter} />

          <Panel style={styles.timelinePanel}>
            {timeline.length ? timeline.map((item, index) => (
              <View key={item.id}>
                {index ? <View style={styles.divider} /> : null}
                <TimelineRow item={item} />
              </View>
            )) : <EmptyState body="Activity matching this view will appear here." icon={History} title="No matching activity" />}
          </Panel>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: Spacing.sm },
  stat: { flex: 1, gap: 5, minWidth: 0 },
  statLabel: { color: Colors.inkFaint, fontSize: 10, fontWeight: "800" },
  statAmount: { color: Colors.ink, fontFamily: Fonts.rounded, fontSize: 24, fontWeight: "800" },
  timelinePanel: { gap: 0, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  divider: { backgroundColor: Colors.line, height: StyleSheet.hairlineWidth, marginLeft: 52 },
});

