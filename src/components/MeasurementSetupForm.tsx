import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ThemeColors } from '@/constants/theme';
import {
  CASE_OPTIONS,
  MATERIAL_OPTIONS,
  ORIENTATION_OPTIONS,
  SURFACE_OPTIONS,
} from '@/lib/measurementSetup';
import type { MeasurementEnvironment } from '@/types/setup';

export function SetupChoices<T extends string>({
  label,
  options,
  value,
  onChange,
  colors,
  disabled = false,
}: {
  label: string;
  options: readonly { value: T; label: string; description?: string }[];
  value: T;
  onChange: (value: T) => void;
  colors: ThemeColors;
  disabled?: boolean;
}) {
  return (
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${option.label}`}
            accessibilityHint={option.description}
            accessibilityState={{ checked: selected, disabled }}
            aria-checked={selected}
            aria-disabled={disabled}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.choice,
              {
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.accentSoft : colors.surface,
                opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
              },
            ]}
          >
            <View style={styles.choiceHeading}>
              <View
                style={[
                  styles.radio,
                  { borderColor: selected ? colors.primary : colors.secondaryText },
                ]}
              >
                {selected && (
                  <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                )}
              </View>
              <Text
                style={[styles.choiceLabel, { color: selected ? colors.primary : colors.text }]}
              >
                {option.label}
              </Text>
            </View>
            {option.description && (
              <Text style={[styles.caption, { color: colors.secondaryText }]}>
                {option.description}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function SetupField({
  number,
  title,
  colors,
  children,
}: {
  number: string;
  title: string;
  colors: ThemeColors;
  children: ReactNode;
}) {
  return (
    <View style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.heading}>
        <Text style={[styles.number, { color: colors.secondaryText }]}>{number}</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function MeasurementSetupForm({
  value,
  onChange,
  colors,
  disabled,
}: {
  value: MeasurementEnvironment;
  onChange: (value: MeasurementEnvironment) => void;
  colors: ThemeColors;
  disabled: boolean;
}) {
  return (
    <View style={styles.form}>
      <SetupField number="01" title="화면 방향" colors={colors}>
        <SetupChoices
          label="화면 방향"
          options={ORIENTATION_OPTIONS}
          value={value.orientation}
          onChange={(orientation) => onChange({ ...value, orientation })}
          colors={colors}
          disabled={disabled}
        />
        {value.orientation === 'screen_down_top_away' && (
          <Text style={[styles.caption, { color: colors.secondaryText }]}>
            측정 시작을 누른 뒤 준비 3초 동안 화면이 아래를 향하도록 놓아 주세요.
          </Text>
        )}
      </SetupField>
      <SetupField number="02" title="케이스 재질" colors={colors}>
        <SetupChoices
          label="케이스 재질"
          options={CASE_OPTIONS}
          value={value.case_material}
          onChange={(case_material) => onChange({ ...value, case_material })}
          colors={colors}
          disabled={disabled}
        />
      </SetupField>
      <SetupField number="03" title="휴대폰을 놓는 곳" colors={colors}>
        <SetupChoices
          label="받침 종류"
          options={SURFACE_OPTIONS}
          value={value.surface_type}
          onChange={(surface_type) => onChange({ ...value, surface_type })}
          colors={colors}
          disabled={disabled}
        />
        <Text style={[styles.sublabel, { color: colors.text }]}>
          {value.surface_type === 'desk' ? '책상' : '바닥'} 재질
        </Text>
        <SetupChoices
          label="받침 재질"
          options={MATERIAL_OPTIONS}
          value={value.surface_material}
          onChange={(surface_material) => onChange({ ...value, surface_material })}
          colors={colors}
          disabled={disabled}
        />
        <TextInput
          value={value.note}
          onChangeText={(note) => onChange({ ...value, note })}
          editable={!disabled}
          multiline
          maxLength={300}
          placeholder="환경 메모 (선택) · 기타 재질이나 특이사항"
          accessibilityLabel="측정 환경 메모"
          placeholderTextColor={colors.secondaryText}
          style={[
            styles.input,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
          ]}
        />
      </SetupField>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  field: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  number: { fontSize: 13, fontVariant: ['tabular-nums'] },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  sublabel: { fontSize: 14, fontWeight: '500', marginTop: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    flexBasis: '44%',
    flexGrow: 1,
    minWidth: 100,
    minHeight: 48,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
  },
  choiceHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choiceLabel: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  caption: { fontSize: 13, lineHeight: 20 },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
});
