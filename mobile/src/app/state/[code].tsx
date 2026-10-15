import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { DistrictCard } from '@/components/DistrictCard';
import { type DistrictTarget, FollowDistrictPrompt } from '@/components/FollowDistrictPrompt';
import { StateDistrictsMap } from '@/components/DistrictMap';
import { LegislatorRow } from '@/components/LegislatorRow';
import { PLACE_COLORS } from '@/components/NationalMap';
import { BouncyPressable, Empty, Icon, Screen, TopBar, Txt } from '@/components/ui';
import { useStateDistricts, useStateMap } from '@/lib/queries';
import type { District } from '@/lib/types';
import { colors, fonts, partyColors, radius, space, sticker, type } from '@/theme';

/** A state's district map: tap a district (on the map or in the list) to see who represents it,
 *  follow it, or make it your district. Route param `district` preselects one. */
export default function StatePage() {
  const params = useLocalSearchParams<{ code: string; district?: string }>();
  const code = params.code.toUpperCase();
  const { data: map, isLoading: mapLoading } = useStateMap(code);
  const { data: info, isLoading, error } = useStateDistricts(code);
  const [selected, setSelected] = useState<string | null>(params.district ?? null);
  const scroll = useRef<ScrollView>(null);

  const districts = info?.districts ?? [];
  const current = districts.find((d) => String(d.district) === selected) ?? (districts.length === 1 ? districts[0] : undefined);
  const [prompt, setPrompt] = useState<DistrictTarget | null>(null);
  const select = (n: string, scrollUp = true) => {
    setSelected(n);
    if (scrollUp) scroll.current?.scrollTo({ y: 0, animated: true });
  };

  if (!isLoading && !info) {
    return (
      <Screen>
        <TopBar />
        <Empty icon="map" title="State not found" body={error?.message} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView ref={scroll} contentContainerStyle={styles.list}>
        <TopBar title={info?.name ?? code} />
        {map && info ? (
          <StateDistrictsMap
            map={map}
            selected={current ? String(current.district) : null}
            selectedParty={current?.representative?.party ?? null}
            home={districts.find((d) => d.is_home)?.district.toString() ?? null}
            following={districts.filter((d) => d.is_following).map((d) => String(d.district))}
            onSelect={(n) => {
              select(n, false);
              setPrompt({ state: code, district: Number(n) });
            }}
            homeColor={PLACE_COLORS.home}
            followingColor={PLACE_COLORS.following}
            onExpand={() =>
              router.push({ pathname: '/state-map/[code]', params: current ? { code, district: String(current.district) } : { code } })
            }
          />
        ) : (
          <View style={[styles.placeholder, sticker(3, radius.lg)]}>
            {mapLoading || isLoading ? <ActivityIndicator color={colors.inkSoft} /> : null}
          </View>
        )}
        {current ? (
          <DistrictCard district={current} />
        ) : districts.length > 1 ? (
          <Txt style={[type.small, { textAlign: 'center' }]}>Tap a district to see who represents it.</Txt>
        ) : null}

        {info?.senators.length ? (
          <View style={{ gap: space.sm }}>
            <Txt style={type.h2}>Senators</Txt>
            {info.senators.map((s) => (
              <LegislatorRow key={s.bioguide_id} legislator={s} />
            ))}
          </View>
        ) : null}

        {districts.length > 1 ? (
          <View style={{ gap: space.sm }}>
            <Txt style={type.h2}>{districts.length} districts</Txt>
            {districts.map((d) => (
              <DistrictRow key={d.district} district={d} selected={d === current} onPress={() => select(String(d.district))} />
            ))}
          </View>
        ) : null}
        <Txt style={type.tiny}>District lines as of the start of the 119th Congress. Source: U.S. Census Bureau.</Txt>
      </ScrollView>
      <FollowDistrictPrompt target={prompt} onClose={() => setPrompt(null)} />
    </Screen>
  );
}

function DistrictRow({ district: d, selected, onPress }: { district: District; selected: boolean; onPress: () => void }) {
  const rep = d.representative;
  const p = partyColors(rep?.party);
  return (
    <BouncyPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${d.name}${rep ? `, ${rep.name}, ${p.label}` : ''}`}
      style={[styles.row, sticker(2, radius.md), selected && { backgroundColor: p.soft }]}>
      <Txt style={[styles.rowLabel, { color: rep ? p.main : colors.muted }]}>{d.district || 'AL'}</Txt>
      <View style={{ flex: 1 }}>
        <Txt style={type.bodyBold} numberOfLines={1}>
          {rep?.name ?? 'Vacant'}
        </Txt>
        <Txt style={type.small}>{rep ? p.label : 'No current member on record'}</Txt>
      </View>
      {d.is_home ? <Icon name="home" size={16} color={colors.success} /> : null}
      {d.is_following ? <Icon name="star" size={16} color={colors.ink} /> : null}
    </BouncyPressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center', gap: space.lg },
  placeholder: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.md, backgroundColor: colors.surface },
  rowLabel: { fontFamily: fonts.black, fontSize: 18, minWidth: 30, textAlign: 'center' },
});
