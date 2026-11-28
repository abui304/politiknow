import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Icon, Screen, Title, Txt } from '@/components/ui';
import { api, refreshTokens } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space, type } from '@/theme';

type State = 'checking' | 'done' | 'failed';

/** Where the confirmation email's link opens. Works signed in or out, on any device. */
export default function Verify() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const signedIn = useAuth((s) => Boolean(s.accessToken));
  const [state, setState] = useState<State>(token ? 'checking' : 'failed');
  const sent = useRef(false);

  useEffect(() => {
    // Each link works once, so it's only ever sent once (React may run effects twice in development).
    if (!token || sent.current) return;
    sent.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token }, auth: false })
      .then(async () => {
        setState('done');
        if (useAuth.getState().accessToken) await refreshTokens();
      })
      .catch(() => setState('failed'));
  }, [token]);

  const next = () => router.replace(signedIn ? '/' : '/login');

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <View style={styles.body}>
        {state === 'checking' ? (
          <>
            <ActivityIndicator color={colors.ink} />
            <Txt style={[type.body, styles.center]}>Confirming your email…</Txt>
          </>
        ) : state === 'done' ? (
          <>
            <Icon name="check-circle" size={32} color={colors.ink} />
            <Title style={[type.title, styles.center]}>Email confirmed</Title>
            <Txt style={[type.body, styles.center, { color: colors.inkSoft }]}>
              {signedIn ? 'You’re all set.' : 'Sign in to finish setting up your account.'}
            </Txt>
            <Button title={signedIn ? 'Continue' : 'Sign in'} onPress={next} style={styles.button} />
          </>
        ) : (
          <>
            <Icon name="alert-circle" size={32} color={colors.ink} />
            <Title style={[type.title, styles.center]}>This link didn’t work</Title>
            <Txt style={[type.body, styles.center, { color: colors.inkSoft }]}>
              It may have been used already or be more than 2 days old. If your account still asks you to confirm, send
              a new link from there.
            </Txt>
            <Button title={signedIn ? 'Back to PolitiKNOW' : 'Sign in'} variant="secondary" onPress={next} style={styles.button} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: space.md, marginTop: space.xxl * 2 },
  center: { textAlign: 'center' },
  button: { marginTop: space.md, alignSelf: 'stretch' },
});
