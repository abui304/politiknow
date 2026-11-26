import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/** One wisp of steam: drifts up and fades, over and over, each wisp a beat behind the one before. */
function Wisp({ x, delay, size, color }: { x: number; delay: number; size: number; color: string }) {
  const t = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, false)));
  }, [delay, reduce, t]);
  const style = useAnimatedStyle(() => {
    const v = t.get();
    // Rises about a sixth of the icon, fading in then out, so the loop has no visible jump.
    return { opacity: reduce ? 0.8 : Math.sin(v * Math.PI) * 0.9, transform: [{ translateY: (reduce ? 0 : -v * size * 0.16) }] };
  });
  return (
    <Animated.View style={[styles.layer, style]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d={`M${x} 8.5c-1.2-1.3 1.2-2.4 0-3.7s1.2-2.4 0-3.3`}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * A cup with steam slowly rising from it, drawn in the same line style as the app's icons. Used for a quiet
 * week: nothing urgent, take your time. Holds still when Reduce Motion is on.
 */
export function SteamCup({ size = 24, color = colors.inkSoft }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel="A steaming cup">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {/* Cup and handle, then the saucer. */}
        <Path d="M4 11h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" stroke={color} strokeWidth={2} strokeLinejoin="round" fill="none" />
        <Path d="M16 12.5h1.5a2.5 2.5 0 0 1 0 5H16" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
        <Path d="M3 22h15" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </Svg>
      <Wisp x={8} delay={0} size={size} color={color} />
      <Wisp x={12} delay={1200} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
