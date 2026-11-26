import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';

import { timeAgo } from '@/lib/format';
import { newRequestKey } from '@/lib/api';
import { useAddComment, useCommentActions, useComments, useMe } from '@/lib/queries';
import { deferWithUndo, toast, toastError } from '@/lib/toast';
import type { Comment, CommentSort } from '@/lib/types';
import { colors, figures, fonts, radius, space, type } from '@/theme';

import { Avatar, Button, Card, Field, Icon, RowSkeleton, Segmented, Sheet, Tap, Txt } from './ui';

const MAX = 2000;
const SORTS: { key: CommentSort; label: string; icon: 'award' | 'clock' }[] = [
  { key: 'top', label: 'Top', icon: 'award' },
  { key: 'new', label: 'New', icon: 'clock' },
];

export function CommentsSection({ billId }: { billId: string }) {
  const [sort, setSort] = useState<CommentSort>('top');
  const { data: comments, isLoading } = useComments(billId, sort);
  const add = useAddComment(billId);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const { data: me } = useMe();
  const input = useRef<TextInput>(null);
  // One idempotency key per comment being written: retries of a failed send reuse it, a new comment gets a new one.
  const requestKey = useRef(newRequestKey());

  // Optimistic: the comment appears in the list right away and the box clears; if sending fails, the text comes back.
  const post = () => {
    const text = body;
    const parent = replyTo;
    setBody('');
    setReplyTo(null);
    add.mutate(
      { body: text, parent_comment_id: parent?.id, requestKey: requestKey.current, author: me?.display_name ?? 'you' },
      {
        onSuccess: () => {
          requestKey.current = newRequestKey();
        },
        onError: (e) => {
          setBody(text);
          setReplyTo(parent);
          toastError(e);
        },
      },
    );
  };
  const reply = (c: Comment) => {
    setReplyTo(c);
    input.current?.focus();
  };

  return (
    <View style={{ gap: space.md }}>
      <Txt style={type.h2}>Discussion</Txt>
      <Card style={{ gap: space.md }}>
        {replyTo ? (
          <View style={styles.replyingTo}>
            <Txt style={[type.small, { flex: 1 }]} numberOfLines={1}>
              Replying to @{replyTo.author_name}
            </Txt>
            <Txt style={[type.small, { color: colors.ink, textDecorationLine: 'underline' }]} onPress={() => setReplyTo(null)}>
              Cancel
            </Txt>
          </View>
        ) : null}
        <Field
          ref={input}
          accessibilityLabel={replyTo ? `Reply to @${replyTo.author_name}` : 'Write a comment'}
          value={body}
          onChangeText={(t) => setBody(t.slice(0, MAX))}
          placeholder={replyTo ? 'Write a reply…' : 'Share your take, kindly'}
          multiline
        />
        <View style={styles.composerRow}>
          <Txt style={[type.meta, { ...figures }]}>
            {body.length}/{MAX}
          </Txt>
          <Button title={replyTo ? 'Post reply' : 'Post comment'} small onPress={post} disabled={!body.trim()} />
        </View>
      </Card>

      {(comments?.length ?? 0) > 1 ? (
        <Segmented options={SORTS} value={sort} onChange={setSort} small />
      ) : null}
      {isLoading ? (
        <>
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : comments?.length ? (
        // Comments already there when the page opens just appear; only ones added or removed while you're here animate.
        <LayoutAnimationConfig skipEntering>
        {comments.map((c) => (
          // New comments fade in, deleted ones fade out, and the rest slide to their new places.
          <Animated.View key={c.id} style={{ gap: space.sm }} entering={FadeIn} exiting={FadeOut} layout={LinearTransition}>
            <CommentItem comment={c} billId={billId} onReply={() => reply(c)} />
            {c.replies.map((r) => (
              <Animated.View key={r.id} style={styles.reply} entering={FadeIn} exiting={FadeOut} layout={LinearTransition}>
                <CommentItem comment={r} billId={billId} />
              </Animated.View>
            ))}
          </Animated.View>
        ))}
        </LayoutAnimationConfig>
      ) : (
        <View style={styles.empty}>
          <Txt style={[type.small, { textAlign: 'center' }]}>No comments yet</Txt>
          <Button title="Write the first comment" small variant="secondary" icon="edit-3" onPress={() => input.current?.focus()} />
        </View>
      )}
    </View>
  );
}

function CommentItem({ comment: c, billId, onReply }: { comment: Comment; billId: string; onReply?: () => void }) {
  const actions = useCommentActions(billId);
  const [menu, setMenu] = useState(false);
  const pending = c.id.startsWith('pending-');
  const vote = (v: -1 | 1) =>
    actions.vote.mutate(
      { id: c.id, value: c.my_vote === v ? 0 : v, before: { net_score: c.net_score, my_vote: c.my_vote } },
      { onError: toastError },
    );
  // The comment disappears now; the delete is only sent if Undo isn't tapped within a few seconds.
  const remove = () => {
    const snap = actions.snapshot();
    deferWithUndo('Comment deleted', {
      hide: () => actions.hideLocally(c.id),
      restore: () => actions.restore(snap),
      commit: () => actions.remove.mutate(c.id, { onError: toastError }),
    });
  };
  const report = (category: string) =>
    actions.report.mutate(
      { id: c.id, category },
      { onSuccess: () => toast('Thanks, a moderator will take a look', 'success'), onError: toastError },
    );

  return (
    <Card style={[styles.comment, (c.is_hidden || pending) && { opacity: 0.6 }]}>
      <View style={styles.commentHead}>
        <Tap
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: c.author_id } })}
          style={styles.author}>
          <Avatar name={c.author_name} size={28} />
          <Txt style={type.bodyMedium}>@{c.author_name}</Txt>
        </Tap>
        <Txt style={type.meta}>{pending ? 'Sending…' : timeAgo(c.created_at)}</Txt>
        <View style={{ flex: 1 }} />
        {pending ? null : (
          <Tap onPress={() => setMenu(true)} style={styles.more} accessibilityLabel={c.is_mine ? 'Delete your comment' : 'Report this comment'}>
            <Icon name="more-horizontal" size={18} color={colors.inkSoft} />
          </Tap>
        )}
      </View>
      {c.is_hidden ? <Txt style={[type.meta, { color: colors.danger }]}>Hidden, only you can see this</Txt> : null}
      <Txt style={type.body}>{c.body}</Txt>
      <View style={[styles.commentActions, pending && { display: 'none' }]}>
        <Tap
          onPress={() => vote(1)}
          accessibilityLabel="Upvote this comment"
          accessibilityState={{ selected: c.my_vote === 1 }}
          style={[styles.pill, c.my_vote === 1 && styles.pillOn]}>
          <Icon name="arrow-up" size={16} color={c.my_vote === 1 ? '#fff' : colors.ink} />
        </Tap>
        <Text style={styles.score}>{c.net_score}</Text>
        <Tap
          onPress={() => vote(-1)}
          accessibilityLabel="Downvote this comment"
          accessibilityState={{ selected: c.my_vote === -1 }}
          style={[styles.pill, c.my_vote === -1 && styles.pillOn]}>
          <Icon name="arrow-down" size={16} color={c.my_vote === -1 ? '#fff' : colors.ink} />
        </Tap>
        {onReply ? (
          <Tap onPress={onReply} style={styles.pill} accessibilityRole="button" accessibilityLabel={`Reply to @${c.author_name}`}>
            <Icon name="corner-down-right" size={16} />
            <Text style={styles.pillText}>Reply</Text>
          </Tap>
        ) : null}
      </View>
      <Sheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={c.is_mine ? 'Your comment' : 'Report this comment'}
        options={
          c.is_mine
            ? [{ label: 'Delete comment', danger: true, onPress: remove }]
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
  replyingTo: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surfaceAlt, padding: space.sm, borderRadius: radius.xs, borderCurve: 'continuous' },
  empty: { alignItems: 'center', gap: space.md, marginVertical: space.lg },
  composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reply: { marginLeft: space.xl, borderLeftWidth: 2, borderLeftColor: colors.hairline, paddingLeft: space.sm },
  comment: { gap: space.sm, padding: space.md },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  author: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  more: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: colors.surfaceAlt },
  pillOn: { backgroundColor: colors.ink },
  pillText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.ink },
  score: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink, minWidth: 20, textAlign: 'center', ...figures },
});
