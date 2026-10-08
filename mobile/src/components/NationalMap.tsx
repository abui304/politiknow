import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { svgPress } from '@/lib/svg';
import type { NationalMap as NationalMapData } from '@/lib/types';
import { colors, fonts, radius, sticker } from '@/theme';

import { Txt } from './ui';

// Callout tags for small states, in screen pixels (build_national spaces them to fit a phone).
const TAG_W = 22;
const TAG_H = 12;

/** Highlight colors for places the user cares about (not party colors). */
export const PLACE_COLORS = { home: colors.mint, following: colors.lilac };

type Props = {
  map: NationalMapData;
  /** "WA-8" style keys. */
  home: string | null;
  following: string[];
  onPressState: (code: string) => void;
};

/** Center of a path's bounding box, for marking districts too small to see at national scale. */
function pathCenter(d: string): [number, number] {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]);
    x1 = Math.max(x1, nums[i]);
    y0 = Math.min(y0, nums[i + 1]);
    y1 = Math.max(y1, nums[i + 1]);
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

/** The whole country with district lines. Tap a state to open its district map. Your district and the
 *  districts you follow are filled in, with a pin so even tiny city districts show up. */
export function NationalMap({ map, home, following, onPressState }: Props) {
  const [px, setPx] = useState(340);
  const unit = map.width / px; // view units per screen pixel
  const marked = [...following.filter((k) => k !== home).map((k) => ({ key: k, color: PLACE_COLORS.following })),
    ...(home ? [{ key: home, color: PLACE_COLORS.home }] : [])].filter((m) => map.districts[m.key]);
  const stateOf = (key: string) => key.split('-')[0];

  return (
    <View>
      <View
        style={[styles.frame, sticker(3, radius.lg), { aspectRatio: map.width / map.height }]}
        onLayout={(e) => setPx(e.nativeEvent.layout.width || px)}
        accessibilityLabel="Map of the United States. Tap a state to see its districts.">
        <Svg width="100%" height="100%" viewBox={`0 0 ${map.width} ${map.height}`}>
          <Rect x={0} y={0} width={map.width} height={map.height} fill={colors.surfaceAlt} />
          {Object.entries(map.states).map(([code, s]) => (
            <Path
              key={code}
              d={s.path}
              fill={colors.surface}
              stroke={colors.line}
              strokeWidth={1.2 * unit}
              strokeLinejoin="round"
              {...svgPress(() => onPressState(code))}
            />
          ))}
          <G fill="none" stroke="#D8C9B4" strokeWidth={0.5 * unit} strokeLinejoin="round">
            {Object.entries(map.districts).map(([key, d]) => (
              <Path key={key} d={d} />
            ))}
          </G>
          {marked.map((m) => (
            <Path
              key={m.key}
              d={map.districts[m.key]}
              fill={m.color}
              stroke={colors.line}
              strokeWidth={1 * unit}
              strokeLinejoin="round"
              {...svgPress(() => onPressState(stateOf(m.key)))}
            />
          ))}
          {/* State borders again, on top of the districts. */}
          <G fill="none" stroke={colors.line} strokeWidth={1.2 * unit} strokeLinejoin="round">
            {Object.entries(map.states).map(([code, s]) => (
              <Path key={code} d={s.path} />
            ))}
          </G>
          {Object.entries(map.states).map(([code, s]) => {
            const [x, y] = s.tag ?? s.label;
            const press = () => onPressState(code);
            const label = { x, y: y + 3 * unit, fontSize: 9 * unit, fontFamily: fonts.extrabold, textAnchor: 'middle' } as const;
            // Handlers go on shapes, not <G> (see svgPress).
            return (
              <G key={code}>
                {s.tag ? (
                  <>
                    <Line x1={s.label[0]} y1={s.label[1]} x2={x - TAG_W * unit / 2} y2={y} stroke={colors.inkSoft} strokeWidth={0.8 * unit} />
                    <Rect
                      x={x - (TAG_W / 2) * unit}
                      y={y - (TAG_H / 2) * unit}
                      width={TAG_W * unit}
                      height={TAG_H * unit}
                      rx={3 * unit}
                      fill={colors.surface}
                      stroke={colors.line}
                      strokeWidth={1 * unit}
                      {...svgPress(press)}
                    />
                  </>
                ) : null}
                <SvgText {...label} fill={colors.inkSoft} {...svgPress(press)}>
                  {code}
                </SvgText>
              </G>
            );
          })}
          {marked.map((m) => {
            const [cx, cy] = pathCenter(map.districts[m.key]);
            return (
              <Circle
                key={`pin-${m.key}`}
                cx={cx}
                cy={cy}
                r={3.5 * unit}
                fill={m.color}
                stroke={colors.line}
                strokeWidth={1.5 * unit}
                {...svgPress(() => onPressState(stateOf(m.key)))}
              />
            );
          })}
        </Svg>
      </View>
      <View style={styles.legend}>
        <Swatch color={PLACE_COLORS.home} label="Your district" />
        <Swatch color={PLACE_COLORS.following} label="Following" />
        <Txt style={[styles.legendText, { flex: 1, textAlign: 'right' }]}>Tap a state to zoom in</Txt>
      </View>
    </View>
  );
}

export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.swatchRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Txt style={styles.legendText}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, borderColor: colors.line },
  legendText: { fontFamily: fonts.bold, fontSize: 12, color: colors.inkSoft },
});
