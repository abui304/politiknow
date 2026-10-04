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
  Comment,
  CommentWithBill,
  Me,
  NotificationPrefs,
  Profile,
  Tag,
} from './types';

export const keys = {
  me: ['me'] as const,
  tags: ['tags'] as const,
  feed: ['feed'] as const,
  search: (q: string, tag: string | null) => ['search', q, tag] as const,
  bill: (id: string) => ['bill', id] as const,
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

export const useSearch = (q: string, tag: string | null) =>
  useInfiniteQuery({
    queryKey: keys.search(q, tag),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ cursor: String(pageParam), limit: '20' });
      if (q) params.set('q', q);
      if (tag) params.set('tag', tag);
      return api<BillPage>(`/search?${params}`);
    },
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: Boolean(q || tag),
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

/** Apply a change to a bill everywhere it's cached (feed, search pages, detail). */
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
