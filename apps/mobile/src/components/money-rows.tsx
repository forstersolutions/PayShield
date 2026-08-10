import {
  CalendarDays,
  CreditCard,
  Landmark,
  LifeBuoy,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ProgressBar } from "@/components/ui";
import { BucketColors, Colors, Radius, Spacing } from "@/constants/theme";
import { formatMoney, formatShortDate, titleCase } from "@/lib/format";
import type { BillPayment, BucketBalance, Payee, TimelineItem } from "@/lib/types";

export function BucketRow({
  bucket,
  index,
  onPress,
}: {
  bucket: BucketBalance;
  index: number;
  onPress?: () => void;
}) {
  const color = BucketColors[index % BucketColors.length];
  const Icon =
    bucket.protection === "bill_only"
      ? ReceiptText
      : bucket.protection === "emergency"
        ? LifeBuoy
        : bucket.protection === "spendable"
          ? WalletCards
          : LockKeyhole;
  const progress = bucket.targetCents
    ? (bucket.availableCents / bucket.targetCents) * 100
    : 100;
  const content = (
    <>
      <View style={[styles.icon, { backgroundColor: `${color}16` }]}>
        <Icon color={color} size={19} />
      </View>
      <View style={styles.bucketCopy}>
        <View style={styles.topline}>
          <Text numberOfLines={1} style={styles.name}>{bucket.name}</Text>
          <Text style={styles.amount}>{formatMoney(bucket.availableCents)}</Text>
        </View>
        <View style={styles.metaLine}>
          <Text numberOfLines={1} style={styles.meta}>{bucket.due}</Text>
          <Text style={styles.meta}>{bucket.targetCents ? `${Math.round(progress)}% funded` : "Available"}</Text>
        </View>
        <ProgressBar color={color} progress={progress} />
      </View>
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function BillRow({ bill, payee }: { bill: BillPayment; payee?: Payee }) {
  return (
    <View style={styles.row}>
      <View style={[styles.icon, styles.billIcon]}><CalendarDays color={Colors.gold} size={19} /></View>
      <View style={styles.billCopy}>
        <Text numberOfLines={1} style={styles.name}>{payee?.name ?? "Scheduled bill"}</Text>
        <Text numberOfLines={1} style={styles.meta}>{bill.memo || formatShortDate(bill.scheduledFor)}</Text>
      </View>
      <View style={styles.billAmount}>
        <Text style={styles.amount}>{formatMoney(bill.amountCents)}</Text>
        <Text style={styles.meta}>{formatShortDate(bill.scheduledFor)}</Text>
      </View>
    </View>
  );
}

export function TimelineRow({ item }: { item: TimelineItem }) {
  const Icon = item.rail.includes("card")
    ? CreditCard
    : item.rail.includes("bill")
      ? ReceiptText
      : item.rail.includes("bank")
        ? Landmark
        : item.rail.includes("unlock")
          ? LockKeyhole
          : ShieldCheck;
  const positive = item.rail.includes("paycheck") || item.rail.includes("deposit");
  return (
    <View style={styles.row}>
      <View style={[styles.icon, positive ? styles.goodIcon : styles.neutralIcon]}>
        <Icon color={positive ? Colors.mint : Colors.blue} size={19} />
      </View>
      <View style={styles.billCopy}>
        <Text numberOfLines={1} style={styles.name}>{titleCase(item.label)}</Text>
        <Text numberOfLines={1} style={styles.meta}>{item.detail || titleCase(item.status)}</Text>
      </View>
      <View style={styles.billAmount}>
        <Text style={[styles.amount, positive && styles.positive]}>
          {item.amountCents ? `${positive ? "+" : ""}${formatMoney(item.amountCents)}` : titleCase(item.status)}
        </Text>
        <Text style={styles.meta}>{formatShortDate(item.at)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: Spacing.md, minHeight: 58, paddingVertical: 8 },
  pressed: { opacity: 0.72 },
  icon: { alignItems: "center", borderRadius: Radius.md, height: 40, justifyContent: "center", width: 40 },
  bucketCopy: { flex: 1, gap: 6, minWidth: 0 },
  billCopy: { flex: 1, gap: 3, minWidth: 0 },
  topline: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, justifyContent: "space-between" },
  metaLine: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, justifyContent: "space-between" },
  name: { color: Colors.ink, flexShrink: 1, fontSize: 14, fontWeight: "700" },
  amount: { color: Colors.ink, fontSize: 14, fontVariant: ["tabular-nums"], fontWeight: "700" },
  positive: { color: Colors.mint },
  meta: { color: Colors.inkMuted, fontSize: 11 },
  billIcon: { backgroundColor: "rgba(241,198,111,0.10)" },
  goodIcon: { backgroundColor: "rgba(114,221,183,0.10)" },
  neutralIcon: { backgroundColor: "rgba(110,145,255,0.10)" },
  billAmount: { alignItems: "flex-end", gap: 3 },
});

