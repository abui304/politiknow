import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { currentPosition } from '@/lib/location';
import { useFollowDistrict, useFollowing, useMyDistricts, useNationalMap, useRepresentatives, useSetHome } from '@/lib/queries';
import { toast, toastError } from '@/lib/toast';
import type { District } from '@/lib/types';
import { colors, fonts, partyColors, radius, space, sticker, type } from '@/theme';

import { LegislatorRow } from './LegislatorRow';
import { NationalMap, PLACE_COLORS } from './NationalMap';
import { BouncyPressable, Button, Card, Icon, Txt } from './ui';

const openState = (state: string, district?: number) =>
  router.push({ pathname: '/state/[code]', params: district === undefined ? { code: state } : { code: state, district: String(district) } });

/** "Who represents me?": the user's House member and senators, found from their location. */
export function RepresentativesCard() {
  const { data: reps, isLoading } = useRepresentatives();
  const setHome = useSetHome();
  const [locating, setLocating] = useState(false);

  const locate = async () => {
    setLocating(true);
    try {
      const reps = await setHome.mutateAsync(await currentPosition());
      if (reps?.home) toast(`Found it: ${reps.home.name}`, 'success');
    } catch (e) {
      toastError(e);
    } finally {
      setLocating(false);
    }
  };
  const home = reps?.home;

  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.head}>
        <Icon name="map-pin" size={18} />
        <Txt style={[type.h3, { flex: 1 }]}>Your representatives</Txt>
        {home ? (
          <BouncyPressable onPress={locate} disabled={locating} accessibilityRole="button" style={styles.link}>
            {locating ? <ActivityIndicator size="small" color={colors.inkSoft} /> : <Icon name="crosshair" size={14} color={colors.blue} />}
            <Txt style={styles.linkText}>Update</Txt>
          </BouncyPressable>
        ) : null}
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.inkSoft} />
      ) : home ? (
        <>
          <BouncyPressable onPress={() => openState(home.state, home.district)} accessibilityRole="link" style={styles.district}>
            <View style={[styles.swatch, { backgroundColor: PLACE_COLORS.home }]} />
            <Txt style={[type.bodyBold, { flex: 1 }]}>{home.name}</Txt>
            <Icon name="chevron-right" size={16} color={colors.inkSoft} />
          </BouncyPressable>
          {home.representative ? (
            <LegislatorRow legislator={home.representative} note="Your representative" />
          ) : (
            <Txt style={type.small}>No current representative on record. The seat may be vacant.</Txt>
          )}
          {reps.senators.map((s) => (
            <LegislatorRow key={s.bioguide_id} legislator={s} note="Your senator" />
          ))}
        </>
      ) : (
        <>
          <Txt style={type.body}>Find the people who represent you in Congress.</Txt>
          <Button title="Use my location" icon="crosshair" onPress={locate} loading={locating} />
          <Txt style={type.small}>Or tap your state on the map below and pick your district.</Txt>
        </>
      )}
      <View style={styles.privacy}>
        <Icon name="lock" size={13} color={colors.muted} />
        <Txt style={[type.tiny, { flex: 1, letterSpacing: 0 }]}>
          Your location is used once to find your district and is never saved. Only your state and district are stored, and
          they’re never shown on your profile.
        </Txt>
      </View>
    </Card>
  );
}

/** The country with the user's district and followed districts highlighted, and those districts listed. */
export function MyMapCard() {
  const { data: map } = useNationalMap();
  const { data: reps } = useRepresentatives();
  const { data: districts } = useMyDistricts();
  const home = reps?.home;
  const key = (d: { state: string; district: number }) => `${d.state}-${d.district}`;

  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.head}>
        <Icon name="map" size={18} />
        <Txt style={[type.h3, { flex: 1 }]}>Your map</Txt>
      </View>
      {map ? (
        <NationalMap
          map={map}
          home={home ? key(home) : null}
          following={(districts ?? []).map(key)}
          onPressState={(code) => openState(code)}
        />
      ) : (
        <View style={[styles.mapPlaceholder, sticker(3, radius.lg)]}>
          <ActivityIndicator color={colors.inkSoft} />
        </View>
      )}
      <Txt style={type.h3}>Districts you follow</Txt>
      {districts?.length ? (
        districts.map((d) => <FollowedDistrict key={key(d)} district={d} />)
      ) : (
        <Txt style={type.small}>
          Follow districts you care about, like where you grew up or a close race. Tap a state, then a district.
        </Txt>
      )}
    </Card>
  );
}

function FollowedDistrict({ district: d }: { district: District }) {
  const follow = useFollowDistrict();
  const rep = d.representative;
  return (
    <BouncyPressable
      onPress={() => openState(d.state, d.district)}
      accessibilityRole="link"
      accessibilityLabel={`${d.name}${rep ? `, represented by ${rep.name}` : ''}`}
      style={[styles.row, sticker(2, radius.md)]}>
      <View style={[styles.swatch, { backgroundColor: PLACE_COLORS.following }]} />
      <View style={{ flex: 1 }}>
        <Txt style={type.bodyBold} numberOfLines={1}>
          {d.name}
        </Txt>
        <Txt style={type.small} numberOfLines={1}>
          {rep ? `${rep.name} (${rep.party ?? '?'})` : 'Vacant'}
        </Txt>
      </View>
      <BouncyPressable
        onPress={() =>
          follow.mutate({ state: d.state, district: d.district, follow: false }, { onError: toastError })
        }
        accessibilityRole="button"
        accessibilityLabel={`Unfollow ${d.label}`}
        hitSlop={8}
        style={styles.remove}>
        <Icon name="x" size={16} color={colors.inkSoft} />
      </BouncyPressable>
    </BouncyPressable>
  );
}

/** Legislators and bills the user follows. Hidden until they follow something. */
export function FollowingCard() {
  const { data } = useFollowing();
  if (!data || (!data.legislators.length && !data.bills.length)) return null;
  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.head}>
        <Icon name="bell" size={18} />
        <Txt style={[type.h3, { flex: 1 }]}>Following</Txt>
      </View>
      {data.legislators.map((l) => (
        <LegislatorRow key={l.bioguide_id} legislator={l} />
      ))}
      {data.bills.map((b) => (
        <BouncyPressable
          key={b.id}
          onPress={() => router.push({ pathname: '/bill/[id]', params: { id: b.id } })}
          accessibilityRole="link"
          style={[styles.row, sticker(2, radius.md), { backgroundColor: partyColors(b.sponsor_party).soft }]}>
          <Txt style={[styles.billLabel, { color: partyColors(b.sponsor_party).main }]}>{b.label}</Txt>
          <Txt style={[type.small, { flex: 1, color: colors.ink }]} numberOfLines={2}>
            {b.title}
          </Txt>
          <Icon name="chevron-right" size={16} color={colors.inkSoft} />
        </BouncyPressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  linkText: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.blue },
  district: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 14, height: 14, borderRadius: 4, borderWidth: 2, borderColor: colors.line },
  privacy: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  mapPlaceholder: { aspectRatio: 1.6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.md, backgroundColor: colors.surface },
  remove: { padding: 4 },
  billLabel: { fontFamily: fonts.black, fontSize: 13, minWidth: 64 },
});
