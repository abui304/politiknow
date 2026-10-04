import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { BillCard } from '@/components/BillCard';
import { Chip, Empty, Field, Loading, Screen, Txt } from '@/components/ui';
import { useSearch, useTags } from '@/lib/queries';
import { colors, space, type } from '@/theme';

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Search() {
  const [text, setText] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const q = useDebounced(text.trim());
  const { data: tags } = useTags();
  const results = useSearch(q, tag);
  const bills = results.data?.pages.flatMap((p) => p.items) ?? [];
  const searching = Boolean(q || tag);

  return (
    <Screen padded={false}>
      <FlatList
        data={searching ? bills : []}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <BillCard bill={item} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => results.hasNextPage && !results.isFetchingNextPage && results.fetchNextPage()}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingTop: space.md, paddingBottom: space.lg }}>
            <Txt style={type.title}>Search</Txt>
            <Field value={text} onChangeText={setText} placeholder="Search bill titles…" returnKeyType="search" autoCorrect={false} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingRight: 8 }}>
              {tags?.map((t) => (
                <Chip
                  key={t.name}
                  label={t.name}
                  selected={tag === t.name}
                  color={colors.mint}
                  onPress={() => setTag(tag === t.name ? null : t.name)}
                />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          !searching ? (
            <Empty icon="compass" title="Explore by topic" body="Type a keyword or tap a topic above to find bills." />
          ) : results.isLoading ? (
            <Loading label="Searching…" />
          ) : (
            <Empty icon="search" title="Nothing found" body="Try a different word or topic." />
          )
        }
        ListFooterComponent={results.isFetchingNextPage ? <ActivityIndicator color={colors.blue} /> : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
});
