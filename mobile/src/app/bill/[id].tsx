import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PartyBadge, VoteControl } from '@/components/BillCard';
import { BillTimeline } from '@/components/BillTimeline';
import { CommentsSection } from '@/components/Comments';
import { BouncyPressable, Button, Card, Chip, Empty, Field, Icon, Loading, Screen, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useBill, useBillText } from '@/lib/queries';
import { shareBill } from '@/lib/share';
import { toast, toastError } from '@/lib/toast';
import { colors, fonts, partyColors, radius, space, sticker, type } from '@/theme';

const FULL_TEXT_PREVIEW = 20_000;

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: bill, isLoading, error } = useBill(id);
  const [level, setLevel] = useState<'simple' | 'detailed'>('simple');
  const [showText, setShowText] = useState(false);
  const text = useBillText(id, showText);

  useEffect(() => {
    api(`/bills/${id}/view`, { method: 'POST' }).catch(() => {});
  }, [id]);

  if (isLoading) return <Loading />;
  if (!bill) {
    return (
      <Screen>
        <TopBar />
        <Empty icon="file-minus" title="Bill not found" body={error?.message} />
      </Screen>
    );
  }

  const p = partyColors(bill.sponsor_party);
  const summary = level === 'simple' ? bill.summary_simple : bill.summary_detailed;
  const sponsorId = bill.sponsor_id;
  const openCongress = () => bill.congress_url && WebBrowser.openBrowserAsync(bill.congress_url);

  return (
    <Screen scroll>
      <TopBar
        title={bill.label}
        right={
          <BouncyPressable onPress={() => shareBill(bill)} style={[styles.iconBtn, sticker(2, radius.pill)]} accessibilityLabel="Share">
            <Icon name="share" size={18} />
          </BouncyPressable>
        }
      />

      <View style={[styles.hero, sticker(4), { backgroundColor: p.main }]}>
        <View style={styles.heroTop}>
          <PartyBadge code={bill.sponsor_party} />
          <Text style={styles.heroLabel}>{bill.label}</Text>
          {bill.is_trending ? <Chip label="Trending" selected color={colors.yellow} /> : null}
        </View>
        <Text style={styles.heroTitle}>{bill.title}</Text>
        <View style={styles.heroTimeline}>
          <BillTimeline bill={bill} onDark />
          {bill.latest_action_text ? (
            <Text style={styles.heroLatest} numberOfLines={3}>
              Latest: {bill.latest_action_text}
            </Text>
          ) : null}
        </View>
        <View style={styles.heroMeta}>
          {bill.sponsor_name ? (
            sponsorId ? (
              <BouncyPressable
                onPress={() => router.push({ pathname: '/legislator/[id]', params: { id: sponsorId } })}
                accessibilityRole="link"
                style={styles.heroLink}>
                <Text style={styles.heroMetaText}>Sponsor: </Text>
                <Text style={styles.heroLinkText}>{bill.sponsor_name}</Text>
                <Icon name="chevron-right" size={15} color="#fff" />
              </BouncyPressable>
            ) : (
              <Text style={styles.heroMetaText}>Sponsor: {bill.sponsor_name}</Text>
            )
          ) : null}
          {bill.cosponsor_count > 0 ? (
            <BouncyPressable
              onPress={() => router.push({ pathname: '/cosponsors/[id]', params: { id: bill.id } })}
              accessibilityRole="link"
              style={styles.heroLink}>
              <Icon name="users" size={15} color="#fff" />
              <Text style={styles.heroLinkText}>Cosponsors ({bill.cosponsor_count})</Text>
              <Icon name="chevron-right" size={15} color="#fff" />
            </BouncyPressable>
          ) : null}
        </View>
        <View style={styles.heroFooter}>
          <VoteControl bill={bill} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="message-circle" size={17} color="#fff" />
            <Text style={styles.heroMetaText}>{bill.comment_count}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tags}>
        {bill.primary_tags.map((t) => (
          <Chip key={t} label={t} selected color={p.soft} />
        ))}
        {bill.sub_tags.map((t) => (
          <Chip key={t} label={`#${t}`} onPress={() => router.push({ pathname: '/search', params: { hashtag: t } })} />
        ))}
      </View>

      <Card style={{ gap: space.md, marginTop: space.lg }}>
        <View style={[styles.segment, sticker(2, radius.pill)]}>
          {(['simple', 'detailed'] as const).map((l) => (
            <BouncyPressable
              key={l}
              onPress={() => setLevel(l)}
              accessibilityRole="tab"
              accessibilityState={{ selected: level === l }}
              style={[styles.segmentBtn, level === l && { backgroundColor: p.main }]}>
              <Text style={[styles.segmentText, level === l && { color: '#fff' }]}>
                {l === 'simple' ? 'Simple' : 'Detailed'}
              </Text>
            </BouncyPressable>
          ))}
        </View>
        <Txt style={type.body}>{summary ?? 'Summary coming soon.'}</Txt>

        <BouncyPressable onPress={() => setShowText((s) => !s)} style={styles.disclaimer}>
          <Txt style={[type.small, { color: colors.ink }]}>
            This summary was generated by AI and may contain inaccuracies.{' '}
            <Txt style={[type.small, { color: colors.blue, fontFamily: fonts.extrabold }]}>
              {showText ? 'Hide the full bill text.' : 'Tap to view the full bill text.'}
            </Txt>
          </Txt>
        </BouncyPressable>

        {showText ? (
          text.isLoading ? (
            <Loading label="Fetching bill text…" />
          ) : (
            <ScrollView style={styles.fullText} nestedScrollEnabled>
              <Txt style={[type.small, { color: colors.ink, fontFamily: fonts.regular }]} selectable>
                {(text.data?.full_text ?? 'Full text unavailable.').slice(0, FULL_TEXT_PREVIEW)}
              </Txt>
              {(text.data?.full_text?.length ?? 0) > FULL_TEXT_PREVIEW ? (
                <Txt style={[type.small, { marginTop: space.md }]}>…continued on Congress.gov</Txt>
              ) : null}
            </ScrollView>
          )
        ) : null}

        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {bill.congress_url ? <Button title="Congress.gov" icon="external-link" small variant="secondary" onPress={openCongress} /> : null}
          <ReportSummary billId={bill.id} />
        </View>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <CommentsSection billId={bill.id} />
      </View>
    </Screen>
  );
}

function ReportSummary({ billId }: { billId: string }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return <Button title="Report inaccuracy" icon="flag" small variant="secondary" onPress={() => setOpen(true)} />;

  const send = async () => {
    setBusy(true);
    try {
      await api(`/bills/${billId}/report-summary`, { method: 'POST', body: { feedback: feedback || null } });
      toast('Thanks! We’ll review this summary.', 'success');
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
        <Button title="Send report" small onPress={send} loading={busy} color={colors.red} />
        <Button title="Cancel" small variant="ghost" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  hero: { padding: space.lg, gap: space.md, marginTop: space.sm },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroLabel: { fontFamily: fonts.black, color: '#fff', fontSize: 16, flex: 1 },
  heroTitle: { fontFamily: fonts.black, color: '#fff', fontSize: 22, lineHeight: 28 },
  heroMeta: { gap: 4 },
  heroTimeline: { gap: space.sm, backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: radius.md, padding: space.md },
  heroLatest: { fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },
  heroMetaText: { fontFamily: fonts.bold, color: 'rgba(255,255,255,0.92)', fontSize: 14 },
  heroLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', flexWrap: 'wrap' },
  heroLinkText: { fontFamily: fonts.extrabold, color: '#fff', fontSize: 14, textDecorationLine: 'underline' },
  heroFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.35)', paddingTop: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.lg },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, padding: 3 },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  segmentText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  disclaimer: { backgroundColor: '#FFF6D6', borderRadius: radius.md, padding: space.md, borderWidth: 2, borderColor: colors.yellow, borderStyle: 'dashed' },
  fullText: { maxHeight: 420, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: space.md },
});
