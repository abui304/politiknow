import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueries,
  useQueryClient,
} from '@tanstack/react-query';

import { registerForPush } from './push';
import { api, newRequestKey } from './api';
import type {
  AppNotification,
  Bill,
  BillPage,
  BillRecord,
  Chamber,
  Comment,
  CommentSort,
  CommentWithBill,
  Cosponsor,
  Digest,
  District,
  FeedSort,
  FloorWeek,
  Following,
  Legislator,
  LegislatorRole,
  Me,
  MemberVotesPage,
  ModComment,
  ModQueue,
  ModUser,
  NationalDetail,
  NationalMap,
  NotificationPrefs,
  PartyFilter,
  Profile,
  Representatives,
  RollCall,
  Since,
  StageCount,
  StageFilter,
  StateDistricts,
  StateMap,
  SummaryReportGroup,
  Tag,
} from './types';

export type SearchFilters = {
  q: string;
  tag: string | null;
  party: PartyFilter | null;
  chamber: Chamber | null;
  stage: StageFilter | null;
};

export const keys = {
  me: ['me'] as const,
  tags: ['tags'] as const,
  feed: ['feed'] as const,
  feedSorted: (sort: FeedSort) => ['feed', sort] as const,
  search: (f: SearchFilters) => ['search', f] as const,
  related: (id: string) => ['bill', id, 'related'] as const,
  billVotes: (id: string) => ['bill', id, 'votes'] as const,
  billRecord: (id: string) => ['bill', id, 'record'] as const,
  legislatorVotes: (id: string) => ['legislator', id, 'votes'] as const,
  myMembersVotes: ['me', 'members', 'votes'] as const,
  digest: ['digest'] as const,
  since: ['me', 'since'] as const,
  stages: (f: Omit<SearchFilters, 'stage'>) => ['stages', f] as const,
  bill: (id: string) => ['bill', id] as const,
  cosponsors: (billId: string) => ['bill', billId, 'cosponsors'] as const,
  legislators: (q: string, party: PartyFilter | null, chamber: Chamber | null) =>
    ['legislators', q, party, chamber] as const,
  legislator: (id: string) => ['legislator', id] as const,
  stateMap: (state: string) => ['stateMap', state] as const,
  nationalDetail: (state: string) => ['stateMap', 'US', state] as const,
  legislatorBills: (id: string, role: LegislatorRole) => ['legislatorBills', id, role] as const,
  billText: (id: string) => ['bill', id, 'text'] as const,
  comments: (billId: string) => ['comments', billId] as const,
  profile: (id: string) => ['profile', id] as const,
  userComments: (id: string) => ['userComments', id] as const,
  notifications: ['notifications'] as const,
  following: ['following'] as const,
  stateDistricts: (state: string) => ['districts', state] as const,
  myDistricts: ['districts', 'mine'] as const,
  representatives: ['representatives'] as const,
  calendar: ['calendar'] as const,
  modComments: (view: ModQueue) => ['moderation', 'comments', view] as const,
  modUsers: (q: string) => ['moderation', 'users', q] as const,
  modSummaries: ['moderation', 'summaries'] as const,
};

// ---------- reads ----------

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/users/me') });

export const useTags = () =>
  useQuery({
    queryKey: keys.tags,
    queryFn: () => api<Tag[]>('/tags'),
    staleTime: Infinity,
  });

export const useFeed = (sort: FeedSort = 'for_you') =>
  useInfiniteQuery({
    queryKey: keys.feedSorted(sort),
    queryFn: ({ pageParam }) => api<BillPage>(`/feed?sort=${sort}&cursor=${pageParam}&limit=15`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

export const useSearch = (filters: SearchFilters) =>
  useInfiniteQuery({
    queryKey: keys.search(filters),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        cursor: String(pageParam),
        limit: '20',
      });
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      return api<BillPage>(`/search?${params}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: Object.values(filters).some(Boolean),
    // Stale-while-revalidate: keep showing the last results while the next query loads, instead of a blank list.
    placeholderData: (previous) => previous,
  });

/** Legislators whose name matches `q`, most active first. */
export const useLegislators = (q: string, party: PartyFilter | null, chamber: Chamber | null) =>
  useQuery({
    queryKey: keys.legislators(q, party, chamber),
    queryFn: () => {
      const params = new URLSearchParams({ q, limit: '5' });
      if (party) params.set('party', party);
      if (chamber) params.set('chamber', chamber);
      return api<Legislator[]>(`/legislators?${params}`);
    },
    enabled: Boolean(q),
    placeholderData: (previous) => previous,
  });

export const useLegislator = (id: string) =>
  useQuery({
    queryKey: keys.legislator(id),
    queryFn: () => api<Legislator>(`/legislators/${id}`),
  });

export const useLegislatorBills = (id: string, role: LegislatorRole) =>
  useInfiniteQuery({
    queryKey: keys.legislatorBills(id, role),
    queryFn: ({ pageParam }) =>
      api<BillPage>(`/legislators/${id}/bills?role=${role}&cursor=${pageParam}&limit=15`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

/** Static per-state boundary data; never changes within a session. */
export const useStateMap = (state: string | null | undefined) =>
  useQuery({
    queryKey: keys.stateMap(state ?? ''),
    queryFn: () => api<StateMap>(`/maps/${state}`),
    enabled: Boolean(state),
    staleTime: Infinity,
  });

export const useBillCosponsors = (billId: string) =>
  useQuery({
    queryKey: keys.cosponsors(billId),
    queryFn: () => api<Cosponsor[]>(`/bills/${billId}/cosponsors`),
  });

/** CBO cost estimates and the bills Congress officially links to this one. */
export const useBillRecord = (id: string) =>
  useQuery({ queryKey: keys.billRecord(id), queryFn: () => api<BillRecord>(`/bills/${id}/record`), staleTime: 30 * 60_000 });

/** Opens a bill Congress links to this one. If PolitiKNOW doesn't have it yet, the server fetches and summarizes
 *  it first (a few seconds). Resolves to its id in the app. */
export function useOpenRelated(fromId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: { congress: number; type: string; number: number }) =>
      api<{ bill_id: string }>(`/bills/${fromId}/record/open`, { method: 'POST', body: r }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.billRecord(fromId) }),
  });
}

/** Every recorded vote on a bill: passage first, procedural last, with the user's own members. */
export const useBillVotes = (id: string) =>
  useQuery({ queryKey: keys.billVotes(id), queryFn: () => api<RollCall[]>(`/bills/${id}/votes`), staleTime: 5 * 60_000 });

/** A member's recorded votes, newest first, with missed votes this Congress (count and denominator). */
export const useLegislatorVotes = (id: string) =>
  useInfiniteQuery({
    queryKey: keys.legislatorVotes(id),
    queryFn: ({ pageParam }) => api<MemberVotesPage>(`/legislators/${id}/votes?cursor=${pageParam}&limit=10`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

/** What changed since the last visit, for the top of the feed. Fetched once per visit. */
export const useSince = () =>
  useQuery({ queryKey: keys.since, queryFn: () => api<Since>('/users/me/since'), staleTime: 30 * 60_000 });

/** This week's recap. */
export const useDigest = () => useQuery({ queryKey: keys.digest, queryFn: () => api<Digest>('/digest') });

/** Recent passage and cloture votes by the user's own members of Congress. */
export const useMyMembersVotes = () =>
  useQuery({
    queryKey: keys.myMembersVotes,
    queryFn: () => api<{ items: RollCall[] }>('/users/me/members/votes?limit=5').then((r) => r.items),
  });

/** Bills on the same subjects as this one, closest first. */
export const useRelatedBills = (id: string) =>
  useQuery({
    queryKey: keys.related(id),
    queryFn: () => api<Bill[]>(`/bills/${id}/related`),
    staleTime: 10 * 60_000,
  });

/** Bill counts per status, within the other active search filters. */
export const useStageCounts = (filters: Omit<SearchFilters, 'stage'>) =>
  useQuery({
    queryKey: keys.stages(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      return api<StageCount[]>(`/stages?${params}`);
    },
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous, // keep the row steady while counts refresh
  });

/** A bill as it already appears in a loaded list (feed, search, a legislator's bills), if anywhere. */
function billFromLists(qc: QueryClient, id: string): Bill | undefined {
  for (const key of [keys.feed, ['search'], ['legislatorBills']]) {
    for (const [, data] of qc.getQueriesData<InfiniteData<BillPage>>({
      queryKey: key,
    })) {
      const hit = data?.pages?.flatMap((p) => p.items).find((b) => b.id === id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Opening a bill from a list renders instantly from the list's copy, then refreshes it in the background. */
export const useBill = (id: string) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.bill(id),
    queryFn: () => api<Bill>(`/bills/${id}`),
    initialData: () => billFromLists(qc, id),
    initialDataUpdatedAt: 0, // treat the list copy as stale, so the full bill is fetched right away
  });
};

/** Start loading a bill page before the tap finishes (on press-in), so it's usually ready when it opens. */
export function prefetchBill(qc: QueryClient, id: string) {
  qc.prefetchQuery({
    queryKey: keys.bill(id),
    queryFn: () => api<Bill>(`/bills/${id}`),
    staleTime: 30_000,
  });
  qc.prefetchQuery({
    queryKey: [...keys.comments(id), 'top'],
    queryFn: () => api<Comment[]>(`/bills/${id}/comments?sort=top`),
    staleTime: 30_000,
  });
}

export const useBillText = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.billText(id),
    queryFn: () => api<{ full_text: string | null; congress_url: string | null }>(`/bills/${id}/text`),
    enabled,
    staleTime: Infinity,
  });

export const useComments = (billId: string, sort: CommentSort = 'top') =>
  useQuery({
    queryKey: [...keys.comments(billId), sort],
    queryFn: () => api<Comment[]>(`/bills/${billId}/comments?sort=${sort}`),
    placeholderData: (previous) => previous, // keep the list up while switching Top/New
  });

export const useProfile = (id: string) =>
  useQuery({
    queryKey: keys.profile(id),
    queryFn: () => api<Profile>(`/users/${id}`),
  });

export const useUserComments = (id: string | undefined) =>
  useQuery({
    queryKey: keys.userComments(id ?? ''),
    queryFn: () => api<CommentWithBill[]>(`/users/${id}/comments`),
    enabled: Boolean(id),
  });

export const useNotifications = () =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: () => api<AppNotification[]>('/notifications'),
  });

/** Legislators and bills the signed-in user follows. */
export const useFollowing = () =>
  useQuery({
    queryKey: keys.following,
    queryFn: () => api<Following>('/users/me/following'),
  });

/** The nationwide map; static, like the state maps. */
export const useNationalMap = () =>
  useQuery({
    queryKey: keys.stateMap('US'),
    queryFn: () => api<NationalMap>('/maps/US'),
    staleTime: Infinity,
  });

/** Full-detail boundaries for these states, keyed by state, as each one loads. */
export const useNationalDetail = (states: string[]) =>
  useQueries({
    queries: states.map((state) => ({
      queryKey: keys.nationalDetail(state),
      queryFn: () => api<NationalDetail>(`/maps/US/${state}`),
      staleTime: Infinity,
    })),
    combine: (results) =>
      Object.fromEntries(results.flatMap((r, i) => (r.data ? [[states[i], r.data]] : []))) as Record<string, NationalDetail>,
  });

export const useStateDistricts = (state: string | null | undefined) =>
  useQuery({
    queryKey: keys.stateDistricts(state ?? ''),
    queryFn: () => api<StateDistricts>(`/districts/${state}`),
    enabled: Boolean(state),
  });

export const useMyDistricts = () =>
  useQuery({
    queryKey: keys.myDistricts,
    queryFn: () => api<District[]>('/users/me/districts'),
  });

export const useRepresentatives = () =>
  useQuery({
    queryKey: keys.representatives,
    queryFn: () => api<Representatives>('/users/me/representatives'),
  });

/** This week's House and Senate floor schedule. */
export const useCalendar = () =>
  useQuery({
    queryKey: keys.calendar,
    queryFn: () => api<FloorWeek>('/calendar'),
    staleTime: 10 * 60_000,
  });

// ---------- writes ----------

/** Apply a change to a bill everywhere it's cached (feed, search and legislator pages, detail). */
function patchBill(qc: QueryClient, id: string, patch: Partial<Bill>) {
  const patchPages = (data: InfiniteData<BillPage> | undefined) =>
    data && {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        items: p.items.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      })),
    };
  qc.setQueriesData({ queryKey: keys.feed }, patchPages);
  qc.setQueriesData({ queryKey: ['search'] }, patchPages);
  qc.setQueriesData({ queryKey: ['legislatorBills'] }, patchPages);
  qc.setQueryData<Bill>(keys.bill(id), (b) => b && { ...b, ...patch });
}

/** Optimistic: the arrow and score change on tap; a failed request puts them back. */
export function useVoteBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: -1 | 0 | 1; before: Pick<Bill, 'net_score' | 'my_vote'> }) =>
      api<{ net_score: number; my_vote: -1 | 0 | 1 }>(`/bills/${id}/vote`, {
        method: 'POST',
        body: { value },
      }),
    onMutate: ({ id, value, before }) =>
      patchBill(qc, id, {
        my_vote: value,
        net_score: before.net_score - before.my_vote + value,
      }),
    onError: (_e, { id, before }) => patchBill(qc, id, before),
    onSuccess: (res, { id }) => patchBill(qc, id, res),
  });
}

/** Apply a change to one comment (or reply) in every cached sort of a bill's discussion. */
function patchComments(qc: QueryClient, billId: string, change: (list: Comment[]) => Comment[]) {
  qc.setQueriesData<Comment[]>({ queryKey: keys.comments(billId) }, (list) => list && change(list));
}

const mapComment = (id: string, f: (c: Comment) => Comment) => (list: Comment[]): Comment[] =>
  list.map((c) => (c.id === id ? f(c) : { ...c, replies: c.replies.map((r) => (r.id === id ? f(r) : r)) }));

/**
 * Posting shows the comment at once, marked as sending, and swaps in the server's copy when it lands.
 * `requestKey` is the idempotency key for this comment: keep it for retries of the same text.
 */
export function useAddComment(billId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestKey, ...body }: { body: string; parent_comment_id?: string; requestKey: string; author: string }) =>
      api<Comment>(`/bills/${billId}/comments`, {
        method: 'POST',
        body: { body: body.body, parent_comment_id: body.parent_comment_id },
        idempotencyKey: requestKey,
      }),
    retry: 2, // safe to retry: the same key means the server posts it at most once
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.comments(billId) });
      const pending: Comment = {
        id: `pending-${v.requestKey}`,
        bill_id: billId,
        parent_comment_id: v.parent_comment_id ?? null,
        author_id: 'me',
        author_name: v.author,
        body: v.body,
        net_score: 0,
        my_vote: 0,
        is_mine: true,
        is_flagged: false,
        is_hidden: false,
        created_at: new Date().toISOString(),
        replies: [],
      };
      patchComments(qc, billId, (list) =>
        v.parent_comment_id
          ? list.map((c) => (c.id === v.parent_comment_id ? { ...c, replies: [...c.replies, pending] } : c))
          : [pending, ...list],
      );
      patchBill(qc, billId, {
        comment_count: (qc.getQueryData<Bill>(keys.bill(billId))?.comment_count ?? 0) + 1,
      });
    },
    onError: (_e, v) => {
      const gone = `pending-${v.requestKey}`;
      patchComments(qc, billId, (list) =>
        list
          .filter((c) => c.id !== gone)
          .map((c) => ({
            ...c,
            replies: c.replies.filter((r) => r.id !== gone),
          })),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.comments(billId) });
      qc.invalidateQueries({ queryKey: keys.bill(billId) });
    },
  });
}

export function useCommentActions(billId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: keys.comments(billId) });
    qc.invalidateQueries({ queryKey: keys.bill(billId) });
  };
  return {
    /** Optimistic, like bill votes. */
    vote: useMutation({
      mutationFn: ({ id, value }: { id: string; value: -1 | 0 | 1; before: Pick<Comment, 'net_score' | 'my_vote'> }) =>
        api(`/comments/${id}/vote`, { method: 'POST', body: { value } }),
      onMutate: ({ id, value, before }) =>
        patchComments(
          qc,
          billId,
          mapComment(id, (c) => ({
            ...c,
            my_vote: value,
            net_score: before.net_score - before.my_vote + value,
          })),
        ),
      onError: (_e, { id, before }) =>
        patchComments(
          qc,
          billId,
          mapComment(id, (c) => ({ ...c, ...before })),
        ),
    }),
    report: useMutation({
      mutationFn: ({ id, category }: { id: string; category: string }) =>
        api(`/comments/${id}/report`, {
          method: 'POST',
          body: { category },
          idempotencyKey: `${id}:${category}:${newRequestKey()}`,
        }),
      onSuccess: refresh,
    }),
    /** Called after the Undo window has passed (see deferWithUndo). */
    remove: useMutation({
      mutationFn: (id: string) => api(`/comments/${id}`, { method: 'DELETE' }),
      onSettled: refresh,
    }),
    /** Hide a comment locally (for the Undo window), or put back a snapshot. */
    snapshot: () => qc.getQueriesData<Comment[]>({ queryKey: keys.comments(billId) }),
    restore: (snap: [readonly unknown[], Comment[] | undefined][]) => snap.forEach(([key, data]) => qc.setQueryData(key, data)),
    hideLocally: (id: string) =>
      patchComments(qc, billId, (list) =>
        list
          .filter((c) => c.id !== id)
          .map((c) => ({
            ...c,
            replies: c.replies.filter((r) => r.id !== id),
          })),
      ),
  };
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Partial<{
        display_name: string;
        onboarding_tags: string[];
        notification_preferences: NotificationPrefs;
        push_token: string | null;
        recap_email: boolean;
      }>,
    ) => api<Me>('/users/me', { method: 'PATCH', body }),
    onSuccess: (me) => {
      qc.setQueryData(keys.me, me);
      qc.invalidateQueries({ queryKey: keys.feed });
    },
  });
}

export function useFollow(userId: string) {
  const qc = useQueryClient();
  const patch = (follow: boolean) =>
    qc.setQueryData<Profile>(keys.profile(userId), (p) =>
      p && p.is_following !== follow
        ? {
            ...p,
            is_following: follow,
            follower_count: p.follower_count + (follow ? 1 : -1),
          }
        : p,
    );
  return useMutation({
    mutationFn: (follow: boolean) => api(`/users/${userId}/follow`, { method: follow ? 'POST' : 'DELETE' }),
    onMutate: patch, // optimistic
    onError: (_e, follow) => patch(!follow),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.profile(userId) });
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

/**
 * After a follow: Alerts may have new entries (a first follow fills in the bill's recent activity), and
 * this is when asking for push permission makes sense, since there's now something to be alerted about.
 * The prompt shows at most once; the system remembers the answer.
 */
function afterFollow(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: keys.notifications });
  registerForPush({ ask: true });
}

export function useFollowBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, follow }: { id: string; follow: boolean }) =>
      api(`/bills/${id}/follow`, { method: follow ? 'POST' : 'DELETE' }),
    onMutate: ({ id, follow }) => patchBill(qc, id, { is_following: follow }), // one tap, instant
    onError: (_e, { id, follow }) => patchBill(qc, id, { is_following: !follow }),
    onSuccess: (_d, { follow }) => {
      if (follow) afterFollow(qc);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.following }),
  });
}

export function useFollowLegislator(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (follow: boolean) => api(`/legislators/${id}/follow`, { method: follow ? 'POST' : 'DELETE' }),
    onMutate: (follow) => qc.setQueryData<Legislator>(keys.legislator(id), (l) => l && { ...l, is_following: follow }),
    onError: (_e, follow) => qc.setQueryData<Legislator>(keys.legislator(id), (l) => l && { ...l, is_following: !follow }),
    onSuccess: (_d, follow) => {
      if (follow) afterFollow(qc);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.following }),
  });
}

/** Refetch everything that shows districts after the home district or a follow changes. */
function refreshPlaces(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['districts'] });
  qc.invalidateQueries({ queryKey: keys.representatives });
  qc.invalidateQueries({ queryKey: keys.me });
}

export function useFollowDistrict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ state, district, follow }: { state: string; district: number; follow: boolean }) =>
      api(`/districts/${state}/${district}/follow`, {
        method: follow ? 'POST' : 'DELETE',
      }),
    // Optimistic: flip the district in its state's list and drop it from "Districts you follow" right away.
    onMutate: ({ state, district, follow }) => {
      qc.setQueryData<StateDistricts>(
        keys.stateDistricts(state),
        (d) =>
          d && {
            ...d,
            districts: d.districts.map((x) => (x.district === district ? { ...x, is_following: follow } : x)),
          },
      );
      if (!follow) {
        qc.setQueryData<District[]>(keys.myDistricts, (list) =>
          list?.filter((x) => !(x.state === state && x.district === district)),
        );
      }
    },
    onSettled: () => refreshPlaces(qc),
  });
}

/** Sets the home district from a location (used once, never stored) or a district picked on the map. */
export function useSetHome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      body: { latitude: number; longitude: number } | { state: string; district: number } | null,
    ): Promise<Representatives | undefined> =>
      body === null
        ? api('/users/me/home', { method: 'DELETE' })
        : 'latitude' in body
          ? api<Representatives>('/users/me/home/locate', {
              method: 'POST',
              body,
            })
          : api<Representatives>('/users/me/home', { method: 'PUT', body }),
    onSuccess: (reps) => {
      qc.setQueryData(keys.representatives, reps ?? { home: null, senators: [] });
      refreshPlaces(qc);
    },
  });
}

// ---------- moderation dashboard ----------

export const useModComments = (view: ModQueue) =>
  useQuery({
    queryKey: keys.modComments(view),
    queryFn: () => api<ModComment[]>(`/moderation/comments?view=${view}`),
  });

/** Shadow-banned users, or (with `q`) anyone whose display name starts with it. */
export const useModUsers = (q: string) =>
  useQuery({
    queryKey: keys.modUsers(q),
    queryFn: () => api<ModUser[]>(`/moderation/users?q=${encodeURIComponent(q)}`),
  });

export const useModSummaries = () =>
  useQuery({
    queryKey: keys.modSummaries,
    queryFn: () => api<SummaryReportGroup[]>('/moderation/summary-reports'),
  });

export function useModActions() {
  const qc = useQueryClient();
  // Every action can change what's in each tab, a bill's comment list, or its comment count.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['moderation'] });
    qc.invalidateQueries({ queryKey: ['comments'] });
    qc.invalidateQueries({ queryKey: ['bill'] });
  };
  return {
    approve: useMutation({
      mutationFn: (id: string) => api(`/moderation/comments/${id}/approve`, { method: 'POST' }),
      onSuccess: refresh,
    }),
    hide: useMutation({
      mutationFn: (id: string) => api(`/moderation/comments/${id}/hide`, { method: 'POST' }),
      onSuccess: refresh,
    }),
    shadowBan: useMutation({
      mutationFn: ({ userId, banned }: { userId: string; banned: boolean }) =>
        api(`/moderation/users/${userId}/shadow-ban`, {
          method: banned ? 'PUT' : 'DELETE',
        }),
      onSuccess: refresh,
    }),
    resolveSummary: useMutation({
      mutationFn: (billId: string) =>
        api(`/moderation/bills/${billId}/summary-reports/resolve`, {
          method: 'POST',
        }),
      onSuccess: refresh,
    }),
    regenerateSummary: useMutation({
      mutationFn: (billId: string) =>
        api<SummaryReportGroup>(`/moderation/bills/${billId}/regenerate-summary`, { method: 'POST' }),
      onSuccess: refresh,
    }),
  };
}
