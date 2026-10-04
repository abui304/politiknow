import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform } from 'react-native';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toastError } from '@/lib/toast';
import type { Tokens } from '@/lib/types';

import { Button } from './ui';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_IDS = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};

/** Hidden unless a Google OAuth client ID is configured for this platform (see mobile/.env.example). */
export function GoogleButton() {
  const configured = CLIENT_IDS[Platform.OS as keyof typeof CLIENT_IDS];
  return configured ? <GoogleButtonInner /> : null;
}

function GoogleButtonInner() {
  const setTokens = useAuth((s) => s.setTokens);
  const [busy, setBusy] = useState(false);
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: CLIENT_IDS.web,
    iosClientId: CLIENT_IDS.ios,
    androidClientId: CLIENT_IDS.android,
  });

  const signIn = async () => {
    const result = await promptAsync();
    if (result.type !== 'success') return;
    setBusy(true);
    try {
      const body = { id_token: result.params.id_token };
      await setTokens(await api<Tokens>('/auth/google', { method: 'POST', body, auth: false }));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      title="Continue with Google"
      variant="secondary"
      disabled={!request}
      loading={busy}
      onPress={signIn}
    />
  );
}
