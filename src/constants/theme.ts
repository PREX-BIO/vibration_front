export const Colors = {
  light: {
    background: '#F5F5F0',
    surface: '#FFFFFF',
    text: '#202E29',
    secondaryText: '#626F68',
    primary: '#236B53',
    accentSoft: '#E8F1EA',
    border: '#D9E1D9',
    danger: '#A34435',
  },
  dark: {
    background: '#141D19',
    surface: '#202B25',
    text: '#EFF4EC',
    secondaryText: '#ABBBAF',
    primary: '#9BCDB3',
    accentSoft: '#2C4034',
    border: '#3E5144',
    danger: '#F2AD9C',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };
