import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { StateMap } from '@/lib/types';
import { colors, fonts, partyColors, radius, sticker } from '@/theme';

type Box = [number, number, number, number]; // x0, y0, x1, y1

type Props = {
  map: StateMap;
  /** The district to highlight; null fills the whole state (senators). */
  district: string | null;
  party: string | null;
};

const ASPECT = 4 / 3;
const MAX_LABELS = 4;
/** A district smaller than this share of its state gets a close-up view plus a state inset. */
const ZOOM_BELOW = 0.3;

/** Grows `box` by `pad` on every side, then widens or heightens it to the card's aspect ratio. */
function fit([x0, y0, x1, y1]: Box, pad: number): Box {
  let w = x1 - x0 + pad * 2;
  let h = y1 - y0 + pad * 2;
  if (w / h < ASPECT) w = h * ASPECT;
  else h = w / ASPECT;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
}

/** The biggest cities in view, the district's own first, skipping any that would crowd a label. */
function pickCities(map: StateMap, view: Box, district: string | null, inset: boolean) {
  const [x0, y0, x1, y1] = view;
  const w = x1 - x0;
  const h = y1 - y0;
  const underInset = (c: { x: number; y: number }) => inset && c.x > x0 + w * 0.45 && c.y > y0 + h * 0.55;
  const inView = map.cities.filter(
    (c) => c.x > x0 + w * 0.04 && c.x < x1 - w * 0.04 && c.y > y0 + h * 0.06 && c.y < y1 - h * 0.04 && !underInset(c),
  );
  const ranked = [
    ...inView.filter((c) => district && c.district === district),
    ...inView.filter((c) => !district || c.district !== district),
  ];
  const picked: typeof ranked = [];
  for (const c of ranked) {
    if (picked.length >= MAX_LABELS) break;
    if (picked.every((p) => Math.abs(p.x - c.x) > w * 0.28 || Math.abs(p.y - c.y) > h * 0.1)) picked.push(c);
  }
  return picked;
}

export function DistrictMap({ map, district, party }: Props) {
  const [px, setPx] = useState(320); // rendered width, so strokes and text stay a constant on-screen size
  const p = partyColors(party);
  const target = district !== null ? map.districts[district] : undefined;
  const stateBox: Box = [0, 0, map.width, map.height];
  const longSide = Math.max(map.width, map.height);
  const zoomed = Boolean(target && Math.max(target.bbox[2] - target.bbox[0], target.bbox[3] - target.bbox[1]) < longSide * ZOOM_BELOW);
  const view = zoomed && target ? fit(target.bbox, Math.max(target.bbox[2] - target.bbox[0], target.bbox[3] - target.bbox[1]) * 0.45) : fit(stateBox, longSide * 0.05);
  const unit = (view[2] - view[0]) / px; // view units per screen pixel
  const cities = pickCities(map, view, target ? district : null, zoomed);
  const others = Object.entries(map.districts).filter(([n]) => n !== district);
  const wholeState = !target;

  return (
    <View
      style={[styles.frame, sticker(3, radius.lg), { aspectRatio: ASPECT }]}
      onLayout={(e) => setPx(e.nativeEvent.layout.width || 320)}>
      <Svg width="100%" height="100%" viewBox={`${view[0]} ${view[1]} ${view[2] - view[0]} ${view[3] - view[1]}`}>
        {/* State: hard offset shadow, then the land. */}
        <Path d={map.outline} fill={colors.line} transform={`translate(${3 * unit} ${3 * unit})`} />
        <Path d={map.outline} fill={wholeState ? p.main : colors.surface} stroke={colors.line} strokeWidth={2 * unit} strokeLinejoin="round" />
        {/* Neighboring districts, faintly outlined. */}
        <G fill="none" stroke={wholeState ? 'rgba(255,255,255,0.45)' : '#D8C9B4'} strokeWidth={1.2 * unit} strokeLinejoin="round">
          {others.map(([n, d]) => (
            <Path key={n} d={d.path} />
          ))}
        </G>
        {target ? (
          <G>
            <Path d={target.path} fill={colors.line} transform={`translate(${2.5 * unit} ${2.5 * unit})`} />
            <Path d={target.path} fill={p.main} stroke={colors.line} strokeWidth={2 * unit} strokeLinejoin="round" />
          </G>
        ) : null}
        {cities.map((c) => {
          const flip = c.x > view[0] + (view[2] - view[0]) * 0.62;
          const tx = c.x + (flip ? -8 : 8) * unit;
          const ty = c.y + 4.5 * unit;
          const label = { x: tx, y: ty, fontSize: 13 * unit, fontFamily: fonts.extrabold, textAnchor: flip ? 'end' : 'start' } as const;
          return (
            <G key={c.name}>
              <Circle cx={c.x} cy={c.y} r={4 * unit} fill={colors.surface} stroke={colors.line} strokeWidth={2 * unit} />
              <SvgText {...label} stroke={colors.surface} strokeWidth={3.5 * unit} strokeLinejoin="round" fill={colors.surface}>
                {c.name}
              </SvgText>
              <SvgText {...label} fill={colors.ink}>
                {c.name}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {zoomed && target ? <StateInset map={map} district={target.path} color={p.main} view={view} /> : null}
    </View>
  );
}

/** Small whole-state locator in the corner of a zoomed-in map, with the zoomed area boxed. */
function StateInset({ map, district, color, view }: { map: StateMap; district: string; color: string; view: Box }) {
  const box = fit([0, 0, map.width, map.height], Math.max(map.width, map.height) * 0.08);
  const u = (box[2] - box[0]) / 90;
  return (
    <View style={[styles.inset, sticker(2, radius.md)]}>
      <Svg width="100%" height="100%" viewBox={`${box[0]} ${box[1]} ${box[2] - box[0]} ${box[3] - box[1]}`}>
        <Path d={map.outline} fill={colors.surfaceAlt} stroke={colors.line} strokeWidth={1.5 * u} strokeLinejoin="round" />
        <Path d={district} fill={color} stroke={color} strokeWidth={1.5 * u} />
        <Rect
          x={view[0]}
          y={view[1]}
          width={view[2] - view[0]}
          height={view[3] - view[1]}
          fill="none"
          stroke={colors.line}
          strokeWidth={1.5 * u}
          strokeDasharray={`${3 * u} ${2 * u}`}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  inset: { position: 'absolute', right: 10, bottom: 10, width: 96, aspectRatio: ASPECT, backgroundColor: colors.surface, overflow: 'hidden' },
});
