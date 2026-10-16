import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  BouncyPressable,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Icon,
  type IconName,
  Loading,
  Screen,
  Segmented,
  TopBar,
  Txt,
} from '@/components/ui';
import { timeAgo } from '@/lib/format';
import { useMe, useModActions, useModComments, useModSummaries, useModUsers } from '@/lib/queries';
import { toast, toastError } from '@/lib/toast';
import type { ModComment, ModQueue, ModUser, SummaryReportGroup } from '@/lib/types';
import { colors, fonts, radius, space, type } from '@/theme';

type Tab = 'comments' | 'summaries' | 'users';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'comments', label: 'Comments', icon: 'message-square' },
  { key: 'summaries', label: 'Summaries', icon: 'file-text' },
  { key: 'users', label: 'Users', icon: 'users' },
];

const QUEUES: { key: ModQueue; label: string }[] = [
  { key: 'pending', label: 'Needs review' },
  { key: 'hidden', label: 'Hidden' },
];

const openBill = (id: string) => router.push({ pathname: '/bill/[id]', params: { id } });
const openUser = (id: string) => router.push({ pathname: '/user/[id]', params: { id } });

/** Moderator dashboard: review flagged and reported comments, shadow bans, and reports on AI summaries. */
export default function Moderation() {
  const { data: me } = useMe();
  const [tab, setTab] = useState<Tab>('comments');

  if (!me) return <Loading />;
  if (!me.is_moderator) {
    return (
      <Screen>
        <TopBar title="Moderation" />
        <Empty icon="lock" title="Moderators only" body="This page is for PolitiKNOW moderators." />
      </Screen>
    );
  }
  return (
    <Screen padded={false}>
      <View style={styles.head}>
        <TopBar title="Moderation" />
        <Segmented options={TABS} value={tab} onChange={setTab} small />
      </View>
      {tab === 'comments' ? <CommentsTab /> : tab === 'summaries' ? <SummariesTab /> : <UsersTab />}
    </Screen>
  );
}

function List({
  children,
  refreshing,
  onRefresh,
}: {
  children: React.ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}>
      {children}
    </ScrollView>
  );
}

function LoadError({ message, retry }: { message?: string; retry: () => void }) {
  return (
    <Empty
      icon="wifi-off"
      title="Couldn’t load this"
      body={message}
      action={<Button title="Try again" small onPress={retry} />}
    />
  );
}

// ---------- comments ----------

function CommentsTab() {
  const [queue, setQueue] = useState<ModQueue>('pending');
  const { data, isLoading, error, refetch, isRefetching } = useModComments(queue);
  return (
    <List refreshing={isRefetching} onRefresh={refetch}>
      <Segmented options={QUEUES} value={queue} onChange={setQueue} color={colors.blue} small />
      {isLoading ? (
        <Loading />
      ) : !data ? (
        <LoadError message={error?.message} retry={refetch} />
      ) : data.length ? (
        data.map((c) => <ModCommentCard key={c.id} comment={c} />)
      ) : queue === 'pending' ? (
        <Empty icon="check-circle" title="All caught up" body="No flagged or reported comments are waiting." />
      ) : (
        <Empty icon="eye" title="Nothing hidden" body="Comments hidden by reports, the AI check, or a moderator show up here." />
      )}
    </List>
  );
}

function ModCommentCard({ comment: c }: { comment: ModComment }) {
  const { approve, hide, shadowBan } = useModActions();
  const categories = Object.entries(c.report_categories);
  const busy = approve.isPending || hide.isPending;
  return (
    <Card style={{ gap: space.sm }} offset={2}>
      <View style={styles.metaRow}>
        <Chip small selected color={colors.yellow} label={c.bill_label} onPress={() => openBill(c.bill_id)} />
        <Txt style={[type.small, { flex: 1 }]} numberOfLines={1}>
          {c.bill_title}
        </Txt>
      </View>

      <View style={styles.metaRow}>
        <BouncyPressable onPress={() => openUser(c.author_id)} accessibilityRole="link">
          <Txt style={type.bodyBold}>{c.author_name}</Txt>
        </BouncyPressable>
        <Txt style={type.small}>
          {timeAgo(c.created_at)}
          {c.parent_comment_id ? ' · reply' : ''} · score {c.net_score}
        </Txt>
      </View>

      <Txt style={type.body}>{c.body}</Txt>

      <View style={styles.badges}>
        {c.is_hidden ? <Badge icon="eye-off" label="Hidden" color={colors.red} /> : null}
        {c.is_flagged && !c.reviewed_at ? <Badge icon="flag" label="Flagged" color={colors.yellow} /> : null}
        {c.report_count ? (
          <Badge icon="alert-triangle" label={`${c.report_count} new report${c.report_count === 1 ? '' : 's'}`} color={colors.pink} />
        ) : null}
        {categories.map(([cat, n]) => (
          <Badge key={cat} label={`${cat} ${n}`} />
        ))}
        {c.reviewed_at ? <Badge icon="check" label={`Reviewed ${timeAgo(c.reviewed_at)}`} color={colors.mint} /> : null}
      </View>

      <Txt style={type.small}>
        Author: {c.author_hidden_count} hidden comment{c.author_hidden_count === 1 ? '' : 's'}
        {c.author_shadow_banned ? ' · shadow-banned' : ''}
      </Txt>

      <View style={styles.actions}>
        <Button
          small
          icon={c.is_hidden ? 'rotate-ccw' : 'check'}
          title={c.is_hidden ? 'Restore' : 'Keep up'}
          color={colors.success}
          disabled={busy}
          onPress={() =>
            approve.mutate(c.id, {
              onSuccess: () => toast(c.is_hidden ? 'Comment restored' : 'Comment approved', 'success'),
              onError: toastError,
            })
          }
        />
        {!c.is_hidden || !c.reviewed_at ? (
          <Button
            small
            icon="eye-off"
            title="Hide"
            variant="danger"
            disabled={busy}
            onPress={() => hide.mutate(c.id, { onSuccess: () => toast('Comment hidden', 'success'), onError: toastError })}
          />
        ) : null}
        <Button
          small
          icon={c.author_shadow_banned ? 'user-check' : 'user-x'}
          title={c.author_shadow_banned ? 'Lift ban' : 'Shadow-ban'}
          variant="secondary"
          loading={shadowBan.isPending}
          onPress={() =>
            shadowBan.mutate(
              { userId: c.author_id, banned: !c.author_shadow_banned },
              {
                onSuccess: () => toast(c.author_shadow_banned ? 'Ban lifted' : `${c.author_name} shadow-banned`, 'success'),
                onError: toastError,
              },
            )
          }
        />
      </View>
    </Card>
  );
}

function Badge({ label, icon, color = colors.surfaceAlt }: { label: string; icon?: IconName; color?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      {icon ? <Icon name={icon} size={12} /> : null}
      <Txt style={styles.badgeText}>{label}</Txt>
    </View>
  );
}

// ---------- summaries ----------

function SummariesTab() {
  const { data, isLoading, error, refetch, isRefetching } = useModSummaries();
  return (
    <List refreshing={isRefetching} onRefresh={refetch}>
      {isLoading ? (
        <Loading />
      ) : !data ? (
        <LoadError message={error?.message} retry={refetch} />
      ) : data.length ? (
        data.map((g) => <SummaryCard key={g.bill_id} group={g} />)
      ) : (
        <Empty icon="check-circle" title="No open reports" body="Reports people file on AI summaries show up here." />
      )}
    </List>
  );
}

function SummaryCard({ group: g }: { group: SummaryReportGroup }) {
  const { resolveSummary, regenerateSummary } = useModActions();
  const [expanded, setExpanded] = useState(false);
  // Regenerating costs two OpenAI calls, so it takes a second tap to confirm.
  const [confirming, setConfirming] = useState(false);

  const regenerate = () => {
    if (!confirming) return setConfirming(true);
    setConfirming(false);
    regenerateSummary.mutate(g.bill_id, {
      onSuccess: () => toast(`New summary written for ${g.bill_label}`, 'success'),
      onError: toastError,
    });
  };

  return (
    <Card style={{ gap: space.sm }} offset={2}>
      <View style={styles.metaRow}>
        <Chip small selected color={colors.yellow} label={g.bill_label} onPress={() => openBill(g.bill_id)} />
        <Badge icon="alert-triangle" label={`${g.reports.length} report${g.reports.length === 1 ? '' : 's'}`} color={colors.pink} />
      </View>
      <Txt style={type.bodyBold}>{g.bill_title}</Txt>

      <BouncyPressable
        onPress={() => setExpanded((e) => !e)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.summary}>
        <Txt style={type.tiny}>CURRENT SUMMARY {expanded ? '(DETAILED)' : ''}</Txt>
        <Txt style={type.body} numberOfLines={expanded ? undefined : 4}>
          {(expanded ? g.summary_detailed : g.summary_simple) ?? 'No summary yet.'}
        </Txt>
      </BouncyPressable>

      {g.reports.map((r) => (
        <View key={r.id} style={styles.report}>
          <Icon name="message-circle" size={14} color={colors.inkSoft} />
          <View style={{ flex: 1 }}>
            <Txt style={type.body}>{r.feedback || 'No details given.'}</Txt>
            <Txt style={type.small}>
              {r.reporter_name} · {timeAgo(r.created_at)}
            </Txt>
          </View>
        </View>
      ))}

      <View style={styles.actions}>
        <Button
          small
          icon="refresh-cw"
          title={confirming ? 'Tap again to regenerate' : 'Regenerate summary'}
          color={confirming ? colors.red : colors.blue}
          loading={regenerateSummary.isPending}
          onPress={regenerate}
        />
        <Button
          small
          icon="check"
          title="Summary is fine"
          variant="secondary"
          loading={resolveSummary.isPending}
          onPress={() =>
            resolveSummary.mutate(g.bill_id, { onSuccess: () => toast('Reports resolved', 'success'), onError: toastError })
          }
        />
      </View>
      {confirming ? <Txt style={type.small}>Rewrites both summaries with AI (uses OpenAI) and resolves these reports.</Txt> : null}
    </Card>
  );
}

// ---------- users ----------

function UsersTab() {
  const [q, setQ] = useState('');
  const query = q.trim();
  const { data, isLoading, error, refetch, isRefetching } = useModUsers(query);
  return (
    <List refreshing={isRefetching} onRefresh={refetch}>
      <Field value={q} onChangeText={setQ} placeholder="Find a user by display name" autoCapitalize="none" autoCorrect={false} />
      <Txt style={type.small}>{query ? 'Matching users' : 'Shadow-banned users. Their comments are visible only to themselves.'}</Txt>
      {isLoading ? (
        <Loading />
      ) : !data ? (
        <LoadError message={error?.message} retry={refetch} />
      ) : data.length ? (
        data.map((u) => <UserRow key={u.id} user={u} />)
      ) : (
        <Empty icon="users" title={query ? 'No one by that name' : 'No one is shadow-banned'} />
      )}
    </List>
  );
}

function UserRow({ user: u }: { user: ModUser }) {
  const { shadowBan } = useModActions();
  return (
    <Card style={styles.userRow} offset={2}>
      <BouncyPressable onPress={() => openUser(u.id)} accessibilityRole="link" style={{ flex: 1, gap: 2 }}>
        <Txt style={type.bodyBold}>{u.display_name}</Txt>
        <Txt style={type.small}>
          {u.comment_count} comments · {u.hidden_count} hidden · {u.report_count} reports · joined {timeAgo(u.created_at)}
        </Txt>
      </BouncyPressable>
      <Button
        small
        icon={u.is_shadow_banned ? 'user-check' : 'user-x'}
        title={u.is_shadow_banned ? 'Lift ban' : 'Ban'}
        variant={u.is_shadow_banned ? 'secondary' : 'danger'}
        loading={shadowBan.isPending}
        onPress={() =>
          shadowBan.mutate(
            { userId: u.id, banned: !u.is_shadow_banned },
            { onSuccess: () => toast(u.is_shadow_banned ? 'Ban lifted' : `${u.display_name} shadow-banned`, 'success'), onError: toastError },
          )
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.sm },
  list: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xxl, gap: space.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  summary: { gap: 4, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  report: { flexDirection: 'row', gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.hairline },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
