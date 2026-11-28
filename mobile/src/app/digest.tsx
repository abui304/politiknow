import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { SteamCup } from '@/components/SteamCup';
import { RollCallCard } from '@/components/Votes';
import { Button, Empty, Icon, Screen, SkeletonList, Tap, TopBar, Txt } from '@/components/ui';
import { track } from '@/lib/events';
import { useDigest, useMe, useUpdateMe } from '@/lib/queries';
import { toast, toastError } from '@/lib/toast';
import type { DigestBill } from '@/lib/types';
import { colors, figures, fonts, partyColors, space, type } from '@/theme';

/**
 * The weekly recap. Built by fixed rules (followed bills that moved, how your
 * members voted, what passed, what's coming up that's yours), the same for everyone, with nothing chosen by AI.
 * It ends, on purpose: there's no infinite scroll here.
 */
export default function DigestScreen() {
  const { data, isLoading } = useDigest();
  useEffect(() => track('recap_open'), []);
  const week = data ? new Date(`${data.week_start}T12:00:00`) : null;

  return (
    <Screen scroll>
      <TopBar title="Weekly recap" />
      {week ? (
        <Txt style={[type.meta, { marginBottom: space.md }]}>
          {`Week of ${week.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`}
        </Txt>
      ) : null}

      {isLoading ? <SkeletonList kind="row" count={4} /> : null}

      {data?.is_empty ? (
        <Empty
          art={<SteamCup size={28} />}
          title="A quiet week"
          body="Nothing you follow moved, and no bill passed a chamber this week. Follow a few bills and your members of Congress, and next week’s recap will be about them."
          action={<Button title="See this week on the floor" small variant="secondary" icon="calendar" onPress={() => router.push('/calendar')} />}
        />
      ) : null}

      {data?.followed.length ? (
        <Section title="Bills you follow that moved">
          {data.followed.map((b) => (
            <BillLine key={b.id} bill={b} />
          ))}
        </Section>
      ) : null}

      {data && (data.votes.length || data.has_members) ? (
        <Section title="How your members voted">
          {data.votes.length ? null : (
            <Txt style={[type.body, { color: colors.inkSoft }]}>
              Your members cast no votes on final passage or cloture this week.
            </Txt>
          )}
          {data.votes.map((rc) => (
            <View key={rc.id}>
              <RollCallCard rc={rc} showMeasure />
              {rc.bill_id ? (
                <Button
                  title={`Open ${rc.measure ?? 'the bill'}`}
                  small
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/bill/[id]', params: { id: rc.bill_id as string } })}
                  style={{ alignSelf: 'flex-start' }}
                />
              ) : null}
            </View>
          ))}
          <Tap onPress={() => router.push('/profile')} accessibilityRole="link" style={styles.calendarLink} hitSlop={0}>
            <Icon name="user" size={16} color={colors.inkSoft} />
            <Txt style={[type.small, { flex: 1 }]}>All their recent votes</Txt>
            <Icon name="chevron-right" size={16} color={colors.muted} />
          </Tap>
        </Section>
      ) : null}

      {data?.passed.length ? (
        <Section title="What Congress passed">
          {data.passed.map((b) => (
            <BillLine key={b.id} bill={b} />
          ))}
        </Section>
      ) : null}

      {data?.coming_up.length ? (
        <Section title="Coming up for a vote">
          {data.coming_up.map((b) => (
            <BillLine key={b.id} bill={b} />
          ))}
        </Section>
      ) : null}

      {data && !data.is_empty && data.floor_count ? (
        <Tap onPress={() => router.push('/calendar')} accessibilityRole="link" style={styles.calendarLink} hitSlop={0}>
          <Icon name="calendar" size={16} color={colors.inkSoft} />
          <Txt style={[type.small, { flex: 1 }]}>
            {data.floor_count === 1 ? '1 bill is' : `${data.floor_count} bills are`} on this week’s floor schedule
          </Txt>
          <Icon name="chevron-right" size={16} color={colors.muted} />
        </Tap>
      ) : null}

      {data && !data.is_empty ? (
        <View style={styles.end}>
          <Txt style={type.bodyMedium}>That’s your week.</Txt>
          <Txt style={type.small}>
            Every item here is picked by the same rules for everyone: bills you follow first, then your members’ votes,
            then what passed, then scheduled votes on bills that are yours. Nothing is chosen by AI.
          </Txt>
          <EmailOptIn />
        </View>
      ) : null}
    </Screen>
  );
}

/** Offered once, at the end of the recap: get it by email on Saturdays instead of remembering to look. */
function EmailOptIn() {
  const { data: me } = useMe();
  const update = useUpdateMe();
  if (!me?.email) return null;
  return (
    <View style={styles.optIn}>
      <Icon name="mail" size={16} color={colors.inkSoft} />
      <Txt style={[type.small, { flex: 1 }]}>{`Email me this recap on Saturday mornings (${me.email})`}</Txt>
      <Switch
        value={me.recap_email}
        onValueChange={(v) =>
          update.mutate(
            { recap_email: v },
            { onSuccess: () => toast(v ? 'You’ll get it by email on Saturdays' : 'Recap emails turned off', 'success'), onError: toastError },
          )
        }
        trackColor={{ true: colors.ink, false: colors.hairline }}
        thumbColor={colors.surface}
        accessibilityLabel="Weekly recap by email"
        {...({ activeThumbColor: colors.surface } as object)}
      />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt style={type.h2}>{title}</Txt>
      {children}
    </View>
  );
}

function BillLine({ bill }: { bill: DigestBill }) {
  const p = partyColors(bill.sponsor_party);
  return (
    <Tap onPress={() => router.push({ pathname: '/bill/[id]', params: { id: bill.id } })} accessibilityRole="link" style={styles.bill} hitSlop={0}>
      <View style={[styles.label, { backgroundColor: p.main }]}>
        <Txt style={[styles.labelText, { color: p.on }]}>{bill.label}</Txt>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={type.bodyMedium}>{bill.what}</Txt>
        <Txt style={type.small} numberOfLines={2}>
          {bill.title}
        </Txt>
      </View>
      <Icon name="chevron-right" size={16} color={colors.muted} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm, marginTop: space.xl },
  bill: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.line },
  label: { paddingHorizontal: space.sm, paddingVertical: 2, minWidth: 76, alignItems: 'center', borderRadius: 4, borderCurve: 'continuous' },
  labelText: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, ...figures },
  calendarLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  end: { gap: space.sm, marginTop: space.xxl, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.ink },
  optIn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
});
