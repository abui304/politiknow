import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { NationalDetail, NationalMap as NationalMapData } from '@/lib/types';
import { colors, fonts, radius, sticker } from '@/theme';

import { Icon, Txt } from './ui';
import type { Box } from './ZoomView';

// Callout tags for small states, in screen pixels (build_national spaces them to fit a phone).
export const TAG_W = 22;
export const TAG_H = 12;

/** Highlight colors for places the user cares about (not party colors). */
export const PLACE_COLORS = { home: colors.mint, following: colors.lilac };

type MapSvgProps = {
  map: NationalMapData;
  /** Visible region, in map units. */
  view: Box;
  /** On-screen width, so lines and labels stay a constant size at any zoom. */
  px: number;
  /** "WA-8" style keys. */
  home: string | null;
  following: string[];
  /** Zoomed in far enough to pick districts: they're drawn filled, with stronger lines. */
  zoomed?: boolean;
  /** Full-detail boundaries for some states (those in view when zoomed in), drawn instead of the overview's. */
  detail?: Record<string, NationalDetail>;
};

/** Bounding box of a path, from its coordinates. */
export function pathBounds(d: string): Box {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    x0 = Math.min(x0, nums[i]);
    x1 = Math.max(x1, nums[i]);
    y0 = Math.min(y0, nums[i + 1]);
    y1 = Math.max(y1, nums[i + 1]);
  }
  return [x0, y0, x1, y1];
}

/** Center of a path's bounding box, for marking districts too small to see at national scale. */
function pathCenter(d: string): [number, number] {
  const [x0, y0, x1, y1] = pathBounds(d);
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

const stateOf = (key: string) => key.split('-')[0];

/** The whole country with district lines. Your district and the districts you follow are filled in,
 *  with a pin so even tiny city districts show up. */
export function NationalMapSvg({ map, view, px, home, following, zoomed = false, detail = {} }: MapSvgProps) {
  const unit = (view[2] - view[0]) / px; // view units per screen pixel
  const marked = [...following.filter((k) => k !== home).map((k) => ({ key: k, color: PLACE_COLORS.following })),
    ...(home ? [{ key: home, color: PLACE_COLORS.home }] : [])].filter((m) => map.districts[m.key]);
  const statePath = (code: string) => detail[code]?.outline ?? map.states[code].path;
  const districtPath = (key: string) => detail[stateOf(key)]?.districts[key] ?? map.districts[key];

  return (
    <Svg width="100%" height="100%" viewBox={`${view[0]} ${view[1]} ${view[2] - view[0]} ${view[3] - view[1]}`}>
      <Rect x={view[0]} y={view[1]} width={view[2] - view[0]} height={view[3] - view[1]} fill={colors.surfaceAlt} />
      {Object.keys(map.states).map((code) => (
        <Path
          key={code}
          d={statePath(code)}
          fill={colors.surface}
          stroke={colors.line}
          strokeWidth={1.2 * unit}
          strokeLinejoin="round"
        />
      ))}
      <G fill="none" stroke={zoomed ? '#BFAE96' : '#D8C9B4'} strokeWidth={(zoomed ? 0.8 : 0.5) * unit} strokeLinejoin="round">
        {Object.keys(map.districts).map((key) => (
          <Path key={key} d={districtPath(key)} />
        ))}
      </G>
      {marked.map((m) => (
        <Path
          key={m.key}
          d={districtPath(m.key)}
          fill={m.color}
          stroke={colors.line}
          strokeWidth={1 * unit}
          strokeLinejoin="round"
        />
      ))}
      {/* State borders again, on top of the districts. */}
      <G fill="none" stroke={colors.line} strokeWidth={1.2 * unit} strokeLinejoin="round">
        {Object.keys(map.states).map((code) => (
          <Path key={code} d={statePath(code)} />
        ))}
      </G>
      {Object.entries(map.states).map(([code, s]) => {
        // Zoomed in, small states have room for their label, so the callouts (which would cross the map) go.
        const tag = zoomed ? null : s.tag;
        const [x, y] = tag ?? s.label;
        const label = { x, y: y + 3 * unit, fontSize: 9 * unit, fontFamily: fonts.extrabold, textAnchor: 'middle' } as const;
        return (
          <G key={code}>
            {tag ? (
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
                />
              </>
            ) : null}
            <SvgText {...label} fill={colors.inkSoft}>
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
          />
        );
      })}
    </Svg>
  );
}

type Props = {
  map: NationalMapData;
  home: string | null;
  following: string[];
  /** Opens the full-screen, zoomable map. */
  onExpand: () => void;
};

/** A preview of the national map for a card. Tapping it opens the full-screen map, where states and
 *  districts are big enough to tap. */
export function NationalMap({ map, home, following, onExpand }: Props) {
  const [px, setPx] = useState(340);

  return (
    <View>
      <Pressable
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel="Map of the United States. Opens a full-screen map you can zoom."
        style={[styles.frame, sticker(3, radius.lg), { aspectRatio: map.width / map.height }]}
        onLayout={(e) => setPx(e.nativeEvent.layout.width || px)}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <NationalMapSvg map={map} view={[0, 0, map.width, map.height]} px={px} home={home} following={following} />
        </View>
        <View pointerEvents="none" style={[styles.expand, sticker(2, radius.sm)]}>
          <Icon name="maximize-2" size={14} />
        </View>
      </Pressable>
      <View style={styles.legend}>
        <Swatch color={PLACE_COLORS.home} label="Your district" />
        <Swatch color={PLACE_COLORS.following} label="Following" />
        <Txt style={[styles.legendText, { flex: 1, textAlign: 'right' }]}>Tap to expand</Txt>
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
  expand: { position: 'absolute', right: 8, top: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, borderColor: colors.line },
  legendText: { fontFamily: fonts.bold, fontSize: 12, color: colors.inkSoft },
});
