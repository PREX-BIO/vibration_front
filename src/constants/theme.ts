export const Colors = {
  light: {
    background: '#F7F8FA',
    surface: '#FFFFFF',
    surfaceMuted: '#EEF0F3',
    text: '#17212F',
    secondaryText: '#536174',
    primary: '#2459C4',
    onPrimary: '#FFFFFF',
    accentSoft: '#EAF0FF',
    border: '#CBD2DC',
    danger: '#B42332',
    acceleration: '#0A756C',
    angularVelocity: '#A34C0C',
  },
  dark: {
    background: '#11151C',
    surface: '#1A202A',
    surfaceMuted: '#252D39',
    text: '#F2F4F8',
    secondaryText: '#B6C0D0',
    primary: '#9BBDFF',
    onPrimary: '#10213F',
    accentSoft: '#253655',
    border: '#465368',
    danger: '#FFABB1',
    acceleration: '#74D7C9',
    angularVelocity: '#F3BB87',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };
