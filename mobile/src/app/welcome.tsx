import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GoogleButton } from '@/components/GoogleButton';
import { Logo } from '@/components/Logo';
import { usePendingLink } from '@/lib/share';
import { Button, Card, Icon, type IconName, Screen, Title, Txt } from '@/components/ui';
import { colors, radius, space, type } from '@/theme';

const PERKS: { icon: IconName; text: string }[] = [
  { icon: 'file-text', text: 'Real bills from Congress, every day' },
  { icon: 'book-open', text: 'Plain-English AI summaries, simple or detailed' },
  { icon: 'users', text: 'Vote, comment, and follow other curious citizens' },
];

export default function Welcome() {
  const pending = usePendingLink((s) => s.path);
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.wrap}>
        {pending ? (
          <View style={styles.pending} accessibilityLiveRegion="polite">
            <Icon name="file-text" size={18} color={colors.inkSoft} />
            <Txt style={[type.small, { flex: 1, color: colors.ink }]}>
              Someone shared a bill with you. Create a free account or sign in, and it opens right after.
            </Txt>
          </View>
        ) : null}
        <View style={styles.hero}>
          <Logo size={34} />
          <Title style={[type.h2, { textAlign: 'center', marginTop: space.lg }]}>Politics, made easy to know</Title>
        </View>

        <Card style={{ gap: space.lg }}>
          {PERKS.map((p) => (
            <View key={p.text} style={styles.perk}>
              <View style={styles.perkIcon}>
                <Icon name={p.icon} size={18} color={colors.inkSoft} />
              </View>
              <Txt style={[type.body, { flex: 1 }]}>{p.text}</Txt>
            </View>
          ))}
        </Card>

        <View style={{ gap: space.md }}>
          <Button title="Create a free account" size="large" icon="arrow-right" onPress={() => router.push('/register')} />
          <Button title="Sign in" size="large" variant="secondary" onPress={() => router.push('/login')} />
          <GoogleButton />
          <Txt style={[type.small, { textAlign: 'center' }]}>
            Anonymous by design. Only your display name is ever shown.{' '}
            <Txt style={[type.small, { color: colors.ink, textDecorationLine: 'underline' }]} onPress={() => router.push('/about')} accessibilityRole="link">
              Privacy and neutrality
            </Txt>
          </Txt>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'space-between', paddingVertical: space.xl, gap: space.xl },
  hero: { alignItems: 'center', marginTop: 64 },
  pending: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, backgroundColor: colors.surface, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.line },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  perkIcon: { width: 36, height: 36, borderRadius: radius.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
