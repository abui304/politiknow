import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegislatorPhoto } from '@/components/LegislatorPhoto';
import { BottomSheet, Button, Icon, Screen, Tap, Title, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { currentPosition } from '@/lib/location';
import { STATES } from '@/lib/places';
import { registerForPush } from '@/lib/push';
import { keys, useSetHome, useStateDistricts } from '@/lib/queries';
import { toast, toastError } from '@/lib/toast';
import type { LegislatorBase, Representatives } from '@/lib/types';
import { APP_MAX_WIDTH, colors, outline, partyColors, radius, space, type } from '@/theme';

/**
 * Onboarding's last step: find the three people who represent you in Congress and follow them. It's what
 * makes the app personal from day one (their bills and votes are what alerts and the weekly recap are
 * built around). Optional: "Skip for now" goes straight to the feed, and it can be done later under Me.
 */
export default function PickPlace() {
  const setStage = useAuth((s) => s.setStage);
  const setHome = useSetHome();
  const qc = useQueryClient();
  const [reps, setReps] = useState<Representatives | null>(null);
  const [locating, setLocating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [following, setFollowing] = useState(false);

  const found = (r: Representatives | undefined) => {
    // No toast: the district and its members appear right on the page, and a toast would cover the button.
    if (r?.home) setReps(r);
  };
  const locate = async () => {
    setLocating(true);
    try {
      found(await setHome.mutateAsync(await currentPosition()));
    } catch (e) {
      toastError(e);
    } finally {
      setLocating(false);
    }
  };
  const members: { l: LegislatorBase; note: string }[] = reps
    ? [
        ...(reps.home?.representative ? [{ l: reps.home.representative, note: 'Your representative' }] : []),
        ...reps.senators.map((l) => ({ l, note: 'Your senator' })),
      ]
    : [];

  const finish = () => setStage('ready');
  const followAll = async () => {
    setFollowing(true);
    try {
      await Promise.all(members.map((m) => api(`/legislators/${m.l.bioguide_id}/follow`, { method: 'POST' })));
      qc.invalidateQueries({ queryKey: keys.following });
      registerForPush({ ask: true });
      toast('Following. You’ll get an alert when they introduce a bill or vote on one you follow.', 'success');
      finish();
    } catch (e) {
      toastError(e);
    } finally {
      setFollowing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen scroll>
        <Title style={[type.title, { marginTop: space.xl }]}>Who represents you?</Title>
        <Txt style={[type.body, { color: colors.inkSoft, marginVertical: space.md }]}>
          One representative and two senators vote on every bill in Congress on your behalf. Find them, and PolitiKNOW
          shows you what they’re doing.
        </Txt>

        {reps?.home ? (
          <View style={{ gap: space.md }}>
            <View style={[styles.district, outline(radius.md)]}>
              <Icon name="map-pin" size={16} />
              <Txt style={[type.bodyMedium, { flex: 1 }]}>{reps.home.name}</Txt>
              <Tap onPress={() => setReps(null)} accessibilityRole="button" accessibilityLabel="Choose a different place">
                <Txt style={styles.change}>Change</Txt>
              </Tap>
            </View>
            {members.map(({ l, note }) => (
              <View key={l.bioguide_id} style={[styles.member, outline(radius.md)]}>
                <LegislatorPhoto legislator={l} size={40} />
                <View style={{ flex: 1 }}>
                  <Txt style={type.bodyMedium}>{l.name}</Txt>
                  <Txt style={type.small}>
                    {note} · {partyColors(l.party).label}
                  </Txt>
                </View>
              </View>
            ))}
            {!reps.home.representative ? (
              <Txt style={type.small}>No current representative on record. The seat may be vacant.</Txt>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: space.sm }}>
            <Button title="Use my location" icon="crosshair" size="large" onPress={locate} loading={locating} />
            <Button title="Choose my state and district" icon="list" variant="secondary" size="large" onPress={() => setPicking(true)} />
            <View style={styles.privacy}>
              <Icon name="lock" size={14} color={colors.muted} />
              <Txt style={[type.meta, { flex: 1 }]}>
                Your location is used once to find your district and is never saved. Only your state and district are kept,
                and they’re never shown on your profile.
              </Txt>
            </View>
          </View>
        )}
        <View style={{ height: 140 }} />
      </Screen>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <View style={styles.footerInner}>
          {members.length ? (
            <Button
              title={members.length === 3 ? 'Follow all three' : `Follow ${members.length === 1 ? 'them' : `all ${members.length}`}`}
              hint="Alerts when they introduce bills or vote on ones you follow"
              icon="bell"
              size="large"
              onPress={followAll}
              loading={following}
            />
          ) : null}
          <Button
            title={reps?.home ? 'Continue without following' : 'Skip for now'}
            variant="secondary"
            onPress={finish}
            disabled={following}
          />
        </View>
      </SafeAreaView>

      <PlacePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={async (state, district) => {
          setPicking(false);
          try {
            found(await setHome.mutateAsync({ state, district }));
          } catch (e) {
            toastError(e);
          }
        }}
      />
    </View>
  );
}

/** State, then district: for people who'd rather not share their location. */
function PlacePicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (state: string, district: number) => void }) {
  const [state, setState] = useState<string | null>(null);
  const { data, isLoading } = useStateDistricts(state);
  const close = () => {
    setState(null);
    onClose();
  };
  return (
    <BottomSheet visible={visible} title={state ? `Which district in ${STATES[state]}?` : 'Which state do you vote in?'} onClose={close}>
      {state ? (
        <>
          <Tap onPress={() => setState(null)} accessibilityRole="button" style={styles.back}>
            <Icon name="arrow-left" size={14} color={colors.inkSoft} />
            <Txt style={type.small}>All states</Txt>
          </Tap>
          {isLoading ? <ActivityIndicator color={colors.inkSoft} /> : null}
          {data?.districts.map((d) => (
            <Tap
              key={d.district}
              hitSlop={0}
              accessibilityRole="button"
              onPress={() => {
                setState(null);
                onPick(d.state, d.district);
              }}
              style={styles.row}>
              <View style={{ flex: 1 }}>
                <Txt style={type.body}>{d.name}</Txt>
                {d.representative ? <Txt style={type.small}>{d.representative.name}</Txt> : null}
              </View>
              <Icon name="chevron-right" size={16} color={colors.muted} />
            </Tap>
          ))}
        </>
      ) : (
        Object.entries(STATES)
          .sort(([, a], [, b]) => a.localeCompare(b))
          .map(([code, name]) => (
            <Tap key={code} hitSlop={0} accessibilityRole="button" onPress={() => setState(code)} style={styles.row}>
              <Txt style={[type.body, { flex: 1 }]}>{name}</Txt>
              <Icon name="chevron-right" size={16} color={colors.muted} />
            </Tap>
          ))
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  district: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: colors.surface },
  change: { ...type.small, color: colors.ink, textDecorationLine: 'underline' },
  member: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: colors.surface },
  privacy: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: space.sm },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
  footerInner: { padding: space.lg, gap: space.sm, width: '100%', maxWidth: APP_MAX_WIDTH, alignSelf: 'center' },
});
