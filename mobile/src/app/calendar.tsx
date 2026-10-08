import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BouncyPressable, Button, Card, Chip, Empty, Icon, Loading, Screen, TopBar, Txt } from '@/components/ui';
import { calendarDate } from '@/lib/format';
import { useCalendar } from '@/lib/queries';
import type { FloorItem } from '@/lib/types';
import { colors, fonts, radius, space, sticker, type } from '@/theme';

/** This week's House and Senate floor schedule, with links to the bills PolitiKNOW has. */
export default function Calendar() {
  const { data: week, isLoading, error, refetch, isRefetching } = useCalendar();

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.blue} />}>
        <TopBar title="This week on the floor" />
        {isLoading ? (
          <Loading label="Checking the schedule…" />
        ) : !week ? (
          <Empty
            icon="wifi-off"
            title="Couldn’t load the schedule"
            body={error?.message}
            action={<Button title="Try again" small onPress={() => refetch()} />}
          />
        ) : (
          <View style={{ gap: space.xl }}>
            <Txt style={type.small}>
              Week of {calendarDate(week.week_of)}. Schedules change often; tap a bill to read it before the vote.
            </Txt>
            <Chamber
              title="House"
              color={colors.mint}
              items={week.house}
              empty="Nothing is scheduled for the House floor this week. It may be on recess."
              source={week.house_url}
            />
            <Chamber
              title="Senate"
              color={colors.lilac}
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
  color,
  items,
  empty,
  source,
}: {
  title: string;
  color: string;
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
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Txt style={[type.h2, { flex: 1 }]}>{title}</Txt>
        <BouncyPressable onPress={() => WebBrowser.openBrowserAsync(source)} accessibilityRole="link" style={styles.source}>
          <Txt style={styles.sourceText}>Source</Txt>
          <Icon name="external-link" size={13} color={colors.inkSoft} />
        </BouncyPressable>
      </View>
      {groups.length ? (
        groups.map((g) => (
          <Card key={g.heading} style={{ gap: space.md }} offset={2}>
            <Txt style={type.tiny}>{g.heading.toUpperCase()}</Txt>
            {g.items.map((item, i) => (
              <Item key={`${item.text}-${i}`} item={item} />
            ))}
          </Card>
        ))
      ) : (
        <Card offset={2} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <Icon name="coffee" size={18} color={colors.inkSoft} />
          <Txt style={[type.small, { flex: 1 }]}>{empty}</Txt>
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
      <BouncyPressable
        disabled={!long}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole={long ? 'button' : undefined}
        accessibilityState={long ? { expanded: open } : undefined}>
        <Txt style={type.body} numberOfLines={open || !long ? undefined : 3}>
          {item.text}
        </Txt>
      </BouncyPressable>
      {item.bills.length ? (
        <View style={styles.bills}>
          {item.bills.map((b) => {
            const billId = b.bill_id;
            return billId ? (
              <Chip
                key={b.label}
                small
                selected
                color={colors.yellow}
                label={b.label}
                onPress={() => router.push({ pathname: '/bill/[id]', params: { id: billId } })}
              />
            ) : (
              <Chip key={b.label} small label={b.label} />
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
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.line },
  source: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, ...sticker(2, radius.pill), backgroundColor: colors.surface },
  sourceText: { fontFamily: fonts.bold, fontSize: 12, color: colors.inkSoft },
  item: { gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.hairline },
  bills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
