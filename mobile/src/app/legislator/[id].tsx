import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, StyleSheet, Text, View } from 'react-native';

import { BillCard, PartyBadge } from '@/components/BillCard';
import { DistrictMap } from '@/components/DistrictMap';
import { LegislatorPhoto } from '@/components/LegislatorPhoto';
import { BouncyPressable, Card, Chip, Empty, Icon, type IconName, Loading, Screen, TopBar, Txt } from '@/components/ui';
import { legislatorPlace, ordinal } from '@/lib/format';
import { useLegislator, useLegislatorBills, useStateMap } from '@/lib/queries';
import type { Legislator, LegislatorRole, StateMap } from '@/lib/types';
import { colors, fonts, partyColors, radius, space, sticker, type } from '@/theme';

const ROLES: { key: LegislatorRole; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sponsored', label: 'Sponsored' },
  { key: 'cosponsored', label: 'Cosponsored' },
];

type Tab = 'bills' | 'district' | 'about';
const TABS: { key: Tab; label: string }[] = [
  { key: 'bills', label: 'Bills' },
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

  if (isLoading) return <Loading />;
  if (!legislator) {
    return (
      <Screen>
        <TopBar />
        <Empty icon="user-x" title="Legislator not found" body={error?.message} />
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
            <View style={[styles.hero, sticker(4), { backgroundColor: p.main }]}>
              <View style={styles.heroTop}>
                <LegislatorPhoto legislator={legislator} size={92} shape="portrait" />
                <View style={{ flex: 1, gap: space.xs }}>
                  <View style={styles.heroParty}>
                    <PartyBadge code={legislator.party} />
                    <Text style={styles.heroPartyText}>{p.label}</Text>
                  </View>
                  <Text style={styles.heroName}>{legislator.name}</Text>
                  <Text style={styles.heroMeta}>{legislatorPlace(legislator)}</Text>
                </View>
              </View>
              <View style={styles.stats}>
                <Stat n={legislator.sponsored_count} label="sponsored" />
                <Stat n={legislator.cosponsored_count} label="cosponsored" />
                <MiniMap legislator={legislator} onPress={() => setTab('district')} />
              </View>
            </View>
            <View style={[styles.segment, sticker(2, radius.pill)]} accessibilityRole="tablist">
              {TABS.map((t) => (
                <BouncyPressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === t.key }}
                  style={[styles.segmentBtn, tab === t.key && { backgroundColor: p.main }]}>
                  <Text style={[styles.segmentText, tab === t.key && { color: '#fff' }]}>{t.label}</Text>
                </BouncyPressable>
              ))}
            </View>
            {tab === 'bills' ? (
              <View style={styles.roles}>
                {ROLES.map((r) => (
                  <Chip
                    key={r.key}
                    small
                    label={r.label}
                    selected={role === r.key}
                    color={p.soft}
                    onPress={() => setRole(r.key)}
                  />
                ))}
              </View>
            ) : null}
            {tab === 'district' ? <AreaCard legislator={legislator} /> : null}
            {tab === 'about' ? <AboutCard legislator={legislator} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <View>
            {role === 'all' ? (
              <View style={styles.roleTag}>
                <Icon name={item.sponsor_id === id ? 'edit-3' : 'users'} size={13} color={colors.inkSoft} />
                <Txt style={type.tiny}>{item.sponsor_id === id ? 'SPONSOR' : 'COSPONSOR'}</Txt>
              </View>
            ) : null}
            <BillCard bill={item} />
          </View>
        )}
        ListEmptyComponent={
          tab !== 'bills' ? null : bills.isLoading ? (
            <Loading label="Loading bills…" />
          ) : (
            <Empty icon="file-text" title="No bills yet" body="Nothing here among the bills PolitiKNOW has pulled in so far." />
          )
        }
        ListFooterComponent={tab === 'bills' && bills.isFetchingNextPage ? <ActivityIndicator color={colors.blue} /> : null}
      />
    </Screen>
  );
}

/** Thumbnail of the member's district in the header; tapping it opens the District tab. */
function MiniMap({ legislator, onPress }: { legislator: Legislator; onPress: () => void }) {
  const { data: map } = useStateMap(legislator.state);
  if (!map) return null;
  return (
    <BouncyPressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Show district map" style={styles.miniMap}>
      <DistrictMap map={map} district={districtKey(legislator, map)} party={legislator.party} compact />
    </BouncyPressable>
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
    </Card>
  );
}

function AboutCard({ legislator: l }: { legislator: Legislator }) {
  const thisYear = new Date().getFullYear();
  const phone = l.phone;
  if (!l.career.length && !l.office_address && !l.phone) {
    return <Empty icon="info" title="No details yet" body="Office and career details haven't been loaded for this member." />;
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
            <BouncyPressable
              onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)}
              accessibilityRole="link"
              accessibilityLabel={`Call ${phone}`}>
              <InfoRow icon="phone" title={phone} link />
            </BouncyPressable>
          ) : null}
        </View>
      ) : null}
      {l.image_credit ? <Txt style={type.tiny}>Photo: {l.image_credit}</Txt> : null}
    </Card>
  );
}

function InfoRow({ icon, title, detail, link }: { icon: IconName; title: string; detail?: string; link?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, sticker(2, radius.pill)]}>
        <Icon name={icon} size={15} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt style={[type.bodyBold, link && { color: colors.blue }]}>{title}</Txt>
        {detail ? <Txt style={type.small}>{detail}</Txt> : null}
      </View>
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 80 }}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  hero: { padding: space.lg, gap: space.xs },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroParty: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroPartyText: { fontFamily: fonts.extrabold, color: '#fff', fontSize: 14 },
  heroName: { fontFamily: fonts.black, color: '#fff', fontSize: 24, lineHeight: 28 },
  heroMeta: { fontFamily: fonts.bold, color: 'rgba(255,255,255,0.92)', fontSize: 15 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.35)',
  },
  statN: { fontFamily: fonts.black, color: '#fff', fontSize: 22 },
  statLabel: { fontFamily: fonts.bold, color: 'rgba(255,255,255,0.85)', fontSize: 11, letterSpacing: 0.4 },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, padding: 3 },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  segmentText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  mapPlaceholder: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.lg },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  infoIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  roles: { flexDirection: 'row', gap: 6 },
  miniMap: { width: 96 },
  roleTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, marginLeft: 4 },
});
