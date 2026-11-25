import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Colors } from '@/constants/theme';

export default function RootLayout() {
  const colors = Colors.light;
  const baseTheme = DefaultTheme;

  return (
    <ThemeProvider
      value={{
        ...baseTheme,
        colors: {
          ...baseTheme.colors,
          background: colors.background,
          card: colors.background,
          text: colors.text,
          primary: colors.primary,
        },
      }}
    >
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: '페이지를 찾을 수 없습니다' }} />
      </Stack>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
