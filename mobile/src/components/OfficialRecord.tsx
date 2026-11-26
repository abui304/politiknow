import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';

import { shortDate } from '@/lib/format';
import { useBillRecord } from '@/lib/queries';
import type { OfficialRelated } from '@/lib/types';
import { colors, figures, fonts, space, type } from '@/theme';

import { Icon, Tap, Txt } from './ui';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;

/**
 * "From the official record": the Congressional Budget Office's cost estimates and the bills Congress itself
 * links to this one. Titles and descriptions are the official wording; no AI paraphrases the numbers.
 * Shows nothing when there's neither.
 */
export function OfficialRecord({ billId, congress, style }: { billId: string; congress: number; style?: object }) {
  const { data } = useBillRecord(billId);
  if (!data || (!data.cbo_estimates.length && !data.related.length)) return null;
  const open = (r: OfficialRelated) =>
    r.bill_id ? router.push({ pathname: '/bill/[id]', params: { id: r.bill_id } }) : WebBrowser.openBrowserAsync(r.url);
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
          <Txt style={type.meta}>Estimates by the Congressional Budget Office, Congress’s nonpartisan scorekeeper.</Txt>
        </View>
      ) : null}
      {data.related.length ? (
        <View style={{ gap: space.xs, marginTop: data.cbo_estimates.length ? space.md : 0 }}>
          <Txt style={styles.kicker}>Linked by Congress</Txt>
          {data.related.map((r) => (
            <Tap key={`${r.congress}-${r.label}`} onPress={() => open(r)} accessibilityRole="link" style={styles.row} hitSlop={0}>
              <Txt style={[styles.label, figures]}>{r.label}</Txt>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={type.meta}>
                  {[r.relationships.join(', '), r.congress && r.congress !== congress ? `${ordinal(r.congress)} Congress` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Txt>
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
              </View>
              <Icon name={r.bill_id ? 'chevron-right' : 'external-link'} size={14} color={colors.muted} />
            </Tap>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, letterSpacing: 0.4, color: colors.inkSoft, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.line },
  link: { ...type.small, color: colors.ink, textDecorationLine: 'underline' },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.ink, minWidth: 72 },
});
