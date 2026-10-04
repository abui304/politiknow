import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Screen, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { NAME_RE } from '@/lib/format';
import { toastError } from '@/lib/toast';
import type { Tokens } from '@/lib/types';
import { colors, space, type } from '@/theme';

export default function Register() {
  const setTokens = useAuth((s) => s.setTokens);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const nameError = name && !NAME_RE.test(name) ? '3–30 letters, numbers or underscores' : undefined;
  const pwError = password && password.length < 8 ? 'At least 8 characters' : undefined;

  const submit = async () => {
    setBusy(true);
    try {
      const tokens = await api<Tokens>('/auth/register', {
        method: 'POST',
        body: { email, password, display_name: name },
        auth: false,
      });
      await setTokens(tokens);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <TopBar title="Join PolitiKNOW" />
      <Txt style={[type.title, { marginVertical: space.lg }]}>Let’s get you set up</Txt>
      <Card style={{ gap: space.lg }}>
        <Field
          label="Display name (this is what others see)"
          value={name}
          onChangeText={setName}
          autoCapitalize="none"
          placeholder="civic_owl"
          error={nameError}
        />
        <Txt style={[type.small, { color: colors.inkSoft, marginTop: -8 }]}>
          Stay anonymous — no need to use your real name.
        </Txt>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="8+ characters" error={pwError} />
        <Button
          title="Create account"
          onPress={submit}
          loading={busy}
          disabled={!email || !NAME_RE.test(name) || password.length < 8}
        />
      </Card>
      <View style={{ marginTop: space.xl, alignItems: 'center' }}>
        <Txt style={[type.small, { color: colors.inkSoft }]} onPress={() => router.replace('/login')}>
          Have an account? <Txt style={[type.small, { color: colors.blue }]}>Sign in</Txt>
        </Txt>
      </View>
    </Screen>
  );
}
