// Mirrors backend/app/schemas.py

export type Tokens = {
  access_token: string;
  refresh_token: string;
  needs_display_name: boolean;
  needs_onboarding: boolean;
};

export type NotificationType = 'new_bill' | 'status_update' | 'trending' | 'social' | 'legislator' | 'member_vote';

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
  /** Private: the user's own district (0 = at-large or delegate). */
  home_state: string | null;
  home_district: number | null;
  is_moderator: boolean;
  /** Gets the weekly recap by email (opt-in). */
  recap_email: boolean;
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

export type TimelineStep = {
  stage: string;
  label: string; // "Passed House"
  short: string; // "House"
  date: string | null; // YYYY-MM-DD
  reached: boolean;
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
  sponsor_id: string | null;
  sponsor_name: string | null;
  sponsor_label: string | null; // "Kim Schrier (D-WA-8)"
  sponsor_party: string | null;
  cosponsor_count: number;
  status: string;
  latest_action_text: string | null;
  timeline: TimelineStep[];
  congress_url: string | null;
  net_score: number;
  comment_count: number;
  is_trending: boolean;
  introduced_date: string | null;
  last_action_date: string | null;
  my_vote: -1 | 0 | 1;
  is_following: boolean;
  /** Feed only: why it's in your feed, e.g. "Because you follow Health". */
  reason: string | null;
  /** Search only: where the search words appear, matches wrapped in \u0002…\u0003. */
  snippet: string | null;
};

export type BillPage = { items: Bill[]; next_cursor: number | null };

export type Chamber = 'house' | 'senate';

export type LegislatorBase = {
  bioguide_id: string;
  name: string;
  full_name: string;
  party: string | null;
  state: string | null;
  district: number | null;
  chamber: Chamber | null;
  image_url: string | null;
  /** Placeholder drawn while the photo loads (see backend services/blurhash.py). */
  image_blurhash?: string | null;
  /** Their Washington office. */
  phone?: string | null;
};

export type CareerSpan = {
  chamber: Chamber;
  start: number | null;
  end: number | null;
};

export type Legislator = LegislatorBase & {
  in_office: boolean;
  is_following: boolean;
  state_name: string | null;
  image_credit: string | null;
  career: CareerSpan[];
  office_address: string | null;
  phone: string | null;
  sponsored_count: number;
  cosponsored_count: number;
};

/** A pre-drawn state map from /maps/{state}: SVG paths in a width x height box, y pointing down. */
export type StateMap = {
  state: string;
  name: string;
  width: number;
  height: number;
  outline: string;
  districts: Record<string, { path: string; bbox: [number, number, number, number] }>;
  cities: {
    name: string;
    x: number;
    y: number;
    pop: number;
    district: string | null;
  }[];
};

/** /maps/US: every state and district in one Albers USA layout (Alaska, Hawaii, Puerto Rico inset). */
export type NationalMap = {
  width: number;
  height: number;
  /** label: where the state's code goes; tag: for small states, a callout off the coast instead. */
  states: Record<
    string,
    {
      name: string;
      path: string;
      label: [number, number];
      tag: [number, number] | null;
    }
  >;
  /** Keyed "WA-8"; 0 is an at-large seat or delegate. */
  districts: Record<string, string>;
};

/** /maps/US/{state}: one state at full detail, in the national map's coordinates (for zooming in). */
export type NationalDetail = {
  outline: string;
  /** Keyed "WA-8". */
  districts: Record<string, string>;
};

export type District = {
  state: string;
  district: number;
  label: string; // "WA-8", "WY-AL"
  name: string; // "Washington's 8th District"
  representative: LegislatorBase | null;
  is_home: boolean;
  is_following: boolean;
};

export type StateDistricts = {
  state: string;
  name: string;
  senators: LegislatorBase[];
  districts: District[];
};

export type Representatives = {
  home: District | null;
  senators: LegislatorBase[];
};

export type Following = { legislators: LegislatorBase[]; bills: Bill[] };

export type FloorItem = {
  chamber: Chamber;
  day: string | null; // YYYY-MM-DD; null = sometime this week (House)
  heading: string;
  text: string;
  bills: { label: string; bill_id: string | null }[];
};

export type FloorWeek = {
  week_of: string;
  house: FloorItem[];
  senate: FloorItem[];
  house_url: string;
  senate_url: string;
};

export type FeedSort = 'for_you' | 'discussed';
export type CommentSort = 'top' | 'new';

export type Cosponsor = LegislatorBase & {
  is_original: boolean;
  sponsorship_date: string | null;
};

/** Search filter values; Independent also matches "ID" (Independent Democrat). */
export type PartyFilter = 'D' | 'R' | 'I';

/** /search?stage= values; "senate" = passed the House, Senate vote next (and vice versa). */
export type StageFilter = 'law' | 'president' | 'senate' | 'house' | 'committee' | 'vetoed' | 'passed';

export type StageCount = { key: StageFilter; bill_count: number };

export type LegislatorRole = 'all' | 'sponsored' | 'cosponsored';

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

export type CommentWithBill = Comment & {
  bill_label: string;
  bill_title: string;
};

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  bill_id: string | null;
  is_read: boolean;
  /** Earlier activity filled in when the bill was followed ("Before you followed"). */
  backfill: boolean;
  created_at: string;
};

export type Tag = {
  name: string;
  /** Everyday words for this topic (medicare, abortion, insulin…), from the server. */ words: string[];
};

// ---------- moderation dashboard ----------

export type ModQueue = 'pending' | 'hidden';

export type ReportCategory = 'harassment' | 'spam' | 'misinformation' | 'other';

export type ModComment = {
  id: string;
  bill_id: string;
  bill_label: string;
  bill_title: string;
  parent_comment_id: string | null;
  author_id: string;
  author_name: string;
  author_shadow_banned: boolean;
  author_hidden_count: number;
  body: string;
  net_score: number;
  is_flagged: boolean;
  is_hidden: boolean;
  reviewed_at: string | null;
  /** Reports filed since the last moderator review. */
  report_count: number;
  /** All reports, by category. */
  report_categories: Partial<Record<ReportCategory, number>>;
  created_at: string;
};

export type ModUser = {
  id: string;
  display_name: string;
  is_shadow_banned: boolean;
  comment_count: number;
  hidden_count: number;
  report_count: number;
  created_at: string;
};

export type SummaryReport = {
  id: string;
  reporter_name: string;
  feedback: string | null;
  created_at: string;
};

export type SummaryReportGroup = {
  bill_id: string;
  bill_label: string;
  bill_title: string;
  summary_simple: string | null;
  summary_detailed: string | null;
  reports: SummaryReport[];
};

// ---------- recorded votes ----------

export type PartyTally = { yea: number; nay: number; present: number; not_voting: number };

export type MemberPosition = LegislatorBase & {
  position: 'Yea' | 'Nay' | 'Present' | 'Not Voting' | string;
  note: string; // "Your representative", "Your senator", "You follow"
};

export type RollCall = {
  id: string;
  chamber: Chamber;
  congress: number;
  session: number;
  number: number;
  voted_at: string;
  /** The official question, word for word. */
  question: string;
  kind: 'passage' | 'cloture' | 'amendment' | 'nomination' | 'procedural' | 'other';
  result: string;
  measure: string | null;
  /** Set only when the bill is published in the app. */
  bill_id: string | null;
  yea: number;
  nay: number;
  present: number;
  not_voting: number;
  party_totals: Record<string, PartyTally>;
  source_url: string | null;
  your_members: MemberPosition[];
};

export type MemberVote = {
  roll_call: RollCall;
  position: string;
  bill_id: string | null;
  bill_label: string | null;
  bill_title: string | null;
};

export type MemberVotesPage = { items: MemberVote[]; next_cursor: number | null; missed: number; eligible: number };

// ---------- weekly recap ----------

export type DigestBill = { id: string; label: string; title: string; sponsor_party: string | null; what: string };

export type Digest = {
  week_start: string;
  followed: DigestBill[];
  votes: RollCall[];
  passed: DigestBill[];
  floor: { chamber: Chamber; label: string; bill_id: string | null }[];
  is_empty: boolean;
};

// ---------- since your last visit ----------

export type SinceItem = { kind: 'bills' | 'members' | 'topics'; text: string; bill_id: string | null; tag: string | null };
/** `since` is null on a first visit, when the strip is hidden. */
export type Since = { since: string | null; items: SinceItem[] };

// ---------- the official record around a bill ----------

export type CostEstimate = { title: string | null; description: string | null; url: string; date: string | null };
export type OfficialRelated = {
  label: string;
  congress: number | null;
  title: string | null;
  /** Official wording: "Identical bill", "Related bill", "Procedurally-related"… */
  relationships: string[];
  latest: string | null;
  bill_id: string | null;
  url: string;
};
export type BillRecord = { cbo_estimates: CostEstimate[]; related: OfficialRelated[] };
