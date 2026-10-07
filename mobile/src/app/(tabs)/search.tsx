import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { BillCard } from '@/components/BillCard';
import { LegislatorRow } from '@/components/LegislatorRow';
import { BottomSheet, BouncyPressable, Button, Chip, Empty, Field, Icon, Loading, Screen, Txt } from '@/components/ui';
import { useLegislators, usePopularHashtags, useSearch, useStageCounts, useTags } from '@/lib/queries';
import type { Chamber, PartyFilter, StageFilter } from '@/lib/types';
import { colors, fonts, party as parties, radius, space, sticker, type } from '@/theme';

const PARTIES: PartyFilter[] = ['D', 'R', 'I'];
const CHAMBERS: { key: Chamber; label: string }[] = [
  { key: 'house', label: 'House' },
  { key: 'senate', label: 'Senate' },
];
const STAGES: Record<StageFilter, string> = {
  law: 'Became law',
  president: 'President’s desk',
  senate: 'Awaiting Senate',
  house: 'Awaiting House',
  committee: 'In committee',
  vetoed: 'Vetoed',
};

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const billCount = (n: number) => `${n} ${n === 1 ? 'bill' : 'bills'}`;

export default function Search() {
  const [text, setText] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [party, setParty] = useState<PartyFilter | null>(null);
  const [chamber, setChamber] = useState<Chamber | null>(null);
  const [stage, setStage] = useState<StageFilter | null>(null);
  // The hashtag filter lives in the URL so tapping a hashtag anywhere opens /search?hashtag=...
  const hashtag = useLocalSearchParams<{ hashtag?: string }>().hashtag || null;
  const setHashtag = (h: string | null) => router.setParams({ hashtag: h ?? undefined });

  const q = useDebounced(text.trim());
  const { data: tags } = useTags();
  const { data: popular } = usePopularHashtags();
  const { data: stageCounts } = useStageCounts({ q, tag, hashtag, party, chamber });
  const results = useSearch({ q, tag, hashtag, party, chamber, stage });
  const { data: legislators } = useLegislators(q.startsWith('#') ? '' : q, party, chamber);
  const bills = results.data?.pages.flatMap((p) => p.items) ?? [];
  const searching = Boolean(q || tag || hashtag || party || chamber || stage);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterCount = [tag, party, chamber].filter(Boolean).length;
  // Everything filtering the results except status, which shows in its own row.
  const active = [
    hashtag && { label: `#${hashtag}`, color: colors.yellow, remove: () => setHashtag(null) },
    tag && { label: tag, color: colors.mint, remove: () => setTag(null) },
    party && { label: parties[party].label, color: parties[party].soft, remove: () => setParty(null) },
    chamber && { label: chamber === 'house' ? 'House' : 'Senate', color: colors.lilac, remove: () => setChamber(null) },
  ].filter((f): f is { label: string; color: string; remove: () => void } => Boolean(f));

  return (
    <Screen padded={false}>
      <FlatList
        data={searching ? bills : []}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <BillCard bill={item} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && results.fetchNextPage()}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingTop: space.md, paddingBottom: space.lg }}>
            <Txt style={type.title}>Search</Txt>
            <View style={styles.searchRow}>
              <View style={{ flex: 1 }}>
                <Field
                  value={text}
                  onChangeText={setText}
                  placeholder="Titles, #hashtags, legislators…"
                  returnKeyType="search"
                  autoCorrect={false}
                />
              </View>
              <BouncyPressable
                onPress={() => setFiltersOpen(true)}
                style={[styles.filterBtn, sticker(2, radius.md), filterCount > 0 && { backgroundColor: colors.yellow }]}
                accessibilityRole="button"
                accessibilityLabel={filterCount ? `Filters, ${filterCount} on` : 'Filters'}>
                <Icon name="sliders" size={18} />
                {filterCount ? <Txt style={styles.filterCount}>{filterCount}</Txt> : null}
              </BouncyPressable>
            </View>
            {active.length ? (
              <View style={styles.wrap}>
                {active.map((f) => (
                  <BouncyPressable
                    key={f.label}
                    onPress={f.remove}
                    style={[styles.activeFilter, sticker(2, radius.pill), { backgroundColor: f.color }]}
                    accessibilityLabel={`Remove ${f.label} filter`}>
                    <Txt style={styles.activeFilterText}>{f.label}</Txt>
                    <Icon name="x" size={14} />
                  </BouncyPressable>
                ))}
              </View>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {stageCounts
                ?.filter((s) => s.bill_count > 0 || stage === s.key)
                .map((s) => (
                  <Chip
                    key={s.key}
                    label={`${STAGES[s.key]} · ${s.bill_count}`}
                    selected={stage === s.key}
                    color={colors.yellow}
                    onPress={() => setStage(stage === s.key ? null : s.key)}
                  />
                ))}
            </ScrollView>
            {q && legislators?.length ? (
              <View style={{ gap: space.sm }}>
                <Txt style={type.h3}>Legislators</Txt>
                {legislators.map((l) => (
                  <LegislatorRow
                    key={l.bioguide_id}
                    legislator={l}
                    note={billCount(l.sponsored_count + l.cosponsored_count)}
                  />
                ))}
                <Txt style={[type.h3, { marginTop: space.sm }]}>Bills</Txt>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !searching ? (
            <View style={{ gap: space.md }}>
              {popular?.length ? (
                <>
                  <Txt style={type.h3}>Popular hashtags</Txt>
                  <View style={styles.wrap}>
                    {popular.map((h) => (
                      <Chip key={h.name} label={`#${h.name} · ${h.bill_count}`} onPress={() => setHashtag(h.name)} />
                    ))}
                  </View>
                </>
              ) : null}
              <Empty
                icon="compass"
                title="Explore"
                body="Type a keyword or a legislator's name, tap a status, open Filters, or pick a hashtag to find bills."
              />
            </View>
          ) : results.isLoading ? (
            <Loading label="Searching…" />
          ) : (
            <Empty icon="search" title="Nothing found" body="Try a different word, name, topic, status, or hashtag." />
          )
        }
        ListFooterComponent={results.isFetchingNextPage ? <ActivityIndicator color={colors.blue} /> : null}
      />
      <BottomSheet
        visible={filtersOpen}
        title="Filters"
        onClose={() => setFiltersOpen(false)}
        footer={
          <View style={styles.sheetFooter}>
            <Button
              title="Clear all"
              variant="secondary"
              small
              disabled={!filterCount}
              onPress={() => {
                setTag(null);
                setParty(null);
                setChamber(null);
              }}
            />
            <Button title="Show bills" small onPress={() => setFiltersOpen(false)} style={{ flex: 1 }} />
          </View>
        }>
        <View style={{ gap: space.lg }}>
          <FilterSection title="Sponsor's party">
            {PARTIES.map((code) => (
              <Chip
                key={code}
                label={parties[code].label}
                selected={party === code}
                color={parties[code].soft}
                onPress={() => setParty(party === code ? null : code)}
              />
            ))}
          </FilterSection>
          <FilterSection title="Chamber">
            {CHAMBERS.map((c) => (
              <Chip
                key={c.key}
                label={c.label}
                selected={chamber === c.key}
                color={colors.lilac}
                onPress={() => setChamber(chamber === c.key ? null : c.key)}
              />
            ))}
          </FilterSection>
          <FilterSection title="Topic">
            {tags?.map((t) => (
              <Chip
                key={t.name}
                label={t.name}
                selected={tag === t.name}
                color={colors.mint}
                onPress={() => setTag(tag === t.name ? null : t.name)}
              />
            ))}
          </FilterSection>
        </View>
      </BottomSheet>
    </Screen>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Txt style={type.tiny}>{title.toUpperCase()}</Txt>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  row: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 50,
    height: 50,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
  },
  filterCount: { fontFamily: fonts.black, fontSize: 14 },
  activeFilter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12 },
  activeFilterText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  sheetFooter: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
});
