import { StyleSheet, Text, View } from 'react-native';

import { calendarDate, numericDate } from '@/lib/format';
import type { Bill } from '@/lib/types';
import { colors, fonts, partyColors } from '@/theme';

const DOT = 14;
const LINE = 3;

/** A bill's path through Congress as a row of steps, with the date each one happened.
 *  `onDark` is for the party-colored header on the bill page. */
export function BillTimeline({ bill, onDark = false }: { bill: Bill; onDark?: boolean }) {
  const steps = bill.timeline;
  const current = steps.reduce((last, s, i) => (s.reached ? i : last), 0);
  const p = partyColors(bill.sponsor_party);
  const on = onDark ? '#fff' : p.main;
  const off = onDark ? 'rgba(255,255,255,0.35)' : colors.hairline;
  const text = onDark ? '#fff' : colors.ink;
  const muted = onDark ? 'rgba(255,255,255,0.6)' : colors.muted;
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
              <View
                style={[
                  styles.dot,
                  s.reached
                    ? { backgroundColor: on, borderColor: colors.line }
                    : { backgroundColor: onDark ? 'transparent' : colors.surface, borderColor: off },
                  isCurrent && styles.dotCurrent,
                ]}
              />
              <View
                style={[
                  styles.line,
                  { backgroundColor: i === steps.length - 1 ? 'transparent' : steps[i + 1].reached ? on : off },
                ]}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.label, { color: s.reached ? text : muted }, isCurrent && styles.labelCurrent]}>
              {s.short}
            </Text>
            <Text numberOfLines={1} style={[styles.date, { color: s.reached ? text : muted }]}>
              {s.date ? numericDate(s.date) : ' '}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Bleeds a little into the card's padding so six labels fit on a phone.
  row: { flexDirection: 'row', marginHorizontal: -10 },
  step: { flex: 1, alignItems: 'center', minWidth: 0 },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', height: DOT + 6 },
  line: { flex: 1, height: LINE },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2 },
  dotCurrent: { width: DOT + 6, height: DOT + 6, borderRadius: (DOT + 6) / 2, borderWidth: 3 },
  label: { fontFamily: fonts.bold, fontSize: 10, marginTop: 4 },
  labelCurrent: { fontFamily: fonts.black },
  date: { fontFamily: fonts.semibold, fontSize: 10, marginTop: 1 },
});
