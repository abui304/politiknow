import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { BillCard } from '@/components/BillCard';
import { LegislatorRow } from '@/components/LegislatorRow';
import { BouncyPressable, Chip, Empty, Field, Icon, Loading, Screen, Txt } from '@/components/ui';
import { useLegislators, usePopularHashtags, useSearch, useStageCounts, useTags } from '@/lib/queries';
import type { Chamber, PartyFilter, StageFilter } from '@/lib/types';
import { colors, party as parties, radius, space, sticker, type } from '@/theme';

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
  const { data: stageCounts } = useStageCounts();
  const results = useSearch({ q, tag, hashtag, party, chamber, stage });
  const { data: legislators } = useLegislators(q.startsWith('#') ? '' : q, party, chamber);
  const bills = results.data?.pages.flatMap((p) => p.items) ?? [];
  const searching = Boolean(q || tag || hashtag || party || chamber || stage);

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
            <Field
              value={text}
              onChangeText={setText}
              placeholder="Search titles, #hashtags, or legislators…"
              returnKeyType="search"
              autoCorrect={false}
            />
            {hashtag ? (
              <BouncyPressable
                onPress={() => setHashtag(null)}
                style={[styles.activeHashtag, sticker(2, radius.pill)]}
                accessibilityLabel={`Remove #${hashtag} filter`}>
                <Txt style={type.bodyBold}>#{hashtag}</Txt>
                <Icon name="x" size={16} />
              </BouncyPressable>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {tags?.map((t) => (
                <Chip
                  key={t.name}
                  label={t.name}
                  selected={tag === t.name}
                  color={colors.mint}
                  onPress={() => setTag(tag === t.name ? null : t.name)}
                />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {PARTIES.map((code) => (
                <Chip
                  key={code}
                  label={parties[code].label}
                  selected={party === code}
                  color={parties[code].soft}
                  onPress={() => setParty(party === code ? null : code)}
                />
              ))}
              <View style={styles.divider} />
              {CHAMBERS.map((c) => (
                <Chip
                  key={c.key}
                  label={c.label}
                  selected={chamber === c.key}
                  color={colors.lilac}
                  onPress={() => setChamber(chamber === c.key ? null : c.key)}
                />
              ))}
            </ScrollView>
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
                body="Type a keyword or a legislator's name, tap a topic, party, chamber, or status, or pick a hashtag to find bills."
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  row: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  divider: { width: 2, alignSelf: 'stretch', marginVertical: 6, backgroundColor: colors.hairline, borderRadius: 1 },
  activeHashtag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.yellow,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
});
