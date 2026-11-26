import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/ui';
import { useWide } from '@/lib/layout';
import { registerForPush, usePushOpens } from '@/lib/push';
import { useNotifications } from '@/lib/queries';
import { colors, fonts } from '@/theme';

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <Icon name={name} size={22} color={String(color)} />;
}

export default function TabsLayout() {
  const { data: notifications } = useNotifications();
  const unread = notifications?.filter((n) => !n.is_read).length ?? 0;
  // On desktop the sidebar does the tab bar's job.
  const wide = useWide();

  useEffect(() => {
    registerForPush();
  }, []);
  usePushOpens();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarStyle: wide
          ? { display: 'none' }
          : {
              backgroundColor: colors.bg,
              borderTopWidth: 1,
              borderTopColor: colors.line,
              height: 64,
              paddingTop: 8,
            },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: (p) => <TabIcon name="home" {...p} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: (p) => <TabIcon name="search" {...p} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: (p) => <TabIcon name="bell" {...p} />,
          tabBarBadge: unread ? unread : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.ink,
            color: '#fff',
            fontFamily: fonts.medium,
            fontSize: 11,
          },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Me',
          tabBarIcon: (p) => <TabIcon name="user" {...p} />,
        }}
      />
    </Tabs>
  );
}
