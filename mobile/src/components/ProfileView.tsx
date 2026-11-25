import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { shortDate, timeAgo } from '@/lib/format';
import { useUserComments } from '@/lib/queries';
import { colors, figures, space, type } from '@/theme';

import { Avatar, Button, Card, DocketTag, Empty, Icon, SkeletonList, Tap, Txt } from './ui';

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
          <Card style={{ alignItems: 'center', gap: space.xs, paddingVertical: space.xl }}>
            <Avatar name={name} size={80} />
            <Txt style={[type.h2, { marginTop: space.md }]}>@{name}</Txt>
            <Txt style={type.meta}>Joined {shortDate(joined)}</Txt>
            <View style={styles.stats}>
              <Stat n={followers} label="followers" />
              <Stat n={following} label="people followed" />
              <Stat n={comments?.length ?? 0} label="comments" />
            </View>
            {actions}
          </Card>
          {extra}
          <Txt style={[type.h3, { marginTop: space.sm }]}>Comment history</Txt>
        </View>
      }
      ListEmptyComponent={
        isLoading ? (
          <SkeletonList kind="row" count={2} />
        ) : (
          <Empty
            icon="message-circle"
            title="No comments yet"
            action={<Button title="Find a bill to discuss" small variant="secondary" onPress={() => router.navigate('/')} />}
          />
        )
      }
      renderItem={({ item }) => (
        <Tap
          onPress={() => router.push({ pathname: '/bill/[id]', params: { id: item.bill_id } })}
          style={{ marginBottom: space.sm }}>
          <Card style={{ gap: space.sm }}>
            <View style={styles.commentHead}>
              <DocketTag label={item.bill_label} />
              <Txt style={[type.small, { flex: 1 }]} numberOfLines={1}>
                {item.bill_title}
              </Txt>
            </View>
            <Txt style={[type.body, item.is_hidden && { color: colors.muted }]}>
              {item.is_hidden ? 'Hidden by moderation: ' : ''}
              {item.body}
            </Txt>
            <View style={styles.commentHead}>
              <Icon name="arrow-up" size={14} color={colors.muted} />
              <Txt style={[type.meta, styles.figure]}>{item.net_score}</Txt>
              <Txt style={type.meta}>· {timeAgo(item.created_at)}</Txt>
            </View>
          </Card>
        </Tap>
      )}
    />
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 72 }}>
      <Txt style={[type.h2, styles.figure]}>{n}</Txt>
      <Txt style={type.meta}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, paddingTop: space.md, width: '100%', maxWidth: 520, alignSelf: 'center' },
  stats: { flexDirection: 'row', gap: space.lg, marginVertical: space.lg },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  figure: { ...figures },
});
