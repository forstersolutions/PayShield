import * as Clipboard from "expo-clipboard";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  BadgeCheck,
  ChevronRight,
  Copy,
  CreditCard,
  Fingerprint,
  Landmark,
  LifeBuoy,
  Link2,
  LockKeyhole,
  LogOut,
  Mail,
  RefreshCcw,
  ShieldCheck,
  Store,
  UserRoundCog,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { GraystonLogo } from "@/components/brand";
import {
  ActionButton,
  AppHeader,
  Divider,
  InlineMessage,
  LoadingState,
  PageHeading,
  Panel,
  Screen,
  SectionHeading,
  StatusPill,
} from "@/components/ui";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { appConfig, biometricPreferenceKey } from "@/lib/config";
import { connectDemoBank } from "@/lib/demo-data";
import { initials } from "@/lib/format";
import { idempotencyKey } from "@/lib/idempotency";
import { openBankLink } from "@/lib/bank-link";
import type { BankConnection, CardState } from "@/lib/types";
import { useOperations, usePayShieldApi, usePayShieldMutation } from "@/hooks/use-pay-shield";
import { useMembership } from "@/providers/membership-provider";
import { useSession } from "@/providers/session-provider";

function SettingsRow({
  detail,
  icon: Icon,
  label,
  onPress,
}: {
  detail?: string;
  icon: typeof ShieldCheck;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}>
      <View style={styles.settingsIcon}><Icon color={Colors.inkMuted} size={19} /></View>
      <View style={styles.settingsCopy}>
        <Text style={styles.settingsLabel}>{label}</Text>
        {detail ? <Text numberOfLines={1} style={styles.settingsDetail}>{detail}</Text> : null}
      </View>
      <ChevronRight color={Colors.inkFaint} size={18} />
    </Pressable>
  );
}

function BankRow({ bank }: { bank: BankConnection }) {
  return (
    <View style={styles.bankRow}>
      <View style={styles.bankIcon}><Landmark color={Colors.mint} size={20} /></View>
      <View style={styles.bankCopy}>
        <Text style={styles.bankName}>{bank.institutionName}</Text>
        <Text style={styles.bankDetail}>{bank.accountName || "Connected account"} · •••• {bank.accountLast4 || bank.accountMask || "----"}</Text>
      </View>
      <StatusPill label="Connected" tone="good" />
    </View>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const session = useSession();
  const membership = useMembership();
  const operations = useOperations();
  const request = usePayShieldApi();
  const queryClient = useQueryClient();
  const setCard = usePayShieldMutation<{ card?: CardState; message?: string }, Record<string, unknown>>("/api/app/card/status");
  const onboarding = usePayShieldMutation<{ kyc?: { verificationUrl?: string; status?: string }; message?: string }, Record<string, unknown>>("/api/app/onboarding/start");
  const [biometricLock, setBiometricLock] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (Platform.OS === "web") return;
    void SecureStore.getItemAsync(biometricPreferenceKey).then((value) => setBiometricLock(value === "enabled"));
  }, []);

  const data = operations.data;
  const banks = data?.operations?.bankConnections ?? [];
  const directDeposit = data?.directDeposit;
  const cardLocked = ["frozen", "locked"].includes(data?.card?.status ?? "");

  function clearMessages() {
    setMessage("");
    setError("");
  }

  async function connectBank() {
    clearMessages();
    setBankLoading(true);
    try {
      if (session.isDemo) {
        connectDemoBank();
        await queryClient.invalidateQueries({ queryKey: ["operations"] });
        setMessage("Bank connected.");
        return;
      }
      const token = await request<{ linkToken?: string }>("/api/app/bank-link/token", {
        body: {
          androidPackageName: "com.graystontechnologies.payshield",
          platform: Platform.OS,
        },
        method: "POST",
      });
      if (!token.linkToken) throw new Error("Bank connection could not be started.");
      await openBankLink({
        linkToken: token.linkToken,
        onSuccess: async (result) => {
          const account = result.metadata.accounts[0];
          await request("/api/app/bank-link/exchange", {
            body: {
              accountId: account?.id,
              accountMask: account?.mask,
              accountName: account?.name,
              institutionName: result.metadata.institution?.name,
              publicToken: result.publicToken,
            },
            method: "POST",
          });
          await queryClient.invalidateQueries({ queryKey: ["operations"] });
        },
      });
      setMessage("Bank connected.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Bank connection could not be completed.");
    } finally {
      setBankLoading(false);
    }
  }

  async function startAccountSetup() {
    clearMessages();
    try {
      const response = await onboarding.mutateAsync({ idempotencyKey: idempotencyKey("mobile-onboarding") });
      setMessage(response.message ?? "Account setup updated.");
      if (response.kyc?.verificationUrl) await Linking.openURL(response.kyc.verificationUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Account setup could not be started.");
    }
  }

  async function toggleCard() {
    clearMessages();
    try {
      const next = cardLocked ? "active" : "frozen";
      const response = await setCard.mutateAsync({ idempotencyKey: idempotencyKey("mobile-card"), status: next });
      setMessage(response.message ?? (next === "active" ? "Card unlocked." : "Card locked."));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Card status could not be changed.");
    }
  }

  async function toggleBiometric(next: boolean) {
    clearMessages();
    if (Platform.OS === "web") {
      setError("Biometric lock is available in the installed mobile app.");
      return;
    }
    if (!next) {
      await SecureStore.deleteItemAsync(biometricPreferenceKey);
      setBiometricLock(false);
      setMessage("Biometric app lock turned off.");
      return;
    }
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    if (!hardware || !enrolled) {
      setError("Set up Face ID, Touch ID, or a fingerprint on this phone first.");
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      biometricsSecurityLevel: "strong",
      promptMessage: "Protect PayShield",
    });
    if (!result.success) return;
    await SecureStore.setItemAsync(biometricPreferenceKey, "enabled");
    setBiometricLock(true);
    setMessage("Biometric app lock turned on.");
  }

  async function copyValue(value: string, label: string) {
    await Clipboard.setStringAsync(value);
    setMessage(`${label} copied.`);
  }

  async function purchaseMembership() {
    clearMessages();
    const success = await membership.purchase();
    if (success) setMessage("Your PayShield membership is active.");
  }

  async function restoreMembership() {
    clearMessages();
    const success = await membership.restore();
    if (success) setMessage("Your PayShield membership was restored.");
  }

  function confirmSignOut() {
    Alert.alert("Sign out of PayShield?", "Your money controls keep running while you are signed out.", [
      { style: "cancel", text: "Stay signed in" },
      { style: "destructive", text: "Sign out", onPress: () => void session.signOut() },
    ]);
  }

  return (
    <Screen onRefresh={() => void operations.refetch()} refreshing={operations.isRefetching}>
      <AppHeader avatar={initials(session.displayName)} onAvatarPress={() => router.push("/profile")} />
      <PageHeading body="Banks, card controls, membership, security, and support." eyebrow="Account" title={session.displayName} />
      <InlineMessage message={message} />
      <InlineMessage message={error || membership.error} tone="error" />

      {operations.isLoading ? <LoadingState label="Loading your account..." /> : null}
      {data ? (
        <>
          <Panel tone={membership.active ? "mint" : "warning"}>
            <View style={styles.membershipTop}>
              <View style={styles.membershipIcon}><Store color={membership.active ? Colors.mint : Colors.gold} size={22} /></View>
              <View style={styles.membershipCopy}>
                <Text style={styles.membershipTitle}>PayShield household</Text>
                <Text style={styles.membershipDetail}>{membership.active ? "Membership active" : `${membership.price} per household`}</Text>
              </View>
              <StatusPill label={membership.active ? "Active" : "Required"} tone={membership.active ? "good" : "warning"} />
            </View>
            <Text style={styles.panelBody}>Custom buckets, paycheck rules, bill routing, card controls, recovery plans, and complete activity history.</Text>
            <View style={styles.membershipActions}>
              {membership.active ? <ActionButton label="Manage in store" onPress={() => void membership.manage()} style={styles.flexButton} variant="secondary" /> : <ActionButton label={`Start ${membership.price}`} loading={membership.loading} onPress={() => void purchaseMembership()} style={styles.flexButton} />}
              <ActionButton icon={RefreshCcw} label="Restore" loading={membership.loading} onPress={() => void restoreMembership()} style={styles.flexButton} variant="quiet" />
            </View>
          </Panel>

          <View style={styles.section}>
            <SectionHeading action={<ActionButton icon={Link2} label="Connect" loading={bankLoading} onPress={() => void connectBank()} variant="secondary" />} detail="Used to detect income and protect each paycheck" title="Connected banks" />
            <Panel style={styles.rowsPanel}>
              {banks.length ? banks.map((bank, index) => <View key={bank.id}>{index ? <Divider /> : null}<BankRow bank={bank} /></View>) : <View style={styles.emptyBank}><Landmark color={Colors.gold} size={24} /><View style={styles.emptyBankCopy}><Text style={styles.bankName}>No account connected</Text><Text style={styles.bankDetail}>Connect the account where your paycheck arrives.</Text></View></View>}
            </Panel>
          </View>

          <Panel tone="blue">
            <View style={styles.depositTop}>
              <View style={styles.depositIcon}><Landmark color={Colors.blue} size={22} /></View>
              <View style={styles.membershipCopy}>
                <Text style={styles.membershipTitle}>Direct deposit</Text>
                <Text style={styles.membershipDetail}>{directDeposit?.accountName || "PayShield paycheck account"}</Text>
              </View>
              <StatusPill label={directDeposit?.providerStatus === "ready" || directDeposit?.providerStatus === "live" ? "Ready" : "Set up"} tone={directDeposit?.providerStatus === "ready" || directDeposit?.providerStatus === "live" ? "good" : "neutral"} />
            </View>
            {directDeposit?.accountNumber && directDeposit.routingNumber ? (
              <View style={styles.instructions}>
                <Pressable onPress={() => void copyValue(directDeposit.routingNumber!, "Routing number")} style={styles.instruction}><View><Text style={styles.instructionLabel}>ROUTING NUMBER</Text><Text style={styles.instructionValue}>{directDeposit.routingNumber}</Text></View><Copy color={Colors.inkMuted} size={18} /></Pressable>
                <Pressable onPress={() => void copyValue(directDeposit.accountNumber!, "Account number")} style={styles.instruction}><View><Text style={styles.instructionLabel}>ACCOUNT NUMBER</Text><Text style={styles.instructionValue}>{directDeposit.accountNumber}</Text></View><Copy color={Colors.inkMuted} size={18} /></Pressable>
              </View>
            ) : (
              <View style={styles.maskedInstructions}>
                <Text style={styles.maskedText}>Routing •••• {directDeposit?.routingLast4 || "----"}</Text>
                <Text style={styles.maskedText}>Account •••• {directDeposit?.accountLast4 || "----"}</Text>
              </View>
            )}
            <ActionButton icon={BadgeCheck} label="Complete account setup" loading={onboarding.isPending} onPress={() => void startAccountSetup()} variant="secondary" />
          </Panel>

          <Panel>
            <View style={styles.cardTop}>
              <View style={styles.cardIcon}><CreditCard color={Colors.blue} size={22} /></View>
              <View style={styles.membershipCopy}>
                <Text style={styles.membershipTitle}>PayShield card · •••• {data.card?.cardLast4 || "----"}</Text>
                <Text style={styles.membershipDetail}>Everyday purchases use Safe to Spend</Text>
              </View>
              <Switch ios_backgroundColor={Colors.surfaceSoft} onValueChange={() => void toggleCard()} thumbColor={Colors.white} trackColor={{ false: Colors.red, true: Colors.mintDeep }} value={!cardLocked} />
            </View>
            <Text style={styles.panelBody}>{cardLocked ? "Card purchases are blocked. Protected buckets and scheduled bills are unchanged." : "Purchase protection is on. Protected bucket money remains out of reach."}</Text>
          </Panel>

          <View style={styles.section}>
            <SectionHeading title="Security and support" />
            <Panel style={styles.settingsPanel}>
              <View style={styles.toggleRow}>
                <View style={styles.settingsIcon}><Fingerprint color={Colors.inkMuted} size={19} /></View>
                <View style={styles.settingsCopy}><Text style={styles.settingsLabel}>Biometric app lock</Text><Text style={styles.settingsDetail}>Require Face ID, Touch ID, or fingerprint</Text></View>
                <Switch ios_backgroundColor={Colors.surfaceSoft} onValueChange={(value) => void toggleBiometric(value)} thumbColor={Colors.white} trackColor={{ false: Colors.surfaceSoft, true: Colors.mintDeep }} value={biometricLock} />
              </View>
              <Divider />
              <SettingsRow detail={session.email} icon={UserRoundCog} label="Profile and account" onPress={() => router.push("/profile")} />
              <Divider />
              <SettingsRow icon={LifeBuoy} label="PayShield support" onPress={() => void Linking.openURL(`mailto:${appConfig.supportEmail}`)} />
              <Divider />
              <SettingsRow icon={LockKeyhole} label="Privacy" onPress={() => void Linking.openURL(appConfig.privacyUrl)} />
              <Divider />
              <SettingsRow icon={ShieldCheck} label="Terms" onPress={() => void Linking.openURL(appConfig.termsUrl)} />
              <Divider />
              <SettingsRow icon={LogOut} label="Sign out" onPress={confirmSignOut} />
            </Panel>
          </View>

          <View style={styles.grayston}>
            <GraystonLogo />
            <Text style={styles.graystonText}>PayShield is a Grayston Technologies product.</Text>
            <Pressable onPress={() => void Linking.openURL(`mailto:${appConfig.supportEmail}`)} style={styles.supportLink}><Mail color={Colors.inkFaint} size={14} /><Text style={styles.supportText}>{appConfig.supportEmail}</Text></Pressable>
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  membershipTop: { alignItems: "center", flexDirection: "row", gap: Spacing.md },
  membershipIcon: { alignItems: "center", backgroundColor: "rgba(114,221,183,0.10)", borderRadius: Radius.round, height: 44, justifyContent: "center", width: 44 },
  membershipCopy: { flex: 1, gap: 3, minWidth: 0 },
  membershipTitle: { color: Colors.ink, fontSize: 15, fontWeight: "700" },
  membershipDetail: { color: Colors.inkMuted, fontSize: 12 },
  panelBody: { color: Colors.inkMuted, fontSize: 13, lineHeight: 19 },
  membershipActions: { flexDirection: "row", gap: Spacing.sm },
  flexButton: { flex: 1 },
  section: { gap: Spacing.md },
  rowsPanel: { gap: 0, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  bankRow: { alignItems: "center", flexDirection: "row", gap: Spacing.md, minHeight: 66, paddingVertical: 8 },
  bankIcon: { alignItems: "center", backgroundColor: "rgba(114,221,183,0.10)", borderRadius: Radius.md, height: 40, justifyContent: "center", width: 40 },
  bankCopy: { flex: 1, gap: 4, minWidth: 0 },
  bankName: { color: Colors.ink, fontSize: 14, fontWeight: "700" },
  bankDetail: { color: Colors.inkMuted, fontSize: 11, lineHeight: 16 },
  emptyBank: { alignItems: "center", flexDirection: "row", gap: Spacing.md, minHeight: 74 },
  emptyBankCopy: { flex: 1, gap: 4 },
  depositTop: { alignItems: "center", flexDirection: "row", gap: Spacing.md },
  depositIcon: { alignItems: "center", backgroundColor: "rgba(110,145,255,0.12)", borderRadius: Radius.round, height: 44, justifyContent: "center", width: 44 },
  instructions: { gap: Spacing.sm },
  instruction: { alignItems: "center", backgroundColor: Colors.canvasRaised, borderRadius: Radius.md, flexDirection: "row", justifyContent: "space-between", minHeight: 58, paddingHorizontal: Spacing.md },
  instructionLabel: { color: Colors.inkFaint, fontSize: 9, fontWeight: "800" },
  instructionValue: { color: Colors.ink, fontSize: 16, fontVariant: ["tabular-nums"], fontWeight: "700" },
  maskedInstructions: { backgroundColor: Colors.canvasRaised, borderRadius: Radius.md, flexDirection: "row", gap: Spacing.lg, justifyContent: "center", padding: Spacing.md },
  maskedText: { color: Colors.inkMuted, fontSize: 12, fontVariant: ["tabular-nums"] },
  cardTop: { alignItems: "center", flexDirection: "row", gap: Spacing.md },
  cardIcon: { alignItems: "center", backgroundColor: "rgba(110,145,255,0.10)", borderRadius: Radius.md, height: 44, justifyContent: "center", width: 44 },
  settingsPanel: { gap: 0, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  settingsRow: { alignItems: "center", flexDirection: "row", gap: Spacing.md, minHeight: 58, paddingVertical: 7 },
  toggleRow: { alignItems: "center", flexDirection: "row", gap: Spacing.md, minHeight: 64, paddingVertical: 7 },
  settingsIcon: { alignItems: "center", backgroundColor: Colors.surfaceSoft, borderRadius: Radius.md, height: 38, justifyContent: "center", width: 38 },
  settingsCopy: { flex: 1, gap: 3, minWidth: 0 },
  settingsLabel: { color: Colors.ink, fontSize: 14, fontWeight: "700" },
  settingsDetail: { color: Colors.inkMuted, fontSize: 11 },
  grayston: { alignItems: "center", gap: Spacing.sm, paddingBottom: Spacing.xl, paddingTop: Spacing.md },
  graystonText: { color: Colors.inkFaint, fontSize: 11, textAlign: "center" },
  supportLink: { alignItems: "center", flexDirection: "row", gap: 5 },
  supportText: { color: Colors.inkFaint, fontSize: 11 },
  pressed: { opacity: 0.7 },
});
