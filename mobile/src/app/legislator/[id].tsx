import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, StyleSheet, Text, View } from 'react-native';

import { BillCard, PartyBadge } from '@/components/BillCard';
import { ContactSheet } from '@/components/ContactMembers';
import { LegislatorVotes } from '@/components/Votes';
import { DistrictMap } from '@/components/DistrictMap';
import { LegislatorPhoto } from '@/components/LegislatorPhoto';
import { Button, Card, Chip, Empty, Icon, type IconName, Screen, Segmented, Skeleton, SkeletonList, Tap, TopBar, Txt } from '@/components/ui';
import { legislatorPlace, ordinal } from '@/lib/format';
import { useFollowLegislator, useLegislator, useLegislatorBills, useStateMap } from '@/lib/queries';
import { toast, toastError } from '@/lib/toast';
import type { Legislator, LegislatorRole, StateMap } from '@/lib/types';
import { colors, figures, fonts, onAlpha, partyColors, radius, space, type } from '@/theme';

const ROLES: { key: LegislatorRole; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sponsored', label: 'Sponsored' },
  { key: 'cosponsored', label: 'Cosponsored' },
];

type Tab = 'bills' | 'votes' | 'district' | 'about';
const TABS: { key: Tab; label: string }[] = [
  { key: 'bills', label: 'Bills' },
  { key: 'votes', label: 'Votes' },
  { key: 'district', label: 'District' },
  { key: 'about', label: 'About' },
];

export default function LegislatorPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: legislator, isLoading, error } = useLegislator(id);
  const [tab, setTab] = useState<Tab>('bills');
  const [role, setRole] = useState<LegislatorRole>('all');
  const bills = useLegislatorBills(id, role);
  const items = bills.data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <Screen>
        <TopBar />
        <Skeleton height={200} r={16} style={{ marginBottom: space.lg }} />
        <SkeletonList count={1} />
      </Screen>
    );
  }
  if (!legislator) {
    return (
      <Screen>
        <TopBar />
        <Empty icon="user-x" title="Legislator not found" body={error?.message} action={<Button title="Search members of Congress" small onPress={() => router.replace('/search')} />} />
      </Screen>
    );
  }

  const p = partyColors(legislator.party);

  return (
    <Screen padded={false}>
      <FlatList
        data={tab === 'bills' ? items : []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        onEndReached={() => tab === 'bills' && bills.hasNextPage && !bills.isFetchingNextPage && bills.fetchNextPage()}
        ListHeaderComponent={
          <View style={{ gap: space.lg, paddingBottom: space.lg }}>
            <TopBar title={legislator.name} />
            <View style={[styles.hero, { backgroundColor: p.main }]}>
              <View style={styles.heroTop}>
                <LegislatorPhoto legislator={legislator} size={92} shape="portrait" />
                <View style={{ flex: 1, gap: space.xs }}>
                  <View style={styles.heroParty}>
                    <PartyBadge code={legislator.party} />
                    <Text style={[styles.heroPartyText, { color: p.on }]}>{p.label}</Text>
                  </View>
                  <Text style={[styles.heroName, { color: p.on }]}>{legislator.name}</Text>
                  <Text style={[styles.heroMeta, { color: onAlpha(p, 0.8) }]}>{legislatorPlace(legislator)}</Text>
                  <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                    <FollowButton legislator={legislator} />
                    <ContactPill legislator={legislator} />
                  </View>
                </View>
              </View>
              <View style={[styles.stats, { borderTopColor: onAlpha(p, 0.25) }]}>
                <Stat n={legislator.sponsored_count} label="Sponsored" color={p.on} soft={onAlpha(p, 0.8)} />
                <Stat n={legislator.cosponsored_count} label="Cosponsored" color={p.on} soft={onAlpha(p, 0.8)} />
                <MiniMap legislator={legislator} onPress={() => setTab('district')} />
              </View>
            </View>
            <Segmented options={TABS} value={tab} onChange={setTab} />
            {tab === 'bills' ? (
              <View style={styles.roles}>
                {ROLES.map((r) => (
                  <Chip
                    key={r.key}
                    small
                    label={r.label}
                    selected={role === r.key}
                    onPress={() => setRole(r.key)}
                  />
                ))}
              </View>
            ) : null}
            {tab === 'votes' ? <LegislatorVotes id={legislator.bioguide_id} name={legislator.name} /> : null}
            {tab === 'district' ? <AreaCard legislator={legislator} /> : null}
            {tab === 'about' ? <AboutCard legislator={legislator} onShowBills={() => setTab('bills')} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View>
            {role === 'all' ? (
              <View style={styles.roleTag}>
                <Icon name={item.sponsor_id === id ? 'edit-3' : 'users'} size={14} color={colors.muted} />
                <Txt style={type.meta}>{item.sponsor_id === id ? 'Sponsor' : 'Cosponsor'}</Txt>
              </View>
            ) : null}
            <BillCard bill={item} />
          </View>
        )}
        ListEmptyComponent={
          tab !== 'bills' ? null : bills.isLoading ? (
            <SkeletonList count={2} />
          ) : (
            <Empty
              icon="file-text"
              title="No bills yet"
              body={role === 'all' ? 'Nothing here among the bills PolitiKNOW has pulled in so far.' : 'Nothing in this list yet.'}
              action={
                role === 'all' ? (
                  <Button title="See their district" small variant="secondary" onPress={() => setTab('district')} />
                ) : (
                  <Button title="Show all their bills" small variant="secondary" onPress={() => setRole('all')} />
                )
              }
            />
          )
        }
        ListFooterComponent={tab === 'bills' && bills.isFetchingNextPage ? <ActivityIndicator color={colors.inkSoft} /> : null}
      />
    </Screen>
  );
}

/** Their office phone and a short, neutral guide to calling. Hidden when there's no phone on file. */
function ContactPill({ legislator: l }: { legislator: Legislator }) {
  const [open, setOpen] = useState(false);
  const p = partyColors(l.party);
  if (!l.phone) return null;
  return (
    <>
      <Tap
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Contact ${l.name}'s office`}
        style={[styles.follow, { borderColor: onAlpha(p, 0.5) }]}>
        <Icon name="phone" size={14} color={p.on} />
        <Text style={[styles.followText, { color: p.on }]}>Contact</Text>
      </Tap>
      <ContactSheet visible={open} onClose={() => setOpen(false)} members={[l]} />
    </>
  );
}

/** Alerts when they sponsor or cosponsor a bill, and their bills ranked up in the feed. */
function FollowButton({ legislator: l }: { legislator: Legislator }) {
  const follow = useFollowLegislator(l.bioguide_id);
  const p = partyColors(l.party);
  const on = l.is_following;
  const toggle = () =>
    follow.mutate(!on, {
      onSuccess: () => toast(on ? `Unfollowed ${l.name}` : `Following ${l.name}. You’ll hear when they back a bill`, 'success'),
      onError: toastError,
    });
  return (
    <Tap
      onPress={toggle}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={on ? `Unfollow ${l.name}` : `Follow ${l.name}`}
      style={[styles.follow, on ? { borderColor: onAlpha(p, 0.5) } : { backgroundColor: p.on, borderColor: p.on }]}>
      <Icon name={on ? 'check' : 'bell'} size={14} color={on ? p.on : p.main} />
      <Text style={[styles.followText, { color: on ? p.on : p.main }]}>{on ? 'Following' : 'Follow'}</Text>
    </Tap>
  );
}

/** Thumbnail of the member's district in the header; tapping it opens the District tab. */
function MiniMap({ legislator, onPress }: { legislator: Legislator; onPress: () => void }) {
  const { data: map } = useStateMap(legislator.state);
  if (!map) return null;
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel="Show district map" style={styles.miniMap}>
      <DistrictMap map={map} district={districtKey(legislator, map)} party={legislator.party} compact />
    </Tap>
  );
}

/** Map key of the member's district: null for senators (whole state). */
function districtKey(l: Legislator, map: StateMap): string | null {
  if (l.chamber === 'senate') return null;
  const keys = Object.keys(map.districts);
  if (keys.length === 1) return keys[0]; // at-large seat or delegate
  const key = String(l.district ?? 0);
  return key in map.districts ? key : null;
}

function areaTitle(l: Legislator, stateName: string) {
  if (l.chamber === 'senate') return { title: stateName, subtitle: 'Represents the whole state' };
  if (!l.district) return { title: `${stateName} at-large`, subtitle: 'One seat covers the whole state' };
  return { title: `${stateName}'s ${ordinal(l.district)} District`, subtitle: 'District boundaries for the 119th Congress' };
}

function AreaCard({ legislator }: { legislator: Legislator }) {
  const { data: map, isLoading } = useStateMap(legislator.state);
  if (!legislator.state || (!isLoading && !map)) return null;
  const { title, subtitle } = areaTitle(legislator, legislator.state_name ?? map?.name ?? legislator.state);
  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.cardHead}>
        <Icon name="map" size={18} />
        <View style={{ flex: 1 }}>
          <Txt style={type.h3}>{title}</Txt>
          <Txt style={type.small}>{subtitle}</Txt>
        </View>
      </View>
      {map ? (
        <DistrictMap map={map} district={districtKey(legislator, map)} party={legislator.party} />
      ) : (
        <View style={styles.mapPlaceholder}>
          <ActivityIndicator color={colors.inkSoft} />
        </View>
      )}
      <Button
        small
        variant="secondary"
        icon="map"
        title={`All of ${map?.name ?? legislator.state}’s districts`}
        style={{ alignSelf: 'flex-start' }}
        onPress={() => {
          const key = map ? districtKey(legislator, map) : null;
          const state = legislator.state ?? '';
          router.push({ pathname: '/state/[code]', params: key ? { code: state, district: key } : { code: state } });
        }}
      />
    </Card>
  );
}

function AboutCard({ legislator: l, onShowBills }: { legislator: Legislator; onShowBills: () => void }) {
  const thisYear = new Date().getFullYear();
  const phone = l.phone;
  if (!l.career.length && !l.office_address && !l.phone) {
    return (
      <Empty
        icon="info"
        title="No details yet"
        body="Office and career details haven't been loaded for this member."
        action={<Button title="See their bills" small variant="secondary" onPress={onShowBills} />}
      />
    );
  }
  return (
    <Card style={{ gap: space.md }}>
      {l.career.length ? (
        <View style={{ gap: space.sm }}>
          <Txt style={type.h3}>In office</Txt>
          {[...l.career].reverse().map((span) => (
            <InfoRow
              key={`${span.chamber}-${span.start}`}
              icon={span.chamber === 'senate' ? 'star' : 'home'}
              title={span.chamber === 'senate' ? 'U.S. Senate' : 'U.S. House'}
              detail={
                span.end === null
                  ? `Since ${span.start} · ${Math.max(thisYear - (span.start ?? thisYear), 1)} yrs`
                  : `${span.start}–${span.end}`
              }
            />
          ))}
        </View>
      ) : null}
      {l.office_address || l.phone ? (
        <View style={{ gap: space.sm }}>
          <Txt style={type.h3}>Washington office</Txt>
          {l.office_address ? <InfoRow icon="map-pin" title={l.office_address} /> : null}
          {phone ? (
            <Tap
              onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)}
              accessibilityRole="link"
              accessibilityLabel={`Call ${phone}`}>
              <InfoRow icon="phone" title={phone} link />
            </Tap>
          ) : null}
        </View>
      ) : null}
      {l.image_credit ? <Txt style={type.meta}>Photo: {l.image_credit}</Txt> : null}
    </Card>
  );
}

function InfoRow({ icon, title, detail, link }: { icon: IconName; title: string; detail?: string; link?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon name={icon} size={16} color={colors.inkSoft} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt style={[type.body, link && styles.link]}>{title}</Txt>
        {detail ? <Txt style={type.small}>{detail}</Txt> : null}
      </View>
    </View>
  );
}

function Stat({ n, label, color, soft }: { n: number; label: string; color: string; soft: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 80 }}>
      <Text style={[styles.statN, { color }]}>{n}</Text>
      <Text style={[styles.statLabel, { color: soft }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  hero: { padding: space.lg, gap: space.xs, borderRadius: radius.lg, borderCurve: 'continuous' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroParty: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroPartyText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  heroName: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28 },
  heroMeta: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
  },
  statN: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 28, ...figures },
  statLabel: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mapPlaceholder: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderCurve: 'continuous' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  infoIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  link: { color: colors.ink, textDecorationLine: 'underline' },
  roles: { flexDirection: 'row', gap: space.sm },
  miniMap: { width: 96 },
  follow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    height: 32,
    paddingHorizontal: space.md,
    marginTop: space.sm,
    borderRadius: radius.sm, borderCurve: 'continuous',
    borderWidth: 1,
  },
  followText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  roleTag: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.sm, marginLeft: space.xs },
});
