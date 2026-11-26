import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { shortDate } from '@/lib/format';
import { useBillVotes, useLegislatorVotes, useMyMembersVotes } from '@/lib/queries';
import type { MemberPosition, PartyTally, RollCall } from '@/lib/types';
import { colors, figures, fonts, outline, radius, space, type } from '@/theme';

import { ContactButton } from './ContactMembers';
import { LegislatorPhoto } from './LegislatorPhoto';
import { Button, Icon, Tap, Txt } from './ui';

/*
 * Recorded votes, shown as the official record: the clerk's question word for word, the result, totals, and
 * each member's vote. Tallies are grey (party colors stay on bill identity), parties are always listed in the
 * same alphabetical order, and procedural votes are folded away but never hidden.
 */

const PARTY_NAMES: Record<string, string> = { D: 'Democrats', I: 'Independents', ID: 'Independents', R: 'Republicans' };
const chamberName = (c: string) => (c === 'house' ? 'House' : 'Senate');

function Tally({ t }: { t: PartyTally }) {
  const total = t.yea + t.nay + t.present + t.not_voting || 1;
  return (
    <View style={styles.bar} accessible={false}>
      <View style={[styles.barPart, { flex: t.yea / total, backgroundColor: colors.inkSoft }]} />
      <View style={[styles.barPart, { flex: t.nay / total, backgroundColor: colors.mapLineStrong }]} />
      <View style={[styles.barPart, { flex: (t.present + t.not_voting) / total, backgroundColor: colors.hairline }]} />
    </View>
  );
}

function PartyRows({ totals }: { totals: Record<string, PartyTally> }) {
  const merged = new Map<string, PartyTally>();
  for (const [code, t] of Object.entries(totals)) {
    const name = PARTY_NAMES[code] ?? 'Other';
    const m = merged.get(name) ?? { yea: 0, nay: 0, present: 0, not_voting: 0 };
    merged.set(name, { yea: m.yea + t.yea, nay: m.nay + t.nay, present: m.present + t.present, not_voting: m.not_voting + t.not_voting });
  }
  const rows = [...merged.entries()].sort(([a], [b]) => a.localeCompare(b));
  return (
    <View style={{ gap: space.sm }}>
      {rows.map(([name, t]) => (
        <View key={name} style={{ gap: 4 }} accessible accessibilityLabel={`${name}: ${t.yea} yea, ${t.nay} nay, ${t.not_voting + t.present} other`}>
          <View style={styles.partyHead}>
            <Txt style={[type.small, { color: colors.ink, flex: 1 }]}>{name}</Txt>
            <Txt style={[type.small, figures]}>
              {t.yea} yea · {t.nay} nay{t.present + t.not_voting ? ` · ${t.present + t.not_voting} other` : ''}
            </Txt>
          </View>
          <Tally t={t} />
        </View>
      ))}
    </View>
  );
}

function YourMembers({ members }: { members: MemberPosition[] }) {
  if (!members.length) return null;
  return (
    <View style={styles.members}>
      {members.map((m) => (
        <Tap
          key={m.bioguide_id}
          onPress={() => router.push({ pathname: '/legislator/[id]', params: { id: m.bioguide_id } })}
          accessibilityRole="link"
          accessibilityLabel={`${m.note}, ${m.name}, voted ${m.position}`}
          style={styles.member}
          hitSlop={0}>
          <LegislatorPhoto legislator={m} size={28} />
          <View style={{ flex: 1 }}>
            <Txt style={type.bodyMedium} numberOfLines={1}>
              {m.name}
            </Txt>
            <Txt style={type.meta}>{m.note}</Txt>
          </View>
          <Txt style={[styles.position, m.position === 'Not Voting' && { color: colors.muted }]}>{m.position}</Txt>
        </Tap>
      ))}
    </View>
  );
}

export function RollCallCard({ rc, showMeasure = false }: { rc: RollCall; showMeasure?: boolean }) {
  return (
    <View style={styles.vote}>
      <View style={{ gap: 2 }}>
        <Txt style={type.meta}>
          {`${chamberName(rc.chamber)} · roll call ${rc.number} · ${shortDate(rc.voted_at)}`}
          {showMeasure && rc.measure ? ` · ${rc.measure}` : ''}
        </Txt>
        <Txt style={type.bodyMedium}>{rc.question}</Txt>
        <Txt style={[type.small, figures]}>
          {rc.result ? `${rc.result}. ` : ''}
          {rc.yea} yea, {rc.nay} nay{rc.not_voting ? `, ${rc.not_voting} not voting` : ''}
        </Txt>
      </View>
      <YourMembers members={rc.your_members} />
      <PartyRows totals={rc.party_totals} />
      {rc.source_url ? (
        <Tap onPress={() => WebBrowser.openBrowserAsync(rc.source_url as string)} accessibilityRole="link" style={styles.source}>
          <Icon name="external-link" size={12} color={colors.inkSoft} />
          <Txt style={styles.sourceText}>Official record</Txt>
        </Tap>
      ) : null}
    </View>
  );
}

/** The bill page's "How Congress voted" section. Shows nothing when there are no recorded votes. */
export function BillVotes({ billId, style }: { billId: string; style?: object }) {
  const { data } = useBillVotes(billId);
  const [showAll, setShowAll] = useState(false);
  if (!data?.length) return null;
  const main = data.filter((v) => v.kind === 'passage' || v.kind === 'cloture');
  const other = data.filter((v) => !(v.kind === 'passage' || v.kind === 'cloture'));
  const shown = showAll || !main.length ? data : main;
  // Everyone who represents the user and voted on this bill, once each, for the contact button.
  const mine = [...new Map(data.flatMap((v) => v.your_members).map((m) => [m.bioguide_id, m])).values()];
  return (
    <View style={style}>
      <Txt style={type.h2}>How Congress voted</Txt>
      <Txt style={type.small}>Recorded votes, as the House and Senate clerks published them.</Txt>
      {shown.map((rc) => (
        <RollCallCard key={rc.id} rc={rc} />
      ))}
      {other.length && main.length ? (
        <Button
          title={showAll ? 'Show only key votes' : `Show ${other.length} more ${other.length === 1 ? 'vote' : 'votes'}`}
          hint="Amendments and procedural votes"
          variant="secondary"
          small
          onPress={() => setShowAll((s) => !s)}
        />
      ) : null}
      {mine.length ? <ContactButton members={mine} about={data[0].measure ?? undefined} /> : null}
    </View>
  );
}

/** A member's voting record on their page: missed votes with context, then recent votes. */
export function LegislatorVotes({ id, name }: { id: string; name: string }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useLegislatorVotes(id);
  const first = data?.pages[0];
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  if (isLoading) return <ActivityIndicator color={colors.inkSoft} />;
  if (!first || !items.length) {
    return <Txt style={type.small}>No recorded votes on file yet for {name}.</Txt>;
  }
  return (
    <View style={{ gap: space.md }}>
      <Txt style={type.small}>
        {`Missed ${first.missed} of ${first.eligible} recorded ${first.eligible === 1 ? 'vote' : 'votes'} on file this Congress. Absences have many causes, including illness, family leave and travel.`}
      </Txt>
      {items.map((v) => (
        <Tap
          key={v.roll_call.id}
          disabled={!v.bill_id}
          onPress={() => v.bill_id && router.push({ pathname: '/bill/[id]', params: { id: v.bill_id } })}
          accessibilityRole={v.bill_id ? 'link' : undefined}
          style={styles.memberVote}
          hitSlop={0}>
          <Txt style={[styles.positionWide, v.position === 'Not Voting' && { color: colors.muted }]}>{v.position}</Txt>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt style={type.meta}>{`${v.bill_label ?? 'Recorded vote'} · ${shortDate(v.roll_call.voted_at)}`}</Txt>
            <Txt style={type.body} numberOfLines={2}>
              {v.bill_title ?? v.roll_call.question}
            </Txt>
            {v.bill_title ? <Txt style={type.small}>{v.roll_call.question}</Txt> : null}
          </View>
          {v.bill_id ? <Icon name="chevron-right" size={16} color={colors.muted} /> : null}
        </Tap>
      ))}
      {hasNextPage ? (
        <Button title="Show earlier votes" variant="secondary" small loading={isFetchingNextPage} onPress={() => fetchNextPage()} />
      ) : null}
    </View>
  );
}

/** Under Me: the latest passage and cloture votes by the user's own members. */
export function MyMembersVotes() {
  const { data } = useMyMembersVotes();
  if (!data?.length) return null;
  return (
    <View style={[styles.card, outline(radius.lg)]}>
      <View style={styles.cardHead}>
        <Icon name="check-square" size={18} />
        <Txt style={[type.h3, { flex: 1 }]}>How your members voted</Txt>
      </View>
      {data.map((rc) => (
        <Tap
          key={rc.id}
          disabled={!rc.bill_id}
          onPress={() => rc.bill_id && router.push({ pathname: '/bill/[id]', params: { id: rc.bill_id } })}
          accessibilityRole={rc.bill_id ? 'link' : undefined}
          style={styles.recent}
          hitSlop={0}>
          <Txt style={type.meta}>{`${chamberName(rc.chamber)} · ${rc.measure ?? 'Recorded vote'} · ${shortDate(rc.voted_at)}`}</Txt>
          <Txt style={type.bodyMedium}>{rc.question}</Txt>
          <Txt style={type.small}>
            {rc.your_members.map((m) => `${m.name} ${m.position}`).join(' · ')}
            {rc.result ? ` · ${rc.result}` : ''}
          </Txt>
        </Tap>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  vote: { gap: space.md, paddingVertical: space.lg, borderTopWidth: 1, borderTopColor: colors.line },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.hairline },
  barPart: { height: 6 },
  partyHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  members: { gap: space.xs },
  member: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  position: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: colors.ink },
  positionWide: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 20, color: colors.ink, width: 78 },
  memberVote: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.line },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start' },
  sourceText: { ...type.meta, color: colors.inkSoft, textDecorationLine: 'underline' },
  card: { backgroundColor: colors.surface, padding: space.lg, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recent: { gap: 2, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line },
});
