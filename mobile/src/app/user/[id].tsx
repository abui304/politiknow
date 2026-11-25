import { router, useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/components/ProfileView';
import { Button, Empty, Loading, Screen, TopBar } from '@/components/ui';
import { useFollow, useProfile } from '@/lib/queries';
import { toastError } from '@/lib/toast';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: profile, isLoading, error } = useProfile(id);
  const follow = useFollow(id);

  if (isLoading) return <Loading />;
  if (!profile) {
    return (
      <Screen>
        <TopBar />
        <Empty icon="user-x" title="User not found" body={error?.message} action={<Button title="Back to your feed" small onPress={() => router.replace('/')} />} />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ProfileView
        userId={profile.id}
        name={profile.display_name}
        followers={profile.follower_count}
        following={profile.following_count}
        joined={profile.created_at}
        top={<TopBar title={`@${profile.display_name}`} />}
        actions={
          profile.is_me ? null : (
            <Button
              small
              title={profile.is_following ? 'Unfollow' : `Follow @${profile.display_name}`}
              icon={profile.is_following ? 'check' : 'user-plus'}
              variant={profile.is_following ? 'secondary' : 'primary'}
              loading={follow.isPending}
              onPress={() => follow.mutate(!profile.is_following, { onError: toastError })}
            />
          )
        }
      />
    </Screen>
  );
}
