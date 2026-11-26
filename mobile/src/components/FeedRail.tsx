import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { LegislatorRow } from '@/components/LegislatorRow';
import { Icon, Tap, Txt } from '@/components/ui';
import { useCalendar, useRepresentatives, useStageCounts } from '@/lib/queries';
import type { StageFilter } from '@/lib/types';
import { colors, figures, fonts, outline, radius, space, type } from '@/theme';

const STAGES: { key: StageFilter; label: string }[] = [
  { key: 'law', label: 'Became law' },
  { key: 'president', label: 'On the President’s desk' },
  { key: 'senate', label: 'Waiting on the Senate' },
  { key: 'house', label: 'Waiting on the House' },
  { key: 'committee', label: 'In committee' },
];

function Section({ title, link, onLink, children }: { title: string; link?: string; onLink?: () => void; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Txt style={styles.kicker}>{title}</Txt>
        {link ? (
          <Tap onPress={onLink} accessibilityRole="link" hitSlop={4}>
            <Txt style={styles.link}>{link}</Txt>
          </Tap>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * The feed's right-hand column on a wide screen: the things a phone reaches through other pages (your
 * members of Congress, this week's floor schedule, where bills stand), kept in view beside the feed.
 */
export function FeedRail() {
  const { data: reps } = useRepresentatives();
  const { data: week } = useCalendar();
  const { data: stages } = useStageCounts({
    q: '',
    tag: null,
    party: null,
    chamber: null,
  });
  const counts = Object.fromEntries((stages ?? []).map((s) => [s.key, s.bill_count])) as Partial<Record<StageFilter, number>>;
  const members = [...(reps?.home?.representative ? [reps.home.representative] : []), ...(reps?.senators ?? [])];
  const floor = [...(week?.house ?? []), ...(week?.senate ?? [])]
    .flatMap((i) => i.bills.map((b) => ({ ...b, chamber: i.chamber })))
    .slice(0, 6);

  return (
    <ScrollView style={styles.rail} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Section
        title="Your members of Congress"
        link={members.length ? 'Your places' : 'Set your place'}
        onLink={() => router.navigate('/profile')}>
        {members.length ? (
          members.map((m) => <LegislatorRow key={m.bioguide_id} legislator={m} />)
        ) : (
          <Txt style={type.small}>Add your home district to see who represents you.</Txt>
        )}
      </Section>

      <Section title="On the floor this week" link="Full schedule" onLink={() => router.navigate('/calendar')}>
        {floor.length ? (
          floor.map((b, i) => (
            <Tap
              key={`${b.label}-${i}`}
              onPress={() =>
                b.bill_id
                  ? router.push({
                      pathname: '/bill/[id]',
                      params: { id: b.bill_id },
                    })
                  : router.navigate('/calendar')
              }
              accessibilityRole="link"
              style={styles.row}
              hitSlop={0}>
              <Txt style={[styles.rowLabel, figures]}>{b.label}</Txt>
              <Txt style={type.meta}>{b.chamber === 'house' ? 'House' : 'Senate'}</Txt>
            </Tap>
          ))
        ) : (
          <Txt style={type.small}>Nothing is scheduled yet. Congress may be on recess.</Txt>
        )}
      </Section>

      <Section title="Where bills stand">
        {STAGES.map((s) => (
          <Tap
            key={s.key}
            onPress={() => router.navigate({ pathname: '/search', params: { stage: s.key } })}
            accessibilityRole="link"
            accessibilityLabel={`${s.label}: ${counts[s.key] ?? 0} bills`}
            style={styles.row}
            hitSlop={0}>
            <Txt style={[type.body, { flex: 1, color: colors.ink }]}>{s.label}</Txt>
            <Txt style={[type.small, figures]}>{(counts[s.key] ?? 0).toLocaleString()}</Txt>
            <Icon name="chevron-right" size={14} color={colors.muted} />
          </Tap>
        ))}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { width: 320, flexGrow: 0 },
  content: { gap: space.lg, paddingTop: space.xl, paddingBottom: space.xxl },
  section: { gap: space.xs, padding: space.lg, backgroundColor: colors.surface, ...outline(radius.lg) },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  kicker: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.4,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  link: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
});
