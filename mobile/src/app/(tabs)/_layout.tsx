import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { type ComponentProps, useEffect } from 'react';
import type { ColorValue } from 'react-native';

import { registerForPush } from '@/lib/push';
import { useNotifications } from '@/lib/queries';
import { colors, fonts } from '@/theme';

type IonName = ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused, color }: { name: string; focused: boolean; color: ColorValue }) {
  return <Ionicons name={(focused ? name : `${name}-outline`) as IonName} size={24} color={color} />;
}

export default function TabsLayout() {
  const { data: notifications } = useNotifications();
  const unread = notifications?.filter((n) => !n.is_read).length ?? 0;

  useEffect(() => {
    registerForPush();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.extrabold, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 2,
          borderTopColor: colors.line,
          height: 64,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Feed', tabBarIcon: (p) => <TabIcon name="home" {...p} /> }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: (p) => <TabIcon name="search" {...p} /> }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: (p) => <TabIcon name="notifications" {...p} />,
          tabBarBadge: unread ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.red, fontFamily: fonts.extrabold },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: (p) => <TabIcon name="person" {...p} /> }} />
    </Tabs>
  );
}
