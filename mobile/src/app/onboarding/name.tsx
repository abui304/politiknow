import { useState } from 'react';

import { Button, Card, Field, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { NAME_RE } from '@/lib/format';
import { useUpdateMe } from '@/lib/queries';
import { toastError } from '@/lib/toast';
import { colors, space, type } from '@/theme';

/** Mandatory for social sign-ins (spec 6.2): we never reuse the Google profile name. */
export default function PickName() {
  const [name, setName] = useState('');
  const update = useUpdateMe();
  const { setStage, signOut } = useAuth();

  const save = () =>
    update.mutate(
      { display_name: name },
      {
        onSuccess: (me) => setStage(me.onboarding_tags.length ? 'ready' : 'needs_topics'),
        onError: toastError,
      },
    );

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Txt style={[type.title, { textAlign: 'center', marginTop: space.xxl, marginBottom: space.md }]}>Pick a display name</Txt>
      <Txt style={[type.body, { textAlign: 'center', color: colors.inkSoft, marginBottom: space.xl }]}>
        This is how you’ll show up in comments. Keep it anonymous — we never use your real name.
      </Txt>
      <Card style={{ gap: space.lg }}>
        <Field
          value={name}
          onChangeText={setName}
          autoCapitalize="none"
          placeholder="ballot_bunny"
          error={name && !NAME_RE.test(name) ? '3–30 letters, numbers or underscores' : undefined}
        />
        <Button title="That’s me!" onPress={save} loading={update.isPending} disabled={!NAME_RE.test(name)} />
      </Card>
      <Button title="Sign out" variant="ghost" onPress={() => signOut()} style={{ marginTop: space.lg }} />
    </Screen>
  );
}
