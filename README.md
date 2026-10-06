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
  score = topic match × 0.45 + recency × 0.25 + trending × 0.20 + followed users × 0.10
  ```
  - **Topic match:** how much of the user's last 30 days of activity (views, votes, comments) involves the bill's topics, plus their onboarding picks.
  - **Recency:** halves every 30 days since the bill's last action (configurable).
  - **Trending:** bills getting unusual engagement in the last 24 hours (see below).
  - **Followed users:** bills that people you follow voted on or commented on.
- Each card is **colored by the sponsor's party** (blue Democrat, red Republican, yellow Independent) and shows the bill number, date, status (Introduced, In committee, Passed House, ... Became law), a short plain-English summary, topics, a Trending badge, votes, comment count, and Share.
- Pull down to refresh and re-rank.

### Bill pages
- **Simple** (about 150–250 words, no jargon) and **Detailed** (about 400–600 words) AI summaries, switchable with a toggle.
- A persistent notice that the summary is AI-generated; tapping it shows the **full bill text** in the app (the first 20,000 characters, with the rest on Congress.gov).
- Sponsor, introduction date, latest status, topics, and **#hashtags**.
- **Tap the sponsor** to open their legislator page, or tap **Cosponsors (N)** to see every current cosponsor (original cosponsors first), each linking to their own page.
- Link to the official Congress.gov page, and a **Report inaccuracy** button with an optional note.
- Up/down voting and sharing (the phone's share sheet; on web, the browser's share menu or copy to clipboard).

### Discussion
- Comments up to 2,000 characters, with **one level of replies**.
- Up/down votes on comments, sorted by score.
- Tap a commenter's name to open their profile.
- Delete your own comments. Report others' for harassment, spam, misinformation, or something else.

### Search and hashtags
- Search bill **titles, hashtags, and legislator names** by keyword. A name finds every bill that member sponsored or cosponsored, and matching legislators are listed above the bills.
- Filter by **topic**, the sponsor's **party** (Democrat, Republican, Independent), and **chamber** (House, Senate).
- **Tap any #hashtag** on a bill to see every bill that shares it.
- With nothing typed, Search shows **Popular hashtags** with how many bills use each.
- New bills reuse existing hashtags where they fit (spelling variants merged, generic words like "Congress" dropped), so hashtags actually connect bills.

### Legislators
- Every sponsor and cosponsor has a page with their party, state and district, how many bills they've sponsored and cosponsored, and their bills, switchable between **All**, **Sponsored**, and **Cosponsored**.

### Alerts (notifications)
- An in-app **Alerts** tab with an unread badge, for four kinds of alerts:
  - a new bill on one of your topics
  - a status change on a bill you voted on or commented on
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
2. Fetches each bill's details (sponsor, party, status, policy area), its **cosponsors** (only when their count has changed), and its **latest full text**.
3. If the text is new or changed, makes three GPT-4o-mini calls: simple summary, detailed summary, and topics + hashtags. Unchanged text is **never re-summarized**.
4. Publishes the bill and sends alerts to people who follow its topics (and status-change alerts to people who engaged with it).

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
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

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
- **State and local bills, filtering by location:** planned in spec section 12.1.
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
  routers/          API endpoints (auth, users, bills, legislators, comments, notifications)
  services/         ingestion, Congress.gov client, AI, feed ranking, trending,
                    hashtags, legislators, moderation, notifications
  worker.py         background job schedule
  cli.py            manual commands
backend/alembic/    database migrations
backend/tests/      test suite

mobile/src/
  app/              screens (Expo Router: each file is a route)
  components/       bill card, legislator row, comments, profile, UI kit
  lib/              API client, auth, data hooks, push, formatting
  theme.ts          colors, fonts, sticker style
```

## Notes

- **Existing databases:** after `alembic upgrade head`, run `backfill-cosponsors` once so bills ingested earlier get their sponsors and cosponsors linked. New ingestion keeps them current.
- **Schema changes:** edit `backend/app/models.py`, then run `alembic revision --autogenerate -m "..."` and `alembic upgrade head`.
- **Design:** the UI uses line icons only, no emoji. Bill cards keep the full party colors.
