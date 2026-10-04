import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GoogleButton } from '@/components/GoogleButton';
import { Button, Card, Icon, type IconName, Screen, Txt } from '@/components/ui';
import { colors, radius, space, sticker, type } from '@/theme';

const PERKS: { icon: IconName; color: string; text: string }[] = [
  { icon: 'file-text', color: colors.blue, text: 'Real bills from Congress, every day' },
  { icon: 'book-open', color: colors.red, text: 'Plain-English AI summaries, simple or detailed' },
  { icon: 'users', color: colors.mint, text: 'Vote, comment, and follow other curious citizens' },
];

export default function Welcome() {
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.wrap}>
        <View style={styles.hero}>
          <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
          <Txt style={[type.h2, { textAlign: 'center', marginTop: space.lg }]}>Politics, made easy to know.</Txt>
        </View>

        <Card style={{ gap: space.lg, backgroundColor: colors.surfaceAlt }}>
          {PERKS.map((p) => (
            <View key={p.text} style={styles.perk}>
              <View style={[styles.perkIcon, sticker(2, radius.md), { backgroundColor: p.color }]}>
                <Icon name={p.icon} size={18} color="#fff" />
              </View>
              <Txt style={[type.bodyBold, { flex: 1 }]}>{p.text}</Txt>
            </View>
          ))}
        </Card>

        <View style={{ gap: space.md }}>
          <Button title="Create an account" onPress={() => router.push('/register')} />
          <Button title="I already have one" variant="secondary" onPress={() => router.push('/login')} />
          <GoogleButton />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'space-between', paddingVertical: space.xl, gap: space.xl },
  hero: { alignItems: 'center', marginTop: space.xxl * 2 },
  logo: { width: 280, height: 52 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  perkIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
});
