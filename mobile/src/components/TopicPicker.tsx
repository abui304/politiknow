import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useTags } from '@/lib/queries';
import { colors, fonts, radius, space, type } from '@/theme';

import { Chip, Loading, Txt } from './ui';

/**
 * Everyday words people look for, mapped to the official Library of Congress topics they're filed under.
 * The topics themselves can't change (every bill is tagged with one), so the picker translates instead.
 */
const PLAIN_WORDS: Record<string, string[]> = {
  'Social Welfare': ['social security', 'retirement', 'pension', 'disability', 'snap', 'food stamps', 'welfare'],
  Health: ['medicare', 'medicaid', 'insurance', 'drugs', 'prescription', 'insulin', 'hospital', 'mental health', 'obamacare'],
  'Armed Forces and National Security': ['veterans', 'military', 'army', 'navy', 'defense', 'va'],
  Education: ['student loans', 'college', 'schools', 'teachers', 'tuition'],
  'Environmental Protection': ['climate', 'pollution', 'wildfire', 'clean water', 'emissions'],
  Energy: ['climate', 'solar', 'oil', 'gas', 'electric', 'clean energy'],
  'Government Operations and Politics': ['post office', 'postal', 'elections', 'voting', 'federal workers'],
  Taxation: ['taxes', 'irs', 'tax credit'],
  Commerce: ['small business', 'business', 'consumers'],
  'Transportation and Public Works': ['roads', 'trucking', 'rail', 'trains', 'airports', 'infrastructure'],
  'Housing and Community Development': ['housing', 'rent', 'mortgage', 'homeless'],
  'Crime and Law Enforcement': ['police', 'guns', 'crime', 'courts'],
  'Labor and Employment': ['jobs', 'wages', 'unions', 'minimum wage', 'workers'],
  Immigration: ['border', 'visas', 'asylum', 'citizenship'],
  Families: ['child care', 'daycare', 'parents', 'kids'],
  'Agriculture and Food': ['farms', 'farmers', 'food'],
  'Science, Technology, Communications': ['internet', 'broadband', 'ai', 'tech', 'privacy'],
};

export function TopicPicker({ selected, onChange, max = 10 }: { selected: string[]; onChange: (tags: string[]) => void; max?: number }) {
  const { data: tags, isLoading } = useTags();
  const [find, setFind] = useState('');
  if (isLoading || !tags) return <Loading label="Fetching topics…" />;

  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter((t) => t !== name));
    else if (selected.length < max) onChange([...selected, name]);
  };
  const term = find.trim().toLowerCase();
  const matches = (name: string) =>
    !term || name.toLowerCase().includes(term) || (PLAIN_WORDS[name] ?? []).some((w) => w.includes(term) || term.includes(w));
  const shown = tags.filter((t) => matches(t.name) || selected.includes(t.name));

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
          <Chip key={t.name} label={t.name} selected={selected.includes(t.name)} onPress={() => toggle(t.name)} />
        ))}
      </View>
      {term && shown.length === selected.length ? (
        <Txt style={type.small}>No topic matches that. Try another word, or pick from the full list.</Txt>
      ) : null}
    </View>
  );
}
