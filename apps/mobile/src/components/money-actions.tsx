import { ArrowRightLeft, LockOpen } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ActionButton,
  FormField,
  InlineMessage,
  ModalSheet,
  SegmentedControl,
} from "@/components/ui";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { dollarsToCents, formatMoney } from "@/lib/format";
import { useIdempotencyAttempt } from "@/lib/idempotency";
import type { BucketBalance, Payee } from "@/lib/types";
import { usePayShieldMutation } from "@/hooks/use-pay-shield";

function Choice({
  detail,
  label,
  onPress,
  selected,
}: {
  detail: string;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.choiceCopy}>
        <Text style={styles.choiceLabel}>{label}</Text>
        <Text style={styles.choiceDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

export function TransferSheet({
  buckets,
  onClose,
  payees,
  visible,
}: {
  buckets: BucketBalance[];
  onClose: () => void;
  payees: Payee[];
  visible: boolean;
}) {
  const eligible = useMemo(
    () => buckets.filter((bucket) => bucket.id !== "safe_spending" && payees.some((payee) => payee.allowedBucketId === bucket.id && payee.status === "approved")),
    [buckets, payees],
  );
  const [bucketId, setBucketId] = useState(eligible[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const mutation = usePayShieldMutation<{ message?: string }, Record<string, unknown>>("/api/app/transfers");
  const attempt = useIdempotencyAttempt("mobile-transfer");
  const bucket = eligible.find((item) => item.id === bucketId) ?? eligible[0];
  const payee = payees.find((item) => item.allowedBucketId === bucket?.id && item.status === "approved");
  const amountCents = dollarsToCents(amount);
  const valid = Boolean(bucket && payee && amountCents > 0 && amountCents <= bucket.availableCents && amountCents <= payee.maxCents);

  function close() {
    setAmount("");
    mutation.reset();
    onClose();
  }

  return (
    <ModalSheet onClose={close} title="Move protected money" visible={visible}>
      <Text style={styles.intro}>Only verified destinations assigned to a bucket can receive protected money.</Text>
      <View style={styles.choices}>
        {eligible.map((item) => {
          const destination = payees.find((candidate) => candidate.allowedBucketId === item.id && candidate.status === "approved");
          return <Choice detail={`${formatMoney(item.availableCents)} available · ${destination?.name}`} key={item.id} label={item.name} onPress={() => setBucketId(item.id)} selected={item.id === bucket?.id} />;
        })}
      </View>
      <FormField keyboardType="decimal-pad" label="Amount" onChangeText={setAmount} prefix="$" placeholder="0.00" value={amount} />
      <ActionButton
        disabled={!valid}
        icon={ArrowRightLeft}
        label={amountCents ? `Move ${formatMoney(amountCents, 2)}` : "Review transfer"}
        loading={mutation.isPending}
        onPress={() => {
          if (!bucket || !payee || !valid) return;
          const input = { amountCents, destinationPayeeId: payee.id, sourceBucketId: bucket.id };
          mutation.mutate(
            { ...input, idempotencyKey: attempt.keyFor(input) },
            { onSuccess: () => { attempt.complete(); setTimeout(close, 650); } },
          );
        }}
      />
      <InlineMessage message={mutation.data?.message} />
      <InlineMessage message={mutation.error?.message} tone="error" />
    </ModalSheet>
  );
}

export function UnlockSheet({
  buckets,
  onClose,
  visible,
}: {
  buckets: BucketBalance[];
  onClose: () => void;
  visible: boolean;
}) {
  const eligible = buckets.filter((bucket) => bucket.id !== "safe_spending" && bucket.availableCents > 0);
  const [bucketId, setBucketId] = useState(eligible[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"slow_free" | "instant_fixed_fee">("slow_free");
  const mutation = usePayShieldMutation<{ message?: string; result?: { recoveryChecks?: number; recoveryPerCheckCents?: number } }, Record<string, unknown>>("/api/app/unlocks");
  const attempt = useIdempotencyAttempt("mobile-unlock");
  const bucket = eligible.find((item) => item.id === bucketId) ?? eligible[0];
  const amountCents = dollarsToCents(amount);
  const valid = Boolean(bucket && reason.trim().length >= 3 && amountCents > 0 && amountCents <= bucket.availableCents);

  function close() {
    setAmount("");
    setReason("");
    setMode("slow_free");
    mutation.reset();
    onClose();
  }

  return (
    <ModalSheet onClose={close} title="Emergency access" visible={visible}>
      <Text style={styles.intro}>Move money to Safe to Spend with a visible plan to restore the bucket.</Text>
      <View style={styles.choices}>
        {eligible.map((item) => <Choice detail={`${formatMoney(item.availableCents)} protected`} key={item.id} label={item.name} onPress={() => setBucketId(item.id)} selected={item.id === bucket?.id} />)}
      </View>
      <FormField keyboardType="decimal-pad" label="Amount" onChangeText={setAmount} prefix="$" placeholder="0.00" value={amount} />
      <FormField label="Reason" maxLength={120} onChangeText={setReason} placeholder="What changed?" value={reason} />
      <SegmentedControl
        onChange={setMode}
        options={[{ label: "Slow release", value: "slow_free" }, { label: "Immediate", value: "instant_fixed_fee" }]}
        value={mode}
      />
      {amountCents ? <Text style={styles.preview}>{mode === "slow_free" ? `${formatMoney(Math.ceil(amountCents / 2))} returns to this bucket from each of the next 2 checks.` : `${formatMoney(amountCents)} returns from your next check.`}</Text> : null}
      <ActionButton
        disabled={!valid}
        icon={LockOpen}
        label={amountCents ? `Unlock ${formatMoney(amountCents, 2)}` : "Review unlock"}
        loading={mutation.isPending}
        onPress={() => {
          if (!bucket || !valid) return;
          const input = { amountCents, bucketId: bucket.id, mode, reason: reason.trim() };
          mutation.mutate(
            { ...input, idempotencyKey: attempt.keyFor(input) },
            { onSuccess: () => { attempt.complete(); setTimeout(close, 650); } },
          );
        }}
      />
      <InlineMessage message={mutation.data?.message} />
      <InlineMessage message={mutation.error?.message} tone="error" />
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  intro: { color: Colors.inkMuted, fontSize: 14, lineHeight: 21 },
  choices: { gap: Spacing.sm },
  choice: { alignItems: "center", backgroundColor: Colors.canvasRaised, borderColor: Colors.line, borderRadius: Radius.md, borderWidth: 1, flexDirection: "row", gap: Spacing.md, minHeight: 60, padding: Spacing.md },
  choiceSelected: { backgroundColor: "rgba(114,221,183,0.08)", borderColor: "rgba(114,221,183,0.42)" },
  radio: { alignItems: "center", borderColor: Colors.inkFaint, borderRadius: Radius.round, borderWidth: 1, height: 20, justifyContent: "center", width: 20 },
  radioSelected: { borderColor: Colors.mint },
  radioDot: { backgroundColor: Colors.mint, borderRadius: Radius.round, height: 10, width: 10 },
  choiceCopy: { flex: 1, gap: 3 },
  choiceLabel: { color: Colors.ink, fontSize: 14, fontWeight: "700" },
  choiceDetail: { color: Colors.inkMuted, fontSize: 12 },
  preview: { color: Colors.gold, fontSize: 13, lineHeight: 19 },
});
