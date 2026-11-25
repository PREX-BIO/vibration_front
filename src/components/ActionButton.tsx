import { Pressable, StyleSheet, Text } from 'react-native';

import type { ThemeColors } from '@/constants/theme';

export function ActionButton({
  title,
  onPress,
  colors,
  variant = 'primary',
  disabled = false,
  selected,
}: {
  title: string;
  onPress: () => void;
  colors: ThemeColors;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  selected?: boolean;
}) {
  const filled = variant === 'primary' && selected === undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, ...(selected !== undefined ? { selected } : {}) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: selected
            ? colors.accentSoft
            : filled
              ? colors.primary
              : variant === 'secondary'
                ? colors.surface
                : 'transparent',
          borderColor:
            selected || filled
              ? colors.primary
              : variant === 'quiet'
                ? 'transparent'
                : colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: filled ? colors.onPrimary : selected ? colors.primary : colors.text },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
