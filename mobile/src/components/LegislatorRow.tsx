import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { legislatorPlace } from '@/lib/format';
import { colors, partyColors, radius, space, outline, type } from '@/theme';

import { LegislatorPhoto } from './LegislatorPhoto';
import { Tap, Icon, Txt } from './ui';

type Props = {
  legislator: {
    bioguide_id: string;
    name: string;
    party: string | null;
    state: string | null;
    district: number | null;
    chamber: string | null;
    image_url: string | null;
    image_blurhash?: string | null;
  };
  /** Extra detail under the name, e.g. "Original cosponsor". */
  note?: string;
};

/** A tappable member of Congress that opens their legislator page. */
export function LegislatorRow({ legislator: l, note }: Props) {
  const p = partyColors(l.party);
  return (
    <Tap
      onPress={() => router.push({ pathname: '/legislator/[id]', params: { id: l.bioguide_id } })}
      accessibilityRole="button"
      accessibilityLabel={`${l.name}, ${p.label}, ${legislatorPlace(l)}`}
      style={[styles.row, outline(radius.md)]}>
      <LegislatorPhoto legislator={l} size={40} />
      <View style={{ flex: 1 }}>
        <Txt style={type.bodyMedium} numberOfLines={1}>
          {l.name}
        </Txt>
        <Txt style={type.small} numberOfLines={2}>
          {p.label} · {legislatorPlace(l)}
        </Txt>
        {note ? (
          <Txt style={type.meta} numberOfLines={1}>
            {note}
          </Txt>
        ) : null}
      </View>
      <Icon name="chevron-right" size={16} color={colors.muted} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, backgroundColor: colors.surface },
});
