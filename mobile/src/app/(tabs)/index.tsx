import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BillCard } from '@/components/BillCard';
import { BouncyPressable, Button, Empty, Icon, Loading, Screen, Segmented, Txt } from '@/components/ui';
import { useFeed, useMe } from '@/lib/queries';
import type { FeedSort } from '@/lib/types';
import { colors, radius, space, sticker, type } from '@/theme';

const SORTS: { key: FeedSort; label: string; icon: 'star' | 'message-circle' }[] = [
  { key: 'for_you', label: 'For you', icon: 'star' },
  { key: 'discussed', label: 'Most discussed', icon: 'message-circle' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Feed() {
  const [sort, setSort] = useState<FeedSort>('for_you');
  const feed = useFeed(sort);
  const { data: me } = useMe();
  const [refreshing, setRefreshing] = useState(false);
  const bills = feed.data?.pages.flatMap((p) => p.items) ?? [];

  const refresh = async () => {
    setRefreshing(true);
    await feed.refetch();
    setRefreshing(false);
  };

  return (
    <Screen padded={false}>
      <FlatList
        data={bills}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <BillCard bill={item} />}
        contentContainerStyle={styles.list}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.blue} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
            <Txt style={type.h2}>
              {greeting()}
              {me?.display_name ? `, ${me.display_name}` : ''}!
            </Txt>
            <Txt style={[type.small, { marginTop: -space.md + 2 }]}>Here’s what Congress is up to.</Txt>
            <BouncyPressable
              onPress={() => router.push('/calendar')}
              accessibilityRole="link"
              style={[styles.calendar, sticker(2, radius.md)]}>
              <Icon name="calendar" size={18} />
              <View style={{ flex: 1 }}>
                <Txt style={type.bodyBold}>This week on the floor</Txt>
                <Txt style={type.small}>What the House and Senate plan to vote on</Txt>
              </View>
              <Icon name="chevron-right" size={18} color={colors.inkSoft} />
            </BouncyPressable>
            <Segmented options={SORTS} value={sort} onChange={setSort} />
          </View>
        }
        ListEmptyComponent={
          feed.isLoading ? (
            <Loading label="Gathering bills…" />
          ) : feed.isError ? (
            <Empty
              icon="wifi-off"
              title="Couldn’t load your feed"
              body={feed.error.message}
              action={<Button title="Try again" small onPress={() => feed.refetch()} />}
            />
          ) : sort === 'discussed' ? (
            <Empty icon="message-circle" title="No discussions yet" body="Bills people are talking about show up here." />
          ) : (
            <Empty icon="inbox" title="No bills yet" body="New bills show up here after the next ingestion run." />
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={colors.blue} style={{ margin: space.lg }} />
          ) : bills.length && !feed.hasNextPage ? (
            <Txt style={[type.small, { textAlign: 'center', margin: space.lg }]}>You’re all caught up.</Txt>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  header: { paddingTop: space.md, paddingBottom: space.xl, gap: space.md },
  calendar: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: colors.surface },
  logo: { width: 150, height: 28 },
});
