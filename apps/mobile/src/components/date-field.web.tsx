import { FormField } from "@/components/ui";

export function DateField({
  hint,
  label,
  onChange,
  value,
}: {
  hint?: string;
  label: string;
  minimumDate?: Date;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <FormField
      hint={hint ?? "YYYY-MM-DD"}
      label={label}
      maxLength={10}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      value={value}
    />
  );
}
