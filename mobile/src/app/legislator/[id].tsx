import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { BillCard, PartyBadge } from '@/components/BillCard';
import { BouncyPressable, Empty, Icon, Loading, Screen, TopBar, Txt } from '@/components/ui';
import { legislatorPlace } from '@/lib/format';
import { useLegislator, useLegislatorBills } from '@/lib/queries';
import type { LegislatorRole } from '@/lib/types';
import { colors, fonts, partyColors, radius, space, sticker, type } from '@/theme';

const ROLES: { key: LegislatorRole; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sponsored', label: 'Sponsored' },
  { key: 'cosponsored', label: 'Cosponsored' },
];

export default function LegislatorPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: legislator, isLoading, error } = useLegislator(id);
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
        data={items}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        onEndReached={() => bills.hasNextPage && !bills.isFetchingNextPage && bills.fetchNextPage()}
        ListHeaderComponent={
          <View style={{ gap: space.lg, paddingBottom: space.lg }}>
            <TopBar title={legislator.name} />
            <View style={[styles.hero, sticker(4), { backgroundColor: p.main }]}>
              <View style={styles.heroTop}>
                <PartyBadge code={legislator.party} />
                <Text style={styles.heroParty}>{p.label}</Text>
              </View>
              <Text style={styles.heroName}>{legislator.name}</Text>
              <Text style={styles.heroMeta}>{legislatorPlace(legislator)}</Text>
              <View style={styles.stats}>
                <Stat n={legislator.sponsored_count} label="sponsored" />
                <Stat n={legislator.cosponsored_count} label="cosponsored" />
              </View>
            </View>
            <View style={[styles.segment, sticker(2, radius.pill)]}>
              {ROLES.map((r) => (
                <BouncyPressable
                  key={r.key}
                  onPress={() => setRole(r.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: role === r.key }}
                  style={[styles.segmentBtn, role === r.key && { backgroundColor: p.main }]}>
                  <Text style={[styles.segmentText, role === r.key && { color: '#fff' }]}>{r.label}</Text>
                </BouncyPressable>
              ))}
            </View>
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
          bills.isLoading ? (
            <Loading label="Loading bills…" />
          ) : (
            <Empty icon="file-text" title="No bills yet" body="Nothing here among the bills PolitiKNOW has pulled in so far." />
          )
        }
        ListFooterComponent={bills.isFetchingNextPage ? <ActivityIndicator color={colors.blue} /> : null}
      />
    </Screen>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 90 }}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  hero: { padding: space.lg, gap: space.xs },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroParty: { fontFamily: fonts.extrabold, color: '#fff', fontSize: 14 },
  heroName: { fontFamily: fonts.black, color: '#fff', fontSize: 26, marginTop: space.xs },
  heroMeta: { fontFamily: fonts.bold, color: 'rgba(255,255,255,0.92)', fontSize: 15 },
  stats: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.xl,
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
  roleTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, marginLeft: 4 },
});
