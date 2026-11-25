import { Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { colors, fonts } from '@/theme';

/**
 * The Path mark: a bill's path through Congress, the steps it has taken and a ringed dot for where it is
 * now. It's the same shape as the timeline on every bill card.
 */
export function PathMark({ height = 24, color = colors.ink, ring = colors.hairline }: { height?: number; color?: string; ring?: string }) {
  return (
    <Svg width={(height * 64) / 40} height={height} viewBox="0 0 64 40">
      <Line x1={6} y1={20} x2={52} y2={20} stroke={color} strokeWidth={3} />
      <Circle cx={6} cy={20} r={5} fill={color} />
      <Circle cx={24} cy={20} r={5} fill={color} />
      <Circle cx={52} cy={20} r={11} fill={ring} />
      <Circle cx={52} cy={20} r={6} fill={color} />
    </Svg>
  );
}

/** The logo: the Path mark and the PolitiKNOW wordmark, with KNOW set in caps to match the name. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.45 }} accessible accessibilityRole="image" accessibilityLabel="PolitiKNOW">
      <PathMark height={size * 1.05} />
      <Text style={{ fontSize: size, lineHeight: size * 1.3, color: colors.ink, letterSpacing: -0.2 }}>
        <Text style={{ fontFamily: fonts.regular }}>Politi</Text>
        <Text style={{ fontFamily: fonts.semibold }}>KNOW</Text>
      </Text>
    </View>
  );
}
