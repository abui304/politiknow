import { StyleSheet, Text, View } from 'react-native';

import { calendarDate, stepDate } from '@/lib/format';
import type { Bill } from '@/lib/types';
import { colors, figures, fonts, onAlpha, partyColors } from '@/theme';

const DOT = 12;
const CURRENT = 20;
const LINE = 2;

/** A bill's path through Congress as a row of steps, with the date each one happened.
 *  `onDark` is for the party-colored header on the bill page. */
export function BillTimeline({ bill, onDark = false }: { bill: Bill; onDark?: boolean }) {
  const steps = bill.timeline;
  const current = steps.reduce((last, s, i) => (s.reached ? i : last), 0);
  const p = partyColors(bill.sponsor_party);
  const on = onDark ? p.on : p.main;
  const off = onDark ? onAlpha(p, 0.3) : colors.hairline;
  const ring = onDark ? onAlpha(p, 0.3) : p.soft;
  const text = onDark ? p.on : colors.ink;
  const muted = onDark ? onAlpha(p, 0.8) : colors.muted;
  const summary = steps
    .map((s) => `${s.label}${s.reached ? (s.date ? `, ${calendarDate(s.date)}` : ', done') : ', not yet'}`)
    .join('; ');

  return (
    <View style={styles.row} accessible accessibilityLabel={`Timeline: ${summary}`}>
      {steps.map((s, i) => {
        const isCurrent = i === current;
        return (
          <View key={s.stage} style={styles.step}>
            <View style={styles.track}>
              <View style={[styles.line, { backgroundColor: i === 0 ? 'transparent' : s.reached ? on : off }]} />
              {isCurrent ? (
                <View style={[styles.current, { backgroundColor: ring }]}>
                  <View style={[styles.dot, { backgroundColor: on }]} />
                </View>
              ) : (
                <View
                  style={[
                    styles.dot,
                    s.reached ? { backgroundColor: on } : { borderWidth: LINE, borderColor: off, backgroundColor: 'transparent' },
                  ]}
                />
              )}
              <View
                style={[
                  styles.line,
                  { backgroundColor: i === steps.length - 1 ? 'transparent' : steps[i + 1].reached ? on : off },
                ]}
              />
            </View>
            {/* Labels may spill a little past their sixth of the row ("Committee" sits between the short "Intro"
                and "House"), so they're never cut off. */}
            <View style={styles.labels}>
              <Text numberOfLines={1} style={[styles.label, { color: s.reached ? text : muted }, isCurrent && styles.labelCurrent]}>
                {s.short}
              </Text>
              <Text numberOfLines={1} style={[styles.date, { color: muted }]}>
                {s.date ? stepDate(s.date) : ' '}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Bleeds a little into the card's padding so six labels fit on a phone.
  row: { flexDirection: 'row', marginHorizontal: -12 },
  step: { flex: 1, alignItems: 'center', minWidth: 0, overflow: 'visible' },
  labels: { width: 76, alignItems: 'center' },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', height: CURRENT },
  line: { flex: 1, height: LINE },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  current: { width: CURRENT, height: CURRENT, borderRadius: CURRENT / 2, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, marginTop: 4 },
  labelCurrent: { fontFamily: fonts.semibold },
  date: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, ...figures },
});
