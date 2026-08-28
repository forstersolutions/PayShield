import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { CalendarDays } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Colors, Radius, Spacing } from "@/constants/theme";

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateFromIso(value: string) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date();

  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function DateField({
  hint,
  label,
  minimumDate,
  onChange,
  value,
}: {
  hint?: string;
  label: string;
  minimumDate?: Date;
  onChange: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => dateFromIso(value), [value]);
  const formatted = value
    ? new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(selected)
    : "Choose a date";

  function select(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === "android" || event.type === "dismissed") {
      setOpen(false);
    }

    if (event.type === "set" && date) {
      onChange(localIsoDate(date));
      setOpen(false);
    }
  }

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Pressable
        accessibilityLabel={`${label}: ${formatted}`}
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.control, pressed && styles.pressed]}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>{formatted}</Text>
        <CalendarDays color={Colors.mint} size={19} />
      </Pressable>
      {open ? (
        <DateTimePicker
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={minimumDate}
          mode="date"
          onChange={select}
          themeVariant="dark"
          value={selected}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  labelRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  label: { color: Colors.ink, fontSize: 13, fontWeight: "700" },
  hint: { color: Colors.inkFaint, fontSize: 11 },
  control: { alignItems: "center", backgroundColor: Colors.canvasRaised, borderColor: Colors.lineStrong, borderRadius: Radius.md, borderWidth: 1, flexDirection: "row", gap: Spacing.sm, justifyContent: "space-between", minHeight: 50, paddingHorizontal: Spacing.md },
  value: { color: Colors.ink, fontSize: 16 },
  placeholder: { color: Colors.inkFaint },
  pressed: { opacity: 0.75 },
});
