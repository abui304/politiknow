import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { shortDate, timeAgo } from '@/lib/format';
import { useUserComments } from '@/lib/queries';
import { colors, space, type } from '@/theme';

import { Avatar, BouncyPressable, Card, Empty, Icon, Loading, Txt } from './ui';

type Props = {
  userId: string | undefined;
  name: string;
  followers: number;
  following: number;
  joined: string;
  actions?: ReactNode;
  extra?: ReactNode;
  top?: ReactNode;
};

export function ProfileView({ userId, name, followers, following, joined, actions, extra, top }: Props) {
  const { data: comments, isLoading } = useUserComments(userId);

  return (
    <FlatList
      data={comments ?? []}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={{ gap: space.lg, paddingBottom: space.lg }}>
          {top}
          <Card style={{ alignItems: 'center', gap: space.sm, backgroundColor: colors.surfaceAlt }} offset={4}>
            <Avatar name={name} size={84} />
            <Txt style={[type.title, { marginTop: space.md }]}>@{name}</Txt>
            <Txt style={type.small}>Joined {shortDate(joined)}</Txt>
            <View style={styles.stats}>
              <Stat n={followers} label="followers" />
              <Stat n={following} label="following" />
              <Stat n={comments?.length ?? 0} label="comments" />
            </View>
            {actions}
          </Card>
          {extra}
          <Txt style={type.h2}>Comment history</Txt>
        </View>
      }
      ListEmptyComponent={isLoading ? <Loading /> : <Empty icon="message-circle" title="No comments yet" />}
      renderItem={({ item }) => (
        <BouncyPressable
          onPress={() => router.push({ pathname: '/bill/[id]', params: { id: item.bill_id } })}
          style={{ marginBottom: space.md }}>
          <Card offset={2} style={{ gap: 4 }}>
            <Txt style={type.tiny}>
              {item.bill_label} · {timeAgo(item.created_at)}
            </Txt>
            <Txt style={[type.small, { color: colors.inkSoft }]} numberOfLines={1}>
              {item.bill_title}
            </Txt>
            <Txt style={[type.body, item.is_hidden && { color: colors.muted }]}>
              {item.is_hidden ? 'Hidden by moderation: ' : ''}
              {item.body}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="arrow-up" size={13} color={colors.inkSoft} />
              <Txt style={type.small}>{item.net_score}</Txt>
            </View>
          </Card>
        </BouncyPressable>
      )}
    />
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 70 }}>
      <Txt style={type.h2}>{n}</Txt>
      <Txt style={type.tiny}>{label.toUpperCase()}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, paddingTop: space.md, width: '100%', maxWidth: 520, alignSelf: 'center' },
  stats: { flexDirection: 'row', gap: space.lg, marginVertical: space.md },
});
