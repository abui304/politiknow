import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Screen, Title, Txt } from '@/components/ui';
import { api, refreshTokens } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast, toastError } from '@/lib/toast';
import type { Me } from '@/lib/types';
import { colors, space, type } from '@/theme';

const RESEND_WAIT = 30;

/**
 * New email accounts land here until they click the link in their confirmation email. The screen checks
 * every few seconds, so confirming on another device (say, a phone's mail app) moves this one along by itself.
 */
export default function ConfirmEmail() {
  const signOut = useAuth((s) => s.signOut);
  const [wait, setWait] = useState(0);
  const [sending, setSending] = useState(false);
  const me = useQuery({
    queryKey: ['me', 'email-check'],
    queryFn: () => api<Me>('/users/me'),
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });

  // Confirmed: fresh tokens say where sign-up continues (topics, then the place step).
  const confirmed = me.data && !me.data.needs_email_check;
  useEffect(() => {
    if (confirmed) void refreshTokens();
  }, [confirmed]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const resend = async () => {
    setSending(true);
    try {
      await api('/auth/resend-confirmation', { method: 'POST' });
      toast('Sent. Check your inbox.');
      setWait(RESEND_WAIT);
    } catch (e) {
      toastError(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <View style={styles.mark}>
        <Icon name="mail" size={28} color={colors.ink} />
      </View>
      <Title style={[type.title, styles.center, { marginTop: space.lg }]}>Check your email</Title>
      <Txt style={[type.body, styles.center, { color: colors.inkSoft, marginTop: space.md }]}>
        We sent a link to{' '}
        <Txt style={[type.body, { color: colors.ink }]}>{me.data?.email ?? 'your email'}</Txt>. Open it to finish signing
        up.
      </Txt>
      <Txt style={[type.small, styles.center, { marginTop: space.sm }]} accessibilityLiveRegion="polite">
        This page moves on by itself once you’ve confirmed.
      </Txt>

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <Button
          title={wait ? `Resend in ${wait}s` : 'Resend email'}
          variant="secondary"
          icon="refresh-cw"
          onPress={resend}
          loading={sending}
          disabled={wait > 0}
        />
        <Button title="Wrong email? Sign out" variant="ghost" onPress={() => signOut()} />
      </View>
      <Txt style={[type.meta, styles.center, { marginTop: space.lg }]}>
        Not there after a minute? Check your spam folder.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  mark: {
    alignSelf: 'center',
    marginTop: space.xxl,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
