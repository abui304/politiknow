import { View } from 'react-native';

import { useTags } from '@/lib/queries';
import { colors } from '@/theme';

import { Chip, Loading } from './ui';

const PICK_COLORS = [colors.yellow, colors.mint, colors.lilac, colors.pink];

export function TopicPicker({ selected, onChange, max = 10 }: { selected: string[]; onChange: (tags: string[]) => void; max?: number }) {
  const { data: tags, isLoading } = useTags();
  if (isLoading || !tags) return <Loading label="Fetching topics…" />;

  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter((t) => t !== name));
    else if (selected.length < max) onChange([...selected, name]);
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {tags.map((t, i) => (
        <Chip
          key={t.name}
          label={t.name}
          selected={selected.includes(t.name)}
          color={PICK_COLORS[i % PICK_COLORS.length]}
          onPress={() => toggle(t.name)}
        />
      ))}
    </View>
  );
}
