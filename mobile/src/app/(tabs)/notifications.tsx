import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BouncyPressable, Card, Empty, Icon, type IconName, Loading, Screen, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { keys, useNotifications } from '@/lib/queries';
import type { AppNotification, NotificationType } from '@/lib/types';
import { colors, space, type } from '@/theme';

const ICONS: Record<NotificationType, { icon: IconName; bg: string }> = {
  new_bill: { icon: 'file-text', bg: '#E6ECFF' },
  status_update: { icon: 'activity', bg: '#FFF3D6' },
  trending: { icon: 'trending-up', bg: '#FFE6E6' },
  social: { icon: 'message-circle', bg: '#DDF8EC' },
  legislator: { icon: 'user-check', bg: '#EFEAFF' },
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
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.blue} />}
        ListHeaderComponent={<Txt style={[type.title, { paddingVertical: space.md }]}>Alerts</Txt>}
        ListEmptyComponent={
          isLoading ? (
            <Loading />
          ) : (
            <Empty icon="bell" title="All quiet" body="We’ll ping you when bills on your topics move, or when people you follow chime in." />
          )
        }
        renderItem={({ item }) => {
          const icon = ICONS[item.type] ?? ICONS.new_bill;
          return (
            <BouncyPressable
              onPress={() => item.bill_id && router.push({ pathname: '/bill/[id]', params: { id: item.bill_id } })}
              style={{ marginBottom: space.md }}>
              <Card style={styles.row} offset={2}>
                <View style={[styles.icon, { backgroundColor: icon.bg }]}>
                  <Icon name={icon.icon} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt style={type.bodyBold}>{item.title}</Txt>
                  <Txt style={[type.small, { marginTop: 2 }]} numberOfLines={2}>
                    {item.body}
                  </Txt>
                  <Txt style={[type.tiny, { marginTop: 4 }]}>{timeAgo(item.created_at)}</Txt>
                </View>
                {!item.is_read ? <View style={styles.dot} /> : null}
              </Card>
            </BouncyPressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl, width: '100%', maxWidth: 520, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.line },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red },
});
