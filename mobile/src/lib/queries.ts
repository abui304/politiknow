import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from './api';
import type {
  AppNotification,
  Bill,
  BillPage,
  Chamber,
  Comment,
  CommentWithBill,
  Cosponsor,
  Hashtag,
  Legislator,
  LegislatorRole,
  Me,
  NotificationPrefs,
  PartyFilter,
  Profile,
  StageCount,
  StageFilter,
  StateMap,
  Tag,
} from './types';

export type SearchFilters = {
  q: string;
  tag: string | null;
  hashtag: string | null;
  party: PartyFilter | null;
  chamber: Chamber | null;
  stage: StageFilter | null;
};

export const keys = {
  me: ['me'] as const,
  tags: ['tags'] as const,
  feed: ['feed'] as const,
  search: (f: SearchFilters) => ['search', f] as const,
  hashtags: ['hashtags'] as const,
  stages: (f: Omit<SearchFilters, 'stage'>) => ['stages', f] as const,
  bill: (id: string) => ['bill', id] as const,
  cosponsors: (billId: string) => ['bill', billId, 'cosponsors'] as const,
  legislators: (q: string, party: PartyFilter | null, chamber: Chamber | null) =>
    ['legislators', q, party, chamber] as const,
  legislator: (id: string) => ['legislator', id] as const,
  stateMap: (state: string) => ['stateMap', state] as const,
  legislatorBills: (id: string, role: LegislatorRole) => ['legislatorBills', id, role] as const,
  billText: (id: string) => ['bill', id, 'text'] as const,
  comments: (billId: string) => ['comments', billId] as const,
  profile: (id: string) => ['profile', id] as const,
  userComments: (id: string) => ['userComments', id] as const,
  notifications: ['notifications'] as const,
};

// ---------- reads ----------

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/users/me') });

export const useTags = () =>
  useQuery({ queryKey: keys.tags, queryFn: () => api<Tag[]>('/tags'), staleTime: Infinity });

export const useFeed = () =>
  useInfiniteQuery({
    queryKey: keys.feed,
    queryFn: ({ pageParam }) => api<BillPage>(`/feed?cursor=${pageParam}&limit=15`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

export const useSearch = (filters: SearchFilters) =>
  useInfiniteQuery({
    queryKey: keys.search(filters),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ cursor: String(pageParam), limit: '20' });
      for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
      return api<BillPage>(`/search?${params}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: Object.values(filters).some(Boolean),
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
  });

export const useLegislator = (id: string) =>
  useQuery({ queryKey: keys.legislator(id), queryFn: () => api<Legislator>(`/legislators/${id}`) });

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
  useQuery({ queryKey: keys.cosponsors(billId), queryFn: () => api<Cosponsor[]>(`/bills/${billId}/cosponsors`) });

export const usePopularHashtags = () =>
  useQuery({ queryKey: keys.hashtags, queryFn: () => api<Hashtag[]>('/hashtags?limit=24'), staleTime: 5 * 60_000 });

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

export const useBill = (id: string) =>
  useQuery({ queryKey: keys.bill(id), queryFn: () => api<Bill>(`/bills/${id}`) });

export const useBillText = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.billText(id),
    queryFn: () => api<{ full_text: string | null; congress_url: string | null }>(`/bills/${id}/text`),
    enabled,
    staleTime: Infinity,
  });

export const useComments = (billId: string) =>
  useQuery({ queryKey: keys.comments(billId), queryFn: () => api<Comment[]>(`/bills/${billId}/comments`) });

export const useProfile = (id: string) =>
  useQuery({ queryKey: keys.profile(id), queryFn: () => api<Profile>(`/users/${id}`) });

export const useUserComments = (id: string | undefined) =>
  useQuery({
    queryKey: keys.userComments(id ?? ''),
    queryFn: () => api<CommentWithBill[]>(`/users/${id}/comments`),
    enabled: Boolean(id),
  });

export const useNotifications = () =>
  useQuery({ queryKey: keys.notifications, queryFn: () => api<AppNotification[]>('/notifications') });

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
  qc.setQueryData(keys.feed, patchPages);
  qc.setQueriesData({ queryKey: ['search'] }, patchPages);
  qc.setQueriesData({ queryKey: ['legislatorBills'] }, patchPages);
  qc.setQueryData<Bill>(keys.bill(id), (b) => b && { ...b, ...patch });
}

export function useVoteBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: -1 | 0 | 1 }) =>
      api<{ net_score: number; my_vote: -1 | 0 | 1 }>(`/bills/${id}/vote`, { method: 'POST', body: { value } }),
    onSuccess: (res, { id }) => patchBill(qc, id, res),
  });
}

export function useAddComment(billId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { body: string; parent_comment_id?: string }) =>
      api<Comment>(`/bills/${billId}/comments`, { method: 'POST', body }),
    onSuccess: () => {
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
    vote: useMutation({
      mutationFn: ({ id, value }: { id: string; value: -1 | 0 | 1 }) =>
        api(`/comments/${id}/vote`, { method: 'POST', body: { value } }),
      onSuccess: refresh,
    }),
    report: useMutation({
      mutationFn: ({ id, category }: { id: string; category: string }) =>
        api(`/comments/${id}/report`, { method: 'POST', body: { category } }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/comments/${id}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
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
  return useMutation({
    mutationFn: (follow: boolean) => api(`/users/${userId}/follow`, { method: follow ? 'POST' : 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.profile(userId) });
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}
