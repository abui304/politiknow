import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useTags } from '@/lib/queries';
import { topicsFor } from '@/lib/topics';
import { colors, fonts, radius, space, type } from '@/theme';

import { Loading, Txt } from './ui';
import { TopicChip } from './TopicIcon';

export function TopicPicker({ selected, onChange, max = 10 }: { selected: string[]; onChange: (tags: string[]) => void; max?: number }) {
  const { data: tags, isLoading } = useTags();
  const [find, setFind] = useState('');
  if (isLoading || !tags) return <Loading label="Fetching topics…" />;

  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter((t) => t !== name));
    else if (selected.length < max) onChange([...selected, name]);
  };
  const term = find.trim().toLowerCase();
  // Topics matching the typed word come first, in order of fit; picked topics stay visible.
  const found = topicsFor(tags, term);
  const shown = term
    ? [...found, ...selected.filter((s) => !found.includes(s))].map((name) => ({
        name,
      }))
    : tags;

  return (
    <View style={{ gap: space.md }}>
      <TextInput
        value={find}
        onChangeText={setFind}
        placeholder="Find a topic, e.g. Social Security, veterans"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Find a topic"
        autoCorrect={false}
        style={{
          height: 44,
          paddingHorizontal: space.md,
          fontFamily: fonts.regular,
          fontSize: 16,
          color: colors.ink,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.lineStrong,
          borderRadius: radius.sm,
          borderCurve: 'continuous',
        }}
      />
      {term && shown.length > selected.length ? (
        <Txt style={type.small}>{`Bills about “${find.trim()}” are filed under:`}</Txt>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {shown.map((t) => (
          <TopicChip key={t.name} label={t.name} selected={selected.includes(t.name)} onPress={() => toggle(t.name)} />
        ))}
      </View>
      {term && shown.length === selected.length ? (
        <Txt style={type.small}>No topic matches that. Try another word, or pick from the full list.</Txt>
      ) : null}
    </View>
  );
}
