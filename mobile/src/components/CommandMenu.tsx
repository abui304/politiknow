import { type Href, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { create } from 'zustand';

import { useLegislators, useSearch } from '@/lib/queries';
import { APP_MAX_WIDTH, colors, float, fonts, outline, partyColors, radius, space, type } from '@/theme';

import { Icon, type IconName, Keycap, MOD_KEY, Tap, Txt } from './ui';

/** Open or close the command menu from anywhere. */
export const useCommandMenu = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

type Item = { key: string; icon: IconName; label: string; detail?: string; href: Href; dot?: string };

const PAGES: Item[] = [
  { key: 'p-feed', icon: 'home', label: 'Feed', detail: 'Bills picked for you', href: '/' },
  { key: 'p-search', icon: 'search', label: 'Search bills', detail: 'Find by words, topic, status or party', href: '/search' },
  { key: 'p-floor', icon: 'calendar', label: 'This week on the floor', detail: 'What the House and Senate vote on next', href: '/calendar' },
  { key: 'p-alerts', icon: 'bell', label: 'Alerts', href: '/notifications' },
  { key: 'p-map', icon: 'map', label: 'Your map', detail: 'Your district and the ones you follow', href: '/map' },
  { key: 'p-me', icon: 'user', label: 'Your profile', href: '/profile' },
  { key: 'p-settings', icon: 'settings', label: 'Settings', detail: 'Topics, alerts, display name', href: '/settings' },
];

/**
 * Jump anywhere by typing: pages, bills and members of Congress in one list. Opens with ⌘K / Ctrl+K on web.
 * Arrow keys move, Enter opens, Escape closes.
 */
export function CommandMenu() {
  const { open, set } = useCommandMenu();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  // After arrow keys, the row under a resting mouse pointer mustn't take the highlight back. Hover only
  // counts again once the mouse actually moves.
  const usingKeys = useRef(false);
  const term = q.trim();
  const searching = term.length >= 2;
  const bills = useSearch({ q: searching ? term : '', tag: null, hashtag: null, party: null, chamber: null, stage: null });
  const { data: people } = useLegislators(searching ? term : '', null, null);

  const items = useMemo(() => {
    const pages = PAGES.filter((p) => !term || `${p.label} ${p.detail ?? ''}`.toLowerCase().includes(term.toLowerCase()));
    const billItems: Item[] = searching
      ? (bills.data?.pages[0]?.items ?? []).slice(0, 5).map((b) => ({
          key: b.id,
          icon: 'file-text',
          label: b.title,
          detail: b.label,
          dot: partyColors(b.sponsor_party).main,
          href: { pathname: '/bill/[id]', params: { id: b.id } },
        }))
      : [];
    const personItems: Item[] = searching
      ? (people ?? []).slice(0, 4).map((l) => ({
          key: l.bioguide_id,
          icon: 'user',
          label: l.name,
          detail: partyColors(l.party).label,
          dot: partyColors(l.party).main,
          href: { pathname: '/legislator/[id]', params: { id: l.bioguide_id } },
        }))
      : [];
    return { pages, billItems, personItems, all: [...pages, ...billItems, ...personItems] };
  }, [term, searching, bills.data, people]);

  const close = () => {
    set(false);
    setQ('');
    setActive(0);
  };
  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onMove = () => (usingKeys.current = false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') usingKeys.current = true;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, items.all.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
    };
  });

  const section = (title: string, list: Item[], offset: number) =>
    list.length ? (
      <View key={title}>
        <Txt style={styles.section}>{title}</Txt>
        {list.map((item, i) => {
          const on = offset + i === active;
          return (
            <Tap
              key={item.key}
              hitSlop={0}
              onPress={() => go(item)}
              onHoverIn={() => !usingKeys.current && setActive(offset + i)}
              accessibilityRole="link"
              accessibilityLabel={item.detail ? `${item.label}, ${item.detail}` : item.label}
              style={[styles.row, on && styles.rowOn]}>
              <Icon name={item.icon} size={16} color={colors.inkSoft} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label} numberOfLines={1}>
                  {item.label}
                </Text>
                {item.detail ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
                    {item.dot ? <View style={[styles.dot, { backgroundColor: item.dot }]} /> : null}
                    <Text style={type.meta} numberOfLines={1}>
                      {item.detail}
                    </Text>
                  </View>
                ) : null}
              </View>
              {on && Platform.OS === 'web' ? <Keycap>↵</Keycap> : null}
            </Tap>
          );
        })}
      </View>
    ) : null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close the command menu" />
      <View style={styles.host} pointerEvents="box-none">
        <View style={[styles.panel, float()]} accessibilityViewIsModal>
          <View style={styles.inputRow}>
            <Icon name="search" size={18} color={colors.muted} />
            <TextInput
              autoFocus
              value={q}
              onChangeText={(v) => {
                setQ(v);
                setActive(0);
                usingKeys.current = true; // typing puts the highlight on the first result, whatever's under the mouse
              }}
              onSubmitEditing={() => go(items.all[active])}
              placeholder="Page, bill, H.R. number or member"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Jump to a page, bill or member of Congress"
              autoCorrect={false}
              style={styles.input}
            />
            <Keycap>esc</Keycap>
          </View>
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {section('Pages', items.pages, 0)}
            {section('Bills', items.billItems, items.pages.length)}
            {section('Members of Congress', items.personItems, items.pages.length + items.billItems.length)}
            {!items.all.length ? (
              <Txt style={[type.small, { padding: space.lg }]}>{searching ? 'No matches. Try a bill number, a name or a topic' : 'Type to search'}</Txt>
            ) : null}
          </ScrollView>
          {Platform.OS === 'web' ? (
            <View style={styles.footer}>
              <Keycap>↑</Keycap>
              <Keycap>↓</Keycap>
              <Txt style={type.meta}>to move</Txt>
              <Keycap>↵</Keycap>
              <Txt style={type.meta}>to open</Txt>
              <View style={{ flex: 1 }} />
              <Keycap>{`${MOD_KEY} K`}</Keycap>
              <Txt style={type.meta}>to toggle</Txt>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(43,38,34,0.32)' },
  host: { flex: 1, alignItems: 'center', paddingTop: 96, paddingHorizontal: space.lg },
  panel: { width: '100%', maxWidth: APP_MAX_WIDTH, backgroundColor: colors.bg, overflow: 'hidden', ...outline(radius.lg) },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.line },
  input: { flex: 1, height: 52, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  section: { ...type.meta, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, marginHorizontal: space.xs, borderRadius: radius.sm, borderCurve: 'continuous' },
  rowOn: { backgroundColor: colors.surfaceAlt },
  label: { ...type.body },
  dot: { width: 8, height: 8, borderRadius: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.lg, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.line },
});
