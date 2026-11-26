import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { track } from '@/lib/events';
import { useSince } from '@/lib/queries';
import type { SinceItem } from '@/lib/types';
import { colors, outline, radius, space, type } from '@/theme';

import { Icon, type IconName, Tap, Txt } from './ui';

const ICONS: Record<SinceItem['kind'], IconName> = { bills: 'activity', members: 'check-square', topics: 'file-text' };

/** "Tuesday", "yesterday", "Nov 3": when the last visit was, in words. */
function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return 'earlier today';
  if (days < 2) return 'yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The top of the feed for someone coming back: up to three lines on what changed for them since they were
 * last here. A quiet stretch gets one calm line instead of filler, and a first visit shows nothing.
 */
export function SinceStrip() {
  const { data } = useSince();
  if (!data?.since) return null;
  const since = when(data.since);
  const open = (item: SinceItem) => {
    track('since_item_open', item.kind);
    if (item.bill_id) router.push({ pathname: '/bill/[id]', params: { id: item.bill_id } });
    else if (item.tag) router.push({ pathname: '/search', params: { tag: item.tag } });
    else if (item.kind === 'members') router.push('/profile');
  };
  return (
    <View style={[styles.strip, outline(radius.md)]} accessibilityRole="summary">
      <Txt style={styles.kicker}>{since === 'earlier today' ? 'Since earlier today' : `Since ${since}`}</Txt>
      {data.items.length ? (
        data.items.map((item) => (
          <Tap key={item.kind} onPress={() => open(item)} accessibilityRole="link" style={styles.row} hitSlop={0}>
            <Icon name={ICONS[item.kind]} size={16} color={colors.inkSoft} />
            <Txt style={[type.body, { flex: 1, color: colors.ink }]}>{item.text}</Txt>
            <Icon name="chevron-right" size={16} color={colors.muted} />
          </Tap>
        ))
      ) : (
        <Txt style={type.small}>Nothing you follow has moved. You’re caught up.</Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { backgroundColor: colors.surface, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.sm, gap: 2 },
  kicker: { ...type.meta, color: colors.inkSoft, marginBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
});
