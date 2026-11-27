import { router } from 'expo-router';
import { createContext, useContext, useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type TextProps } from 'react-native';

import { track } from '@/lib/events';
import { byId, segment, type GlossaryEntry } from '@/lib/glossary';
import { colors, outline, radius, space, type } from '@/theme';

import { useGlossaryScope } from './GlossaryScope';
import { BottomSheet, Icon, Tap, Txt } from './ui';

const OpenContext = createContext<(id: string) => void>(() => {});

/** Opens a term's definition from anywhere in the app. */
export const useGlossary = () => useContext(OpenContext);

/** One definition sheet for the whole app. Wraps the screens in the root layout. */
export function GlossaryProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  // The sheet keeps showing its last term while it slides away.
  const [shown, setShown] = useState<string | null>(null);
  const open = useMemo(
    () => (id: string) => {
      if (!byId[id]) return;
      track('glossary_tap');
      setShown(id);
      setOpenId(id);
    },
    [],
  );
  const entry = shown ? byId[shown] : null;
  return (
    <OpenContext.Provider value={open}>
      {children}
      <BottomSheet visible={openId !== null} title={entry?.term ?? ''} onClose={() => setOpenId(null)}>
        {entry ? (
          <DefinitionBody
            entry={entry}
            onSee={(id) => setShown(id)}
            onAll={() => {
              setOpenId(null);
              router.push('/glossary');
            }}
          />
        ) : null}
      </BottomSheet>
    </OpenContext.Provider>
  );
}

function DefinitionBody({ entry, onSee, onAll }: { entry: GlossaryEntry; onSee: (id: string) => void; onAll: () => void }) {
  return (
    <View style={{ gap: space.lg }}>
      <Txt style={type.body}>{entry.definition}</Txt>
      {entry.see?.length ? (
        <View style={styles.seeRow}>
          <Txt style={type.meta}>See also</Txt>
          {entry.see.map((id) => (
            <Tap key={id} onPress={() => onSee(id)} accessibilityRole="button" style={styles.see}>
              <Txt style={type.small}>{byId[id].term}</Txt>
            </Tap>
          ))}
        </View>
      ) : null}
      <Tap onPress={onAll} accessibilityRole="link" style={styles.all}>
        <Icon name="book" size={16} color={colors.inkSoft} />
        <Txt style={[type.small, { flex: 1 }]}>Open the glossary</Txt>
        <Icon name="chevron-right" size={16} color={colors.muted} />
      </Tap>
    </View>
  );
}

/**
 * Text from the official record (a vote question, a floor-schedule heading, a bill action) with Congress's
 * terms underlined. Tapping one opens its plain-language definition. A term is underlined only at its first
 * use on the screen, so a list of votes doesn't fill up with dotted lines.
 */
export function Defined({ text, before, ...props }: TextProps & { text: string; before?: ReactNode }) {
  const open = useGlossary();
  const scope = useGlossaryScope();
  const me = useId();
  const segments = useMemo(() => segment(text), [text]);
  const ids = segments.flatMap((s) => (s.id ? [s.id] : []));
  const key = ids.join(' ');
  const claim = scope?.claim;
  const release = scope?.release;
  // Claimed before the screen paints, so underlines never flash on and then off.
  useLayoutEffect(() => {
    if (!claim || !release || !key) return;
    claim(key.split(' '), me);
    return () => release(me);
  }, [claim, release, key, me]);

  if (!ids.length)
    return (
      <Txt {...props}>
        {before}
        {text}
      </Txt>
    );
  const mine = (id: string) => !scope || (scope.owners[id]?.[0] ?? me) === me;
  return (
    <Txt {...props}>
      {before}
      {segments.map((s, i) =>
        s.id && mine(s.id) ? (
          <Text
            key={i}
            onPress={(e) => {
              // Inside a tappable row (a vote, a related bill), the term opens its meaning instead of the row.
              e?.stopPropagation?.();
              open(s.id!);
            }}
            suppressHighlighting
            accessibilityRole="link"
            accessibilityHint="Shows what this means"
            style={styles.term}>
            {s.text}
          </Text>
        ) : (
          s.text
        ),
      )}
    </Txt>
  );
}

/** A definition shown in place, e.g. at the top of search results when someone searches for "cloture". */
export function DefinitionCard({ entry }: { entry: GlossaryEntry }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Icon name="book-open" size={16} color={colors.inkSoft} />
        <Txt style={type.meta}>What it means</Txt>
      </View>
      <Txt style={type.h3}>{entry.term}</Txt>
      <Txt style={type.body}>{entry.definition}</Txt>
      <Tap onPress={() => router.push('/glossary')} accessibilityRole="link" hitSlop={8}>
        <Txt style={styles.link}>Open the glossary</Txt>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  term: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer', textUnderlineOffset: 3 } as object) : null),
  },
  seeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  see: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
  },
  all: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  card: { gap: space.sm, padding: space.lg, backgroundColor: colors.surface, ...outline(radius.md) },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  link: { ...type.small, color: colors.ink, textDecorationLine: 'underline' },
});
