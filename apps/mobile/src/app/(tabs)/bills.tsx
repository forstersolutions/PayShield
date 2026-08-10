import { useRouter } from "expo-router";
import {
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { BillRow } from "@/components/money-rows";
import {
  ActionButton,
  AppHeader,
  EmptyState,
  FormField,
  InlineMessage,
  LoadingState,
  ModalSheet,
  PageHeading,
  Panel,
  Screen,
  SectionHeading,
  StatusPill,
} from "@/components/ui";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { dollarsToCents, formatMoney, initials, titleCase } from "@/lib/format";
import { idempotencyKey } from "@/lib/idempotency";
import type { BillPayment, BucketBalance, Payee } from "@/lib/types";
import { useOperations, usePayShieldMutation } from "@/hooks/use-pay-shield";
import { useSession } from "@/providers/session-provider";

function defaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function BucketChoice({ bucket, selected, onPress }: { bucket: BucketBalance; onPress: () => void; selected: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      <ShieldCheck color={selected ? Colors.mint : Colors.inkFaint} size={19} />
      <View style={styles.choiceCopy}>
        <Text style={styles.choiceLabel}>{bucket.name}</Text>
        <Text style={styles.choiceDetail}>{formatMoney(bucket.availableCents)} available</Text>
      </View>
      {selected ? <CheckCircle2 color={Colors.mint} size={19} /> : null}
    </Pressable>
  );
}

export default function BillsScreen() {
  const router = useRouter();
  const session = useSession();
  const operations = useOperations();
  const [billOpen, setBillOpen] = useState(false);
  const [payeeOpen, setPayeeOpen] = useState(false);
  const [payeeId, setPayeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [scheduledFor, setScheduledFor] = useState(defaultDate);
  const [destinationName, setDestinationName] = useState("");
  const [destinationBucketId, setDestinationBucketId] = useState("");
  const [destinationLimit, setDestinationLimit] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const schedule = usePayShieldMutation<{ message?: string }, Record<string, unknown>>("/api/app/bill-payments");
  const cancel = usePayShieldMutation<{ message?: string }, Record<string, unknown>>("/api/app/bill-payments/cancel");
  const addPayee = usePayShieldMutation<{ enrollmentUrl?: string; message?: string; payee?: Payee }, Record<string, unknown>>("/api/app/payees");
  const verifyPayee = usePayShieldMutation<{ enrollmentUrl?: string; message?: string; payee?: Payee }, Record<string, unknown>>("/api/app/payees/verify");

  const data = operations.data;
  const buckets = data?.buckets.filter((bucket) => bucket.id !== "safe_spending") ?? [];
  const payees = data?.controls?.payees?.filter((payee) => payee.status !== "archived") ?? [];
  const approved = payees.filter((payee) => payee.status === "approved");
  const upcoming = useMemo(
    () => (data?.operations?.billPayments ?? []).filter((bill) => ["scheduled", "submitted", "blocked"].includes(bill.status)).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
    [data?.operations?.billPayments],
  );
  const selectedPayee = approved.find((payee) => payee.id === payeeId) ?? approved[0];
  const selectedBucket = buckets.find((bucket) => bucket.id === selectedPayee?.allowedBucketId);
  const amountCents = dollarsToCents(amount);
  const billValid = Boolean(selectedPayee && selectedBucket && scheduledFor && amountCents > 0 && amountCents <= selectedPayee.maxCents && amountCents <= selectedBucket.availableCents);
  const destinationValid = Boolean(destinationName.trim() && destinationBucketId && dollarsToCents(destinationLimit) > 0);

  function resetMessages() {
    setMessage("");
    setError("");
  }

  async function scheduleBill() {
    if (!billValid || !selectedPayee) return;
    resetMessages();
    try {
      const response = await schedule.mutateAsync({ amountCents, idempotencyKey: idempotencyKey("mobile-bill"), memo: memo.trim() || undefined, payeeId: selectedPayee.id, scheduledFor });
      setMessage(response.message ?? "Bill scheduled.");
      setBillOpen(false);
      setAmount("");
      setMemo("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The bill could not be scheduled.");
    }
  }

  async function createDestination() {
    if (!destinationValid) return;
    resetMessages();
    try {
      const response = await addPayee.mutateAsync({ allowedBucketId: destinationBucketId, idempotencyKey: idempotencyKey("mobile-payee"), maxCents: dollarsToCents(destinationLimit), name: destinationName.trim() });
      setMessage(response.message ?? "Destination added.");
      setPayeeOpen(false);
      setDestinationName("");
      setDestinationLimit("");
      if (response.enrollmentUrl) await Linking.openURL(response.enrollmentUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The destination could not be added.");
    }
  }

  async function startVerification(payee: Payee) {
    resetMessages();
    try {
      const response = await verifyPayee.mutateAsync({ idempotencyKey: idempotencyKey("mobile-payee-verify"), payeeId: payee.id });
      setMessage(response.message ?? "Destination verified.");
      if (response.enrollmentUrl) await Linking.openURL(response.enrollmentUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Verification could not be opened.");
    }
  }

  function confirmCancel(bill: BillPayment) {
    Alert.alert("Cancel this bill?", "The scheduled payment will be removed. No money will move.", [
      { style: "cancel", text: "Keep bill" },
      {
        style: "destructive",
        text: "Cancel bill",
        onPress: () => {
          void cancel.mutateAsync({ idempotencyKey: idempotencyKey("mobile-bill-cancel"), reason: "Canceled from PayShield mobile", scheduleId: bill.id }).then((response) => setMessage(response.message ?? "Bill canceled.")).catch((requestError) => setError(requestError instanceof Error ? requestError.message : "The bill could not be canceled."));
        },
      },
    ]);
  }

  return (
    <Screen onRefresh={() => void operations.refetch()} refreshing={operations.isRefetching}>
      <AppHeader avatar={initials(session.displayName)} onAvatarPress={() => router.push("/profile")} />
      <PageHeading body="Approved destinations can reach only the bucket you assign." eyebrow="Bill routing" title="Bills use their money. Nothing else does." />

      {operations.isLoading ? <LoadingState label="Loading bills..." /> : null}
      {data ? (
        <>
          <View style={styles.actions}>
            <ActionButton disabled={!approved.length} icon={CalendarPlus} label="Schedule bill" onPress={() => { resetMessages(); setPayeeId(approved[0]?.id ?? ""); setBillOpen(true); }} style={styles.action} />
            <ActionButton icon={Plus} label="Add destination" onPress={() => { resetMessages(); setDestinationBucketId(buckets[0]?.id ?? ""); setPayeeOpen(true); }} style={styles.action} variant="secondary" />
          </View>
          <InlineMessage message={message} />
          <InlineMessage message={error} tone="error" />

          <View style={styles.section}>
            <SectionHeading detail={`${upcoming.length} payment${upcoming.length === 1 ? "" : "s"} waiting`} title="Upcoming" />
            <Panel style={styles.rowsPanel}>
              {upcoming.length ? upcoming.map((bill, index) => (
                <View key={bill.id}>
                  {index ? <View style={styles.divider} /> : null}
                  <View style={styles.billWrap}>
                    <View style={styles.billMain}><BillRow bill={bill} payee={payees.find((payee) => payee.id === bill.payeeId)} /></View>
                    <Pressable accessibilityLabel="Cancel bill" hitSlop={7} onPress={() => confirmCancel(bill)} style={styles.trash}><Trash2 color={Colors.inkFaint} size={17} /></Pressable>
                  </View>
                </View>
              )) : <EmptyState body="Schedule a bill and PayShield will hold the right money." icon={ReceiptText} title="No upcoming bills" />}
            </Panel>
          </View>

          <View style={styles.section}>
            <SectionHeading detail="Each destination is limited to one bucket and a maximum amount" title="Approved destinations" />
            <Panel style={styles.destinationPanel}>
              {payees.length ? payees.map((payee, index) => {
                const bucket = buckets.find((item) => item.id === payee.allowedBucketId);
                const ready = payee.status === "approved";
                return (
                  <View key={payee.id}>
                    {index ? <View style={styles.divider} /> : null}
                    <View style={styles.destinationRow}>
                      <View style={styles.destinationIcon}><ReceiptText color={ready ? Colors.mint : Colors.gold} size={19} /></View>
                      <View style={styles.destinationCopy}>
                        <Text style={styles.destinationName}>{payee.name}</Text>
                        <Text style={styles.destinationMeta}>{bucket?.name ?? "Bucket"} · limit {formatMoney(payee.maxCents)}</Text>
                      </View>
                      {ready ? <StatusPill label="Verified" tone="good" /> : <Pressable onPress={() => void startVerification(payee)} style={styles.verify}><ExternalLink color={Colors.gold} size={15} /><Text style={styles.verifyText}>Verify</Text></Pressable>}
                    </View>
                  </View>
                );
              }) : <EmptyState body="Add the companies or people allowed to receive protected bill money." icon={ReceiptText} title="No destinations yet" />}
            </Panel>
          </View>

          <ModalSheet onClose={() => setBillOpen(false)} title="Schedule a bill" visible={billOpen}>
            <Text style={styles.modalIntro}>Choose a verified destination. PayShield checks its assigned bucket and payment limit.</Text>
            <View style={styles.choices}>
              {approved.map((payee) => {
                const bucket = buckets.find((item) => item.id === payee.allowedBucketId);
                return <Pressable key={payee.id} onPress={() => setPayeeId(payee.id)} style={[styles.choice, payee.id === selectedPayee?.id && styles.choiceSelected]}><ReceiptText color={payee.id === selectedPayee?.id ? Colors.mint : Colors.inkFaint} size={19} /><View style={styles.choiceCopy}><Text style={styles.choiceLabel}>{payee.name}</Text><Text style={styles.choiceDetail}>{bucket?.name} · {formatMoney(bucket?.availableCents ?? 0)} available</Text></View></Pressable>;
              })}
            </View>
            <FormField keyboardType="decimal-pad" label="Amount" onChangeText={setAmount} prefix="$" placeholder="0.00" value={amount} />
            <FormField hint="YYYY-MM-DD" label="Pay on" maxLength={10} onChangeText={setScheduledFor} placeholder="2026-08-21" value={scheduledFor} />
            <FormField hint="Optional" label="Note" maxLength={120} onChangeText={setMemo} placeholder="September rent" value={memo} />
            {selectedPayee ? <Text style={styles.limitCopy}>{titleCase(selectedPayee.status)} · {formatMoney(selectedPayee.maxCents)} destination limit</Text> : null}
            <ActionButton disabled={!billValid} icon={CalendarPlus} label={amountCents ? `Schedule ${formatMoney(amountCents, 2)}` : "Schedule bill"} loading={schedule.isPending} onPress={() => void scheduleBill()} />
          </ModalSheet>

          <ModalSheet onClose={() => setPayeeOpen(false)} title="Add destination" visible={payeeOpen}>
            <Text style={styles.modalIntro}>Add a biller, landlord, lender, or other destination. Verification happens before money can move.</Text>
            <FormField label="Destination name" maxLength={80} onChangeText={setDestinationName} placeholder="Utility company" value={destinationName} />
            <Text style={styles.fieldLabel}>Allowed bucket</Text>
            <View style={styles.choices}>
              {buckets.map((bucket) => <BucketChoice bucket={bucket} key={bucket.id} onPress={() => setDestinationBucketId(bucket.id)} selected={bucket.id === destinationBucketId} />)}
            </View>
            <FormField keyboardType="decimal-pad" label="Maximum payment" onChangeText={setDestinationLimit} prefix="$" placeholder="0.00" value={destinationLimit} />
            <ActionButton disabled={!destinationValid} icon={Plus} label="Add destination" loading={addPayee.isPending} onPress={() => void createDestination()} />
          </ModalSheet>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: Spacing.sm },
  action: { flex: 1 },
  section: { gap: Spacing.md },
  rowsPanel: { gap: 0, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  destinationPanel: { gap: 0, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  divider: { backgroundColor: Colors.line, height: StyleSheet.hairlineWidth, marginLeft: 52 },
  billWrap: { alignItems: "center", flexDirection: "row" },
  billMain: { flex: 1 },
  trash: { alignItems: "center", height: 38, justifyContent: "center", width: 34 },
  destinationRow: { alignItems: "center", flexDirection: "row", gap: Spacing.md, minHeight: 66, paddingVertical: 8 },
  destinationIcon: { alignItems: "center", backgroundColor: Colors.surfaceSoft, borderRadius: Radius.md, height: 40, justifyContent: "center", width: 40 },
  destinationCopy: { flex: 1, gap: 4, minWidth: 0 },
  destinationName: { color: Colors.ink, fontSize: 14, fontWeight: "700" },
  destinationMeta: { color: Colors.inkMuted, fontSize: 11 },
  verify: { alignItems: "center", flexDirection: "row", gap: 4, padding: 8 },
  verifyText: { color: Colors.gold, fontSize: 12, fontWeight: "700" },
  modalIntro: { color: Colors.inkMuted, fontSize: 14, lineHeight: 21 },
  choices: { gap: Spacing.sm },
  choice: { alignItems: "center", backgroundColor: Colors.canvasRaised, borderColor: Colors.line, borderRadius: Radius.md, borderWidth: 1, flexDirection: "row", gap: Spacing.md, minHeight: 58, padding: Spacing.md },
  choiceSelected: { backgroundColor: "rgba(114,221,183,0.08)", borderColor: "rgba(114,221,183,0.42)" },
  choiceCopy: { flex: 1, gap: 3 },
  choiceLabel: { color: Colors.ink, fontSize: 14, fontWeight: "700" },
  choiceDetail: { color: Colors.inkMuted, fontSize: 12 },
  limitCopy: { color: Colors.gold, fontSize: 12 },
  fieldLabel: { color: Colors.ink, fontSize: 13, fontWeight: "700" },
});

