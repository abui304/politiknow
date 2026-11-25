import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { TopicPicker } from '@/components/TopicPicker';
import { BottomSheet, Button, Card, Field, Loading, Screen, TopBar, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { NAME_RE } from '@/lib/format';
import { useMe, useUpdateMe } from '@/lib/queries';
import { toast, toastError } from '@/lib/toast';
import type { Me, NotificationPrefs, NotificationType } from '@/lib/types';
import { colors, space, type } from '@/theme';

const TYPE_LABELS: Record<NotificationType, string> = {
  new_bill: 'New bills on my topics',
  status_update: 'Updates on bills I follow or engaged with',
  trending: 'Trending on my topics',
  social: 'People I follow commenting',
  legislator: 'New bills from legislators I follow',
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function Settings() {
  const { data: me } = useMe();
  return me ? <SettingsForm me={me} /> : <Loading />;
}

function SettingsForm({ me }: { me: Me }) {
  // Opened from "Choose what to get alerts about": put the alert switches first.
  const alertsFirst = useLocalSearchParams<{ section?: string }>().section === 'alerts';
  const update = useUpdateMe();
  const signOut = useAuth((s) => s.signOut);

  const [name, setName] = useState(me.display_name ?? '');
  const [topics, setTopics] = useState<string[]>(me.onboarding_tags);
  const [prefs, setPrefs] = useState<NotificationPrefs>(me.notification_preferences);

  const save = (body: Parameters<typeof update.mutate>[0], msg: string) =>
    update.mutate(body, { onSuccess: () => toast(msg, 'success'), onError: toastError });

  const setPrefsAndSave = (next: NotificationPrefs) => {
    setPrefs(next);
    save({ notification_preferences: next }, 'Notification settings saved');
  };

  const quiet = prefs.quiet_hours;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'America/New_York';

  const notifications = (
      <Section title="Notifications" subtitle="At most 5 a day. Changes save as soon as you flip a switch.">
        {(Object.keys(TYPE_LABELS) as NotificationType[]).map((t) => (
          <Row key={t} label={TYPE_LABELS[t]}>
            <Switch
              value={prefs.types[t] ?? true}
              onValueChange={(v) => setPrefsAndSave({ ...prefs, types: { ...prefs.types, [t]: v } })}
              trackColor={{ true: colors.ink, false: colors.hairline }}
              thumbColor={colors.surface}
              {...({ activeThumbColor: colors.surface } as object)}
            />
          </Row>
        ))}
        <Row label="Quiet hours">
          <Switch
            value={Boolean(quiet)}
            onValueChange={(v) => setPrefsAndSave({ ...prefs, quiet_hours: v ? { start: '22:00', end: '08:00', tz } : null })}
            trackColor={{ true: colors.ink, false: colors.hairline }}
              thumbColor={colors.surface}
              {...({ activeThumbColor: colors.surface } as object)}
          />
        </Row>
        {quiet ? <QuietHoursEditor value={quiet} onSave={(q) => setPrefsAndSave({ ...prefs, quiet_hours: q })} /> : null}
      </Section>
  );

  return (
    <Screen scroll>
      <TopBar title="Settings" />

      {alertsFirst ? notifications : null}

      <Section title="Display name">
        <Field value={name} onChangeText={setName} autoCapitalize="none" error={name && !NAME_RE.test(name) ? '3–30 letters, numbers or underscores' : undefined} />
        <Button
          small
          title="Save name"
          disabled={!NAME_RE.test(name) || name === me.display_name}
          onPress={() => save({ display_name: name }, 'Name updated')}
          style={{ alignSelf: 'flex-start' }}
        />
      </Section>

      <Section title="My topics" subtitle={topics.length ? `${topics.length} of 10 picked. These shape your feed` : 'None picked. Your feed shows what’s recent and trending'}>
        <TopicPicker selected={topics} onChange={setTopics} />
        <Button
          small
          title="Save topics"
          disabled={topics.join() === me.onboarding_tags.join()}
          onPress={() => save({ onboarding_tags: topics }, 'Topics saved — your feed will update')}
          style={{ alignSelf: 'flex-start' }}
        />
      </Section>

      {alertsFirst ? null : notifications}

      {me.is_moderator ? (
        <Section title="Moderation" subtitle="Review flagged comments, shadow bans and summary reports">
          <Button
            title="Open moderation dashboard"
            icon="shield"
            variant="secondary"
            onPress={() => router.push('/moderation')}
          />
        </Section>
      ) : null}

      <Section title="Account">
        <Txt style={type.small}>Signed in {me.email ? `as ${me.email}` : `with ${me.auth_provider}`}</Txt>
        <Button title="Sign out" icon="log-out" variant="secondary" onPress={() => signOut()} />
        <Button title="Privacy and how we stay neutral" icon="shield" variant="ghost" onPress={() => router.push('/about')} />
        <DeleteAccount />
      </Section>
    </Screen>
  );
}

/** Permanently deletes the account and everything in it, after a second, explicit confirmation. */
function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const signOut = useAuth((s) => s.signOut);
  const remove = async () => {
    setBusy(true);
    try {
      await api('/users/me', { method: 'DELETE' });
      await signOut(false);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <>
      <Button title="Delete my account" icon="trash-2" variant="ghost" onPress={() => setConfirming(true)} />
      <BottomSheet
        visible={confirming}
        title="Delete your account?"
        onClose={() => setConfirming(false)}
        footer={
          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <Button title="Delete my account forever" variant="danger" loading={busy} onPress={remove} />
            <Button title="Keep my account" variant="secondary" onPress={() => setConfirming(false)} />
          </View>
        }>
        <Txt style={type.body}>
          This removes your account, your comments, votes, follows and alerts, and your saved district. It can’t be undone.
        </Txt>
      </BottomSheet>
    </>
  );
}

function QuietHoursEditor({ value, onSave }: { value: NonNullable<NotificationPrefs['quiet_hours']>; onSave: (v: typeof value) => void }) {
  const [start, setStart] = useState(value.start);
  const [end, setEnd] = useState(value.end);
  const valid = HHMM.test(start) && HHMM.test(end);
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Field label="From" value={start} onChangeText={setStart} placeholder="22:00" maxLength={5} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Until" value={end} onChangeText={setEnd} placeholder="08:00" maxLength={5} />
        </View>
      </View>
      <Button
        small
        title="Save quiet hours"
        disabled={!valid || (start === value.start && end === value.end)}
        onPress={() => onSave({ ...value, start, end })}
        style={{ alignSelf: 'flex-start' }}
      />
    </View>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card style={{ gap: space.md, marginBottom: space.lg }}>
      <View>
        <Txt style={type.h3}>{title}</Txt>
        {subtitle ? <Txt style={type.small}>{subtitle}</Txt> : null}
      </View>
      {children}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Txt style={[type.body, { flex: 1 }]}>{label}</Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
});
