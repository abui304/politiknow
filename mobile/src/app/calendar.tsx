import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, DocketTag, Empty, Icon, Loading, Screen, Tap, TopBar, Txt } from '@/components/ui';
import { calendarDate } from '@/lib/format';
import { useCalendar } from '@/lib/queries';
import type { FloorItem } from '@/lib/types';
import { colors, fonts, space, type } from '@/theme';

/** This week's House and Senate floor schedule, with links to the bills PolitiKNOW has. */
export default function Calendar() {
  const { data: week, isLoading, error, refetch, isRefetching } = useCalendar();

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.inkSoft} />}>
        <TopBar title="This week on the floor" />
        {isLoading ? (
          <Loading label="Checking the schedule…" />
        ) : !week ? (
          <Empty
            icon="wifi-off"
            title="Couldn’t load the schedule"
            body={error?.message}
            action={<Button title="Reload the schedule" small onPress={() => refetch()} />}
          />
        ) : (
          <View style={{ gap: space.xl }}>
            <Txt style={type.small}>
              Week of {calendarDate(week.week_of)}. Schedules change often, so open a bill to read it before the vote.
            </Txt>
            <Chamber
              title="House"
              items={week.house}
              empty="Nothing is scheduled for the House floor this week. It may be on recess."
              source={week.house_url}
            />
            <Chamber
              title="Senate"
              items={week.senate}
              empty="The Senate hasn’t posted its next meeting yet."
              source={week.senate_url}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Chamber({
  title,
  items,
  empty,
  source,
}: {
  title: string;
  items: FloorItem[];
  empty: string;
  source: string;
}) {
  // The House groups bills by how they'll be considered; keep its categories together.
  const groups: { heading: string; items: FloorItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.heading === item.heading) last.items.push(item);
    else groups.push({ heading: item.heading, items: [item] });
  }
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.chamberHead}>
        <Txt style={[type.h2, { flex: 1 }]}>{title}</Txt>
        <Tap onPress={() => WebBrowser.openBrowserAsync(source)} accessibilityRole="link" style={styles.source}>
          <Txt style={styles.sourceText}>Source</Txt>
          <Icon name="external-link" size={14} color={colors.inkSoft} />
        </Tap>
      </View>
      {groups.length ? (
        groups.map((g) => (
          <Card key={g.heading} style={{ gap: space.md }}>
            <Txt style={[type.small, { fontFamily: fonts.medium }]}>{g.heading}</Txt>
            {g.items.map((item, i) => (
              <Item key={`${item.text}-${i}`} item={item} />
            ))}
          </Card>
        ))
      ) : (
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <Icon name="coffee" size={18} color={colors.inkSoft} />
            <Txt style={[type.small, { flex: 1 }]}>{empty}</Txt>
          </View>
          <Button
            title="See bills close to becoming law"
            small
            variant="secondary"
            onPress={() => router.navigate({ pathname: '/search', params: { stage: 'president' } })}
            style={{ alignSelf: 'flex-start' }}
          />
        </Card>
      )}
    </View>
  );
}

function Item({ item }: { item: FloorItem }) {
  const [open, setOpen] = useState(false);
  const long = item.text.length > 160;
  return (
    <View style={styles.item}>
      <Tap
        disabled={!long}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole={long ? 'button' : undefined}
        accessibilityState={long ? { expanded: open } : undefined}>
        <Txt style={type.body} numberOfLines={open || !long ? undefined : 3}>
          {item.text}
        </Txt>
      </Tap>
      {item.bills.length ? (
        <View style={styles.bills}>
          {item.bills.map((b) => {
            const billId = b.bill_id;
            return billId ? (
              <DocketTag key={b.label} label={b.label} onPress={() => router.push({ pathname: '/bill/[id]', params: { id: billId } })} />
            ) : (
              <DocketTag key={b.label} label={b.label} muted />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center', gap: space.md },
  chamberHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  source: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.xs },
  sourceText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.inkSoft, textDecorationLine: 'underline' },
  item: { gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line },
  bills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
