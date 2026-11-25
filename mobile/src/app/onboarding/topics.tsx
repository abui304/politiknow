import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopicPicker } from '@/components/TopicPicker';
import { Button, Screen, Title, Txt } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useUpdateMe } from '@/lib/queries';
import { toastError } from '@/lib/toast';
import { APP_MAX_WIDTH, colors, space, type } from '@/theme';

/** Cold-start quiz (spec 5.3): up to 10 topics seed the feed algorithm. Optional: skipping gives a feed ranked
 *  by what's recent and trending until likes, follows and comments teach it more. */
export default function PickTopics() {
  const [selected, setSelected] = useState<string[]>([]);
  const update = useUpdateMe();
  const setStage = useAuth((s) => s.setStage);
  const n = selected.length;

  const save = (tags: string[]) =>
    update.mutate({ onboarding_tags: tags }, { onSuccess: () => setStage('ready'), onError: toastError });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen scroll>
        <Title style={[type.title, { marginTop: space.xl }]}>What do you care about?</Title>
        <Txt style={[type.body, { color: colors.inkSoft, marginVertical: space.md }]}>
          Pick up to 10 topics to shape your feed, or skip this and see what’s new in Congress. You can change them anytime in Settings.
        </Txt>
        <TopicPicker selected={selected} onChange={setSelected} />
        <View style={{ height: 120 }} />
      </Screen>
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <View style={styles.footerInner}>
          <Txt style={type.bodyMedium}>{n ? `${n} of 10 picked` : 'No topics picked yet'}</Txt>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Skip for now" variant="secondary" onPress={() => save([])} disabled={update.isPending} />
            <Button title="Build my feed" onPress={() => save(selected)} loading={update.isPending} disabled={!n} style={{ flex: 1 }} />
          </View>
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
    borderTopWidth: 1,
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
