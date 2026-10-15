import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { type DistrictTarget, FollowDistrictPrompt } from '@/components/FollowDistrictPrompt';
import { NationalMapSvg, pathBounds, PLACE_COLORS, Swatch, TAG_H, TAG_W } from '@/components/NationalMap';
import { Screen, TopBar, Txt } from '@/components/ui';
import { type Box, type ZoomHandle, ZoomView } from '@/components/ZoomView';
import { keys, useMyDistricts, useNationalDetail, useNationalMap, useRepresentatives } from '@/lib/queries';
import { pathContains } from '@/lib/svg';
import type { NationalDetail, NationalMap } from '@/lib/types';
import { colors, radius, space, sticker, type } from '@/theme';

/** Zoom level at which taps pick a district instead of a state. */
const DISTRICT_ZOOM = 2.5;

/** Zoom level at which the states in view switch to full-detail boundaries. */
const DETAIL_ZOOM = 2;
/** Past this many states in view the overview is detailed enough, and loading them all isn't worth it. */
const MAX_DETAIL_STATES = 20;

const openState = (code: string, district?: string) =>
  router.push({ pathname: '/state/[code]', params: district === undefined ? { code } : { code, district } });

/** The national map full screen: pinch or use the buttons to zoom. Tap a state to zoom in on it, then
 *  tap a district to follow it (or open its page). */
export default function MapScreen() {
  const { data: map } = useNationalMap();
  const { data: reps } = useRepresentatives();
  const { data: districts } = useMyDistricts();
  const key = (d: { state: string; district: number }) => `${d.state}-${d.district}`;
  const home = reps?.home ? key(reps.home) : null;
  const following = (districts ?? []).map(key);
  const [prompt, setPrompt] = useState<DistrictTarget | null>(null);
  const zoomRef = useRef<ZoomHandle>(null);
  const qc = useQueryClient();
  // Tapping a state zooms in on it, far enough that its districts can be tapped.
  const zoomToState = (code: string) => {
    const s = map?.states[code];
    if (!s) return;
    const [x0, y0, x1, y1] = pathBounds(s.path);
    const pad = Math.max(x1 - x0, y1 - y0) * 0.1;
    zoomRef.current?.zoomTo([x0 - pad, y0 - pad, x1 + pad, y1 + pad], DISTRICT_ZOOM);
  };

  /** The state under a point: its callout tag (small Northeast states) or its shape. */
  const stateAt = (x: number, y: number, unit: number, k: number) => {
    if (!map) return undefined;
    const states = Object.entries(map.states);
    const tagged = states.find(
      ([, s]) => k < DISTRICT_ZOOM && s.tag && Math.abs(x - s.tag[0]) <= (TAG_W / 2) * unit && Math.abs(y - s.tag[1]) <= (TAG_H / 2) * unit,
    );
    return (tagged ?? states.find(([, s]) => pathContains(s.path, x, y)))?.[0];
  };
  /** The district under a point, using full-detail boundaries where they've loaded. */
  const districtAt = (x: number, y: number) =>
    Object.keys(map?.districts ?? {}).find((key) => {
      const path = qc.getQueryData<NationalDetail>(keys.nationalDetail(key.split('-')[0]))?.districts[key] ?? map!.districts[key];
      return pathContains(path, x, y);
    });
  const onTap = (x: number, y: number, unit: number, k: number) => {
    if (k < DISTRICT_ZOOM) {
      const code = stateAt(x, y, unit, k);
      if (code) zoomToState(code);
      return;
    }
    const district = districtAt(x, y);
    if (district) {
      const [state, n] = district.split('-');
      setPrompt({ state, district: Number(n) });
    }
  };

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <TopBar title="Your map" />
      </View>
      <View style={[styles.frame, sticker(3, radius.lg)]}>
        {map ? (
          <ZoomView ref={zoomRef} base={[0, 0, map.width, map.height]} maxZoom={12} onTap={onTap}>
            {(view, px, k) => <DetailedNationalMap map={map} view={view} px={px} k={k} home={home} following={following} />}
          </ZoomView>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.inkSoft} />
          </View>
        )}
      </View>
      <View style={styles.legend}>
        <Swatch color={PLACE_COLORS.home} label="Your district" />
        <Swatch color={PLACE_COLORS.following} label="Following" />
      </View>
      <Txt style={[type.small, styles.hint]}>Tap a state to zoom in, then tap a district to follow it.</Txt>
      <FollowDistrictPrompt
        target={prompt}
        onClose={() => setPrompt(null)}
        onOpen={(t) => openState(t.state, String(t.district))}
      />
    </Screen>
  );
}

type DetailedProps = {
  map: NationalMap;
  view: Box;
  px: number;
  k: number;
  home: string | null;
  following: string[];
};

/** The national map at the current zoom: zoomed in, the states in view load and draw at full detail
 *  (the overview is simplified for the whole country). */
function DetailedNationalMap({ map, view, px, k, ...marks }: DetailedProps) {
  const bounds = useMemo(
    () => Object.entries(map.states).map(([code, s]) => [code, pathBounds(s.path)] as const),
    [map],
  );
  const inView = bounds
    .filter(([, b]) => b[0] < view[2] && b[2] > view[0] && b[1] < view[3] && b[3] > view[1])
    .map(([code]) => code);
  const detail = useNationalDetail(k >= DETAIL_ZOOM && inView.length <= MAX_DETAIL_STATES ? inView : []);

  return (
    <NationalMapSvg
      map={map}
      view={view}
      px={px}
      {...marks}
      detail={detail}
      zoomed={k >= DISTRICT_ZOOM}
    />
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: space.lg },
  frame: { flex: 1, marginHorizontal: space.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', gap: 12, paddingHorizontal: space.lg, paddingTop: space.md },
  hint: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.md },
});
