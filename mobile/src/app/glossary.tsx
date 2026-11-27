import { useMemo, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { useGlossary } from '@/components/Glossary';
import { Card, Icon, Screen, Tap, Title, TopBar, Txt } from '@/components/ui';
import { byId, GLOSSARY, GROUPS } from '@/lib/glossary';
import { colors, fonts, radius, space, type } from '@/theme';

const fold = (s: string) => s.toLowerCase().replace(/[’']/g, '');

/** Every term the app explains, grouped the way a bill moves, with a box to narrow them down. Open to everyone. */
export default function Glossary() {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const open = useGlossary();
  const q = fold(text.trim());
  const groups = useMemo(() => {
    const match = (e: (typeof GLOSSARY)[number]) =>
      !q || [e.term, ...(e.aliases ?? []), e.definition].some((s) => fold(s).includes(q));
    return GROUPS.map((g) => ({
      ...g,
      entries: GLOSSARY.filter((e) => e.group === g.id && match(e)).sort((a, b) => a.term.localeCompare(b.term)),
    })).filter((g) => g.entries.length);
  }, [q]);

  return (
    <Screen scroll>
      <TopBar />
      <Title style={{ marginTop: space.md }}>Glossary</Title>
      <Txt style={[type.body, { color: colors.inkSoft, marginTop: space.sm }]}>
        Tap any word with a dotted underline to see its meaning.
      </Txt>

      <View style={[styles.box, focused && { borderColor: colors.ink }]}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Find a term, like cloture"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Find a term"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.input}
        />
        {text ? (
          <Tap onPress={() => setText('')} accessibilityRole="button" accessibilityLabel="Clear" hitSlop={8}>
            <Icon name="x" size={16} color={colors.inkSoft} />
          </Tap>
        ) : null}
      </View>

      {groups.length ? null : (
        <Txt style={[type.small, { marginTop: space.lg }]} accessibilityLiveRegion="polite">
          No terms match “{text.trim()}”.
        </Txt>
      )}

      {groups.map((g) => (
        <View key={g.id} style={{ marginTop: space.xl, gap: space.md }}>
          <Txt style={type.h3} accessibilityRole="header">
            {g.title}
          </Txt>
          <Card style={{ paddingVertical: 0 }}>
            {g.entries.map((e, i) => (
              <View key={e.id} style={[styles.entry, i > 0 && styles.divider]}>
                <Txt style={type.bodyMedium}>{e.term}</Txt>
                <Txt style={[type.body, { color: colors.inkSoft }]}>{e.definition}</Txt>
                {e.see?.length ? (
                  <Txt style={type.small}>
                    See also{' '}
                    {e.see.map((id, j) => (
                      <Txt key={id} style={type.small}>
                        {j > 0 ? ', ' : ''}
                        <Txt style={styles.see} onPress={() => open(id)} accessibilityRole="link">
                          {byId[id].term}
                        </Txt>
                      </Txt>
                    ))}
                  </Txt>
                ) : null}
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 48,
    marginTop: space.lg,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  entry: { gap: space.xs, paddingVertical: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  see: { color: colors.ink, textDecorationLine: 'underline' },
});
