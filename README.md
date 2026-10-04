# PolitiKNOW

Federal legislation, made easy to know. Real bills from Congress.gov, summarized by AI at two reading levels, in a social feed you can vote and comment on.

One codebase runs on **iOS, Android, and the web**.

```
backend/   FastAPI + PostgreSQL + Redis + Celery (Python 3.12)
mobile/    Expo / React Native app (iOS, Android, web)
PolitiKNOW_Technical_Spec.docx
```

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
.venv/bin/python -m app.cli seed-demo   # optional: 6 sample bills + demo users

# 3. App
cd ../mobile
npm install
```

## Running it

Use three terminals:

```bash
# API  ->  http://localhost:8000/docs
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

# Background jobs (ingestion 4x/day, trending every 30 min, moderation)
cd backend && .venv/bin/celery -A app.worker worker --beat --loglevel=info

# App
cd mobile && npx expo start
#   press  w  -> web browser
#   press  i  -> iOS Simulator (needs Xcode)
#   or scan the QR code with Expo Go on your phone (same Wi-Fi)
```

Demo logins after `seed-demo`: `civic_owl@example.com` / `politiknow123` (also `ballot_bunny`, `policy_panda`).

Pull real bills right now instead of waiting for the schedule:

```bash
cd backend && .venv/bin/python -m app.cli ingest
```

Each run handles up to `INGEST_MAX_BILLS_PER_RUN` bills (default 50) to cap OpenAI spend. If more bills were updated than that, the next run picks up exactly where the last one stopped. The output shows `backlog_remaining`; when it reaches 0, the next run moves on to newer updates. Bills are never summarized twice unless their text changes.

## Keys and accounts

| What | Cost | Where | Without it |
|---|---|---|---|
| Congress.gov API key | Free | https://api.congress.gov/sign-up | `DEMO_KEY` works but is heavily rate-limited |
| OpenAI API key | Pay per use (~fractions of a cent per bill) | https://platform.openai.com | Summaries show a labeled excerpt of the bill text; no AI moderation |
| Google sign-in | Free | Google Cloud Console → OAuth client IDs | Google button is hidden |
| Push notifications | Free (Android); iOS needs a $99/yr Apple Developer account | EAS project + Firebase | In-app Alerts tab still works everywhere |

## Tests and checks

```bash
cd backend && .venv/bin/pytest && .venv/bin/ruff check .
cd mobile && npx tsc --noEmit && npx expo lint
```

## Notes

- Schema changes: edit `backend/app/models.py`, then `alembic revision --autogenerate -m "..."` and `alembic upgrade head`.
- Moderation review: flagged comments (`comments.is_flagged`) and summary reports (`summary_reports`) are in the database. There's no admin screen yet.
- Email verification links are printed to the API log (no email provider configured).
