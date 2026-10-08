# PolitiKNOW

Federal legislation, made easy to know. PolitiKNOW pulls real bills from Congress.gov, summarizes them with AI in plain English, and puts them in a personalized social feed where people can vote, discuss, and follow each other.

One codebase runs on **iOS, Android, and the web**.

```
backend/   FastAPI + PostgreSQL + Redis + Celery (Python 3.12)
mobile/    Expo / React Native app (iOS, Android, web)
PolitiKNOW_Technical_Spec.docx   product + technical spec (v1.1)
```

---

## What the app does

### Accounts and onboarding
- Sign up with email and password, choosing an anonymous **display name** (3–30 letters, numbers, or underscores). Real names are never required or shown.
- Google sign-in is built in but stays hidden until a Google client ID is configured. Google users must still pick their own display name; the Google profile name is never used.
- New users pick **5–10 topics** from the 34 Library of Congress policy areas (Health, Taxation, Immigration, ...). These seed the personalized feed.
- Sessions refresh themselves in the background, so people stay signed in for 30 days.

### Feed
- An infinite-scroll feed of bill cards, **personalized** to each user:
  ```
  score = topic match × 0.45 + recency × 0.25 + trending × 0.20 + followed users × 0.10 + follows × 0.20
  ```
  - **Topic match:** how much of the user's last 30 days of activity (views, votes, comments) involves the bill's topics, plus their onboarding picks.
  - **Recency:** halves every 30 days since the bill's last action (configurable).
  - **Trending:** bills getting unusual engagement in the last 24 hours (see below).
  - **Followed users:** bills that people you follow voted on or commented on.
  - **Follows:** bills you follow, and bills sponsored or cosponsored by legislators you follow.
- **Why am I seeing this?** Each card says why it's there, e.g. "Because you follow Health" or "Sponsored by Kim Schrier, who you follow". It names the most personal reason that applies (something you follow, then your topics, then people you follow, then trending), and only says "Recent activity in Congress" when none do.
- **For you / Most discussed** tabs. Most discussed ranks bills by comments in the last 7 days.
- A **This week on the floor** link opens the floor calendar (see below).
- Each card is **colored by the sponsor's party** (blue Democrat, red Republican, yellow Independent) and shows the bill number, date, a **timeline** of its path through Congress (Intro, Committee, House, Senate, President, Law) with the date of each step reached, a short plain-English summary, topics, a Trending badge, votes, comment count, a **Follow** bell, and Share.
- Pull down to refresh and re-rank.

### Bill pages
- **Simple** (about 150–250 words, no jargon) and **Detailed** (about 400–600 words) AI summaries, switchable with a toggle.
- A persistent notice that the summary is AI-generated; tapping it shows the **full bill text** in the app (the first 20,000 characters, with the rest on Congress.gov).
- **Find in bill text:** type a word to see every place it appears in the whole bill with a little context (phones have no Ctrl+F). Opening a bill from a search result fills it in with the matched word.
- **Follow** a bill with one tap to get an alert whenever it moves, without voting or commenting on it.
- The bill's **timeline** with dates, its latest action (one line; tap to expand), sponsor (e.g. "Kim Schrier (D-WA-8)"), topics, and **#hashtags** (folded into a small "Hashtags (N)" pill; tap to show them). Resolutions show their shorter path (a simple resolution only needs its own chamber; concurrent resolutions skip the President), and a vetoed bill ends in Vetoed.
- **Tap the sponsor** to open their legislator page, or tap **Cosponsors (N)** to see every current cosponsor (original cosponsors first), each linking to their own page.
- Link to the official Congress.gov page, and a **Report inaccuracy** button with an optional note.
- Up/down voting and sharing (the phone's share sheet; on web, the browser's share menu or copy to clipboard).

### Discussion
- Comments up to 2,000 characters, with **one level of replies**.
- Up/down votes on comments, with **Top** (highest score) and **New** tabs.
- Tap a commenter's name to open their profile.
- Delete your own comments. Report others' for harassment, spam, misinformation, or something else.

### Search and hashtags
- Search bill **titles, summaries, full text, hashtags, and legislator names**. Text search uses Postgres full-text search, so "farm tax" also finds "taxes on family farms"; "quoted phrases" and -excluded words work. A name finds every bill that member sponsored or cosponsored, and matching legislators are listed above the bills.
- Title and hashtag matches come first, then the best text matches. Bills matched by their summary or text show the **passage that matched**, with the words in bold.
- A **status** row sits right under the search box. Each chip shows how many bills match within your other filters:
  - **Became law**, **President's desk**, **In committee**, **Vetoed**
  - **Awaiting Senate:** House bills that passed the House, with the Senate vote next (and **Awaiting House** the other way around). Simple resolutions never leave their own chamber, so they don't count.
- The **Filters** button opens a sheet for **topic**, the sponsor's **party** (Democrat, Republican, Independent), and **chamber** (House, Senate), and shows how many are on. Active filters appear as removable chips under the search box.
- **Tap any #hashtag** on a bill to see every bill that shares it.
- With nothing typed, Search shows **Popular hashtags** with how many bills use each.
- New bills reuse existing hashtags where they fit (spelling variants merged, generic words like "Congress" dropped), so hashtags actually connect bills.

### Legislators
- Every sponsor and cosponsor has a page with their **official photo**, party, state and district, how many bills they've sponsored and cosponsored, and a small map of their district. Below that are three tabs:
  - **Bills** (first): everything they've sponsored or cosponsored, narrowed with **All / Sponsored / Cosponsored** chips.
  - **District:** the full map.
  - **About:** years in office and their Washington office.
- The **map** is illustrated: the district filled in their party color inside its state, neighboring districts outlined, and major cities labeled. Small city districts zoom in, with a little state map showing where they are. Senators' maps fill the whole state.
- The About tab lists **years served** in the House and Senate and the **Washington office** address and phone (tap to call).
- **Follow** a legislator for an alert when they sponsor or cosponsor a bill (a new bill, or a new cosponsorship on an existing one); their bills also rank higher in your feed.
- The District tab links to their whole state's district map.
- Photos also appear in search suggestions and cosponsor lists.
- Maps are drawn by the app from public-domain Census Bureau boundaries (119th Congress districts) and Natural Earth city data, so they need no map service or key.

### Your district and the map (Me tab)
- **Your representatives:** tap **Use my location** to find your congressional district, House member, and two senators. Or tap your state on the map and pick your district.
  - **Privacy:** your location is sent once, in the request body (so it never lands in server logs), matched against the district boundaries, and thrown away. Only your state and district number are stored, and they're never shown on your public profile.
  - The lookup uses full-detail Census boundaries (accurate to about 10 m) on the server, so it needs no map service.
- **Your map:** the whole country with district lines, in the usual layout with Alaska, Hawaii, and Puerto Rico as insets and the small Northeast states and DC called out on the side. Your district is filled in mint, and districts you follow in lilac, each with a pin so even tiny city districts show up.
  - **Tap a state** to open its district map with city labels. **Tap a district** (or a city, or a row in the list underneath) to see who represents it, open their page, **follow the district**, or make it your district.
  - **Districts you follow** (where you grew up, a swing seat...) are listed under the map.
- **Following:** the legislators and bills you follow.
- "Who represents a district" comes from Congress.gov's list of current members, refreshed weekly by ingestion (also `sync-roster`), so it includes members who haven't sponsored anything yet.

### Floor calendar
- **This week on the floor** (from the Feed): what the House and Senate plan to take up this week, with each bill linked to its PolitiKNOW page when the app has it.
- House: the Majority Leader's weekly "Bills this Week" file from docs.house.gov, grouped by how bills will be considered (e.g. under suspension of the rules). Bills a rule brings to the floor are linked too. If this week's file isn't out, next week's is shown once published.
- Senate: when it last met and when it meets next, from the floor schedule page on senate.gov, with any bill numbers it mentions linked. (The Senate doesn't publish an item-by-item list.)
- Both sources are free and public, and are cached for an hour.

### Alerts (notifications)
- An in-app **Alerts** tab with an unread badge, for five kinds of alerts:
  - a new bill on one of your topics
  - a status change on a bill you follow, voted on, or commented on
  - a legislator you follow sponsoring or cosponsoring a bill
  - a bill on your topics starting to trend
  - someone you follow commenting on a bill you've engaged with
- Settings for each alert type, plus **quiet hours**. Capped at **5 alerts a day**.
- Push notifications are wired up through Expo's free push service, but only work in a real installed build on a phone (not on web, simulators, or Expo Go), and iOS push requires a paid Apple Developer account.

### Profiles and following
- Generated pixel-art avatar, follower/following/comment counts, your topics, and your public **comment history**.
- Follow other users from their profile. Following shapes your feed and alerts.

### Settings
- Change your display name, topics, alert types, and quiet hours. Sign out.

### Safety and moderation
- **AI moderation:** every new comment is checked in the background (OpenAI's free moderation endpoint). Flagged comments stay up for review; severe ones are hidden immediately.
- **3 reports** from different people hide a comment.
- Posting the **same comment on several bills** gets it flagged as spam.
- **Repeat offenders** (3 hidden comments) are shadow-banned: their comments are visible only to themselves.
- **Rate limits:** 10 comments and 100 votes per user per hour. New accounts can comment after 1 hour (set to 0 in local `.env` for testing).
- Hidden comments stay visible to their author, marked as hidden.

### Looks
- Cozy cream background with chunky outlines and "sticker" shadows, line icons, and the Nunito font.
- On a desktop browser the app shows as a centered, phone-width column.

---

## How bills get in (ingestion)

A background job runs **4 times a day** (06:00, 12:00, 18:00, 23:00 UTC). It can also be run by hand. Each run:

1. Asks Congress.gov for bills in the current Congress (119th) updated in a time window, **oldest first**.
2. Fetches each bill's details (sponsor, party, policy area), its **actions** (only when there's a new latest action) to build its timeline, its **cosponsors** (only when their count has changed), and its **latest full text**. A bill's status is the furthest step it has reached, so it never slides back (e.g. to In committee when a House-passed bill is referred to a Senate committee).
3. If the text is new or changed, makes three GPT-4o-mini calls: simple summary, detailed summary, and topics + hashtags. Unchanged text is **never re-summarized**.
4. Publishes the bill and sends alerts to people who follow its topics (and status-change alerts to people who engaged with it).

5. Fetches photos, years in office, and office details for any new sponsors and cosponsors, and refreshes existing legislators monthly (up to `INGEST_MAX_MEMBERS_PER_RUN` per run, free Congress.gov calls).

Bills without published text yet stay hidden and are retried on later runs.

Each run handles up to `INGEST_MAX_BILLS_PER_RUN` bills (default 50) to cap OpenAI spend. If more bills were updated than that, the next run **resumes exactly where the last one stopped**, and the output's `backlog_remaining` shows how much is left. Only after the backlog is cleared does it move on to newer updates.

Other background jobs: **trending** is recalculated every 30 minutes (comments count 3×, votes 1×, divided by users active in the last week), and activity older than 30 days is pruned nightly.

---

## First-time setup (macOS)

```bash
# 1. Database + cache
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
createdb politiknow
createdb politiknow_test          # used by the test suite

# 2. Backend
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env              # then fill in keys (see below)
.venv/bin/alembic upgrade head

# 3. App
cd ../mobile
npm install
```

## Running it

Use three terminals:

```bash
# 1. API  ->  http://localhost:8000/docs (interactive API docs)
#    --host 0.0.0.0 lets the iOS Simulator and phones reach it, not just the browser
cd backend && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 2. Background jobs (ingestion 4x/day, trending, moderation, alerts)
cd backend && .venv/bin/celery -A app.worker worker --beat --pool=solo --loglevel=info

# 3. App
cd mobile && npx expo start
#   press  w  -> web browser (http://localhost:8081)
#   press  i  -> iOS Simulator (needs Xcode)
#   or scan the QR code with Expo Go on your phone (same Wi-Fi)
```

Restart the worker (terminal 2) after pulling backend code changes; it doesn't reload on its own.

### Manual commands

Run from `backend/`:

| Command | What it does | Cost |
|---|---|---|
| `.venv/bin/python -m app.cli ingest` | Pull the next batch of bills now | OpenAI, about 0.8¢ per new bill |
| `.venv/bin/python -m app.cli trending` | Recalculate trending now | Free |
| `.venv/bin/python -m app.cli normalize-hashtags` | Merge hashtag spelling variants, drop generic ones | Free |
| `.venv/bin/python -m app.cli retag` | Regenerate every bill's hashtags so they reuse each other | OpenAI, one call per bill |
| `.venv/bin/python -m app.cli backfill-cosponsors` | Fetch sponsor and cosponsor details for bills ingested before they were tracked | Free (Congress.gov only) |
| `.venv/bin/python -m app.cli backfill-timelines` | Build every bill's timeline from its Congress.gov actions and reset its status | Free (Congress.gov only) |
| `.venv/bin/python -m app.cli sync-members` | Refresh every legislator's photo, years in office, and office details (ingestion also does up to 100 per run, monthly per member) | Free (Congress.gov only) |
| `.venv/bin/python -m app.cli sync-roster` | Mark who's serving now from Congress.gov's current-member list (ingestion also does this weekly) | Free (Congress.gov only) |
| `.venv/bin/python -m app.cli build-maps` | Rebuild the state, national, and district-lookup maps in `backend/app/data/` (needs `requirements-dev.txt`) | Free |
| `.venv/bin/python -m app.cli seed-demo` | Add 6 sample (older) bills and demo users, for UI work without API keys | Free without an OpenAI key |

Demo logins after `seed-demo`: `civic_owl@example.com` / `politiknow123` (also `ballot_bunny`, `policy_panda`).

## Keys and accounts

| What | Cost | Where | Without it |
|---|---|---|---|
| Congress.gov API key | Free | https://api.congress.gov/sign-up | `DEMO_KEY` works but is heavily rate-limited |
| OpenAI API key | Pay per use (fractions of a cent per bill) | https://platform.openai.com | Summaries show a labeled excerpt of the bill text; topics come only from Congress.gov's official policy area; no hashtags or AI moderation |
| Google sign-in | Free | Google Cloud Console → OAuth client IDs | Google button is hidden |
| Push notifications | Free on Android; iOS needs a $99/yr Apple Developer account | EAS project + Firebase | The in-app Alerts tab still works everywhere |

Backend keys go in `backend/.env`; app settings (API URL override, Google client IDs) go in `mobile/.env.local`. See each folder's `.env.example`.

## Useful settings (`backend/.env`)

| Setting | Default | Meaning |
|---|---|---|
| `INGEST_MAX_BILLS_PER_RUN` | 50 | Bills per ingestion run (caps OpenAI spend) |
| `INGEST_MAX_MEMBERS_PER_RUN` | 100 | Legislator photo/office refreshes per ingestion run (free) |
| `INGEST_LOOKBACK_DAYS` | 7 | How far back the very first run looks |
| `CONGRESS_NUMBER` | 119 | Which Congress to ingest |
| `FEED_RECENCY_HALF_LIFE_DAYS` | 30 | How fast older bills sink in the feed |
| `TRENDING_THRESHOLD` | 0.05 | Engagement needed to trend |
| `COMMENT_MIN_ACCOUNT_AGE_MINUTES` | 60 | Wait before new accounts can comment |
| `COMMENTS_PER_HOUR` / `VOTES_PER_HOUR` | 10 / 100 | Rate limits |
| `REPORTS_TO_HIDE` | 3 | Reports that hide a comment |
| `SHADOW_BAN_AFTER_HIDDEN` | 3 | Hidden comments before a shadow ban |
| `NOTIFICATIONS_PER_DAY` | 5 | Alert cap per user |

The full list is in `backend/app/config.py`.

## Not built yet

- **Apple sign-in and iOS push:** need a paid Apple Developer account.
- **Password reset and real email:** verification links are only printed to the API log; no email provider is set up.
- **Moderator dashboard:** flagged comments (`comments.is_flagged`) and summary reports (`summary_reports`) are only in the database.
- **Editing comments, deleting accounts.**
- **Ads and premium subscription** (spec Phase 3).
- **State and local bills, filtering the feed by location:** planned in spec section 12.1.
- **Finding your district by ZIP code:** ZIP codes often span several districts, so only location (or picking on the map) is offered.
- **Amendments, committee actions, and floor votes** as their own items (spec Phase 3).

## Tests and checks

```bash
cd backend && .venv/bin/pytest && .venv/bin/ruff check .
cd mobile && npx tsc --noEmit && npx expo lint
```

The backend tests use the separate `politiknow_test` database, so they never touch your real data.

## Project layout

```
backend/app/
  main.py           API app
  models.py         database tables
  routers/          API endpoints (auth, users, bills, legislators, places, comments, notifications, calendar)
  services/         ingestion, Congress.gov client, AI, feed ranking, trending,
                    hashtags, legislators, district maps, floor schedule, moderation, notifications
  data/maps/        pre-drawn state and district maps (one JSON file per state, plus US.json)
  data/district_bounds.json  district boundaries for finding a user's district from their location
  worker.py         background job schedule
  cli.py            manual commands
backend/alembic/    database migrations
backend/tests/      test suite

mobile/src/
  app/              screens (Expo Router: each file is a route)
  components/       bill card and timeline, legislator row/photo, district map, comments, profile, UI kit
  lib/              API client, auth, data hooks, push, formatting
  theme.ts          colors, fonts, sticker style
```

## Notes

- **Existing databases:** after `alembic upgrade head`, run `backfill-cosponsors`, `backfill-timelines`, and then `sync-members` once, so bills ingested earlier get their sponsors and cosponsors linked and their timelines built, and every legislator gets a photo and office details. New ingestion keeps them current.
- **District maps and the location lookup** reflect boundaries at the start of the 119th Congress. If states redraw districts, rerun `build-maps` once the Census Bureau publishes new files (update the file names in `services/district_maps.py`). It writes the per-state maps, the national map (`maps/US.json`, from the coarser 1:20m files), and `district_bounds.json` (full detail, about 9 MB, used only on the server).
- **After pulling these changes:** run `alembic upgrade head` (adds follows, home districts, and full-text search; the search index is built for existing bills automatically) and `sync-roster` once so "Your representatives" works before the next ingestion run.
- **Schema changes:** edit `backend/app/models.py`, then run `alembic revision --autogenerate -m "..."` and `alembic upgrade head`.
- **Design:** the UI uses line icons only, no emoji. Bill cards keep the full party colors.
