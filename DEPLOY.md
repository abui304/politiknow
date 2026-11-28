# Putting PolitiKNOW online

Everything here is free except OpenAI (about 0.8¢ per new bill summary). Plan on about an hour.

| Piece | Runs on | Cost |
|---|---|---|
| Website | Vercel (Hobby) | Free |
| API | Vercel (Hobby), as one Python function | Free |
| Database | Neon Postgres | Free: 1 GB storage |
| Cache | Upstash Redis | Free: 500K commands a month |
| New bills, votes, recaps, cleanup | GitHub Actions, on a schedule | Free (public repo) or the monthly allowance (private) |
| Recap emails (optional) | Brevo | Free: 300 a day |

You'll end up with two web addresses, for example `politiknow.vercel.app` (the website) and `politiknow-api.vercel.app` (the API).

---

## 0. Before you start

You need accounts at **Vercel**, **Neon** and **Upstash**. Sign up to each with your GitHub account; none needs a card.

Keep a notes file open. You'll collect these values as you go:

```
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
CONGRESS_API_KEY=      (already in backend/.env)
OPENAI_API_KEY=        (already in backend/.env)
API address=
Website address=
```

Push the latest code first, including `.github/workflows/jobs.yml`:

```bash
git add -A && git commit -m "Deployment setup" && git push
```

## 1. Database (Neon)

1. In Neon, **Create project**. Name it `politiknow`. Region: **AWS US East (N. Virginia)**, the same region Vercel uses by default.
2. On the project dashboard, click **Connect**. Turn **Connection pooling** on, and copy the connection string. It looks like:
   `postgresql://neondb_owner:…@ep-…-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
3. Save it as `DATABASE_URL`. Paste it exactly as given; the app converts it for its driver.

## 2. Cache (Upstash)

1. In Upstash, **Create database** (Redis). Name `politiknow`, region **N. Virginia (us-east-1)**, free plan.
2. On the database page, under **Connect**, pick the **TCP** tab and copy the URL that starts with `rediss://` (two s's). It looks like:
   `rediss://default:…@….upstash.io:6379`
3. Save it as `REDIS_URL`.

## 3. A secret for sign-ins

Run this on your Mac and save the output as `JWT_SECRET`:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

The hosted API refuses to start without it. Never reuse the development value.

## 4. Set up the database and load the first bills (from your Mac)

This creates the tables and pulls in the last month of bills, so the site isn't empty on day one. It uses the API keys already in `backend/.env`.

```bash
cd backend
export DATABASE_URL='paste-your-neon-url' REDIS_URL='paste-your-upstash-url' SERVERLESS=true
.venv/bin/alembic upgrade head
INGEST_LOOKBACK_DAYS=30 .venv/bin/python -m app.cli ingest
```

Each run adds up to 50 bills (about 40¢ of OpenAI). Run the last line two or three more times for a fuller start.

Then **close that terminal window**, so you don't accidentally run local development against the live database.

## 5. The API (Vercel)

1. In Vercel, **Add New → Project**, and import the `politiknow` repository.
2. **Project Name:** `politiknow-api`.
3. **Root Directory:** click Edit and choose `backend`. Vercel detects FastAPI.
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | from step 1 |
   | `REDIS_URL` | from step 2 |
   | `JWT_SECRET` | from step 3 |
   | `SERVERLESS` | `true` |
   | `CONGRESS_API_KEY` | from `backend/.env` |
   | `OPENAI_API_KEY` | from `backend/.env` |
   | `CORS_ORIGINS` | `["https://politiknow.vercel.app"]` (your website address, from step 6) |
   | `WEB_URL` | `https://politiknow.vercel.app` |
   | `API_URL` | `https://politiknow-api.vercel.app` |

5. **Deploy.** When it's done, open `https://politiknow-api.vercel.app/health`. You should see `{"ok":true}`.

If Vercel gives the project a different address (because the name is taken), use that address everywhere these steps say `politiknow-api.vercel.app`.

## 6. The website (Vercel)

1. **Add New → Project** again, and import the same repository.
2. **Project Name:** `politiknow`.
3. **Root Directory:** `mobile`. Leave the framework as "Other"; `mobile/vercel.json` sets the build.
4. **Environment Variables:**

   | Name | Value |
   |---|---|
   | `EXPO_PUBLIC_API_URL` | `https://politiknow-api.vercel.app` |
   | `EXPO_PUBLIC_WEB_URL` | `https://politiknow.vercel.app` |

5. **Deploy.**

If either address came out different from what you entered in step 5, fix `CORS_ORIGINS`, `WEB_URL` and `API_URL` in the API project (**Settings → Environment Variables**), then **Deployments → ⋯ → Redeploy**. Variables only take effect on the next deploy.

## 7. Keep it updating (GitHub Actions)

1. On GitHub, open the repository: **Settings → Secrets and variables → Actions → New repository secret**. Add:

   | Secret | Value |
   |---|---|
   | `DATABASE_URL` | from step 1 |
   | `REDIS_URL` | from step 2 |
   | `CONGRESS_API_KEY` | from `backend/.env` |
   | `OPENAI_API_KEY` | from `backend/.env` |
   | `WEB_URL` | your website address |
   | `API_URL` | your API address |

2. Open the **Actions** tab. If GitHub asks, enable workflows.
3. Click **Scheduled jobs → Run workflow**, keep `ingest`, and run it. It should finish green in a few minutes.

From now on it runs on its own: new bills and votes 4 times a day, cleanup nightly, and recap emails on Saturday mornings.

Two GitHub rules to know:
- Schedules run from the default branch (`main`).
- In a **public** repository, GitHub pauses schedules after 60 days with no commits. A push, or **Enable workflow** on the Actions tab, turns them back on.

## 8. Check it

Open your website address and:

- [ ] Create an account and finish onboarding.
- [ ] The feed shows bills; open one.
- [ ] Copy a bill's address, open it in a private window: it should load (after sign-in).
- [ ] **Schedule** and **Map** open.
- [ ] Vote on a bill and post a comment.

Make yourself a moderator, from your Mac, using your display name:

```bash
cd backend
DATABASE_URL='paste-your-neon-url' SERVERLESS=true .venv/bin/python -m app.cli make-moderator YourDisplayName
```

## 9. Optional

**Recap emails (Brevo).** Create a free Brevo account and verify a sender. A domain you own works best; mail "from" a Gmail address is often sent to spam. Then add these GitHub secrets: `BREVO_API_KEY` and `EMAIL_FROM`. Without them, recaps just stay in the app.

**Google sign-in.** In Google Cloud Console, create an OAuth client ID of type **Web application**. Add your website address under **Authorized JavaScript origins**. Then:
- In the API project, set `GOOGLE_CLIENT_IDS` to `["your-client-id"]`.
- In the website project, set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the same ID.
- Redeploy both.

**Your own domain** (about $10–15 a year). Add it under the website project's **Settings → Domains**, then update `CORS_ORIGINS`, `WEB_URL` and `EXPO_PUBLIC_WEB_URL` and redeploy.

---

## Day to day

- **Code changes:** pushing to `main` redeploys the website and the API automatically.
- **Database changes** (a new Alembic migration): after pushing, run **Actions → Scheduled jobs → Run workflow → `migrate`**.
- **How it's going:** **Run workflow → `metrics`**, then open the run to read the weekly scorecard.

## Limits to watch

| Limit | What happens | What to do |
|---|---|---|
| Neon: 1 GB storage | Saving new bills fails | Check usage in Neon's dashboard. Bill texts are the bulk; ask about storing only summaries. |
| Upstash: 500K commands a month | Cache calls fail until the month resets | Fine for hundreds of daily users; pay-as-you-go is $0.20 per 100K after. |
| Vercel Hobby: non-commercial use | — | If PolitiKNOW ever earns money (ads, subscriptions), move to Vercel Pro. |
| OpenAI | Your card is billed per summary | Set a monthly budget in OpenAI's billing settings. |

## If something's wrong

- **Website loads but every action fails:** `EXPO_PUBLIC_API_URL` is missing or wrong. Fix it, then redeploy the website (it's baked in at build time).
- **Browser console says "CORS":** `CORS_ORIGINS` in the API must match the website address exactly: `https`, no trailing slash, inside `["…"]`. Redeploy the API.
- **API deploy crashes with "Set JWT_SECRET":** add `JWT_SECRET` to the API project and redeploy.
- **Actions run fails to connect:** check the `DATABASE_URL` and `REDIS_URL` secrets (no quotes around them).
- **A bill link opens a blank page:** the website project's Root Directory must be `mobile`, so `mobile/vercel.json` is used.
