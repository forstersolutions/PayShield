import * as Haptics from "expo-haptics";
import { X, type LucideIcon } from "lucide-react-native";
import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { PayShieldLogo } from "@/components/brand";
import {
  Colors,
  Fonts,
  MaxContentWidth,
  Radius,
  Spacing,
  TabBarHeight,
} from "@/constants/theme";

function haptic() {
  if (Platform.OS !== "web") void Haptics.selectionAsync();
}

export function Screen({
  children,
  onRefresh,
  refreshing = false,
}: PropsWithChildren<{ onRefresh?: () => void; refreshing?: boolean }>) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.screenContent}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            colors={[Colors.mint]}
            onRefresh={onRefresh}
            progressBackgroundColor={Colors.surfaceRaised}
            refreshing={refreshing}
            tintColor={Colors.mint}
          />
        ) : undefined
      }
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      <View style={[styles.screenInner, { paddingTop: Math.max(insets.top, Spacing.sm) }]}>{children}</View>
    </ScrollView>
  );
}

export function AppHeader({
  avatar,
  onAvatarPress,
}: {
  avatar: string;
  onAvatarPress?: () => void;
}) {
  return (
    <View style={styles.appHeader}>
      <PayShieldLogo compact />
      <Pressable
        accessibilityLabel="Open account"
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => {
          haptic();
          onAvatarPress?.();
        }}
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
      >
        <Text style={styles.avatarText}>{avatar}</Text>
      </Pressable>
    </View>
  );
}

export function PageHeading({
  eyebrow,
  title,
  body,
  action,
}: {
  action?: ReactNode;
  body?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <View style={styles.pageHeading}>
      <View style={styles.pageHeadingCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.pageTitle}>{title}</Text>
        {body ? <Text style={styles.pageBody}>{body}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function SectionHeading({
  title,
  detail,
  action,
}: {
  action?: ReactNode;
  detail?: string;
  title: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Panel({
  children,
  style,
  tone = "default",
}: PropsWithChildren<{
  style?: ViewStyle | ViewStyle[];
  tone?: "default" | "blue" | "mint" | "warning";
}>) {
  return <View style={[styles.panel, toneStyles[tone], style]}>{children}</View>;
}

const toneStyles = StyleSheet.create({
  default: {},
  blue: { backgroundColor: "#17213A", borderColor: "rgba(110, 145, 255, 0.24)" },
  mint: { backgroundColor: "#13251F", borderColor: "rgba(114, 221, 183, 0.24)" },
  warning: { backgroundColor: "#282318", borderColor: "rgba(241, 198, 111, 0.24)" },
});

type ActionButtonProps = {
  disabled?: boolean;
  icon?: LucideIcon;
  label: string;
  loading?: boolean;
  onPress: () => void;
  style?: ViewStyle | ViewStyle[];
  variant?: "primary" | "secondary" | "danger" | "quiet";
};

export function ActionButton({
  disabled,
  icon: Icon,
  label,
  loading,
  onPress,
  style,
  variant = "primary",
}: ActionButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        buttonStyles[variant],
        style,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? Colors.black : Colors.ink} size="small" />
      ) : Icon ? (
        <Icon color={variant === "primary" ? Colors.black : variant === "danger" ? Colors.red : Colors.ink} size={18} strokeWidth={2.2} />
      ) : null}
      <Text style={[styles.buttonText, variant === "primary" && styles.buttonTextPrimary, variant === "danger" && styles.buttonTextDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: Colors.mint, borderColor: Colors.mint },
  secondary: { backgroundColor: Colors.surfaceRaised, borderColor: Colors.lineStrong },
  danger: { backgroundColor: "rgba(255, 118, 111, 0.08)", borderColor: "rgba(255, 118, 111, 0.28)" },
  quiet: { backgroundColor: "transparent", borderColor: Colors.line },
});

export function IconButton({
  icon: Icon,
  label,
  onPress,
  danger = false,
  disabled = false,
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [styles.iconButton, danger && styles.iconButtonDanger, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Icon color={danger ? Colors.red : Colors.inkMuted} size={19} />
    </Pressable>
  );
}

export function QuickAction({
  icon: Icon,
  label,
  onPress,
  color = Colors.mint,
}: {
  color?: string;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: `${color}18` }]}>
        <Icon color={color} size={21} strokeWidth={2.1} />
      </View>
      <Text numberOfLines={1} style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ color, progress }: { color: string; progress: number }) {
  const width = `${Math.max(0, Math.min(100, progress))}%` as `${number}%`;
  return (
    <View accessibilityLabel={`${Math.round(progress)} percent funded`} accessibilityRole="progressbar" style={styles.progressTrack}>
      <View style={[styles.progressFill, { backgroundColor: color, width }]} />
    </View>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "good" | "neutral" | "warning" | "danger";
}) {
  const color = tone === "good" ? Colors.mint : tone === "warning" ? Colors.gold : tone === "danger" ? Colors.red : Colors.inkMuted;
  return (
    <View style={[styles.statusPill, { borderColor: `${color}40` }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  body: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}><Icon color={Colors.inkMuted} size={22} /></View>
      <View style={styles.emptyCopy}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyBody}>{body}</Text>
      </View>
    </View>
  );
}

export function LoadingState({ label = "Loading your money..." }: { label?: string }) {
  return (
    <View style={styles.centerState}>
      <ActivityIndicator color={Colors.mint} size="large" />
      <Text style={styles.centerStateText}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Panel tone="warning">
      <Text style={styles.errorTitle}>Couldn&apos;t load this</Text>
      <Text style={styles.errorBody}>{message}</Text>
      {onRetry ? <ActionButton label="Try again" onPress={onRetry} variant="secondary" /> : null}
    </Panel>
  );
}

export function FormField({
  label,
  hint,
  prefix,
  keyboardType,
  ...inputProps
}: TextInputProps & {
  hint?: string;
  keyboardType?: KeyboardTypeOptions;
  label: string;
  prefix?: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <View style={styles.inputWrap}>
        {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}
        <TextInput
          autoCorrect={false}
          keyboardAppearance="dark"
          keyboardType={keyboardType}
          placeholderTextColor={Colors.inkFaint}
          selectionColor={Colors.mint}
          style={styles.input}
          {...inputProps}
        />
      </View>
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  value: T;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => {
              haptic();
              onChange(option.value);
            }}
            style={({ pressed }) => [styles.segment, selected && styles.segmentSelected, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ModalSheet({
  children,
  onClose,
  title,
  visible,
}: PropsWithChildren<{ onClose: () => void; title: string; visible: boolean }>) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
        <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <IconButton icon={X} label="Close" onPress={onClose} />
          </View>
          <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function InlineMessage({
  message,
  tone = "good",
}: {
  message?: string | null;
  tone?: "good" | "error" | "neutral";
}) {
  if (!message) return null;
  return <Text accessibilityRole={tone === "error" ? "alert" : undefined} style={[styles.inlineMessage, tone === "error" && styles.inlineMessageError]}>{message}</Text>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: Colors.canvas, flex: 1 },
  screenContent: { alignItems: "center", paddingBottom: TabBarHeight + Spacing.xl },
  screenInner: { gap: Spacing.xl, maxWidth: MaxContentWidth, paddingHorizontal: Spacing.lg, width: "100%" },
  appHeader: { alignItems: "center", borderBottomColor: Colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 66, paddingVertical: Spacing.sm },
  avatar: { alignItems: "center", backgroundColor: Colors.surfaceSoft, borderColor: Colors.lineStrong, borderRadius: Radius.round, borderWidth: 1, height: 38, justifyContent: "center", width: 38 },
  avatarText: { color: Colors.ink, fontFamily: Fonts.rounded, fontSize: 12, fontWeight: "800" },
  pageHeading: { alignItems: "flex-start", flexDirection: "row", gap: Spacing.md, justifyContent: "space-between" },
  pageHeadingCopy: { flex: 1, gap: 5 },
  eyebrow: { color: Colors.gold, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  pageTitle: { color: Colors.ink, fontFamily: Fonts.rounded, fontSize: 29, fontWeight: "800", lineHeight: 34 },
  pageBody: { color: Colors.inkMuted, fontSize: 15, lineHeight: 22, maxWidth: 540 },
  sectionHeading: { alignItems: "center", flexDirection: "row", gap: Spacing.md, justifyContent: "space-between" },
  sectionHeadingCopy: { flex: 1, gap: 2 },
  sectionTitle: { color: Colors.ink, fontSize: 18, fontWeight: "700" },
  sectionDetail: { color: Colors.inkMuted, fontSize: 13, lineHeight: 18 },
  panel: { backgroundColor: Colors.surface, borderColor: Colors.line, borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.lg, padding: Spacing.lg },
  button: { alignItems: "center", borderRadius: Radius.md, borderWidth: 1, flexDirection: "row", gap: Spacing.sm, justifyContent: "center", minHeight: 48, paddingHorizontal: Spacing.lg, paddingVertical: 12 },
  buttonText: { color: Colors.ink, fontSize: 15, fontWeight: "700" },
  buttonTextPrimary: { color: Colors.black },
  buttonTextDanger: { color: Colors.red },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.42 },
  iconButton: { alignItems: "center", backgroundColor: Colors.surfaceRaised, borderColor: Colors.line, borderRadius: Radius.md, borderWidth: 1, height: 40, justifyContent: "center", width: 40 },
  iconButtonDanger: { backgroundColor: "rgba(255,118,111,0.07)", borderColor: "rgba(255,118,111,0.2)" },
  quickAction: { alignItems: "center", flex: 1, gap: Spacing.sm, minWidth: 78 },
  quickActionIcon: { alignItems: "center", borderRadius: Radius.round, height: 48, justifyContent: "center", width: 48 },
  quickActionText: { color: Colors.inkMuted, fontSize: 12, fontWeight: "700" },
  progressTrack: { backgroundColor: Colors.surfaceSoft, borderRadius: 3, height: 5, overflow: "hidden", width: "100%" },
  progressFill: { borderRadius: 3, height: "100%" },
  statusPill: { alignItems: "center", alignSelf: "flex-start", borderRadius: Radius.round, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 26, paddingHorizontal: 9 },
  statusDot: { borderRadius: Radius.round, height: 6, width: 6 },
  statusText: { fontSize: 11, fontWeight: "800" },
  divider: { backgroundColor: Colors.line, height: StyleSheet.hairlineWidth, width: "100%" },
  emptyState: { alignItems: "center", flexDirection: "row", gap: Spacing.md, paddingVertical: Spacing.md },
  emptyIcon: { alignItems: "center", backgroundColor: Colors.surfaceSoft, borderRadius: Radius.round, height: 44, justifyContent: "center", width: 44 },
  emptyCopy: { flex: 1, gap: 3 },
  emptyTitle: { color: Colors.ink, fontSize: 15, fontWeight: "700" },
  emptyBody: { color: Colors.inkMuted, fontSize: 13, lineHeight: 18 },
  centerState: { alignItems: "center", flex: 1, gap: Spacing.md, justifyContent: "center", minHeight: 420 },
  centerStateText: { color: Colors.inkMuted, fontSize: 14 },
  errorTitle: { color: Colors.ink, fontSize: 17, fontWeight: "700" },
  errorBody: { color: Colors.inkMuted, fontSize: 14, lineHeight: 20 },
  field: { gap: 7 },
  fieldLabelRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  fieldLabel: { color: Colors.ink, fontSize: 13, fontWeight: "700" },
  fieldHint: { color: Colors.inkFaint, fontSize: 11 },
  inputWrap: { alignItems: "center", backgroundColor: Colors.canvasRaised, borderColor: Colors.lineStrong, borderRadius: Radius.md, borderWidth: 1, flexDirection: "row", minHeight: 50, paddingHorizontal: Spacing.md },
  inputPrefix: { color: Colors.inkMuted, fontSize: 17, fontWeight: "700" },
  input: { color: Colors.ink, flex: 1, fontSize: 16, minHeight: 48, paddingHorizontal: Spacing.sm },
  segmented: { backgroundColor: Colors.canvasRaised, borderColor: Colors.line, borderRadius: Radius.md, borderWidth: 1, flexDirection: "row", padding: 3 },
  segment: { alignItems: "center", borderRadius: Radius.sm, flex: 1, justifyContent: "center", minHeight: 38, paddingHorizontal: 7 },
  segmentSelected: { backgroundColor: Colors.surfaceSoft },
  segmentText: { color: Colors.inkMuted, fontSize: 12, fontWeight: "700" },
  segmentTextSelected: { color: Colors.ink },
  modalRoot: { backgroundColor: Colors.canvas, flex: 1 },
  modalSafe: { flex: 1 },
  modalHeader: { alignItems: "center", borderBottomColor: Colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", justifyContent: "space-between", minHeight: 64, paddingHorizontal: Spacing.lg },
  modalTitle: { color: Colors.ink, fontFamily: Fonts.rounded, fontSize: 19, fontWeight: "800" },
  modalContent: { gap: Spacing.lg, padding: Spacing.lg, paddingBottom: Spacing.jumbo },
  inlineMessage: { color: Colors.mint, fontSize: 13, lineHeight: 18 },
  inlineMessageError: { color: Colors.coral },
});
