// PolitiKNOW design tokens: cozy cream base + playful "sticker" outlines and offset shadows.
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  bg: '#FFF7EC',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF0DC',
  ink: '#2A2340',
  inkSoft: '#5C5470',
  muted: '#9A93A8',
  line: '#2A2340',
  hairline: '#EADFCF',

  red: '#E5484D', // from the logo's "P"
  blue: '#3E63DD', // from the logo's "K"
  yellow: '#FFC53D',
  mint: '#5BD1A5',
  lilac: '#B9A6FF',
  pink: '#FF8FB1',

  success: '#2EAD7A',
  danger: '#E5484D',
};

// Full-card party colors (kept from the original design).
export const party: Record<string, { main: string; soft: string; label: string }> = {
  D: { main: '#3E63DD', soft: '#E6ECFF', label: 'Democrat' },
  R: { main: '#E5484D', soft: '#FFE6E6', label: 'Republican' },
  I: { main: '#F0A81A', soft: '#FFF3D6', label: 'Independent' },
  ID: { main: '#F0A81A', soft: '#FFF3D6', label: 'Independent' },
  other: { main: '#8B6CF0', soft: '#EFEAFF', label: 'Other' },
};

export function partyColors(code?: string | null) {
  return party[code ?? ''] ?? party.other;
}

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const fonts = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
};

export const type: Record<string, TextStyle> = {
  // Explicit lineHeight: without one, Nunito Black's tallest glyphs (e.g. "@") draw above the box on phones.
  title: { fontFamily: fonts.black, fontSize: 28, lineHeight: 36, color: colors.ink, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  h3: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.ink },
  bodyBold: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft },
  tiny: { fontFamily: fonts.bold, fontSize: 11, color: colors.muted, letterSpacing: 0.4 },
};

/** Chunky outline + hard offset shadow — the "sticker" look. */
export function sticker(offset = 3, borderRadius = radius.lg): ViewStyle {
  return {
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: `${offset}px ${offset}px 0 ${colors.line}` } as ViewStyle)
      : {
          shadowColor: colors.line,
          shadowOffset: { width: offset, height: offset },
          shadowOpacity: 1,
          shadowRadius: 0,
          elevation: offset + 1,
        }),
  };
}

/** Max width of the app column; on desktop web the app renders as a centered phone-sized column. */
export const APP_MAX_WIDTH = 520;
