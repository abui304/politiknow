import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, partyColors, sticker } from '@/theme';

type Props = {
  legislator: { name: string; party: string | null; image_url: string | null };
  /** Width in px; portraits are 4:5, round thumbnails are square. */
  size: number;
  shape?: 'round' | 'portrait';
};

/** Official Congress.gov portrait, framed in the member's party color. Falls back to initials. */
export function LegislatorPhoto({ legislator: l, size, shape = 'round' }: Props) {
  const [failed, setFailed] = useState(false);
  const p = partyColors(l.party);
  const height = shape === 'portrait' ? Math.round(size * 1.25) : size;
  const radius = shape === 'portrait' ? size * 0.2 : size / 2;
  const words = l.name.split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0]?.[0] ?? '?');

  return (
    <View
      style={[
        { width: size, height, backgroundColor: p.soft, overflow: 'hidden' },
        sticker(shape === 'portrait' ? 3 : 2, radius),
      ]}
      accessibilityLabel={`Photo of ${l.name}`}>
      {l.image_url && !failed ? (
        <Image
          source={{ uri: l.image_url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          transition={150}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.center}>
          <Text style={[styles.initials, { color: p.main, fontSize: size * 0.36 }]}>{initials}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: fonts.black },
});
