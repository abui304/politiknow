import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { shortDate } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useBillRecord, useOpenRelated } from '@/lib/queries';
import { toast } from '@/lib/toast';
import type { OfficialRelated } from '@/lib/types';
import { colors, figures, fonts, space, type } from '@/theme';

import { Defined } from './Glossary';
import { Icon, Tap, Txt } from './ui';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;

/**
 * "From the official record": the Congressional Budget Office's cost estimates and the bills Congress itself
 * links to this one. Titles and descriptions are the official wording; no AI paraphrases the numbers.
 * Shows nothing when there's neither.
 */
export function OfficialRecord({ billId, congress, style }: { billId: string; congress: number; style?: object }) {
  const { data } = useBillRecord(billId);
  const fetchBill = useOpenRelated(billId);
  const [opening, setOpening] = useState<string | null>(null);
  if (!data || (!data.cbo_estimates.length && !data.related.length)) return null;
  const go = (id: string) => router.push({ pathname: '/bill/[id]', params: { id } });
  // Every linked bill opens in the app. One PolitiKNOW doesn't have yet is fetched and summarized first.
  const open = (r: OfficialRelated) => {
    if (r.bill_id) return go(r.bill_id);
    if (opening) return;
    setOpening(r.label);
    fetchBill.mutate(
      { congress: r.congress ?? congress, type: r.type, number: r.number },
      {
        onSuccess: (d) => go(d.bill_id),
        onError: (e) =>
          toast(
            e instanceof ApiError && e.status === 404 ? `${r.label} has no published text yet, so there’s nothing to summarize.` : e.message,
            'error',
            { label: 'Congress.gov', onPress: () => WebBrowser.openBrowserAsync(r.url) },
          ),
        onSettled: () => setOpening(null),
      },
    );
  };
  return (
    <View style={style}>
      <Txt style={type.h2}>From the official record</Txt>
      {data.cbo_estimates.length ? (
        <View style={{ gap: space.xs }}>
          <Txt style={styles.kicker}>What it would cost</Txt>
          {data.cbo_estimates.map((e) => (
            <Tap key={e.url} onPress={() => WebBrowser.openBrowserAsync(e.url)} accessibilityRole="link" style={styles.row} hitSlop={0}>
              <Icon name="dollar-sign" size={16} color={colors.inkSoft} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={type.bodyMedium}>{e.title ?? 'Cost estimate'}</Txt>
                <Txt style={type.small}>
                  {[e.description, e.date ? `Published ${shortDate(e.date)}` : null].filter(Boolean).join('. ')}
                </Txt>
                <Txt style={styles.link}>Read the estimate on CBO.gov</Txt>
              </View>
              <Icon name="external-link" size={14} color={colors.muted} />
            </Tap>
          ))}
          <Defined style={type.meta} text="Estimates by the Congressional Budget Office, Congress’s nonpartisan scorekeeper." />
        </View>
      ) : null}
      {data.related.length ? (
        <View style={{ gap: space.xs, marginTop: data.cbo_estimates.length ? space.md : 0 }}>
          <Txt style={styles.kicker}>Linked by Congress</Txt>
          {data.related.map((r) => (
            <Tap key={`${r.congress}-${r.label}`} onPress={() => open(r)} accessibilityRole="link" style={styles.row} hitSlop={0}>
              <Txt style={[styles.label, figures]}>{r.label}</Txt>
              <View style={{ flex: 1, gap: 2 }}>
                <Defined
                  style={type.meta}
                  text={[r.relationships.join(', '), r.congress && r.congress !== congress ? `${ordinal(r.congress)} Congress` : null]
                    .filter(Boolean)
                    .join(' · ')}
                />
                {r.title ? (
                  <Txt style={type.body} numberOfLines={2}>
                    {r.title}
                  </Txt>
                ) : null}
                {r.latest ? (
                  <Txt style={type.small} numberOfLines={1}>
                    {r.latest}
                  </Txt>
                ) : null}
                {opening === r.label ? <Txt style={type.meta}>Getting this bill and writing its summary…</Txt> : null}
              </View>
              {opening === r.label ? (
                <ActivityIndicator size="small" color={colors.inkSoft} accessibilityLabel={`Getting ${r.label}`} />
              ) : (
                <Icon name="chevron-right" size={14} color={colors.muted} />
              )}
            </Tap>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.line },
  link: { ...type.small, color: colors.ink, textDecorationLine: 'underline' },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.ink, minWidth: 72 },
});
