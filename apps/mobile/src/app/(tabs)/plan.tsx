import { useRouter } from "expo-router";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ActionButton,
  AppHeader,
  ErrorState,
  FormField,
  IconButton,
  InlineMessage,
  LoadingState,
  ModalSheet,
  PageHeading,
  Panel,
  Screen,
  SectionHeading,
  SegmentedControl,
} from "@/components/ui";
import { DateField } from "@/components/date-field";
import { BucketColors, Colors, Fonts, Radius, Spacing } from "@/constants/theme";
import { centsToInput, dollarsToCents, formatMoney, initials, isValidCalendarDate, titleCase } from "@/lib/format";
import { useIdempotencyAttempt } from "@/lib/idempotency";
import type { BucketBalance, BucketProtection, MoneyProfileResponse, OperationsPacket } from "@/lib/types";
import { useMoneyProfile, useOperations, usePayShieldMutation } from "@/hooks/use-pay-shield";
import { useSession } from "@/providers/session-provider";

type EditableBucket = Pick<BucketBalance, "due" | "id" | "name" | "protection" | "targetCents">;

const frequencyOptions = [
  { label: "Weekly", value: "weekly" },
  { label: "Biweekly", value: "biweekly" },
  { label: "2x/month", value: "semimonthly" },
  { label: "Monthly", value: "monthly" },
] as const;

const protectionOptions = [
  { label: "Bills", value: "bill_only" },
  { label: "Locked", value: "hard_lock" },
  { label: "Flexible", value: "soft_lock" },
  { label: "Emergency", value: "emergency" },
] as const;

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "bucket";
}

export default function PlanScreen() {
  const router = useRouter();
  const session = useSession();
  const operations = useOperations();
  const profileQuery = useMoneyProfile();

  if (operations.isLoading || profileQuery.isLoading) {
    return <Screen><AppHeader avatar={initials(session.displayName)} onAvatarPress={() => router.push("/profile")} /><LoadingState label="Loading your paycheck plan..." /></Screen>;
  }

  const loadError = operations.error ?? profileQuery.error;

  if (loadError || !operations.data || !profileQuery.data) {
    return (
      <Screen>
        <AppHeader avatar={initials(session.displayName)} onAvatarPress={() => router.push("/profile")} />
        <ErrorState
          message={loadError?.message ?? "Your paycheck plan could not be loaded."}
          onRetry={() => void Promise.all([operations.refetch(), profileQuery.refetch()])}
        />
      </Screen>
    );
  }

  return (
    <PlanEditor
      initialOperations={operations.data}
      initialProfile={profileQuery.data}
      key={operations.data.household?.householdId ?? "household"}
    />
  );
}

function PlanEditor({
  initialOperations,
  initialProfile,
}: {
  initialOperations: OperationsPacket;
  initialProfile: MoneyProfileResponse;
}) {
  const router = useRouter();
  const session = useSession();
  const saveProtectionPlan = usePayShieldMutation<
    MoneyProfileResponse & { message?: string },
    Record<string, unknown>
  >("/api/app/protection-plan");
  const planAttempt = useIdempotencyAttempt("mobile-plan");
  const profile = initialProfile.profile;
  const [employer, setEmployer] = useState(profile.employerName || "");
  const [paycheck, setPaycheck] = useState(centsToInput(profile.paycheckAmountCents));
  const [frequency, setFrequency] = useState<"weekly" | "biweekly" | "semimonthly" | "monthly">(
    profile.expectedFrequency === "unknown" ? "biweekly" : profile.expectedFrequency,
  );
  const [nextPayday, setNextPayday] = useState(profile.nextPayday ?? "");
  const [buckets, setBuckets] = useState<EditableBucket[]>(() =>
    initialOperations.buckets
      .filter((bucket) => bucket.id !== "safe_spending")
      .sort((left, right) => left.priority - right.priority)
      .map(({ due, id, name, protection, targetCents }) => ({ due, id, name, protection, targetCents })),
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editorName, setEditorName] = useState("");
  const [editorTarget, setEditorTarget] = useState("");
  const [editorDue, setEditorDue] = useState("Every check");
  const [editorProtection, setEditorProtection] = useState<BucketProtection>("hard_lock");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const paycheckCents = dollarsToCents(paycheck);
  const protectedTarget = buckets.reduce((total, bucket) => total + bucket.targetCents, 0);
  const projectedSafe = Math.max(0, paycheckCents - protectedTarget);
  const shortfall = Math.max(0, protectedTarget - paycheckCents);
  const saving = saveProtectionPlan.isPending;

  const allocations = useMemo(() => {
    const denominator = Math.max(paycheckCents, protectedTarget, 1);
    return [
      ...buckets.map((bucket, index) => ({ color: BucketColors[index % BucketColors.length], id: bucket.id, width: `${Math.max(2, (bucket.targetCents / denominator) * 100)}%` as `${number}%` })),
      ...(projectedSafe ? [{ color: Colors.inkFaint, id: "safe", width: `${Math.max(2, (projectedSafe / denominator) * 100)}%` as `${number}%` }] : []),
    ];
  }, [buckets, paycheckCents, projectedSafe, protectedTarget]);

  function openNewBucket() {
    setEditingId("");
    setEditorName("");
    setEditorTarget("");
    setEditorDue("Every check");
    setEditorProtection("hard_lock");
    setEditorOpen(true);
  }

  function openBucket(bucket: EditableBucket) {
    setEditingId(bucket.id);
    setEditorName(bucket.name);
    setEditorTarget(centsToInput(bucket.targetCents));
    setEditorDue(bucket.due);
    setEditorProtection(bucket.protection);
    setEditorOpen(true);
  }

  function commitBucket() {
    const targetCents = dollarsToCents(editorTarget);
    const name = editorName.trim();
    if (!name || targetCents <= 0 || !editorDue.trim()) return;
    const nextBucket: EditableBucket = {
      due: editorDue.trim(),
      id: editingId || `custom_${slug(name)}_${Date.now().toString(36).slice(-4)}`,
      name,
      protection: editorProtection,
      targetCents,
    };
    setBuckets((current) => editingId ? current.map((bucket) => bucket.id === editingId ? nextBucket : bucket) : [...current, nextBucket]);
    setEditorOpen(false);
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= buckets.length) return;
    setBuckets((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function savePlan() {
    setMessage("");
    setError("");
    if (!employer.trim() || paycheckCents < 10000 || !buckets.length) {
      setError("Add your employer, a paycheck of at least $100, and one protected bucket.");
      return;
    }
    if (nextPayday.trim() && !isValidCalendarDate(nextPayday.trim())) {
      setError("Enter a valid payday of today or later using YYYY-MM-DD.");
      return;
    }

    const planInput = {
      buckets: buckets.map((bucket, index) => ({ ...bucket, priority: (index + 1) * 10 })),
      employerName: employer.trim(),
      expectedFrequency: frequency,
      nextPayday: nextPayday.trim() || null,
      paycheckAmountCents: paycheckCents,
    };
    const attemptKey = planAttempt.keyFor(planInput);
    const existingRuleId =
      profile.detectionRuleId ||
      initialOperations.operations?.paycheckDetectionRules?.find((rule) => rule.status === "active")?.id;

    try {
      const response = await saveProtectionPlan.mutateAsync({
        buckets: planInput.buckets,
        detectionRuleId: existingRuleId || undefined,
        employerName: planInput.employerName,
        expectedFrequency: planInput.expectedFrequency,
        idempotencyKey: attemptKey,
        nextPayday: planInput.nextPayday,
        paycheckAmountCents: planInput.paycheckAmountCents,
        requestedTransferCents: 0,
      });
      planAttempt.complete();
      setMessage(response.message ?? "Your protection plan is active.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The plan could not be saved.");
    }
  }

  return (
    <Screen>
      <AppHeader avatar={initials(session.displayName)} onAvatarPress={() => router.push("/profile")} />
      <PageHeading body="Set the order once. Every paycheck follows it automatically." eyebrow="Protection plan" title="Tell every dollar where to go." />

      <Panel tone="mint">
        <FormField label="Employer or deposit name" maxLength={80} onChangeText={setEmployer} placeholder="Primary employer" value={employer} />
        <FormField keyboardType="decimal-pad" label="Typical take-home pay" onChangeText={setPaycheck} prefix="$" placeholder="0.00" value={paycheck} />
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Pay schedule</Text>
          <SegmentedControl onChange={setFrequency} options={frequencyOptions} value={frequency} />
        </View>
        <DateField label="Next payday" minimumDate={new Date(new Date().setHours(0, 0, 0, 0))} onChange={setNextPayday} value={nextPayday} />
      </Panel>

      <Panel style={styles.splitPanel}>
        <View style={styles.splitTopline}>
          <View>
            <Text style={styles.splitLabel}>NEXT CHECK</Text>
            <Text style={styles.splitAmount}>{formatMoney(paycheckCents)}</Text>
          </View>
          <View style={styles.safePreview}>
            <Text style={styles.safePreviewLabel}>Safe to Spend</Text>
            <Text style={styles.safePreviewAmount}>{formatMoney(projectedSafe)}</Text>
          </View>
        </View>
        <View style={styles.allocationBar}>
          {allocations.map((item) => <View key={item.id} style={{ backgroundColor: item.color, height: "100%", width: item.width }} />)}
        </View>
        <View style={styles.splitLegend}>
          <Text style={styles.legendText}>{formatMoney(protectedTarget)} protected</Text>
          <Text style={styles.legendText}>{buckets.length} priorities</Text>
        </View>
        {shortfall ? (
          <View style={styles.warning}>
            <ShieldAlert color={Colors.gold} size={18} />
            <Text style={styles.warningText}>{formatMoney(shortfall)} of lower priorities will wait for the next deposit.</Text>
          </View>
        ) : null}
      </Panel>

      <View style={styles.section}>
        <SectionHeading
          action={<ActionButton disabled={buckets.length >= 12} icon={Plus} label="Add" onPress={openNewBucket} variant="secondary" />}
          detail="Use the arrows to choose what gets funded first"
          title="Funding priority"
        />
        <Panel style={styles.bucketPanel}>
          {buckets.map((bucket, index) => {
            const color = BucketColors[index % BucketColors.length];
            return (
              <View key={bucket.id}>
                {index ? <View style={styles.divider} /> : null}
                <View style={styles.bucketRow}>
                  <View style={[styles.priority, { borderColor: color }]}><Text style={[styles.priorityText, { color }]}>{index + 1}</Text></View>
                  <Pressable onPress={() => openBucket(bucket)} style={styles.bucketCopy}>
                    <Text numberOfLines={1} style={styles.bucketName}>{bucket.name}</Text>
                    <Text numberOfLines={1} style={styles.bucketMeta}>{formatMoney(bucket.targetCents)} · {bucket.due} · {titleCase(bucket.protection)}</Text>
                  </Pressable>
                  <View style={styles.rowActions}>
                    <IconButton icon={ArrowUp} label={`Move ${bucket.name} up`} onPress={() => move(index, -1)} />
                    <IconButton icon={ArrowDown} label={`Move ${bucket.name} down`} onPress={() => move(index, 1)} />
                    <IconButton icon={Pencil} label={`Edit ${bucket.name}`} onPress={() => openBucket(bucket)} />
                  </View>
                </View>
              </View>
            );
          })}
        </Panel>
      </View>

      <ActionButton icon={Save} label="Save paycheck plan" loading={saving} onPress={() => void savePlan()} />
      <InlineMessage message={message} />
      <InlineMessage message={error} tone="error" />

      <ModalSheet onClose={() => setEditorOpen(false)} title={editingId ? "Edit bucket" : "New protected bucket"} visible={editorOpen}>
        <FormField label="Bucket name" maxLength={48} onChangeText={setEditorName} placeholder="Utilities" value={editorName} />
        <FormField keyboardType="decimal-pad" label="Amount from each check" onChangeText={setEditorTarget} prefix="$" placeholder="0.00" value={editorTarget} />
        <FormField label="Due or cadence" maxLength={40} onChangeText={setEditorDue} placeholder="15th or Every check" value={editorDue} />
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Protection</Text>
          <SegmentedControl onChange={setEditorProtection} options={protectionOptions} value={editorProtection} />
        </View>
        <Text style={styles.protectionHelp}>
          {editorProtection === "bill_only" ? "Only an approved bill destination can use this money." : editorProtection === "hard_lock" ? "Everyday card purchases cannot reach this money." : editorProtection === "emergency" ? "Held for emergency access with a recovery plan." : "Protected by default, with deliberate release when plans change."}
        </Text>
        <ActionButton disabled={!editorName.trim() || dollarsToCents(editorTarget) <= 0 || !editorDue.trim()} icon={editingId ? Save : Plus} label={editingId ? "Save bucket" : "Add bucket"} onPress={commitBucket} />
        {editingId ? <ActionButton icon={Trash2} label="Delete bucket" onPress={() => { setBuckets((current) => current.filter((bucket) => bucket.id !== editingId)); setEditorOpen(false); }} variant="danger" /> : null}
      </ModalSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: 7 },
  fieldLabel: { color: Colors.ink, fontSize: 13, fontWeight: "700" },
  splitPanel: { gap: Spacing.md },
  splitTopline: { alignItems: "flex-end", flexDirection: "row", gap: Spacing.lg, justifyContent: "space-between" },
  splitLabel: { color: Colors.inkFaint, fontSize: 10, fontWeight: "800" },
  splitAmount: { color: Colors.ink, fontFamily: Fonts.rounded, fontSize: 29, fontWeight: "800" },
  safePreview: { alignItems: "flex-end", gap: 2 },
  safePreviewLabel: { color: Colors.mint, fontSize: 11, fontWeight: "700" },
  safePreviewAmount: { color: Colors.ink, fontSize: 20, fontWeight: "800" },
  allocationBar: { borderRadius: Radius.sm, flexDirection: "row", gap: 2, height: 12, overflow: "hidden" },
  splitLegend: { flexDirection: "row", justifyContent: "space-between" },
  legendText: { color: Colors.inkMuted, fontSize: 11 },
  warning: { alignItems: "center", backgroundColor: "rgba(241,198,111,0.08)", borderRadius: Radius.md, flexDirection: "row", gap: Spacing.sm, padding: Spacing.md },
  warningText: { color: Colors.gold, flex: 1, fontSize: 12, lineHeight: 17 },
  section: { gap: Spacing.md },
  bucketPanel: { gap: 0, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  bucketRow: { alignItems: "center", flexDirection: "row", gap: Spacing.sm, minHeight: 68, paddingVertical: 7 },
  priority: { alignItems: "center", borderRadius: Radius.round, borderWidth: 1, height: 34, justifyContent: "center", width: 34 },
  priorityText: { fontSize: 12, fontWeight: "800" },
  bucketCopy: { flex: 1, gap: 4, minWidth: 0 },
  bucketName: { color: Colors.ink, fontSize: 14, fontWeight: "700" },
  bucketMeta: { color: Colors.inkMuted, fontSize: 11 },
  rowActions: { flexDirection: "row", gap: 4 },
  divider: { backgroundColor: Colors.line, height: StyleSheet.hairlineWidth, marginLeft: 42 },
  protectionHelp: { color: Colors.inkMuted, fontSize: 13, lineHeight: 19 },
});
