// PolitiKNOW design tokens. The world is the printed record: ink on cream paper, hairline rules,
// docket numbers. Chrome stays quiet (paper, ink, hairlines); party color lives on bills and members.
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

// One hue per color. Every neutral is hue 30 (warm paper and ink); each party color keeps one hue for its
// fill and its tint; success and warning have one hue each. Shades change lightness and saturation only.
export const colors = {
  bg: '#FAF7F4', // paper
  surface: '#FFFFFF',
  surfaceAlt: '#F2EDE8', // a step down from paper, for wells, skeletons and pressed states
  ink: '#2B2622',
  inkHover: '#3D3630', // ink one step lighter, for a filled button under the pointer
  inkSoft: '#5C544D',
  muted: '#736B64',
  line: 'rgba(43,38,34,0.10)', // hairline borders
  lineStrong: 'rgba(43,38,34,0.18)', // inputs and controls
  hairline: '#E9E3DD', // opaque rule, for tracks and separators drawn over other shapes
  mapLine: '#D8D1CB',
  mapLineStrong: '#B6ADA5',

  success: '#22774F',
  warning: '#8F5F00',
  danger: '#BA2B2E', // the Republican red, so red means one thing visually
  dangerHover: '#A32326',
};

// Full-card party colors. `on` is the text and icon color that reads on `main`.
export const party: Record<string, { main: string; soft: string; on: string; label: string }> = {
  // Balanced by perceived (OKLCH) lightness: blue 0.50 and red 0.52 carry the same weight; yellow can't be that
  // dark without turning brown, so it's toned down in saturation (0.78, chroma 0.14) to sit at a similar weight.
  D: { main: '#3056CD', soft: '#E8F0FF', on: '#FFFFFF', label: 'Democrat' },
  R: { main: '#BA2B2E', soft: '#FFEAE8', on: '#FFFFFF', label: 'Republican' },
  I: { main: '#E8AB3E', soft: '#FFF1DA', on: '#2B2622', label: 'Independent' },
  ID: { main: '#E8AB3E', soft: '#FFF1DA', on: '#2B2622', label: 'Independent' },
  other: { main: '#635C54', soft: '#F2EDE8', on: '#FFFFFF', label: 'Other' },
};

export function partyColors(code?: string | null) {
  return party[code ?? ''] ?? party.other;
}

/** The party's `on` color at an opacity, for secondary text and rules on a party-colored surface. */
export function onAlpha(p: { on: string }, alpha: number) {
  return p.on === '#FFFFFF' ? `rgba(255,255,255,${alpha})` : `rgba(43,38,34,${alpha})`;
}

// Nested radii: an inner radius is the outer one minus the padding between them.
export const radius = { xs: 6, sm: 10, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Merriweather: a sturdy serif to match the logo's lettering. Weights stop at 600. */
export const fonts = {
  regular: 'Merriweather_400Regular',
  medium: 'Merriweather_500Medium',
  semibold: 'Merriweather_600SemiBold',
};

/** Merriweather's tabular lining figures: every digit the same width, so counts don't jiggle as they change
 *  and columns of numbers line up. Spread into any style that shows numbers. */
export const figures: TextStyle = { fontVariant: ['tabular-nums', 'lining-nums'] };

export const type: Record<string, TextStyle> = {
  // Explicit lineHeight on every style so serif ascenders never draw above the box on phones.
  title: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 36, color: colors.ink, letterSpacing: -0.2 },
  h2: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, color: colors.ink },
  h3: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 24, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.ink },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  meta: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.muted },
  /** Bill numbers like H.R. 1234, set the same way everywhere: the app's signature. */
  docket: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0.3, color: colors.ink, ...figures },
  figure: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.ink, ...figures },
};

/** iOS squircle corners: the curve eases into the straight edge instead of meeting it at a hard tangent. */
export const continuous: ViewStyle = { borderCurve: 'continuous' };

/** A quiet hairline frame for cards, rows and maps. */
export function outline(borderRadius: number = radius.lg): ViewStyle {
  return { borderWidth: 1, borderColor: colors.line, borderRadius, borderCurve: 'continuous' };
}

/** Soft neutral shadow, only for things that float over content (toasts, sheets, map buttons). */
export function float(): ViewStyle {
  return Platform.OS === 'web'
    ? ({ boxShadow: '0 4px 16px rgba(43,38,34,0.10)' } as ViewStyle)
    : { shadowColor: '#2B2622', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 };
}

/** One easing curve and three durations for the whole app. Gestures use the spring instead, so a motion can
 *  be interrupted mid-flight and carry on from the finger's velocity. */
export const motion = { fast: 100, base: 160, enter: 240 };
export const spring = { damping: 26, stiffness: 320, mass: 1 };

/** Max width of the app column; on desktop web the app renders as a centered phone-sized column. */
export const APP_MAX_WIDTH = 520;
/** The reading column on desktop: about 70 characters of body text, with room for a bill's header. */
export const PAGE_MAX_WIDTH = 720;
