import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BillCard } from '@/components/BillCard';
import { FeedRail } from '@/components/FeedRail';
import { SinceStrip } from '@/components/SinceStrip';
import { Logo } from '@/components/Logo';
import { useCommandMenu } from '@/components/CommandMenu';
import { hasKeyboard } from '@/lib/device';
import { Button, Empty, Icon, Keycap, MOD_KEY, Screen, Segmented, SkeletonList, Tap, Title, Txt } from '@/components/ui';
import { useRail, useWide } from '@/lib/layout';
import { useFeed } from '@/lib/queries';
import type { FeedSort } from '@/lib/types';
import { colors, outline, PAGE_MAX_WIDTH, radius, space, type } from '@/theme';

const SORTS: {
  key: FeedSort;
  label: string;
  icon: 'star' | 'message-circle';
}[] = [
  { key: 'for_you', label: 'For you', icon: 'star' },
  { key: 'discussed', label: 'Most discussed', icon: 'message-circle' },
];

/** Today as "Wednesday, November 25", the context line above the feed's title. */
function today() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function Feed() {
  const [sort, setSort] = useState<FeedSort>('for_you');
  const feed = useFeed(sort);
  const [refreshing, setRefreshing] = useState(false);
  const bills = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const wide = useWide();
  const rail = useRail();

  const refresh = async () => {
    setRefreshing(true);
    await feed.refetch();
    setRefreshing(false);
  };

  return (
    <Screen padded={false} width="wide">
      <View style={styles.columns}>
        <FlatList
          style={{ flex: 1 }}
          data={bills}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => <BillCard bill={item} />}
          contentContainerStyle={[styles.list, wide && styles.listWide]}
          onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
          onEndReachedThreshold={0.6}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.inkSoft} />}
          ListHeaderComponent={
            <View style={styles.header}>
              {wide ? null : (
                <View style={styles.brandRow}>
                  <Logo size={20} />
                  {hasKeyboard ? (
                    <Tap
                      onPress={() => useCommandMenu.getState().set(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Jump to a page, bill or member of Congress"
                      style={styles.jump}>
                      <Icon name="search" size={14} color={colors.inkSoft} />
                      <Txt style={type.small}>Jump to</Txt>
                      <Keycap>{`${MOD_KEY} K`}</Keycap>
                    </Tap>
                  ) : null}
                </View>
              )}
              <View style={styles.heading}>
                <Txt style={type.meta}>{today()}</Txt>
                <Title>What Congress is up to</Title>
              </View>
              <SinceStrip />
              {rail ? null : (
                <Tap
                  onPress={() => router.push('/calendar')}
                  accessibilityRole="link"
                  accessibilityLabel="See this week’s floor schedule"
                  style={styles.calendar}>
                  <View style={styles.calendarIcon}>
                    <Icon name="calendar" size={18} color={colors.inkSoft} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt style={type.bodyMedium}>Floor schedule</Txt>
                    <Txt style={type.small}>This week’s votes</Txt>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.muted} />
                </Tap>
              )}
              <Segmented options={SORTS} value={sort} onChange={setSort} />
            </View>
          }
          ListEmptyComponent={
            feed.isLoading ? (
              <SkeletonList count={3} />
            ) : feed.isError ? (
              <Empty
                icon="wifi-off"
                title="Couldn’t load your feed"
                body={feed.error.message}
                action={<Button title="Reload feed" icon="refresh-cw" small onPress={() => feed.refetch()} />}
              />
            ) : sort === 'discussed' ? (
              <Empty
                icon="message-circle"
                title="No discussions yet"
                body="Bills people are talking about show up here."
                action={<Button title="See bills picked for you" small onPress={() => setSort('for_you')} />}
              />
            ) : (
              <Empty
                icon="inbox"
                title="No bills yet"
                body="New bills arrive several times a day. Meanwhile, search everything Congress has filed."
                action={<Button title="Search all bills" icon="search" small onPress={() => router.navigate('/search')} />}
              />
            )
          }
          ListFooterComponent={
            feed.isFetchingNextPage ? (
              <ActivityIndicator color={colors.inkSoft} style={{ margin: space.lg }} />
            ) : bills.length && !feed.hasNextPage ? (
              <Txt style={[type.meta, { textAlign: 'center', margin: space.lg }]}>You’re all caught up</Txt>
            ) : null
          }
        />
        {rail ? <FeedRail /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  columns: {
    flex: 1,
    flexDirection: 'row',
    gap: space.xxl,
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  listWide: { maxWidth: PAGE_MAX_WIDTH, paddingHorizontal: space.xl },
  header: { paddingTop: space.md, paddingBottom: space.xl, gap: space.lg },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 32,
    paddingLeft: space.md,
    paddingRight: space.xs,
    backgroundColor: colors.surface,
    ...outline(radius.sm),
  },
  heading: { gap: space.xs, marginTop: space.sm },
  calendar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    ...outline(radius.md),
  },
  calendarIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
});
