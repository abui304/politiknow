import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BillCard } from '@/components/BillCard';
import { Button, Empty, Loading, Screen, Txt } from '@/components/ui';
import { useFeed, useMe } from '@/lib/queries';
import { colors, space, type } from '@/theme';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Feed() {
  const feed = useFeed();
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
            <Txt style={[type.h2, { marginTop: space.md }]}>
              {greeting()}
              {me?.display_name ? `, ${me.display_name}` : ''}!
            </Txt>
            <Txt style={[type.small, { marginTop: 2 }]}>Here’s what Congress is up to.</Txt>
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
  header: { paddingTop: space.md, paddingBottom: space.xl },
  logo: { width: 150, height: 28 },
});
