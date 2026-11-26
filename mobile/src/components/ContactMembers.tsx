import { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { track } from '@/lib/events';
import type { LegislatorBase } from '@/lib/types';
import { colors, space, type } from '@/theme';

import { LegislatorPhoto } from './LegislatorPhoto';
import { BottomSheet, Button, Icon, Txt } from './ui';

type Member = LegislatorBase & { note?: string };

/** A phone number that never breaks across lines. */
const unbroken = (phone: string) => phone.replace(/-/g, '\u2011').replace(/ /g, '\u00a0');

/**
 * How to reach a member's office, with a short, neutral guide to what a call involves. PolitiKNOW never
 * writes what to say: the stance is the person's own.
 */
export function ContactSheet({
  visible,
  onClose,
  members,
  about,
}: {
  visible: boolean;
  onClose: () => void;
  members: Member[];
  /** The bill this is about, e.g. "H.R. 1148", to name in the guide. */
  about?: string;
}) {
  const call = (m: Member) => {
    if (!m.phone) return;
    track('contact_member', m.bioguide_id);
    Linking.openURL(`tel:${m.phone.replace(/[^\d+]/g, '')}`).catch(() => {});
  };
  return (
    <BottomSheet visible={visible} title={members.length === 1 ? `Contact ${members[0].name}` : 'Contact your members'} onClose={onClose}>
      <View style={{ gap: space.md }}>
        {members.map((m) => (
          <View key={m.bioguide_id} style={styles.member}>
            <LegislatorPhoto legislator={m} size={36} />
            <View style={{ flex: 1 }}>
              <Txt style={type.bodyMedium}>{m.name}</Txt>
              <Txt style={type.small}>{[m.note, m.phone ? unbroken(m.phone) : 'No office phone on file'].filter(Boolean).join(' · ')}</Txt>
            </View>
            {m.phone ? (
              <Button
                title={Platform.OS === 'web' ? 'Call' : 'Call office'}
                icon="phone"
                small
                variant="secondary"
                onPress={() => call(m)}
                hint={`Calls ${m.name}’s office at ${m.phone}`}
              />
            ) : null}
          </View>
        ))}
        <View style={styles.guide}>
          <Icon name="info" size={16} color={colors.inkSoft} />
          <View style={{ flex: 1, gap: space.xs }}>
            <Txt style={type.bodyMedium}>What a call involves</Txt>
            <Txt style={type.small}>
              {`A staff member answers and notes what you say for the member. Say you’re a constituent and give your ZIP code, name the bill${about ? ` (${about})` : ''}, and say what you think and why, in your own words. A minute is plenty.`}
            </Txt>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

/** A button that opens the contact sheet. */
export function ContactButton({ members, about, title, small = true }: { members: Member[]; about?: string; title?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!members.some((m) => m.phone)) return null;
  return (
    <>
      <Button
        title={title ?? (members.length === 1 ? 'Contact their office' : 'Contact your members')}
        icon="phone"
        variant="secondary"
        small={small}
        onPress={() => setOpen(true)}
        style={{ alignSelf: 'flex-start' }}
      />
      <ContactSheet visible={open} onClose={() => setOpen(false)} members={members} about={about} />
    </>
  );
}

const styles = StyleSheet.create({
  member: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  guide: { flexDirection: 'row', gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line },
});
