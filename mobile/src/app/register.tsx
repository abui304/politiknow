import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Field, Screen, Title, TopBar, Txt } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { NAME_RE } from '@/lib/format';
import { toastError } from '@/lib/toast';
import type { Tokens } from '@/lib/types';
import { colors, fonts, space, type } from '@/theme';

export default function Register() {
  const setTokens = useAuth((s) => s.setTokens);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // The server turned this address away (a throwaway inbox, or a domain that can't receive mail).
  const [emailProblem, setEmailProblem] = useState<{ email: string; message: string } | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

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
      if (e instanceof ApiError && e.status === 422 && /email|mail/i.test(e.message)) {
        setEmailProblem({ email, message: e.message });
        emailRef.current?.focus();
      } else {
        toastError(e);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <TopBar />
      <Title style={{ marginTop: space.md, marginBottom: space.xl }}>Create your account</Title>
      <Card style={{ gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Field
            label="Display name"
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            autoComplete="username-new"
            textContentType="nickname"
            placeholder="civic_owl"
            error={nameError}
          />
          <Txt style={type.meta}>This is what others see. Stay anonymous, no real name needed.</Txt>
        </View>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          ref={emailRef}
          placeholder="you@example.com"
          error={emailProblem && emailProblem.email === email ? emailProblem.message : undefined}
        />
        <Txt style={type.meta}>We’ll send a link to confirm it’s yours.</Txt>
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          passwordRules="minlength: 8;"
          ref={passwordRef}
          returnKeyType="go"
          onSubmitEditing={() => email && NAME_RE.test(name) && password.length >= 8 && submit()}
          placeholder="8+ characters"
          error={pwError}
        />
        <Button
          title="Create my account"
          onPress={submit}
          loading={busy}
          disabled={!email || !NAME_RE.test(name) || password.length < 8}
        />
      </Card>
      <View style={{ marginTop: space.xl, alignItems: 'center' }}>
        <Txt style={[type.small, { color: colors.inkSoft }]} onPress={() => router.replace('/login')}>
          Have an account? <Txt style={[type.small, styles.link]}>Sign in</Txt>
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { fontFamily: fonts.medium, color: colors.ink, textDecorationLine: 'underline' },
});
