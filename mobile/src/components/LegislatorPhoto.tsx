import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, partyColors } from '@/theme';

type Props = {
  legislator: { name: string; party: string | null; image_url: string | null; image_blurhash?: string | null };
  /** Width in px; portraits are 4:5, round thumbnails are square. */
  size: number;
  shape?: 'round' | 'portrait';
};

/** Official Congress.gov portrait, framed in the member's party color. While it downloads, its BlurHash (a
 *  blurred sketch of the photo's colors) fills the frame, and the photo fades in over it. Falls back to initials. */
export function LegislatorPhoto({ legislator: l, size, shape = 'round' }: Props) {
  const [failed, setFailed] = useState(false);
  const p = partyColors(l.party);
  const height = shape === 'portrait' ? Math.round(size * 1.25) : size;
  const radius = shape === 'portrait' ? 12 : size / 2;
  const words = l.name.split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0]?.[0] ?? '?');

  return (
    <View
      style={[
        { width: size, height, backgroundColor: p.soft, overflow: 'hidden', borderRadius: radius },
        // Round thumbnails get a thin ring in the party color; portraits sit on a party-colored header already.
        shape === 'round' && { borderWidth: 2, borderColor: p.main },
      ]}
      accessibilityLabel={`Photo of ${l.name}`}>
      {l.image_url && !failed ? (
        <Image
          source={{ uri: l.image_url }}
          placeholder={l.image_blurhash ? { blurhash: l.image_blurhash } : undefined}
          placeholderContentFit="cover"
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          transition={240}
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
  initials: { fontFamily: fonts.semibold },
});
