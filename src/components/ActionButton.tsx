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
  const filled = variant === 'primary' || selected;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, ...(selected !== undefined ? { selected } : {}) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: filled
            ? colors.primary
            : variant === 'secondary'
              ? colors.surface
              : 'transparent',
          borderColor: variant === 'quiet' && !selected ? 'transparent' : colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text style={[styles.text, { color: filled ? colors.background : colors.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
