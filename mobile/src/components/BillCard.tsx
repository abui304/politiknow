import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { shortDate, truncate } from '@/lib/format';
import { useFollowBill, useVoteBill } from '@/lib/queries';
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

/** One-tap follow: alerts when the bill moves, without voting or commenting. */
export function FollowBillButton({ bill, onDark = true, label = false }: { bill: Bill; onDark?: boolean; label?: boolean }) {
  const follow = useFollowBill();
  const on = bill.is_following;
  const fg = on || !onDark ? colors.ink : '#fff';
  return (
    <BouncyPressable
      onPress={() => follow.mutate({ id: bill.id, follow: !on }, { onError: toastError })}
      accessibilityRole="button"
      accessibilityLabel={on ? `Unfollow ${bill.label}` : `Follow ${bill.label} for updates`}
      accessibilityState={{ selected: on }}
      style={[styles.followBtn, label && styles.followLabeled, on && styles.voteOn]}>
      <Icon name="bell" size={16} color={fg} />
      {label ? <Text style={[styles.footerText, { color: fg }]}>{on ? 'Following' : 'Follow'}</Text> : null}
    </BouncyPressable>
  );
}

/** Search passage with the matched words (wrapped in \u0002…\u0003 by the API) in bold. */
export function Snippet({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\u0002[^\u0003]*\u0003)/);
  return (
    <View style={styles.snippet}>
      <Icon name="search" size={13} color={colors.inkSoft} />
      <Txt style={[type.small, { flex: 1, color: colors.inkSoft, lineHeight: 18 }]} numberOfLines={4}>
        …
        {parts.map((part, i) =>
          part.startsWith('\u0002') ? (
            <Text key={i} style={{ fontFamily: fonts.extrabold, color }}>
              {part.slice(1, -1)}
            </Text>
          ) : (
            part
          ),
        )}
        …
      </Txt>
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
  // From search, the first matched word goes along so the bill page's text finder is ready with it.
  const find = bill.snippet?.match(/\u0002([^\u0003]*)\u0003/)?.[1];
  const open = () => router.push({ pathname: '/bill/[id]', params: find ? { id: bill.id, find } : { id: bill.id } });

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
          {bill.reason ? (
            <View style={styles.reason} accessibilityLabel={`Why you're seeing this: ${bill.reason}`}>
              <Icon name="info" size={13} color={colors.muted} />
              <Txt style={styles.reasonText} numberOfLines={1}>
                {bill.reason}
              </Txt>
            </View>
          ) : null}
          <Txt style={type.h3} numberOfLines={3}>
            {bill.title}
          </Txt>
          <View style={{ marginTop: space.md }}>
            <BillTimeline bill={bill} />
          </View>
          {bill.snippet ? <Snippet text={bill.snippet} color={p.main} /> : null}
          {bill.summary_simple && !bill.snippet ? (
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
        <FollowBillButton bill={bill} />
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
  followBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, minWidth: 34, borderRadius: 17, justifyContent: 'center', marginHorizontal: 2 },
  followLabeled: { paddingHorizontal: space.md },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: space.sm },
  reasonText: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted, flex: 1 },
  snippet: { flexDirection: 'row', gap: 6, marginTop: space.sm, padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  score: { fontFamily: fonts.black, fontSize: 16, minWidth: 28, textAlign: 'center' },
});
