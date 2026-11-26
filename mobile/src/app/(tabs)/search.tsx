import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { BillCard } from '@/components/BillCard';
import { LegislatorRow } from '@/components/LegislatorRow';
import { BottomSheet, Button, Chip, Empty, Field, Icon, Keycap, SkeletonList, Tap, Title, Txt, Screen } from '@/components/ui';
import { hasKeyboard } from '@/lib/device';
import { parsePlace, STATES } from '@/lib/places';
import { useLegislators, useSearch, useStageCounts, useStateDistricts, useTags } from '@/lib/queries';
import { useRecentSearches } from '@/lib/recent';
import { topicsFor } from '@/lib/topics';
import { useWide } from '@/lib/layout';
import type { Chamber, PartyFilter, StageFilter, Tag } from '@/lib/types';
import { colors, figures, fonts, motion, outline, party as parties, radius, space, type } from '@/theme';

const PARTIES: PartyFilter[] = ['D', 'R', 'I'];
const CHAMBERS: { key: Chamber; label: string }[] = [
  { key: 'house', label: 'House' },
  { key: 'senate', label: 'Senate' },
];
/** Statuses in the order a bill moves through Congress. */
const STAGES: {
  key: StageFilter;
  label: string;
  icon: 'check-circle' | 'edit-3' | 'arrow-right' | 'users' | 'x-circle' | 'trending-up';
}[] = [
  { key: 'law', label: 'Became law', icon: 'check-circle' },
  { key: 'passed', label: 'Passed at least one chamber', icon: 'trending-up' },
  { key: 'president', label: 'On the President’s desk', icon: 'edit-3' },
  {
    key: 'senate',
    label: 'Passed the House, waiting on the Senate',
    icon: 'arrow-right',
  },
  {
    key: 'house',
    label: 'Passed the Senate, waiting on the House',
    icon: 'arrow-right',
  },
  { key: 'committee', label: 'In committee', icon: 'users' },
  { key: 'vetoed', label: 'Vetoed', icon: 'x-circle' },
];
const stageLabel = (k: StageFilter) => STAGES.find((s) => s.key === k)?.label ?? k;

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
/** "1 bill matches", "3 bills match". */
const matches = (n: number) => `${plural(n, 'bill')} ${n === 1 ? 'matches' : 'match'}`;

/** Everyday issues, as one-tap searches. People think "Social Security", not "Social Welfare". */
const ISSUES = [
  'Social Security',
  'Medicare',
  'Veterans',
  'Student loans',
  'Climate',
  'Small business',
  'Housing',
  'Post office',
  'Taxes',
  'Immigration',
];
const TOPICS_SHOWN = 8;

/**
 * Search in three states:
 * - Nothing typed: ways in (recent searches, issues, where bills stand, topics), each one tap.
 * - Searching: how many bills match, the official topics the words are filed under, the members of Congress
 *   whose names match, then the bills.
 * - Filters (topic, status, party, chamber) live in one sheet and show as removable chips under the box.
 */
export default function Search() {
  // The whole search lives in the URL (/search?q=…&tag=…&stage=…): reloading keeps it, Back undoes the last
  // filter, and a search can be shared as a link.
  const params = useLocalSearchParams<{
    q?: string;
    tag?: string;
    party?: PartyFilter;
    chamber?: Chamber;
    stage?: StageFilter;
    focus?: string;
  }>();
  const tag = params.tag || null;
  const party = params.party || null;
  const chamber = params.chamber || null;
  const stage = params.stage || null;
  const set = (key: 'q' | 'tag' | 'party' | 'chamber' | 'stage') => (v: string | null) => router.setParams({ [key]: v || undefined });
  const setTag = set('tag');
  const setParty = set('party') as (v: PartyFilter | null) => void;
  const setChamber = set('chamber') as (v: Chamber | null) => void;
  const setStage = set('stage') as (v: StageFilter | null) => void;
  const [text, setText] = useState(params.q ?? '');
  const [focused, setFocused] = useState(false);
  const wide = useWide();
  const reduce = useReducedMotion();
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const input = useRef<TextInput>(null);
  const list = useRef<FlatList>(null);
  const { recent, add: remember, clear: clearRecent } = useRecentSearches();
  const navigation = useNavigation();

  // Tapping the Search tab again while on it jumps to the top and puts the cursor in the box.
  useEffect(
    () =>
      navigation.addListener('tabPress' as never, () => {
        if (navigation.isFocused()) {
          list.current?.scrollToOffset({ offset: 0, animated: true });
          input.current?.focus();
        }
      }),
    [navigation],
  );

  // "/" on web (and the command menu) send focus=<time> to put the cursor in the box.
  useEffect(() => {
    if (params.focus) input.current?.focus();
  }, [params.focus]);

  const q = useDebounced(text.trim());
  useEffect(() => {
    if ((params.q ?? '') !== q) router.setParams({ q: q || undefined });
  }, [q, params.q]);
  useEffect(() => {
    if (q.length >= 3) {
      const t = setTimeout(() => remember(q), 1500); // only searches someone paused on
      return () => clearTimeout(t);
    }
  }, [q, remember]);

  const { data: tags } = useTags();
  const place = parsePlace(q);
  // A place ("Iowa 2", "ohio senators") is answered with its members, not a bill search: the words
  // would only match bills by accident.
  const billQ = place ? '' : q;
  const { data: stageCounts } = useStageCounts({
    q: billQ,
    tag,
    party,
    chamber,
  });
  const results = useSearch({ q: billQ, tag, party, chamber, stage });
  const { data: legislators } = useLegislators(place ? '' : q, party, chamber);
  const bills = results.data?.pages.flatMap((p) => p.items) ?? [];
  const filtering = Boolean(tag || party || chamber || stage);
  const searching = Boolean(billQ || filtering);
  const counts = Object.fromEntries((stageCounts ?? []).map((s) => [s.key, s.bill_count])) as Partial<Record<StageFilter, number>>;
  // "Passed at least one chamber" overlaps the other statuses, so it's left out of the total.
  const total = stage ? (counts[stage] ?? 0) : Object.entries(counts).reduce((a, [k, n]) => a + (k === 'passed' ? 0 : (n ?? 0)), 0);

  const active = [
    tag && { key: 't', label: tag, remove: () => setTag(null) },
    stage && {
      key: 's',
      label: stageLabel(stage),
      remove: () => setStage(null),
    },
    party && {
      key: 'p',
      label: parties[party].label,
      remove: () => setParty(null),
    },
    chamber && {
      key: 'c',
      label: chamber === 'house' ? 'House' : 'Senate',
      remove: () => setChamber(null),
    },
  ].filter((f): f is { key: string; label: string; remove: () => void } => Boolean(f));

  const clearAll = () =>
    router.setParams({
      tag: undefined,
      party: undefined,
      chamber: undefined,
      stage: undefined,
    });
  const startOver = () => {
    router.setParams({
      q: undefined,
      tag: undefined,
      party: undefined,
      chamber: undefined,
      stage: undefined,
    });
    setText('');
    input.current?.focus();
  };

  // The official topics the words are filed under ("abortion" → Health, Civil Rights), offered as one-tap
  // filters, so a search can be narrowed to the Library of Congress's own categories.
  const filedUnder = billQ && !tag ? topicsFor(tags ?? [], billQ).slice(0, 3) : [];
  // Blur is held back a moment, so a tap on Cancel lands before the button leaves.
  const onFocus = () => {
    clearTimeout(blurTimer.current);
    setFocused(true);
  };
  const onBlur = () => {
    blurTimer.current = setTimeout(() => setFocused(false), 150);
  };
  const cancel = () => {
    setText('');
    input.current?.blur();
    setFocused(false);
  };
  const layout = reduce ? undefined : LinearTransition.duration(motion.base);

  const header = (
    <View style={styles.header}>
      <Title>Search</Title>
      <View style={styles.searchRow}>
        <Animated.View layout={layout} style={[styles.box, focused && styles.boxFocused]}>
          <Icon name="search" size={18} color={focused ? colors.ink : colors.muted} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => remember(text)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Bills, topics, members"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search bills, topics or members of Congress"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.boxInput}
          />
          {text ? (
            <Tap onPress={() => setText('')} accessibilityRole="button" accessibilityLabel="Clear the search box" style={styles.boxClear}>
              <Icon name="x" size={16} color={colors.inkSoft} />
            </Tap>
          ) : hasKeyboard ? (
            <Keycap>/</Keycap>
          ) : null}
        </Animated.View>
        {/* While typing on a phone, Filters steps aside for Cancel, so the box keeps its room. */}
        {focused && !wide ? null : (
        <Tap
          onPress={() => setFiltersOpen(true)}
          style={[styles.filterBtn, active.length > 0 && styles.filterBtnOn]}
          accessibilityRole="button"
          accessibilityLabel={active.length ? `Filters, ${active.length} on. Change filters` : 'Filter by topic, status, party or chamber'}>
          <Icon name="sliders" size={18} color={active.length ? '#fff' : colors.ink} />
          <Txt style={[styles.filterLabel, active.length > 0 && { color: '#fff' }]}>
            {active.length ? `Filters · ${active.length}` : 'Filters'}
          </Txt>
        </Tap>
        )}
        {/* On a phone, focusing the box brings in a way back out: Cancel clears the words and closes the keyboard. */}
        {focused && !wide ? (
          <Animated.View
            entering={reduce ? undefined : FadeIn.duration(motion.base)}
            exiting={reduce ? undefined : FadeOut.duration(motion.fast)}>
            <Tap onPress={cancel} accessibilityRole="button" accessibilityLabel="Cancel search" style={styles.cancel}>
              <Txt style={styles.cancelText}>Cancel</Txt>
            </Tap>
          </Animated.View>
        ) : null}
      </View>

      {active.length ? (
        <View style={styles.wrap}>
          {active.map((f) => (
            <Tap
              key={f.key}
              onPress={f.remove}
              style={styles.activeFilter}
              accessibilityRole="button"
              accessibilityLabel={`Remove the ${f.label} filter`}>
              <Txt style={styles.activeFilterText}>{f.label}</Txt>
              <Icon name="x" size={14} color="#fff" />
            </Tap>
          ))}
          {active.length > 1 ? (
            <Tap onPress={clearAll} accessibilityRole="button" style={styles.clearLink}>
              <Txt style={styles.link}>Clear all filters</Txt>
            </Tap>
          ) : null}
        </View>
      ) : null}

      {place ? <PlaceCard state={place.state} district={place.district} /> : null}
      {searching ? (
        <>
          <Txt style={type.small} accessibilityLiveRegion="polite">
            {results.isLoading ? 'Searching…' : `${matches(total)}${billQ ? ` “${billQ}”` : ''}`}
          </Txt>
          {filedUnder.length ? (
            <View style={styles.wrap}>
              <Txt style={type.small}>Filed under</Txt>
              {filedUnder.map((t) => (
                <Chip key={t} small label={t} onPress={() => setTag(t)} accessibilityLabel={`Show only bills filed under ${t}`} />
              ))}
            </View>
          ) : null}
          {q && legislators?.length ? (
            <View style={{ gap: space.sm }}>
              <Txt style={type.h3}>Members of Congress</Txt>
              {legislators.slice(0, 3).map((l) => (
                <LegislatorRow key={l.bioguide_id} legislator={l} note={plural(l.sponsored_count + l.cosponsored_count, 'bill')} />
              ))}
              <Txt style={[type.h3, { marginTop: space.md }]}>Bills</Txt>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <Screen padded={false}>
      <FlatList
        ref={list}
        data={searching ? bills : []}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <BillCard bill={item} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && results.fetchNextPage()}
        ListHeaderComponent={header}
        ListEmptyComponent={
          place && !filtering ? null : !searching ? (
            <Browse
              recent={recent}
              onRecent={setText}
              onIssue={(issue) => {
                setText(issue);
                remember(issue);
              }}
              onClearRecent={clearRecent}
              tags={tags?.map((t) => t.name) ?? []}
              onTag={setTag}
              counts={counts}
              onStage={setStage}
            />
          ) : results.isLoading ? (
            <SkeletonList count={2} />
          ) : (
            <Empty
              icon="search"
              title={place ? `No bills match “${q}”` : 'No bills match'}
              body={
                place
                  ? 'The members for this place are above. To find bills, try a topic or an issue.'
                  : active.length
                    ? 'Try removing a filter, or different words.'
                    : 'Try different words, a bill number like H.R. 1234, a member’s last name, or a state.'
              }
              action={
                active.length ? (
                  <Button title="Clear all filters" small onPress={clearAll} />
                ) : filedUnder.length ? (
                  <Button title={`See bills filed under ${filedUnder[0]}`} small onPress={() => {
                    const t = filedUnder[0];
                    setText('');
                    router.setParams({ q: undefined, tag: t });
                  }} />
                ) : (
                  <Button title="Start a new search" small variant="secondary" onPress={startOver} />
                )
              }
            />
          )
        }
        ListFooterComponent={results.isFetchingNextPage ? <ActivityIndicator color={colors.inkSoft} style={{ margin: space.lg }} /> : null}
      />

      <BottomSheet
        visible={filtersOpen}
        title="Filter bills"
        onClose={() => setFiltersOpen(false)}
        footer={
          <View style={styles.sheetFooter}>
            <Button title="Clear filters" variant="secondary" disabled={!active.length} onPress={clearAll} />
            <Button
              title={searching ? `Show ${plural(total, 'bill')}` : 'Done'}
              onPress={() => setFiltersOpen(false)}
              style={{ flex: 1 }}
            />
          </View>
        }>
        <View style={{ gap: space.xl }}>
          <FilterSection title="Status">
            {STAGES.map((s) => (
              <Chip
                key={s.key}
                label={`${s.label}${counts[s.key] !== undefined ? ` · ${counts[s.key]}` : ''}`}
                selected={stage === s.key}
                onPress={() => setStage(stage === s.key ? null : s.key)}
              />
            ))}
          </FilterSection>
          <FilterSection title="Sponsor’s party">
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
              <Chip key={c.key} label={c.label} selected={chamber === c.key} onPress={() => setChamber(chamber === c.key ? null : c.key)} />
            ))}
          </FilterSection>
          <TopicFilter tags={tags ?? []} value={tag} onChange={setTag} />
        </View>
      </BottomSheet>
    </Screen>
  );
}

/** What Search shows before anything is typed: one tap into the bills people most often look for. */
function Browse({
  recent,
  onRecent,
  onIssue,
  onClearRecent,
  tags,
  onTag,
  counts,
  onStage,
}: {
  recent: string[];
  onRecent: (q: string) => void;
  onIssue: (q: string) => void;
  onClearRecent: () => void;
  tags: string[];
  onTag: (t: string) => void;
  counts: Partial<Record<StageFilter, number>>;
  onStage: (s: StageFilter) => void;
}) {
  const [allTopics, setAllTopics] = useState(false);
  return (
    <View style={{ gap: space.xl }}>
      {recent.length ? (
        <View style={{ gap: space.sm }}>
          <View style={styles.sectionHead}>
            <Txt style={type.h3}>Recent searches</Txt>
            <Tap onPress={onClearRecent} accessibilityRole="button" accessibilityLabel="Clear recent searches">
              <Txt style={styles.link}>Clear</Txt>
            </Tap>
          </View>
          {recent.map((r) => (
            <Tap
              key={r}
              onPress={() => onRecent(r)}
              accessibilityRole="button"
              accessibilityLabel={`Search for ${r} again`}
              style={styles.recentRow}>
              <Icon name="clock" size={16} color={colors.muted} />
              <Txt style={[type.body, { flex: 1 }]} numberOfLines={1}>
                {r}
              </Txt>
              <Icon name="arrow-up-left" size={16} color={colors.muted} />
            </Tap>
          ))}
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        <Txt style={type.h3}>Popular issues</Txt>
        <View style={styles.wrap}>
          {ISSUES.map((i) => (
            <Chip key={i} label={i} onPress={() => onIssue(i)} accessibilityLabel={`Search for ${i}`} />
          ))}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <Txt style={type.h3}>Where bills stand</Txt>
        <View style={styles.statusList}>
          {STAGES.filter((s) => counts[s.key]).map((s, i) => (
            <Tap
              key={s.key}
              onPress={() => onStage(s.key)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${plural(counts[s.key] ?? 0, 'bill')}: ${s.label}`}
              hitSlop={0}
              style={[styles.statusRow, i > 0 && styles.statusRowRule]}>
              <Icon name={s.icon} size={16} color={colors.inkSoft} />
              <Txt style={[type.body, { flex: 1 }]}>{s.label}</Txt>
              <Txt style={[type.small, figures]}>{(counts[s.key] ?? 0).toLocaleString()}</Txt>
              <Icon name="chevron-right" size={16} color={colors.muted} />
            </Tap>
          ))}
        </View>
      </View>

      {tags.length ? (
        <View style={{ gap: space.sm }}>
          <Txt style={type.h3}>Official topics</Txt>
          <Txt style={type.small}>The Library of Congress files every bill under one of these.</Txt>
          <View style={styles.wrap}>
            {(allTopics ? tags : tags.slice(0, TOPICS_SHOWN)).map((t) => (
              <Chip key={t} label={t} onPress={() => onTag(t)} accessibilityLabel={`Show bills about ${t}`} />
            ))}
            {tags.length > TOPICS_SHOWN ? (
              <Tap onPress={() => setAllTopics((a) => !a)} accessibilityRole="button" style={styles.clearLink}>
                <Txt style={styles.link}>{allTopics ? 'Show fewer' : `Show all ${tags.length} topics`}</Txt>
              </Tap>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Who represents a place typed into search ("Iowa 2", "ohio senators"): its senators and House member. */
function PlaceCard({ state, district }: { state: string; district: number | null }) {
  const { data, isLoading } = useStateDistricts(state);
  const name = STATES[state];
  const seat = district !== null ? data?.districts.find((d) => d.district === district) : undefined;
  return (
    <View style={styles.place}>
      <Txt style={type.h3}>
        {district !== null ? `${name}’s ${district === 0 ? 'at-large seat' : `district ${district}`}` : `Members of Congress for ${name}`}
      </Txt>
      {isLoading ? (
        <SkeletonList kind="row" count={2} />
      ) : (
        <>
          {seat?.representative ? <LegislatorRow legislator={seat.representative} /> : null}
          {district !== null && data && !seat ? (
            <Txt style={type.small}>{`${name} has no district ${district}. It has ${plural(data.districts.length, 'district')}.`}</Txt>
          ) : null}
          {(data?.senators ?? []).map((s) => (
            <LegislatorRow key={s.bioguide_id} legislator={s} />
          ))}
          {district === null && data && !data.senators.length ? (
            <Txt style={type.small}>No senators on record yet. Pick a district to see its House member.</Txt>
          ) : null}
        </>
      )}
      <Button
        title={district !== null ? `All of ${name}’s districts` : `Find your district in ${name}`}
        icon="map"
        small
        variant="secondary"
        onPress={() =>
          router.push({
            pathname: '/state/[code]',
            params: district !== null ? { code: state, district: String(district) } : { code: state },
          })
        }
        style={{ alignSelf: 'flex-start' }}
      />
    </View>
  );
}

/** Topics with a finder: everyday words ("abortion", "insulin") bring up the topics they're filed under. */
function TopicFilter({ tags, value, onChange }: { tags: Tag[]; value: string | null; onChange: (t: string | null) => void }) {
  const [find, setFind] = useState('');
  const found = find.trim() ? topicsFor(tags, find) : tags.map((t) => t.name);
  const shown = value && !found.includes(value) ? [value, ...found] : found;
  return (
    <View style={{ gap: space.sm }}>
      <Txt style={[type.small, { color: colors.ink, fontFamily: fonts.medium }]}>Topic</Txt>
      <Field
        value={find}
        onChangeText={setFind}
        placeholder="Find a topic, like “abortion” or “insulin”"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Find a topic"
      />
      <View style={styles.wrap}>
        {shown.map((t) => (
          <Chip key={t} label={t} selected={value === t} onPress={() => onChange(value === t ? null : t)} />
        ))}
        {!shown.length ? (
          <Txt style={type.small}>{`No topic covers “${find.trim()}”. Try another word, or search for it instead.`}</Txt>
        ) : null}
      </View>
    </View>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Txt style={[type.small, { color: colors.ink, fontFamily: fonts.medium }]}>{title}</Txt>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  header: { gap: space.md, paddingTop: space.md, paddingBottom: space.lg },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    alignItems: 'center',
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  box: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 48,
    paddingLeft: space.md,
    paddingRight: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  boxFocused: { borderColor: colors.ink },
  // The box shows focus itself, so the browser's own ring (drawn inside the input) is turned off.
  boxInput: {
    flex: 1,
    height: '100%',
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  place: { gap: space.sm, padding: space.lg, backgroundColor: colors.surface, ...outline(radius.md) },
  boxClear: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 48,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  filterBtnOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterLabel: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    ...figures,
  },
  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  activeFilterText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: '#fff',
  },
  clearLink: { paddingVertical: space.xs, paddingHorizontal: space.xs },
  link: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  statusList: { backgroundColor: colors.surface, ...outline(radius.md) },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md },
  statusRowRule: { borderTopWidth: 1, borderTopColor: colors.line },
  cancel: { height: 48, justifyContent: 'center', paddingHorizontal: space.xs },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  sheetFooter: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
});
