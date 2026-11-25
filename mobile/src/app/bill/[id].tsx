import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FollowBillButton, PartyBadge, VoteControl, ZoomTarget } from '@/components/BillCard';
import { BillTimeline } from '@/components/BillTimeline';
import { CommentsSection } from '@/components/Comments';
import { BillCardSkeleton, Button, Card, Chip, Empty, Field, Icon, IconButton, Loading, Screen, Segmented, Tap, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { plainText } from '@/lib/format';
import { useBill, useBillText } from '@/lib/queries';
import { shareBill } from '@/lib/share';
import { toast, toastError } from '@/lib/toast';
import { colors, figures, fonts, onAlpha, partyColors, radius, space, type } from '@/theme';

const FULL_TEXT_PREVIEW = 20_000;
const MAX_MATCHES = 50;

export default function BillDetail() {
  // `find`: the search words, when opened from Search, so they're ready in the bill-text finder.
  const { id, find } = useLocalSearchParams<{ id: string; find?: string }>();
  const { data: bill, isLoading, error } = useBill(id);
  const [level, setLevel] = useState<'simple' | 'detailed'>('simple');
  const [showText, setShowText] = useState(false);
  const [query, setQuery] = useState(find ?? '');
  const text = useBillText(id, showText);

  useEffect(() => {
    api(`/bills/${id}/view`, { method: 'POST' }).catch(() => {});
  }, [id]);

  if (isLoading) {
    return (
      <Screen>
        <TopBar />
        <BillCardSkeleton />
      </Screen>
    );
  }
  if (!bill) {
    return (
      <Screen>
        <TopBar />
        <Empty
          icon="file-minus"
          title="Bill not found"
          body={error?.message}
          action={<Button title="Back to your feed" small onPress={() => router.replace('/')} />}
        />
      </Screen>
    );
  }

  const p = partyColors(bill.sponsor_party);
  const raw = level === 'simple' ? bill.summary_simple : bill.summary_detailed;
  const summary = raw ? plainText(raw) : raw;
  const sponsorId = bill.sponsor_id;
  const sponsor = bill.sponsor_label ?? bill.sponsor_name;
  const openCongress = () => bill.congress_url && WebBrowser.openBrowserAsync(bill.congress_url);

  return (
    <Screen scroll>
      <TopBar right={<IconButton icon="share" label={`Share ${bill.label}`} onPress={() => shareBill(bill)} />} />

      <ZoomTarget>
      <View style={[styles.hero, { backgroundColor: p.main }]}>
        <View style={styles.heroTop}>
          <PartyBadge code={bill.sponsor_party} />
          <Text style={[styles.heroLabel, { color: p.on }]}>{bill.label}</Text>
          {bill.is_trending ? (
            <View style={styles.trending}>
              <Icon name="trending-up" size={14} color={p.on} />
              <Text style={[styles.heroSmall, { color: p.on }]}>Trending</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[styles.heroTitle, { color: p.on }]}
          accessibilityRole="header"
          textBreakStrategy="balanced"
          lineBreakStrategyIOS="push-out">
          {bill.title}
        </Text>
        <View style={[styles.heroTimeline, { backgroundColor: onAlpha(p, 0.12) }]}>
          <BillTimeline bill={bill} onDark />
          {bill.latest_action_text ? <LatestAction text={bill.latest_action_text} color={p.on} /> : null}
        </View>
        <View style={styles.heroMeta}>
          {sponsor ? (
            sponsorId ? (
              <Tap
                onPress={() => router.push({ pathname: '/legislator/[id]', params: { id: sponsorId } })}
                accessibilityRole="link"
                style={styles.heroLink}>
                <Text style={[styles.heroMetaText, { color: onAlpha(p, 0.8) }]}>Sponsor </Text>
                <Text style={[styles.heroLinkText, { color: p.on }]}>{sponsor}</Text>
                <Icon name="chevron-right" size={16} color={p.on} />
              </Tap>
            ) : (
              <Text style={[styles.heroMetaText, { color: onAlpha(p, 0.8) }]}>
                Sponsor <Text style={{ color: p.on }}>{sponsor}</Text>
              </Text>
            )
          ) : null}
          {bill.cosponsor_count > 0 ? (
            <Tap
              onPress={() => router.push({ pathname: '/cosponsors/[id]', params: { id: bill.id } })}
              accessibilityRole="link"
              style={styles.heroLink}>
              <Text style={[styles.heroMetaText, { color: onAlpha(p, 0.8) }]}>Cosponsors </Text>
              <Text style={[styles.heroLinkText, styles.figure, { color: p.on }]}>{bill.cosponsor_count}</Text>
              <Icon name="chevron-right" size={16} color={p.on} />
            </Tap>
          ) : null}
        </View>
        <View style={[styles.heroFooter, { borderTopColor: onAlpha(p, 0.25) }]}>
          <VoteControl bill={bill} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessibilityLabel={`${bill.comment_count} comments`}>
              <Icon name="message-circle" size={16} color={p.on} />
              <Text style={[styles.heroMetaText, styles.figure, { color: p.on }]}>{bill.comment_count}</Text>
            </View>
            <FollowBillButton bill={bill} />
          </View>
        </View>
      </View>
      </ZoomTarget>

      <View style={styles.tags}>
        {bill.primary_tags.map((t) => (
          <Chip key={t} label={t} small />
        ))}
      </View>
      <Hashtags tags={bill.sub_tags} />

      <Card style={{ gap: space.md, marginTop: space.lg }}>
        <Segmented
          options={[
            { key: 'simple', label: 'Simple' },
            { key: 'detailed', label: 'Detailed' },
          ]}
          value={level}
          onChange={setLevel}
          small
        />
        <Txt style={type.body}>{summary ?? 'Summary coming soon.'}</Txt>

        <Tap onPress={() => setShowText((s) => !s)} accessibilityRole="button" accessibilityState={{ expanded: showText }} style={styles.disclaimer}>
          <Icon name="info" size={16} color={colors.inkSoft} />
          <Txt style={[type.small, { flex: 1 }]}>
            This summary was written by AI and may contain mistakes.{' '}
            <Txt style={[type.small, styles.textLink]}>{showText ? 'Hide the full bill text' : 'Read the full bill text'}</Txt>
          </Txt>
        </Tap>

        {showText ? (
          text.isLoading ? (
            <Loading label="Fetching bill text…" />
          ) : query.trim().length >= 2 && text.data?.full_text ? (
            <View style={{ gap: space.sm }}>
              <FindField value={query} onChange={setQuery} />
              <TextMatches text={text.data.full_text} query={query.trim()} />
            </View>
          ) : (
            <View style={{ gap: space.sm }}>
              {text.data?.full_text ? <FindField value={query} onChange={setQuery} /> : null}
            <ScrollView style={styles.fullText} nestedScrollEnabled>
              <Txt style={[type.small, { color: colors.ink, fontFamily: fonts.regular }]} selectable>
                {(text.data?.full_text ?? 'Full text unavailable.').slice(0, FULL_TEXT_PREVIEW)}
              </Txt>
              {(text.data?.full_text?.length ?? 0) > FULL_TEXT_PREVIEW ? (
                <Txt style={[type.meta, { marginTop: space.md }]}>Continued on Congress.gov</Txt>
              ) : null}
            </ScrollView>
            </View>
          )
        ) : null}

        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {bill.congress_url ? (
            <Button
              title="Read on Congress.gov"
              icon="external-link"
              small
              variant="secondary"
              hint="Opens the official bill page in your browser"
              onPress={openCongress}
            />
          ) : null}
          <ReportSummary billId={bill.id} />
        </View>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <CommentsSection billId={bill.id} />
      </View>
    </Screen>
  );
}

function FindField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field
      value={value}
      onChangeText={onChange}
      placeholder="Find in bill text"
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      accessibilityLabel="Find in bill text"
    />
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every place the words appear in the whole bill (not just the preview), with a little context.
 *  Phones have no find-in-page, so this stands in for Ctrl+F. */
function TextMatches({ text, query }: { text: string; query: string }) {
  const re = new RegExp(escapeRegExp(query), 'gi');
  const matches: { before: string; hit: string; after: string; at: number }[] = [];
  let total = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    total++;
    if (matches.length < MAX_MATCHES) {
      const squash = (s: string) => s.replace(/\s+/g, ' ');
      matches.push({
        before: squash(text.slice(Math.max(0, m.index - 90), m.index)),
        hit: m[0],
        after: squash(text.slice(m.index + m[0].length, m.index + m[0].length + 90)),
        at: m.index,
      });
    }
  }
  return (
    <View style={{ gap: space.sm }}>
      <Txt style={type.small}>
        {total === 0
          ? `No matches for “${query}”`
          : `${total} match${total === 1 ? '' : 'es'}${total > MAX_MATCHES ? `, first ${MAX_MATCHES} shown` : ''}`}
      </Txt>
      <ScrollView style={styles.fullText} nestedScrollEnabled>
        {matches.map((m) => (
          <Txt key={m.at} style={[type.small, styles.match]} selectable>
            …{m.before}
            <Text style={styles.hit}>{m.hit}</Text>
            {m.after}…
          </Txt>
        ))}
      </ScrollView>
    </View>
  );
}

/** The bill's latest action, one line until tapped. */
function LatestAction({ text, color }: { text: string; color: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tap
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`Latest action: ${text}`}
      style={styles.latest}>
      <Text style={[styles.heroLatest, { color }]} numberOfLines={open ? undefined : 1}>
        <Text style={{ fontFamily: fonts.medium }}>Latest </Text>
        {text}
      </Text>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={color} />
    </Tap>
  );
}

/** Hashtags fold into one small pill; tapping it shows them all. */
function Hashtags({ tags }: { tags: string[] }) {
  const [open, setOpen] = useState(false);
  if (!tags.length) return null;
  return (
    <View style={styles.hashtags}>
      <Tap
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.hashtagToggle}>
        <Icon name="hash" size={14} color={colors.inkSoft} />
        <Txt style={styles.hashtagToggleText}>{tags.length} hashtags</Txt>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.inkSoft} />
      </Tap>
      {open
        ? tags.map((t) => (
            <Chip key={t} small label={`#${t}`} onPress={() => router.push({ pathname: '/search', params: { hashtag: t } })} />
          ))
        : null}
    </View>
  );
}

function ReportSummary({ billId }: { billId: string }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // One report per visit: after sending, the button says so instead of inviting a duplicate.
  if (sent) return <Button title="Mistake reported, thanks" icon="check" small variant="secondary" disabled />;
  if (!open) return <Button title="Report a summary mistake" icon="flag" small variant="secondary" onPress={() => setOpen(true)} />;

  const send = async () => {
    setBusy(true);
    try {
      await api(`/bills/${billId}/report-summary`, { method: 'POST', body: { feedback: feedback || null } });
      toast('Thanks, we’ll review this summary', 'success');
      setSent(true);
      setOpen(false);
      setFeedback('');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ width: '100%', gap: space.sm }}>
      <Field value={feedback} onChangeText={setFeedback} placeholder="What looks off? (optional)" multiline />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Send report" small onPress={send} loading={busy} />
        <Button title="Don’t report" small variant="ghost" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: space.lg, gap: space.md, marginTop: space.sm, borderRadius: radius.lg, borderCurve: 'continuous' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroLabel: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, letterSpacing: 0.3, flex: 1, ...figures },
  heroTitle: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 30 },
  heroSmall: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  trending: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  heroMeta: { gap: space.xs },
  // Pulled out into the header's padding so six step labels fit on a phone.
  heroTimeline: { gap: space.md, borderRadius: radius.md, borderCurve: 'continuous', padding: space.md, marginHorizontal: -space.sm },
  heroLatest: { flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  latest: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  heroMetaText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  heroLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', flexWrap: 'wrap', minHeight: 28 },
  heroLinkText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  figure: { ...figures },
  heroFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  hashtags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  hashtagToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  hashtagToggleText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: colors.inkSoft },
  disclaimer: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, borderCurve: 'continuous', padding: space.md },
  textLink: { fontFamily: fonts.medium, color: colors.ink, textDecorationLine: 'underline' },
  hit: { fontFamily: fonts.semibold, color: colors.ink, backgroundColor: colors.surfaceAlt },
  fullText: { maxHeight: 420, backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, borderCurve: 'continuous', padding: space.md },
  match: { color: colors.ink, fontFamily: fonts.regular, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
});
