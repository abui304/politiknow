import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Screen, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toastError } from '@/lib/toast';
import type { Tokens } from '@/lib/types';
import { colors, space, type } from '@/theme';

export default function Login() {
  const setTokens = useAuth((s) => s.setTokens);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

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
      <TopBar title="Sign in" />
      <Txt style={[type.title, { marginVertical: space.lg }]}>Welcome back</Txt>
      <Card style={{ gap: space.lg }}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" placeholder="••••••••" onSubmitEditing={submit} />
        <Button title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
      </Card>
      <View style={{ marginTop: space.xl, alignItems: 'center' }}>
        <Txt style={[type.small, { color: colors.inkSoft }]} onPress={() => router.replace('/register')}>
          New here? <Txt style={[type.small, { color: colors.blue }]}>Make an account</Txt>
        </Txt>
      </View>
    </Screen>
  );
}
