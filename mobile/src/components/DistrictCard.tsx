import { StyleSheet, View } from 'react-native';

import { useFollowDistrict, useSetHome } from '@/lib/queries';
import { toast, toastError } from '@/lib/toast';
import type { District } from '@/lib/types';
import { partyColors, space, type } from '@/theme';

import { LegislatorRow } from './LegislatorRow';
import { Button, Card, DocketTag, Txt } from './ui';

/** A district's representative, with Follow and "This is my district". */
export function DistrictCard({ district: d }: { district: District }) {
  const follow = useFollowDistrict();
  const setHome = useSetHome();
  const toggleFollow = () =>
    follow.mutate(
      { state: d.state, district: d.district, follow: !d.is_following },
      { onSuccess: () => toast(d.is_following ? `Unfollowed ${d.label}` : `Following ${d.label}`, 'success'), onError: toastError },
    );
  const makeHome = () =>
    setHome.mutate(
      { state: d.state, district: d.district },
      { onSuccess: () => toast(`${d.label} is now your district`, 'success'), onError: toastError },
    );

  return (
    <Card style={{ gap: space.md }}>
      <View style={styles.cardHead}>
        <DocketTag label={d.label} tint={partyColors(d.representative?.party).soft} />
        <View style={{ flex: 1 }}>
          <Txt style={type.h3}>{d.name}</Txt>
          {d.is_home ? <Txt style={type.small}>Your district</Txt> : null}
        </View>
      </View>
      {d.representative ? (
        <LegislatorRow legislator={d.representative} note={d.district ? 'Representative' : 'Represents the whole area'} />
      ) : (
        <Txt style={type.small}>No current representative on record. The seat may be vacant.</Txt>
      )}
      <View style={styles.actions}>
        <Button
          small
          icon={d.is_following ? 'check' : 'plus'}
          title={d.is_following ? 'Unfollow district' : 'Follow district'}
          variant={d.is_following ? 'secondary' : 'primary'}
          loading={follow.isPending}
          onPress={toggleFollow}
        />
        {!d.is_home ? (
          <Button small icon="home" title="Set as my district" variant="secondary" loading={setHome.isPending} onPress={makeHome} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
