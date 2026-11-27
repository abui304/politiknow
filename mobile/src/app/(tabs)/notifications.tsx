import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { Button, Card, Empty, Icon, type IconName, Screen, SkeletonList, Tap, Title, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { markAlertOpened } from '@/lib/events';
import { shortDate, timeAgo } from '@/lib/format';
import { keys, useNotifications } from '@/lib/queries';
import type { AppNotification, NotificationType } from '@/lib/types';
import { colors, outline, radius, space, type } from '@/theme';

const ICONS: Record<NotificationType, IconName> = {
  member_vote: 'check-square',
  new_bill: 'file-text',
  status_update: 'activity',
  trending: 'trending-up',
  social: 'message-circle',
  legislator: 'user-check',
};

export default function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useNotifications();

  // Opening the tab marks everything read (after a beat, so the unread dots are visible first).
  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        api('/notifications/read-all', { method: 'POST' })
          .then(() =>
            qc.setQueryData<AppNotification[]>(keys.notifications, (old) => old?.map((n) => ({ ...n, is_read: true }))),
          )
          .catch(() => {});
      }, 1500);
      return () => clearTimeout(t);
    }, [qc]),
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={data ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.inkSoft} />}
        ListHeaderComponent={
          <View style={{ paddingTop: space.md, paddingBottom: space.lg, gap: space.md }}>
            <Title>Alerts</Title>
            <Tap onPress={() => router.push('/digest')} accessibilityRole="link" style={styles.recap}>
              <Icon name="file-text" size={18} color={colors.inkSoft} />
              <View style={{ flex: 1 }}>
                <Txt style={type.bodyMedium}>Weekly recap</Txt>
                <Txt style={type.small}>What moved and how your members voted</Txt>
              </View>
              <Icon name="chevron-right" size={16} color={colors.muted} />
            </Tap>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <SkeletonList kind="row" count={4} />
          ) : (
            <Empty
              icon="bell"
              title="No alerts yet"
              body="Follow a bill and you’ll see its recent activity here right away, then an alert each time it moves. A good place to start is what’s on the floor this week."
              action={<Button title="See this week on the floor" small variant="secondary" icon="calendar" onPress={() => router.push('/calendar')} />}
            />
          )
        }
        renderItem={({ item }) => {
          const icon = ICONS[item.type] ?? ICONS.new_bill;
          return (
            <Tap
              onPress={() => {
                markAlertOpened(item.id);
                if (item.bill_id) router.push({ pathname: '/bill/[id]', params: { id: item.bill_id } });
              }}
              accessibilityLabel={`${item.is_read ? '' : 'Unread. '}${item.title}`}
              style={{ marginBottom: space.sm }}>
              <Card style={styles.row}>
                <View style={styles.icon}>
                  <Icon name={icon} size={18} color={colors.inkSoft} />
                </View>
                <View style={{ flex: 1, gap: space.xs }}>
                  <Txt style={item.is_read ? type.body : type.bodyMedium}>{item.title}</Txt>
                  <Txt style={type.small} numberOfLines={2}>
                    {item.body}
                  </Txt>
                  <Txt style={type.meta}>
                    {item.backfill ? `Before you followed · ${shortDate(item.created_at)}` : timeAgo(item.created_at)}
                  </Txt>
                </View>
                {!item.is_read ? <View style={styles.dot} /> : null}
              </Card>
            </Tap>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  recap: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: colors.surface, ...outline(radius.md) },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md },
  icon: { width: 36, height: 36, borderRadius: radius.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink, marginTop: space.sm },
});
