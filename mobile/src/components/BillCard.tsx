import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { shortDate, truncate } from '@/lib/format';
import { useVoteBill } from '@/lib/queries';
import { shareBill } from '@/lib/share';
import { toastError } from '@/lib/toast';
import type { Bill } from '@/lib/types';
import { colors, fonts, partyColors, radius, space, sticker, type } from '@/theme';

import { BillTimeline } from './BillTimeline';
import { BouncyPressable, Chip, Icon, Txt } from './ui';

export function VoteControl({ bill, onDark = true }: { bill: Bill; onDark?: boolean }) {
  const vote = useVoteBill();
  const cast = (v: -1 | 1) =>
    vote.mutate({ id: bill.id, value: bill.my_vote === v ? 0 : v }, { onError: toastError });
  const fg = onDark ? '#fff' : colors.ink;
  return (
    <View style={styles.vote}>
      <BouncyPressable
        onPress={() => cast(1)}
        accessibilityLabel="Upvote"
        accessibilityState={{ selected: bill.my_vote === 1 }}
        style={[styles.voteBtn, bill.my_vote === 1 && styles.voteOn]}>
        <Icon name="arrow-up" size={18} color={bill.my_vote === 1 ? colors.ink : fg} />
      </BouncyPressable>
      <Text style={[styles.score, { color: fg }]}>{bill.net_score}</Text>
      <BouncyPressable
        onPress={() => cast(-1)}
        accessibilityLabel="Downvote"
        accessibilityState={{ selected: bill.my_vote === -1 }}
        style={[styles.voteBtn, bill.my_vote === -1 && styles.voteOn]}>
        <Icon name="arrow-down" size={18} color={bill.my_vote === -1 ? colors.ink : fg} />
      </BouncyPressable>
    </View>
  );
}

export function PartyBadge({ code }: { code: string | null }) {
  const p = partyColors(code);
  return (
    <View style={[styles.partyBadge, { backgroundColor: '#fff' }]}>
      <Text style={[styles.partyText, { color: p.main }]}>{code ? code.slice(0, 1) : '?'}</Text>
    </View>
  );
}

export function BillCard({ bill }: { bill: Bill }) {
  const p = partyColors(bill.sponsor_party);
  const open = () => router.push({ pathname: '/bill/[id]', params: { id: bill.id } });

  return (
    <View style={[styles.card, sticker(4)]}>
      <BouncyPressable onPress={open} accessibilityRole="button" accessibilityLabel={`Open ${bill.label}`}>
        <View style={[styles.header, { backgroundColor: p.main }]}>
          <PartyBadge code={bill.sponsor_party} />
          <Text style={styles.headerLabel}>{bill.label}</Text>
          <Text style={styles.headerDate}>{shortDate(bill.last_action_date)}</Text>
          {bill.is_trending ? (
            <View style={styles.trending}>
              <Icon name="trending-up" size={12} />
              <Text style={styles.trendingText}>Trending</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.body}>
          <Txt style={type.h3} numberOfLines={3}>
            {bill.title}
          </Txt>
          <View style={{ marginTop: space.md }}>
            <BillTimeline bill={bill} />
          </View>
          {bill.summary_simple ? (
            <Txt style={[type.body, { marginTop: space.sm, color: colors.inkSoft }]}>
              {truncate(bill.summary_simple, 240)} <Text style={{ fontFamily: fonts.extrabold, color: p.main }}>Read more</Text>
            </Txt>
          ) : null}
          <View style={styles.tags}>
            {bill.primary_tags.map((t) => (
              <Chip key={t} label={t} />
            ))}
          </View>
        </View>
      </BouncyPressable>
      <View style={[styles.footer, { backgroundColor: p.main }]}>
        <VoteControl bill={bill} />
        <View style={{ flex: 1 }} />
        <BouncyPressable onPress={open} style={styles.footerBtn} accessibilityLabel="Comments">
          <Icon name="message-circle" size={17} color="#fff" />
          <Text style={styles.footerText}>{bill.comment_count}</Text>
        </BouncyPressable>
        <BouncyPressable onPress={() => shareBill(bill)} style={styles.footerBtn} accessibilityLabel="Share">
          <Icon name="share" size={16} color="#fff" />
          <Text style={styles.footerText}>Share</Text>
        </BouncyPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, overflow: 'hidden', marginBottom: space.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: colors.line,
    flexWrap: 'wrap',
  },
  headerLabel: { fontFamily: fonts.black, color: '#fff', fontSize: 15 },
  headerDate: { fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.85)', fontSize: 13, flex: 1 },
  partyBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.line,
  },
  partyText: { fontFamily: fonts.black, fontSize: 12 },
  trending: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 2, borderColor: colors.line },
  trendingText: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.ink },
  body: { padding: space.lg, backgroundColor: colors.surface },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderTopWidth: 2,
    borderTopColor: colors.line,
  },
  footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 8 },
  footerText: { fontFamily: fonts.extrabold, color: '#fff', fontSize: 14 },
  vote: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  voteBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  voteOn: { backgroundColor: colors.yellow, borderWidth: 2, borderColor: colors.line },
  score: { fontFamily: fonts.black, fontSize: 16, minWidth: 28, textAlign: 'center' },
});
