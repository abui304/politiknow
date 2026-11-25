import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Field, Screen, Title, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toastError } from '@/lib/toast';
import type { Tokens } from '@/lib/types';
import { colors, fonts, space, type } from '@/theme';

export default function Login() {
  const setTokens = useAuth((s) => s.setTokens);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    setBusy(true);
    try {
      await setTokens(await api<Tokens>('/auth/login', { method: 'POST', body: { email, password }, auth: false }));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <TopBar />
      <Title style={{ marginTop: space.md, marginBottom: space.xl }}>Sign in</Title>
      <Card style={{ gap: space.lg }}>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="username"
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          ref={passwordRef}
          returnKeyType="go"
          placeholder="••••••••"
          onSubmitEditing={submit}
        />
        <Button title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
      </Card>
      <View style={{ marginTop: space.xl, alignItems: 'center' }}>
        <Txt style={[type.small, { color: colors.inkSoft }]} onPress={() => router.replace('/register')}>
          New here? <Txt style={[type.small, styles.link]}>Create an account</Txt>
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: fonts.medium, color: colors.ink, textDecorationLine: 'underline' },
});
