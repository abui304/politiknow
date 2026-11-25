import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { currentPosition } from '@/lib/location';
import { STATES } from '@/lib/places';
import { useFollowDistrict, useFollowing, useMyDistricts, useNationalMap, useRepresentatives, useSetHome } from '@/lib/queries';
import { toast, toastError } from '@/lib/toast';
import type { District } from '@/lib/types';
import { colors, fonts, partyColors, radius, space, outline, type } from '@/theme';

import { LegislatorRow } from './LegislatorRow';
import { NationalMap, PLACE_COLORS } from './NationalMap';
import { BottomSheet, Button, Card, DocketTag, Icon, Tap, Txt } from './ui';

const openState = (state: string, district?: number) =>
  router.push({ pathname: '/state/[code]', params: district === undefined ? { code: state } : { code: state, district: String(district) } });

/** "Who represents me?": the user's House member and senators, found from their location. */
export function RepresentativesCard() {
  const { data: reps, isLoading } = useRepresentatives();
  const setHome = useSetHome();
  const [locating, setLocating] = useState(false);
  const [picking, setPicking] = useState(false);

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
          <Tap onPress={locate} disabled={locating} accessibilityRole="button" style={styles.link}>
            {locating ? <ActivityIndicator size="small" color={colors.inkSoft} /> : <Icon name="crosshair" size={14} color={colors.inkSoft} />}
            <Txt style={styles.linkText}>Update</Txt>
          </Tap>
        ) : null}
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.inkSoft} />
      ) : home ? (
        <>
          <Tap onPress={() => openState(home.state, home.district)} accessibilityRole="link" style={styles.district}>
            <View style={[styles.swatch, { backgroundColor: PLACE_COLORS.home }]} />
            <Txt style={[type.bodyMedium, { flex: 1 }]}>{home.name}</Txt>
            <Icon name="chevron-right" size={16} color={colors.inkSoft} />
          </Tap>
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
          <Button title="Choose my state instead" icon="list" variant="secondary" onPress={() => setPicking(true)} />
          <StatePicker visible={picking} onClose={() => setPicking(false)} />
        </>
      )}
      <View style={styles.privacy}>
        <Icon name="lock" size={14} color={colors.muted} />
        <Txt style={[type.meta, { flex: 1 }]}>
          Your location is used once to find your district and is never saved. Only your state and district are stored, and
          they’re never shown on your profile.
        </Txt>
      </View>
    </Card>
  );
}

/** Every state as a plain list, for people who'd rather not tap a map or share their location. Picking one
 *  opens its page, which lists its districts by number with each member's name. */
function StatePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} title="Which state do you vote in?" onClose={onClose}>
      {Object.entries(STATES)
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(([code, name]) => (
          <Tap
            key={code}
            hitSlop={0}
            accessibilityRole="link"
            onPress={() => {
              onClose();
              openState(code);
            }}
            style={styles.stateRow}>
            <Txt style={[type.body, { flex: 1 }]}>{name}</Txt>
            <Icon name="chevron-right" size={16} color={colors.muted} />
          </Tap>
        ))}
    </BottomSheet>
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
          onExpand={() => router.push('/map')}
        />
      ) : (
        <View style={[styles.mapPlaceholder, outline(radius.lg)]}>
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
    <Tap
      onPress={() => openState(d.state, d.district)}
      accessibilityRole="link"
      accessibilityLabel={`${d.name}${rep ? `, represented by ${rep.name}` : ''}`}
      style={[styles.row, outline(radius.md)]}>
      <View style={[styles.swatch, { backgroundColor: PLACE_COLORS.following }]} />
      <View style={{ flex: 1 }}>
        <Txt style={type.bodyMedium} numberOfLines={1}>
          {d.name}
        </Txt>
        <Txt style={type.small} numberOfLines={1}>
          {rep ? `${rep.name} (${rep.party ?? '?'})` : 'Vacant'}
        </Txt>
      </View>
      <Tap
        onPress={() =>
          follow.mutate({ state: d.state, district: d.district, follow: false }, { onError: toastError })
        }
        accessibilityRole="button"
        accessibilityLabel={`Unfollow ${d.label}`}
        hitSlop={8}
        style={styles.remove}>
        <Icon name="x" size={16} color={colors.inkSoft} />
      </Tap>
    </Tap>
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
        <Tap
          key={b.id}
          onPress={() => router.push({ pathname: '/bill/[id]', params: { id: b.id } })}
          accessibilityRole="link"
          style={[styles.row, outline(radius.md)]}>
          <View style={[styles.partyDot, { backgroundColor: partyColors(b.sponsor_party).main }]} />
          <View style={{ flex: 1, gap: space.xs }}>
            <DocketTag label={b.label} />
            <Txt style={[type.small, { color: colors.ink }]} numberOfLines={2}>
              {b.title}
            </Txt>
          </View>
          <Icon name="chevron-right" size={16} color={colors.muted} />
        </Tap>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs },
  linkText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.ink },
  district: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  privacy: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  mapPlaceholder: { aspectRatio: 1.6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, backgroundColor: colors.surface },
  remove: { padding: space.xs },
  partyDot: { width: 8, height: 8, borderRadius: 4 },
  stateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
});
