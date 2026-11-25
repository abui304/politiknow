import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { LegislatorRow } from '@/components/LegislatorRow';
import { Button, Empty, Screen, SkeletonList, TopBar, Txt } from '@/components/ui';
import { shortDate } from '@/lib/format';
import { useBill, useBillCosponsors } from '@/lib/queries';
import { space, type } from '@/theme';

/** Every current cosponsor of a bill. Route param `id` is the bill id. */
export default function Cosponsors() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: bill } = useBill(id);
  const { data: cosponsors, isLoading, error } = useBillCosponsors(id);

  return (
    <Screen padded={false}>
      <FlatList
        data={cosponsors ?? []}
        keyExtractor={(c) => c.bioguide_id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={
          <View style={{ gap: space.xs, paddingBottom: space.lg }}>
            <TopBar title={bill ? `${bill.label} cosponsors` : 'Cosponsors'} />
            {bill ? (
              <Txt style={type.small} numberOfLines={2}>
                {bill.title}
              </Txt>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <LegislatorRow
            legislator={item}
            note={item.is_original ? 'Original cosponsor' : item.sponsorship_date ? `Joined ${shortDate(item.sponsorship_date)}` : undefined}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <SkeletonList kind="row" count={4} />
          ) : (
            <Empty
              icon="users"
              title="No cosponsors"
              body={error?.message ?? 'No one else has signed on to this bill yet.'}
              action={<Button title="Back to the bill" small variant="secondary" onPress={() => router.back()} />}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
});
