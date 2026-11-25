import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { plainText, shortDate, truncate } from '@/lib/format';
import { prefetchBill, useFollowBill, useVoteBill } from '@/lib/queries';
import { shareBill } from '@/lib/share';
import { toast, toastError, toastUndo } from '@/lib/toast';
import type { Bill } from '@/lib/types';
import { colors, figures, fonts, onAlpha, outline, partyColors, radius, space, type } from '@/theme';

import { BillTimeline } from './BillTimeline';
import { Chip, Icon, Tap, Txt } from './ui';

/** On iOS 18+, the card's colored header zooms into the bill page's header when the card is opened.
 *  Elsewhere the normal page transition runs. */
export function ZoomSource({ children }: { children: ReactNode }) {
  // The zoom wrapper passes props to its single child, which must have a plain (not array) style.
  return Platform.OS === 'ios' ? (
    <Link.AppleZoom>
      <View>{children}</View>
    </Link.AppleZoom>
  ) : (
    <>{children}</>
  );
}

/** The bill page's end of the zoom (see ZoomSource). */
export function ZoomTarget({ children }: { children: ReactNode }) {
  return Platform.OS === 'ios' ? (
    <Link.AppleZoomTarget>
      <View>{children}</View>
    </Link.AppleZoomTarget>
  ) : (
    <>{children}</>
  );
}

/** Up and down votes on a party-colored bar. The chosen arrow sits in a filled circle of the bar's text color. */
export function VoteControl({ bill }: { bill: Bill }) {
  const vote = useVoteBill();
  const p = partyColors(bill.sponsor_party);
  const cast = (v: -1 | 1) =>
    vote.mutate(
      { id: bill.id, value: bill.my_vote === v ? 0 : v, before: { net_score: bill.net_score, my_vote: bill.my_vote } },
      { onError: toastError },
    );
  const arrow = (v: -1 | 1) => {
    const on = bill.my_vote === v;
    return (
      <Tap
        onPress={() => cast(v)}
        accessibilityLabel={v === 1 ? 'Upvote this bill' : 'Downvote this bill'}
        accessibilityState={{ selected: on }}
        style={[styles.voteBtn, on && { backgroundColor: p.on }]}>
        <Icon name={v === 1 ? 'arrow-up' : 'arrow-down'} size={18} color={on ? p.main : p.on} />
      </Tap>
    );
  };
  return (
    <View style={styles.vote}>
      {arrow(1)}
      <Text style={[styles.score, { color: p.on }]} accessibilityLabel={`Score ${bill.net_score}`}>
        {bill.net_score}
      </Text>
      {arrow(-1)}
    </View>
  );
}

/** One-tap follow: alerts when the bill moves, without voting or commenting. */
export function FollowBillButton({ bill }: { bill: Bill }) {
  const follow = useFollowBill();
  const p = partyColors(bill.sponsor_party);
  const on = bill.is_following;
  const fg = on ? p.main : p.on;
  const set = (value: boolean) => follow.mutate({ id: bill.id, follow: value }, { onError: toastError });
  const press = () => {
    set(!on);
    if (on) toastUndo(`Stopped alerts for ${bill.label}`, () => set(true));
    else toast(`You’ll get an alert in Alerts when ${bill.label} moves`, 'success');
  };
  return (
    <Tap
      onPress={press}
      accessibilityRole="button"
      accessibilityLabel={on ? `Stop alerts for ${bill.label}` : `Get alerts when ${bill.label} moves`}
      accessibilityState={{ selected: on }}
      style={[styles.footerBtn, on && { backgroundColor: p.on }]}>
      <Icon name={on ? 'check' : 'bell'} size={16} color={fg} />
      <Text style={[styles.footerText, { color: fg }]}>{on ? 'Following' : 'Follow'}</Text>
    </Tap>
  );
}

/** Search passage with the matched words (wrapped in \u0002…\u0003 by the API) set in medium ink. */
export function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\u0002[^\u0003]*\u0003)/);
  return (
    <View style={styles.snippet}>
      <Icon name="search" size={14} color={colors.muted} />
      <Txt style={[type.small, { flex: 1 }]} numberOfLines={4}>
        …
        {parts.map((part, i) =>
          part.startsWith('\u0002') ? (
            <Text key={i} style={styles.hit}>
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

/** The sponsor's party initial in a small circle of the bar's text color. Read aloud as the party's name. */
export function PartyBadge({ code }: { code: string | null }) {
  const p = partyColors(code);
  return (
    <View style={[styles.partyBadge, { backgroundColor: p.on }]} accessible accessibilityLabel={`${p.label} sponsor`}>
      <Text style={[styles.partyText, { color: p.main }]}>{code ? code.slice(0, 1) : '?'}</Text>
    </View>
  );
}

/** "Democratic sponsor": the card's color, said in words, so it never has to be decoded. */
export function sponsorWords(code: string | null) {
  const label = partyColors(code).label;
  return `${label === 'Democrat' ? 'Democratic' : label === 'Other' ? 'Other-party' : label} sponsor`;
}

export function BillCard({ bill }: { bill: Bill }) {
  const p = partyColors(bill.sponsor_party);
  const qc = useQueryClient();
  // From search, the first matched word goes along so the bill page's text finder is ready with it.
  const find = bill.snippet?.match(/\u0002([^\u0003]*)\u0003/)?.[1];
  const href = { pathname: '/bill/[id]', params: find ? { id: bill.id, find } : { id: bill.id } } as const;
  // Loading starts on press-in, a beat before the tap completes, so the page usually opens filled in.
  const prefetch = () => prefetchBill(qc, bill.id);

  return (
    <View style={styles.card}>
      <Link href={href} asChild>
      <Tap onPressIn={prefetch} hitSlop={0} accessibilityRole="link" accessibilityLabel={`Read ${bill.label}: ${bill.title}`}>
        <ZoomSource>
        <View style={[styles.header, { backgroundColor: p.main }]}>
          <PartyBadge code={bill.sponsor_party} />
          <Text style={[styles.headerLabel, { color: p.on }]}>{bill.label}</Text>
          <Text style={[styles.headerDate, { color: onAlpha(p, 0.85) }]} numberOfLines={1}>
            {sponsorWords(bill.sponsor_party)}
          </Text>
          {bill.is_trending ? (
            <View style={styles.trending}>
              <Icon name="trending-up" size={14} color={p.on} />
              <Text style={[styles.trendingText, { color: p.on }]}>Trending</Text>
            </View>
          ) : null}
        </View>
        </ZoomSource>
        <View style={styles.body}>
          <View style={styles.reason}>
            <Txt style={[type.meta, { flexShrink: 0 }]}>{`Last action ${shortDate(bill.last_action_date)}`}</Txt>
            {bill.reason ? (
              <Txt style={[type.meta, { flex: 1 }]} numberOfLines={1} accessibilityLabel={`Why you're seeing this: ${bill.reason}`}>
                {` · ${bill.reason}`}
              </Txt>
            ) : null}
          </View>
          <Txt style={type.h3} numberOfLines={3}>
            {bill.title}
          </Txt>
          <View style={{ marginTop: space.lg }}>
            <BillTimeline bill={bill} />
          </View>
          {bill.snippet ? <Snippet text={bill.snippet} /> : null}
          {bill.summary_simple && !bill.snippet ? (
            <Txt style={[type.body, { marginTop: space.md, color: colors.inkSoft }]}>
              {truncate(plainText(bill.summary_simple), 240)} <Text style={styles.more}>Read more</Text>
            </Txt>
          ) : null}
          {bill.primary_tags.length ? (
            <View style={styles.tags}>
              {bill.primary_tags.map((t) => (
                <Chip key={t} label={t} small />
              ))}
            </View>
          ) : null}
        </View>
      </Tap>
      </Link>
      <View style={[styles.footer, { backgroundColor: p.main }]}>
        <VoteControl bill={bill} />
        <View style={{ flex: 1 }} />
        <Link href={href} asChild>
          <Tap onPressIn={prefetch} style={styles.footerBtn} accessibilityRole="link" accessibilityLabel={`Read ${bill.comment_count} ${bill.comment_count === 1 ? 'comment' : 'comments'}`}>
            <Icon name="message-circle" size={16} color={p.on} />
            <Text style={[styles.footerText, styles.count, { color: p.on }]}>{bill.comment_count}</Text>
          </Tap>
        </Link>
        <FollowBillButton bill={bill} />
        <Tap onPress={() => shareBill(bill)} style={styles.footerBtn} accessibilityLabel={`Share ${bill.label}`}>
          <Icon name="share" size={16} color={p.on} />
        </Tap>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, overflow: 'hidden', marginBottom: space.lg, ...outline(radius.lg) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexWrap: 'wrap',
  },
  headerLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, letterSpacing: 0.3, ...figures },
  headerDate: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, flex: 1 },
  partyBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  partyText: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14 },
  trending: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  trendingText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  body: { padding: space.lg },
  reason: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.sm },
  more: { fontFamily: fonts.medium, color: colors.ink },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: space.xs },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 36,
    minWidth: 36,
    paddingHorizontal: space.md,
    borderRadius: 18,
  },
  footerText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  count: { ...figures },
  vote: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  voteBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  score: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, minWidth: 28, textAlign: 'center', ...figures },
  snippet: { flexDirection: 'row', gap: space.sm, marginTop: space.md, padding: space.md, borderRadius: radius.sm, borderCurve: 'continuous', backgroundColor: colors.surfaceAlt },
  hit: { fontFamily: fonts.semibold, color: colors.ink },
});
