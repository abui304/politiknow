import { router } from 'expo-router';
import { View } from 'react-native';

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
        actions={<Button title="Settings" icon="settings" variant="secondary" small onPress={() => router.push('/settings')} />}
        extra={
          <Card style={{ gap: space.md }}>
            <Txt style={type.h3}>My topics</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {me.onboarding_tags.map((t) => (
                <Chip key={t} label={t} />
              ))}
            </View>
          </Card>
        }
      />
    </Screen>
  );
}
