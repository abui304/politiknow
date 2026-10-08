import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { timeAgo } from '@/lib/format';
import { useAddComment, useCommentActions, useComments } from '@/lib/queries';
import { toast, toastError } from '@/lib/toast';
import type { Comment, CommentSort } from '@/lib/types';
import { colors, fonts, radius, space, type } from '@/theme';

import { Avatar, BouncyPressable, Button, Card, Field, Icon, Loading, Segmented, Sheet, Txt } from './ui';

const MAX = 2000;
const SORTS: { key: CommentSort; label: string; icon: 'award' | 'clock' }[] = [
  { key: 'top', label: 'Top', icon: 'award' },
  { key: 'new', label: 'New', icon: 'clock' },
];

export function CommentsSection({ billId, color = colors.ink }: { billId: string; color?: string }) {
  const [sort, setSort] = useState<CommentSort>('top');
  const { data: comments, isLoading } = useComments(billId, sort);
  const add = useAddComment(billId);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const post = () =>
    add.mutate(
      { body, parent_comment_id: replyTo?.id },
      {
        onSuccess: () => {
          setBody('');
          setReplyTo(null);
        },
        onError: toastError,
      },
    );

  return (
    <View style={{ gap: space.md }}>
      <Txt style={type.h2}>Discussion</Txt>
      <Card style={{ gap: space.md }} offset={2}>
        {replyTo ? (
          <View style={styles.replyingTo}>
            <Txt style={[type.small, { flex: 1 }]} numberOfLines={1}>
              Replying to @{replyTo.author_name}
            </Txt>
            <Txt style={[type.small, { color: colors.red }]} onPress={() => setReplyTo(null)}>
              cancel
            </Txt>
          </View>
        ) : null}
        <Field
          value={body}
          onChangeText={(t) => setBody(t.slice(0, MAX))}
          placeholder={replyTo ? 'Write a reply…' : 'Share your take, kindly'}
          multiline
        />
        <View style={styles.composerRow}>
          <Txt style={type.tiny}>
            {body.length}/{MAX}
          </Txt>
          <Button title={replyTo ? 'Reply' : 'Post'} small onPress={post} loading={add.isPending} disabled={!body.trim()} />
        </View>
      </Card>

      {(comments?.length ?? 0) > 1 ? (
        <Segmented options={SORTS} value={sort} onChange={setSort} color={color} small />
      ) : null}
      {isLoading ? (
        <Loading />
      ) : comments?.length ? (
        comments.map((c) => (
          <View key={c.id} style={{ gap: space.sm }}>
            <CommentItem comment={c} billId={billId} onReply={() => setReplyTo(c)} />
            {c.replies.map((r) => (
              <View key={r.id} style={styles.reply}>
                <CommentItem comment={r} billId={billId} />
              </View>
            ))}
          </View>
        ))
      ) : (
        <Txt style={[type.small, { textAlign: 'center', marginVertical: space.lg }]}>Be the first to say something.</Txt>
      )}
    </View>
  );
}

function CommentItem({ comment: c, billId, onReply }: { comment: Comment; billId: string; onReply?: () => void }) {
  const actions = useCommentActions(billId);
  const [menu, setMenu] = useState(false);
  const vote = (v: -1 | 1) =>
    actions.vote.mutate({ id: c.id, value: c.my_vote === v ? 0 : v }, { onError: toastError });
  const report = (category: string) =>
    actions.report.mutate(
      { id: c.id, category },
      { onSuccess: () => toast('Thanks — our moderators will take a look.', 'success'), onError: toastError },
    );

  return (
    <Card offset={2} style={[styles.comment, c.is_hidden && { opacity: 0.6 }]}>
      <View style={styles.commentHead}>
        <BouncyPressable
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: c.author_id } })}
          style={styles.author}>
          <Avatar name={c.author_name} size={28} />
          <Txt style={type.bodyBold}>@{c.author_name}</Txt>
        </BouncyPressable>
        <Txt style={type.tiny}>{timeAgo(c.created_at)}</Txt>
        <View style={{ flex: 1 }} />
        <BouncyPressable onPress={() => setMenu(true)} style={styles.more} accessibilityLabel="More options">
          <Icon name="more-horizontal" size={18} color={colors.inkSoft} />
        </BouncyPressable>
      </View>
      {c.is_hidden ? <Txt style={[type.tiny, { color: colors.danger }]}>HIDDEN — ONLY YOU CAN SEE THIS</Txt> : null}
      <Txt style={type.body}>{c.body}</Txt>
      <View style={styles.commentActions}>
        <BouncyPressable onPress={() => vote(1)} style={[styles.pill, c.my_vote === 1 && styles.pillOn]}>
          <Icon name="arrow-up" size={14} />
        </BouncyPressable>
        <Text style={styles.score}>{c.net_score}</Text>
        <BouncyPressable onPress={() => vote(-1)} style={[styles.pill, c.my_vote === -1 && styles.pillOn]}>
          <Icon name="arrow-down" size={14} />
        </BouncyPressable>
        {onReply ? (
          <BouncyPressable onPress={onReply} style={styles.pill}>
            <Icon name="corner-down-right" size={14} />
            <Text style={styles.pillText}>Reply</Text>
          </BouncyPressable>
        ) : null}
      </View>
      <Sheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={c.is_mine ? 'Your comment' : 'Report this comment'}
        options={
          c.is_mine
            ? [{ label: 'Delete comment', danger: true, onPress: () => actions.remove.mutate(c.id, { onError: toastError }) }]
            : [
                { label: 'Harassment', onPress: () => report('harassment') },
                { label: 'Spam', onPress: () => report('spam') },
                { label: 'Misinformation', onPress: () => report('misinformation') },
                { label: 'Something else', onPress: () => report('other') },
              ]
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  replyingTo: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surfaceAlt, padding: space.sm, borderRadius: radius.sm },
  composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reply: { marginLeft: space.xl, borderLeftWidth: 3, borderLeftColor: colors.hairline, paddingLeft: space.sm },
  comment: { gap: space.sm, padding: space.md },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  more: { paddingHorizontal: 8, paddingVertical: 2 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  pillOn: { backgroundColor: colors.yellow, borderWidth: 2, borderColor: colors.line },
  pillText: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.ink },
  score: { fontFamily: fonts.black, fontSize: 14, color: colors.ink, minWidth: 20, textAlign: 'center' },
});
