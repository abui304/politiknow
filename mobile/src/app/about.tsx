import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, type IconName, Screen, Title, TopBar, Txt } from '@/components/ui';
import { colors, radius, space, type } from '@/theme';

const POINTS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'eye-off',
    title: 'Anonymous by design',
    body: 'Other people only ever see your display name, your comments, and who you follow. Never your email, your real name, or your district.',
  },
  {
    icon: 'map-pin',
    title: 'Your location is used once',
    body: 'If you use your location to find your district, it’s used for that one lookup and thrown away. Only your state and district number are saved.',
  },
  {
    icon: 'lock',
    title: 'We don’t sell your data',
    body: 'There are no ads and no data brokers. Your email is used to sign you in and, only if you turn it on, to send the weekly recap. Every recap email has a one-click unsubscribe and no tracking.',
  },
  {
    icon: 'bar-chart-2',
    title: 'What we measure, and what we don’t',
    body: 'To see whether the app is useful, we record which days you used it, when you opened an alert, and a few named actions such as opening the weekly recap. No search terms, no browsing history, no device or network details, and no outside analytics. Raw records are deleted after 13 months, and all of it is deleted with your account.',
  },
  {
    icon: 'trash-2',
    title: 'You can leave anytime',
    body: 'Settings → Delete my account removes your account and everything you’ve posted, for good.',
  },
  {
    icon: 'file-text',
    title: 'Bills come straight from Congress',
    body: 'Every bill, status and date is from Congress.gov, the official record. Each bill links back to it so you can check.',
  },
  {
    icon: 'cpu',
    title: 'Summaries are written by AI',
    body: 'An AI writes the plain-English summaries from the bill’s text, told to describe what a bill does without taking sides. They can contain mistakes, so each one has a “Report a summary mistake” button.',
  },
  {
    icon: 'check-square',
    title: 'Votes are the official record',
    body: 'How members voted comes from the House and Senate clerks, shown word for word: the question as they wrote it, the result, and each vote. Parties are always listed in the same order, and missed votes are shown with the total and a reminder that absences have many causes.',
  },
  {
    icon: 'book-open',
    title: 'How the weekly recap is picked',
    body: 'The same rules for everyone, in this order: bills you follow that moved, how your members voted on final passage and cloture, bills that passed the House or Senate or became law (most-followed first), and what’s on the floor. Nothing in it is chosen or written by AI.',
  },
  {
    icon: 'columns',
    title: 'Party colors are labels, not opinions',
    body: 'A bill card is blue, red or yellow because of its sponsor’s party, and says so in words. Your feed is ranked by your topics and follows, never by party.',
  },
];

/** What PolitiKNOW does with your data, and how it stays neutral. Open to everyone, signed in or not. */
export default function About() {
  return (
    <Screen scroll>
      <TopBar />
      <Title style={{ marginTop: space.md, marginBottom: space.xl }}>Privacy and how we stay neutral</Title>
      <Card style={{ gap: space.xl }}>
        {POINTS.map((p) => (
          <View key={p.title} style={styles.point}>
            <View style={styles.icon}>
              <Icon name={p.icon} size={18} color={colors.inkSoft} />
            </View>
            <View style={{ flex: 1, gap: space.xs }}>
              <Txt style={type.bodyMedium}>{p.title}</Txt>
              <Txt style={[type.body, { color: colors.inkSoft }]}>{p.body}</Txt>
            </View>
          </View>
        ))}
      </Card>
      <Button
        title="Visit Congress.gov"
        icon="external-link"
        variant="secondary"
        hint="Opens the official congressional website in your browser"
        onPress={() => WebBrowser.openBrowserAsync('https://www.congress.gov')}
        style={{ marginTop: space.lg, alignSelf: 'flex-start' }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: 'row', gap: space.md },
  icon: { width: 36, height: 36, borderRadius: radius.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
});
