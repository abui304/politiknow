import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useFollowDistrict, useStateDistricts } from '@/lib/queries';
import { toast, toastError } from '@/lib/toast';
import { colors, partyColors, space, type } from '@/theme';

import { BottomSheet, Button, Txt } from './ui';

export type DistrictTarget = { state: string; district: number };

type Props = {
  /** The district tapped on a map; null hides the prompt. */
  target: DistrictTarget | null;
  onClose: () => void;
  /** Adds a button to open the district's page (for maps that don't already show it). */
  onOpen?: (target: DistrictTarget) => void;
};

/** Asked when a district is tapped on a map: follow it (or unfollow it, if already following). */
export function FollowDistrictPrompt({ target, onClose, onOpen }: Props) {
  const { data } = useStateDistricts(target?.state);
  const follow = useFollowDistrict();
  const d = target ? data?.districts.find((x) => x.district === target.district) : undefined;
  const rep = d?.representative;

  const toggle = () => {
    if (!d) return;
    follow.mutate(
      { state: d.state, district: d.district, follow: !d.is_following },
      {
        onSuccess: () => {
          toast(d.is_following ? `Unfollowed ${d.label}` : `Following ${d.label}`, 'success');
          onClose();
        },
        onError: toastError,
      },
    );
  };

  return (
    <BottomSheet
      visible={target !== null}
      title={d ? (d.is_following ? `You follow ${d.label}` : `Follow ${d.label}?`) : 'Follow this district?'}
      onClose={onClose}
      footer={
        <View style={styles.actions}>
          <Button
            title={d?.is_following ? 'Unfollow district' : 'Follow district'}
            icon={d?.is_following ? 'x' : 'plus'}
            variant={d?.is_following ? 'secondary' : 'primary'}
            color={d?.is_following ? undefined : colors.ink}
            loading={follow.isPending}
            disabled={!d}
            onPress={toggle}
          />
          {onOpen && target ? (
            <Button
              title="See district"
              icon="map-pin"
              variant="secondary"
              onPress={() => {
                onClose();
                onOpen(target);
              }}
            />
          ) : null}
          <Button title="Not now" variant="ghost" onPress={onClose} />
        </View>
      }>
      {d ? (
        <View style={{ gap: space.xs }}>
          <Txt style={type.bodyBold}>{d.name}</Txt>
          <Txt style={type.small}>
            {rep ? `Represented by ${rep.name} (${partyColors(rep.party).label})` : 'No current representative on record.'}
          </Txt>
          <Txt style={[type.small, { marginTop: space.xs }]}>
            {d.is_following
              ? 'It’s highlighted on your map and listed under Districts you follow.'
              : 'It’ll be highlighted on your map and listed under Districts you follow.'}
          </Txt>
        </View>
      ) : (
        <ActivityIndicator color={colors.inkSoft} />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space.sm, marginTop: space.lg },
});
