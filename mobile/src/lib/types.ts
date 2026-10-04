// Mirrors backend/app/schemas.py

export type Tokens = {
  access_token: string;
  refresh_token: string;
  needs_display_name: boolean;
  needs_onboarding: boolean;
};

export type NotificationType = 'new_bill' | 'status_update' | 'trending' | 'social';

export type NotificationPrefs = {
  types: Record<NotificationType, boolean>;
  tags: string[] | null;
  quiet_hours: { start: string; end: string; tz: string } | null;
};

export type Me = {
  id: string;
  email: string | null;
  display_name: string | null;
  auth_provider: 'email' | 'google' | 'apple';
  onboarding_tags: string[];
  notification_preferences: NotificationPrefs;
  is_premium: boolean;
  email_verified: boolean;
  follower_count: number;
  following_count: number;
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_me: boolean;
  created_at: string;
};

export type Bill = {
  id: string;
  label: string;
  congress_number: number;
  bill_type: string;
  bill_number: number;
  title: string;
  summary_simple: string | null;
  summary_detailed: string | null;
  primary_tags: string[];
  sub_tags: string[];
  sponsor_name: string | null;
  sponsor_party: string | null;
  status: string;
  latest_action_text: string | null;
  congress_url: string | null;
  net_score: number;
  comment_count: number;
  is_trending: boolean;
  introduced_date: string | null;
  last_action_date: string | null;
  my_vote: -1 | 0 | 1;
};

export type BillPage = { items: Bill[]; next_cursor: number | null };

export type Comment = {
  id: string;
  bill_id: string;
  parent_comment_id: string | null;
  author_id: string;
  author_name: string;
  body: string;
  net_score: number;
  my_vote: -1 | 0 | 1;
  is_mine: boolean;
  is_flagged: boolean;
  is_hidden: boolean;
  created_at: string;
  replies: Comment[];
};

export type CommentWithBill = Comment & { bill_label: string; bill_title: string };

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  bill_id: string | null;
  is_read: boolean;
  created_at: string;
};

export type Tag = { name: string };

export type Hashtag = { name: string; bill_count: number };
