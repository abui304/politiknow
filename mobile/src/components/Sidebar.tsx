import { type Href, router, usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useCommandMenu } from '@/components/CommandMenu';
import { Logo } from '@/components/Logo';
import { Icon, type IconName, Keycap, MOD_KEY, Tap, Txt } from '@/components/ui';
import { useNotifications } from '@/lib/queries';
import { colors, figures, fonts, space, type } from '@/theme';

type Item = {
  href: Href;
  match: (path: string) => boolean;
  label: string;
  icon: IconName;
};

const MAIN: Item[] = [
  { href: '/', match: (p) => p === '/', label: 'Feed', icon: 'home' },
  {
    href: '/search',
    match: (p) => p.startsWith('/search'),
    label: 'Search',
    icon: 'search',
  },
  {
    href: '/notifications',
    match: (p) => p.startsWith('/notifications'),
    label: 'Alerts',
    icon: 'bell',
  },
  {
    href: '/profile',
    match: (p) => p.startsWith('/profile'),
    label: 'Me',
    icon: 'user',
  },
];
const MORE: Item[] = [
  {
    href: '/calendar',
    match: (p) => p.startsWith('/calendar'),
    label: 'This week on the floor',
    icon: 'calendar',
  },
  {
    href: '/map',
    match: (p) => p.startsWith('/map') || p.startsWith('/state'),
    label: 'Map of Congress',
    icon: 'map',
  },
  {
    href: '/settings',
    match: (p) => p.startsWith('/settings'),
    label: 'Settings',
    icon: 'settings',
  },
];

/**
 * Desktop navigation: the same four places as the phone's tab bar, plus the pages a phone reaches from
 * them, in one column that's always there. The current page is marked with an ink rule, not a filled pill.
 */
export function Sidebar() {
  const path = usePathname();
  const { data: notifications } = useNotifications();
  const unread = notifications?.filter((n) => !n.is_read).length ?? 0;

  const row = (item: Item) => {
    const on = item.match(path);
    return (
      <Tap
        key={item.label}
        onPress={() => router.navigate(item.href)}
        accessibilityRole="link"
        accessibilityState={{ selected: on }}
        accessibilityLabel={item.label === 'Alerts' && unread ? `Alerts, ${unread} unread` : item.label}
        hitSlop={0}
        style={[styles.item, on && styles.itemOn]}>
        <Icon name={item.icon} size={18} color={on ? colors.ink : colors.inkSoft} />
        <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
          {item.label}
        </Text>
        {item.label === 'Alerts' && unread ? <Text style={styles.count}>{unread > 99 ? '99+' : unread}</Text> : null}
      </Tap>
    );
  };

  return (
    <View style={styles.bar} role="navigation">
      <Tap
        onPress={() => router.navigate('/')}
        accessibilityRole="link"
        accessibilityLabel="PolitiKNOW, go to your feed"
        style={styles.logo}
        hitSlop={0}>
        <Logo size={19} />
      </Tap>
      <Tap
        onPress={() => useCommandMenu.getState().set(true)}
        accessibilityRole="button"
        accessibilityLabel="Jump to a page, bill or member of Congress"
        style={styles.jump}>
        <Icon name="search" size={14} color={colors.inkSoft} />
        <Txt style={[type.small, { flex: 1 }]}>Jump to…</Txt>
        <Keycap>{`${MOD_KEY} K`}</Keycap>
      </Tap>
      <View style={styles.group}>{MAIN.map(row)}</View>
      <View style={styles.rule} />
      <View style={styles.group}>{MORE.map(row)}</View>
      <View style={{ flex: 1 }} />
      <Tap onPress={() => router.navigate('/about')} accessibilityRole="link" style={styles.footer} hitSlop={0}>
        <Txt style={type.meta}>About PolitiKNOW</Txt>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: 248,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    borderRightWidth: 1,
    borderRightColor: colors.line,
    gap: space.lg,
  },
  logo: { alignSelf: 'flex-start', paddingHorizontal: space.sm },
  jump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 36,
    paddingLeft: space.md,
    paddingRight: space.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineStrong,
  },
  group: { gap: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 40,
    paddingHorizontal: space.sm,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  itemOn: { borderLeftColor: colors.ink },
  label: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  labelOn: { fontFamily: fonts.medium, color: colors.ink },
  count: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink,
    ...figures,
  },
  rule: { height: 1, backgroundColor: colors.line, marginHorizontal: space.sm },
  footer: { paddingHorizontal: space.sm },
});
