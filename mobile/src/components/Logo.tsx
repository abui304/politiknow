import { Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
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

/**
 * The logo: the Path mark and the PolitiKNOW wordmark, with KNOW set in caps to match the name. With a mouse, it
 * grows a little while the pointer is over it (from its left edge, so it never nudges what's beside it; from its middle when it's centered).
 */
export function Logo({ size = 22, centered = false }: { size?: number; centered?: boolean }) {
  const scale = useSharedValue(1);
  const reduce = useReducedMotion();
  const grow = (to: number) => {
    if (!reduce) scale.set(withTiming(to, { duration: 180, easing: Easing.out(Easing.cubic) }));
  };
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: size * 0.45, transformOrigin: centered ? 'center' : 'left center' }, style]}
      onPointerEnter={() => grow(1.08)}
      onPointerLeave={() => grow(1)}
      accessible
      accessibilityRole="image"
      accessibilityLabel="PolitiKNOW">
      <PathMark height={size * 1.05} />
      <Text style={{ fontSize: size, lineHeight: size * 1.3, color: colors.ink, letterSpacing: -0.2 }}>
        <Text style={{ fontFamily: fonts.regular }}>Politi</Text>
        <Text style={{ fontFamily: fonts.semibold }}>KNOW</Text>
      </Text>
    </Animated.View>
  );
}
