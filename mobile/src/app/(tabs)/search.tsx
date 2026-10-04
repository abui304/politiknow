import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { BillCard } from '@/components/BillCard';
import { BouncyPressable, Chip, Empty, Field, Icon, Loading, Screen, Txt } from '@/components/ui';
import { usePopularHashtags, useSearch, useTags } from '@/lib/queries';
import { colors, radius, space, sticker, type } from '@/theme';

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
  // The hashtag filter lives in the URL so tapping a hashtag anywhere opens /search?hashtag=...
  const hashtag = useLocalSearchParams<{ hashtag?: string }>().hashtag || null;
  const setHashtag = (h: string | null) => router.setParams({ hashtag: h ?? undefined });

  const q = useDebounced(text.trim());
  const { data: tags } = useTags();
  const { data: popular } = usePopularHashtags();
  const results = useSearch(q, tag, hashtag);
  const bills = results.data?.pages.flatMap((p) => p.items) ?? [];
  const searching = Boolean(q || tag || hashtag);

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
            <Field
              value={text}
              onChangeText={setText}
              placeholder="Search titles and #hashtags…"
              returnKeyType="search"
              autoCorrect={false}
            />
            {hashtag ? (
              <BouncyPressable
                onPress={() => setHashtag(null)}
                style={[styles.activeHashtag, sticker(2, radius.pill)]}
                accessibilityLabel={`Remove #${hashtag} filter`}>
                <Txt style={type.bodyBold}>#{hashtag}</Txt>
                <Icon name="x" size={16} />
              </BouncyPressable>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
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
            <View style={{ gap: space.md }}>
              {popular?.length ? (
                <>
                  <Txt style={type.h3}>Popular hashtags</Txt>
                  <View style={styles.wrap}>
                    {popular.map((h) => (
                      <Chip key={h.name} label={`#${h.name} · ${h.bill_count}`} onPress={() => setHashtag(h.name)} />
                    ))}
                  </View>
                </>
              ) : null}
              <Empty icon="compass" title="Explore" body="Type a keyword, tap a topic, or pick a hashtag to find bills." />
            </View>
          ) : results.isLoading ? (
            <Loading label="Searching…" />
          ) : (
            <Empty icon="search" title="Nothing found" body="Try a different word, topic, or hashtag." />
          )
        }
        ListFooterComponent={results.isFetchingNextPage ? <ActivityIndicator color={colors.blue} /> : null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  row: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  activeHashtag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.yellow,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
});
