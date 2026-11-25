import { router } from 'expo-router';
import { View } from 'react-native';

import { FollowingCard, MyMapCard, RepresentativesCard } from '@/components/MyPlaces';
import { ProfileView } from '@/components/ProfileView';
import { Button, Card, Chip, Loading, Screen, Txt } from '@/components/ui';
import { useMe } from '@/lib/queries';
import { space, type } from '@/theme';

export default function MyProfile() {
  const { data: me, isLoading } = useMe();
  if (isLoading || !me) return <Loading />;

  return (
    <Screen padded={false}>
      <ProfileView
        userId={me.id}
        name={me.display_name ?? ''}
        followers={me.follower_count}
        following={me.following_count}
        joined={me.created_at}
        actions={<Button title="Edit settings" icon="settings" variant="secondary" small onPress={() => router.push('/settings')} />}
        extra={
          <>
            <RepresentativesCard />
            <MyMapCard />
            <FollowingCard />
            <Card style={{ gap: space.md }}>
              <Txt style={type.h3}>My topics</Txt>
              {me.onboarding_tags.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {me.onboarding_tags.map((t) => (
                    <Chip key={t} label={t} small />
                  ))}
                </View>
              ) : (
                <>
                  <Txt style={type.small}>None yet. Picking a few makes your feed about what you care about.</Txt>
                  <Button title="Pick topics" small variant="secondary" onPress={() => router.push('/settings')} style={{ alignSelf: 'flex-start' }} />
                </>
              )}
            </Card>
          </>
        }
      />
    </Screen>
  );
}
