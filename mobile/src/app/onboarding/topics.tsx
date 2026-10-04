import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopicPicker } from '@/components/TopicPicker';
import { Button, Screen, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useUpdateMe } from '@/lib/queries';
import { toastError } from '@/lib/toast';
import { APP_MAX_WIDTH, colors, space, type } from '@/theme';

/** Cold-start quiz (spec 5.3): 5–10 topics seed the feed algorithm. */
export default function PickTopics() {
  const [selected, setSelected] = useState<string[]>([]);
  const update = useUpdateMe();
  const setStage = useAuth((s) => s.setStage);
  const n = selected.length;

  const save = () =>
    update.mutate({ onboarding_tags: selected }, { onSuccess: () => setStage('ready'), onError: toastError });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen scroll>
        <Txt style={[type.title, { marginTop: space.xl }]}>What do you care about?</Txt>
        <Txt style={[type.body, { color: colors.inkSoft, marginVertical: space.md }]}>
          Pick 5 to 10 topics. We’ll use them to build your feed — you can change them anytime.
        </Txt>
        <TopicPicker selected={selected} onChange={setSelected} />
        <View style={{ height: 120 }} />
      </Screen>
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <View style={styles.footerInner}>
          <Txt style={type.bodyBold}>{n < 5 ? `${5 - n} more to go` : `${n} picked`}</Txt>
          <Button title="Build my feed" onPress={save} loading={update.isPending} disabled={n < 5 || n > 10} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    borderTopWidth: 2,
    borderTopColor: colors.line,
  },
  footerInner: {
    padding: space.lg,
    gap: space.md,
    width: '100%',
    maxWidth: APP_MAX_WIDTH,
    alignSelf: 'center',
  },
});
