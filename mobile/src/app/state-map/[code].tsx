import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { DistrictCard } from '@/components/DistrictCard';
import { type DistrictTarget, FollowDistrictPrompt } from '@/components/FollowDistrictPrompt';
import { StateDistrictsSvg, stateView } from '@/components/DistrictMap';
import { PLACE_COLORS } from '@/components/NationalMap';
import { Screen, TopBar, Txt } from '@/components/ui';
import { ZoomView } from '@/components/ZoomView';
import { useStateDistricts, useStateMap } from '@/lib/queries';
import { pathContains } from '@/lib/svg';
import { colors, radius, space, sticker, type } from '@/theme';

/** A state's district map full screen, for picking a district: pinch or use the buttons to zoom, tap a
 *  district to see who represents it, follow it, or make it your district. Route param `district`
 *  preselects one and opens zoomed to it if it's small. */
export default function StateMapScreen() {
  const params = useLocalSearchParams<{ code: string; district?: string }>();
  const code = params.code.toUpperCase();
  const { data: map } = useStateMap(code);
  const { data: info } = useStateDistricts(code);
  const [selected, setSelected] = useState<string | null>(params.district ?? null);
  const [prompt, setPrompt] = useState<DistrictTarget | null>(null);

  const districts = info?.districts ?? [];
  const current = districts.find((d) => String(d.district) === selected) ?? (districts.length === 1 ? districts[0] : undefined);

  return (
    <Screen padded={false} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <TopBar title={info ? `${info.name} districts` : code} />
      </View>
      <View style={[styles.frame, sticker(3, radius.lg)]}>
        {map && info ? (
          <ZoomView
            base={[0, 0, map.width, map.height]}
            initial={stateView(map, params.district ?? null).zoomed ? stateView(map, params.district ?? null).view : undefined}
            maxZoom={10}
            onTap={(x, y) => {
              const n = Object.keys(map.districts).find((d) => pathContains(map.districts[d].path, x, y));
              if (n === undefined) return;
              setSelected(n);
              setPrompt({ state: code, district: Number(n) });
            }}>
            {(view, px) => (
              <StateDistrictsSvg
                map={map}
                view={view}
                px={px}
                selected={current ? String(current.district) : null}
                selectedParty={current?.representative?.party ?? null}
                home={districts.find((d) => d.is_home)?.district.toString() ?? null}
                following={districts.filter((d) => d.is_following).map((d) => String(d.district))}
                homeColor={PLACE_COLORS.home}
                followingColor={PLACE_COLORS.following}
                maxLabels={8}
              />
            )}
          </ZoomView>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.inkSoft} />
          </View>
        )}
      </View>
      <View style={styles.bottom}>
        {current ? (
          <DistrictCard district={current} />
        ) : (
          <Txt style={[type.small, { textAlign: 'center' }]}>Pinch to zoom, then tap a district to see who represents it.</Txt>
        )}
      </View>
      <FollowDistrictPrompt target={prompt} onClose={() => setPrompt(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: space.lg },
  frame: { flex: 1, marginHorizontal: space.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottom: { padding: space.lg },
});
