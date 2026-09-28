# Tandem — habits, together

Tandem is a private, social habit tracker for a small group of friends. Everyone creates their own habits, checks them off each day, and can see each other's progress: what got done today, current streaks, and a GitHub-style history grid for every shared habit.

It's a mobile-first web app that you can install to your home screen (PWA), so nobody needs the App Store. It's built to run on the free tiers of **Vercel** and **Supabase**.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Folder structure](#folder-structure)
4. [Quick start (local)](#quick-start-local)
5. [Supabase setup](#supabase-setup)
6. [Environment variables](#environment-variables)
7. [Database migrations & demo data](#database-migrations--demo-data)
8. [Deploying to Vercel](#deploying-to-vercel)
9. [Installing the app on a phone (PWA)](#installing-the-app-on-a-phone-pwa)
10. [How invite links work](#how-invite-links-work)
11. [Reminders (push notifications)](#reminders-push-notifications)
12. [How streaks & percentages are calculated](#how-streaks--percentages-are-calculated)
13. [Time zones](#time-zones)
14. [Security & privacy model](#security--privacy-model)
15. [Testing](#testing)
16. [Troubleshooting](#troubleshooting)

---

## Features

- **Today screen**: a greeting, today's progress ring, and a large check button on every habit due today. One tap checks a habit off, with an animation, an **Undo** toast, and a small celebration at streak milestones. Habits that aren't due today sit in a collapsed "Not due today" list and can still be checked off.
- **Habits** have a name, an optional description, an emoji, a color, a start date, a visibility setting (**My groups** or **Private**) and an optional reminder time. You can create, edit, archive (history is kept), restore, delete and drag to reorder them.
- **Frequencies**: every day, specific weekdays (e.g. Mon/Wed/Fri), X times per week, or every N days. When you change a schedule, the change applies from that day onward. Past days are still judged by the rules that were in force at the time.
- **History grids**: every habit gets a contribution grid (Month, 6 months or Year). Completed days are filled with the habit's color. Missed days are dim. Days the habit wasn't scheduled show a small dot and never count as failures. Tap any square to see the date, its status and the note. On your own habits you can also fix a missed day or edit the note from there.
- **Notes**: attach a short note (up to 280 characters) to any check-in, e.g. "Leg day — 45 min".
- **Groups**: private groups with invite links or codes. The group dashboard has three tabs:
  - **Today**: each member's X/Y and percentage, weekly consistency and best streak.
  - **Habits**: every member's shared habits with a 14-day strip.
  - **Activity**: a feed of recent check-ins with reactions (🔥 💪 👏 👀 🎉) and short comments.
- **Friend profiles**: what they completed today, what's still open, their streaks, and a full history grid for each shared habit.
- **Leaderboard** (optional; the group owner can turn it off): ranks members by 7-day consistency, then perfect days, then streaks. It never ranks by habit count, so adding lots of easy habits doesn't help you win.
- **Progress**: consistency, check-ins, perfect days and best current streak, filterable by habit and date range (7/30/90 days, a year, or a custom range). It includes a combined grid across all habits and a grid for each habit.
- **Stats** on each habit: current streak, longest streak, last 7 days, last 30 days, all time, and total check-ins.
- **Reminders**: real Web Push notifications when a habit isn't done by its reminder time (see [Reminders](#reminders-push-notifications)).
- Dark and light themes (automatic or manual), friendly empty states, an offline banner, check-ins made offline sync automatically when you reconnect, and friendly error messages throughout.
- Account deletion and sign-out, which also clears this device's reminders and cached pages.

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | **Next.js 16** (App Router, Turbopack), React 19, TypeScript | Modern, fast, and deploys on Vercel with no configuration |
| Styling | **Tailwind CSS v4**, custom shadcn-style components, `motion` for animation, `lucide-react` icons, Geist font | Small bundle and full control over the look |
| Data | **TanStack Query** with optimistic updates | Check-ins feel instant, and offline actions are queued and retried |
| Backend | **Supabase**: Postgres, Auth, Row Level Security, SQL functions | Free tier, real auth, and privacy enforced inside the database |
| PWA | Web app manifest, a hand-written service worker, and Web Push through `web-push` | Installable with an offline fallback; no plugin that could break with Turbopack |
| Tests | **Vitest** (logic and database security), **Playwright** (end-to-end) | |

There is no separate API server. The browser talks to Supabase directly using the public key, and **Row Level Security decides what each user can read and write**. The only server-side code is the auth callback routes, the session-refreshing proxy, and the reminder dispatcher.

## Folder structure

```
tandem/
├── supabase/
│   ├── migrations/20260928000000_init.sql   # full schema, RLS policies, RPC functions
│   ├── seed.sql                              # DEMO data (4 users, a group, ~6 months of history)
│   └── tests/supabase-shim.sql               # test-only stand-in for Supabase's auth schema
├── src/
│   ├── proxy.ts                  # refreshes the session cookie and guards app routes (Next 16 "proxy" = middleware)
│   ├── app/
│   │   ├── page.tsx              # landing page
│   │   ├── (auth)/               # login, signup, forgot/reset password
│   │   ├── auth/callback|confirm # email-link / OAuth handlers
│   │   ├── onboarding/           # pick username → create/join a group
│   │   ├── join/[code]/          # invite preview and join
│   │   ├── (app)/                # signed-in app (bottom tab bar / sidebar)
│   │   │   ├── today/  group/  progress/  profile/
│   │   │   ├── habits/ (manage, new, [id], [id]/edit)
│   │   │   ├── groups/new/  group/[id]/settings/
│   │   │   └── people/[userId]/  # a friend's public habits
│   │   ├── api/reminders/dispatch/  # sends due push reminders (cron-triggered)
│   │   ├── manifest.ts  offline/
│   ├── components/               # ui/ (primitives), grid/ (history grids), habits/, group/, today/, shell/
│   └── lib/
│       ├── habit-engine.ts       # schedules, day status, streaks, rates (pure, unit-tested)
│       ├── dates.ts              # calendar-day math & time-zone handling (pure, unit-tested)
│       ├── group-stats.ts        # per-member stats and leaderboard ranking
│       ├── queries.ts            # all Supabase reads and writes (TanStack Query hooks)
│       ├── supabase/             # browser, server and admin clients
│       └── push.ts  errors.ts  validation.ts …
├── public/sw.js  public/icons/   # service worker and app icons (scripts/generate-icons.mjs)
├── tests/db/rls.test.ts          # database permission tests (real Postgres)
└── tests/e2e/                    # Playwright specs and a test-only Supabase stand-in
```

## Quick start (local)

Requirements: **Node 20+** and a free [Supabase](https://supabase.com) account.

```bash
cd tandem
npm install
cp .env.example .env.local     # then fill in the two Supabase values (see below)
npm run dev                    # http://localhost:3000
```

1. Complete the [Supabase setup](#supabase-setup) below. It takes about 5 minutes.
2. Open http://localhost:3000, create an account, and you're in.
3. Optional: load the [demo data](#database-migrations--demo-data) and log in as `alex@example.com` / `tandem-demo-2026` to see a populated group.

> Prefer a fully local Supabase? With Docker installed, run `npx supabase init`, then `npx supabase start`. Copy `supabase/migrations` and `supabase/seed.sql` into the generated `supabase/` folder (the paths already match), then run `npx supabase db reset`. Use the API URL and publishable/anon key it prints.

## Supabase setup

1. **Create a project** at [supabase.com/dashboard](https://supabase.com/dashboard). Any region and the free plan are fine. Save the database password.
2. **Create the schema.** Open **SQL Editor → New query**, paste the whole of [`supabase/migrations/20260928000000_init.sql`](supabase/migrations/20260928000000_init.sql) and click **Run**. It should finish with "Success. No rows returned". Alternatively, use the CLI (see [migrations](#database-migrations--demo-data)).
3. **Get the API keys.** Go to **Project Settings → API Keys** (or click **Connect**):
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable key** (`sb_publishable_…`), or the legacy **anon** key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Secret key** (`sb_secret_…`), or the legacy **service_role** key → `SUPABASE_SECRET_KEY`. You only need this for reminders, and it is server-only.
4. **Configure authentication** under **Authentication → Sign In / Providers → Email**:
   - Keep **Email** enabled. It's recommended to leave **Confirm email** on. For quick local testing you can turn it off, and signup then logs you in straight away.
   - Set **Minimum password length** to 8 to match the app.
5. **URL configuration** under **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` for now. Change it to your Vercel URL after deploying.
   - **Redirect URLs**: add `http://localhost:3000/**` and later `https://YOUR-APP.vercel.app/**`.
6. **Email templates** (recommended for iPhone users). Under **Authentication → Emails**, change the links in these templates so email links work even when they open in a different browser than the one that asked for them (for example, the home-screen app versus Safari):
   - **Confirm signup**: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>`
   - **Reset password**: `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset your password</a>`

   The default templates also work (through `/auth/callback`) as long as the link is opened in the same browser.
7. **Email sending.** Supabase's built-in email is heavily rate-limited (a few emails per hour) and is meant for testing. For a friend group that's usually fine. If signups get stuck, add a free SMTP provider (Resend, Brevo, …) under **Authentication → Emails → SMTP Settings**.
8. **Google sign-in (optional).** Enable **Google** under **Authentication → Sign In / Providers** and follow Supabase's guide for creating OAuth credentials. Then set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`. The Google button only appears when this flag is set.

## Environment variables

Copy `.env.example` to `.env.local` for local development. On Vercel, set the same variables under **Project → Settings → Environment Variables**.

| Variable | Required | Exposed to browser | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | yes | Publishable or anon key. Safe to expose because RLS protects the data (`NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted) |
| `NEXT_PUBLIC_SITE_URL` | recommended | yes | Public app URL, used in invite links and auth redirects. Falls back to the current origin |
| `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH` | no | yes | `true` shows "Continue with Google" |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | for reminders | yes | Web Push public key |
| `VAPID_PRIVATE_KEY` | for reminders | **no** | Web Push private key |
| `VAPID_SUBJECT` | for reminders | no | `mailto:` contact for push services |
| `SUPABASE_SECRET_KEY` | for reminders | **no** | Secret or service-role key, used only by `/api/reminders/dispatch` (`SUPABASE_SERVICE_ROLE_KEY` is also accepted) |
| `CRON_SECRET` | for reminders | **no** | Shared secret the scheduler sends to the dispatcher |

Never prefix the secret key, VAPID private key or cron secret with `NEXT_PUBLIC_`.

## Database migrations & demo data

The whole schema lives in `supabase/migrations/`. There are two ways to apply it:

- **Dashboard**: paste the migration file into the SQL Editor and run it (step 2 above).
- **CLI**:
  ```bash
  npx supabase login
  npx supabase link --project-ref YOUR-PROJECT-REF
  npx supabase db push          # applies supabase/migrations/*
  ```
  For future schema changes, add a new timestamped file in `supabase/migrations/` and run `db push` again.

**Demo data (optional; for trying the app, not for your real group).** Paste [`supabase/seed.sql`](supabase/seed.sql) into the SQL Editor and run it. It creates:

| Email | Password | Notes |
| --- | --- | --- |
| alex@example.com | tandem-demo-2026 | group owner; has a *private* "Journal" habit that nobody else can see |
| mike@example.com | tandem-demo-2026 | |
| john@example.com | tandem-demo-2026 | has a private habit |
| chris@example.com | tandem-demo-2026 | |

All four are in the group **Morning Crew ☀️** with invite code `TANDEMDEMO`, with about 6 months of generated history, streaks, notes, reactions and comments, all relative to today. Re-running the seed resets the demo users. To remove them, run `delete from auth.users where email like '%@example.com';`.

**What the schema contains:** `profiles`, `groups`, `group_members`, `habits`, `habit_schedules` (versioned frequency rules), `habit_completions` (with a unique `(habit_id, completed_on)` constraint and an optional note), `reactions`, `comments`, `push_subscriptions`, and `reminder_deliveries`. It uses foreign keys with cascades, check constraints on every user-supplied field, indexes for every access path, `updated_at` triggers, and RLS on every table.

## Deploying to Vercel

1. Push this repository to GitHub.
2. In [Vercel](https://vercel.com/new), click **Add New → Project** and import the repository.
3. Set **Root Directory** to **`tandem`**. This is important because the app lives in a sub-folder. Vercel auto-detects the Next.js framework preset.
4. Add the environment variables listed above. Set `NEXT_PUBLIC_SITE_URL` to your production URL, e.g. `https://tandem-yourname.vercel.app`.
5. Click **Deploy**.
6. Back in Supabase **Authentication → URL Configuration**, set **Site URL** to the production URL and add `https://…vercel.app/**` to **Redirect URLs**.
7. Open the site on your phone, create your account, create a group, and share the invite.

If you use a custom domain, update `NEXT_PUBLIC_SITE_URL` and the Supabase URLs to match, then redeploy.

## Installing the app on a phone (PWA)

- **iPhone / iPad (Safari)**: open the site, tap **Share** (the square with an arrow), choose **Add to Home Screen**, then **Add**. Launch Tandem from the home screen and it runs full-screen with its own icon. On iOS 16.4 and later, reminders only work from the installed app.
- **Android (Chrome)**: tap **⋮ → Install app** (or **Add to Home screen**).
- **Desktop (Chrome or Edge)**: click the install icon in the address bar.

The app also shows these instructions under **Me → Install the app**.

## How invite links work

- Every group has a random 10-character invite code from an unambiguous alphabet (no 0/O/1/I), such as `K7QMP-X2RHD`. That's about 50 bits of randomness, generated by Postgres's CSPRNG. The share link is `https://your-app/join/K7QMPX2RHD`.
- Opening the link shows a preview with the group's name, emoji and member count. Nothing else about the group is revealed. The preview comes from the `get_invite_preview` function, which only works if you already know the code.
- If you aren't signed in, you can **Create an account to join** or **log in**. Either way you come straight back to the invite and join with one tap.
- Joining calls the `join_group` function in the database, which validates the code. Nobody can add themselves to a group by writing to `group_members` directly: RLS has no insert policy on that table.
- Codes are case- and dash-insensitive. You can paste the link or type the code on the **Join a group** screen.
- The group owner can **generate a new code** in Group settings. The old link stops working immediately, and existing members stay in the group.
- Owners can remove members. Anyone can leave a group. If the owner leaves, ownership passes to the longest-standing member, and an empty group is deleted.
- Limits: 50 members per group and 20 groups per user.

## Reminders (push notifications)

Each habit can have an optional reminder time. If it isn't done by then, that user gets a push notification on every device where they turned on **Me → Reminders on this device**. Reminders respect schedules, so a Mon/Wed/Fri habit won't remind you on Tuesday.

Push notifications need three things. If any of them is missing, the app says so plainly instead of pretending, and the reminder times you set are still saved.

1. **VAPID keys**: run `npm run vapid` and put the keys into `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Also set `VAPID_SUBJECT`, `SUPABASE_SECRET_KEY` and `CRON_SECRET`, then redeploy.
2. **Something that calls the dispatcher every 5–15 minutes.** Vercel's free cron only runs once a day, so use Supabase's free `pg_cron`. In the Supabase dashboard, enable the **pg_cron** and **pg_net** extensions (**Database → Extensions**), then run:
   ```sql
   select cron.schedule(
     'tandem-reminders',
     '*/10 * * * *',
     $$ select net.http_post(
          url := 'https://YOUR-APP.vercel.app/api/reminders/dispatch',
          headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
        ) $$
   );
   ```
   Any other scheduler works too, e.g. a GitHub Actions schedule or cron-job.org, as long as it sends `POST` or `GET` to `/api/reminders/dispatch` with the header `Authorization: Bearer $CRON_SECRET`.
3. **Each user opts in** on each device. On iPhone this has to be done from the home-screen app.

The dispatcher sends at most one notification per habit per day, even if runs overlap: deliveries are claimed in the `reminder_deliveries` table before sending. It groups several due habits into one notification and removes expired subscriptions.

## How streaks & percentages are calculated

All of this logic lives in [`src/lib/habit-engine.ts`](src/lib/habit-engine.ts) and is covered by unit tests.

- **Every day / specific weekdays / every N days**: the streak counts consecutive *scheduled* days that were completed. Unscheduled days are skipped and never break a streak; with a Mon/Wed/Fri gym habit, Tuesday doesn't count. Completing on an unscheduled day is a *bonus*: it counts toward totals but neither extends nor breaks the streak.
- **X times per week** is judged per week (Monday to Sunday), and its streak is counted in **weeks** that met the target. A week you started partway through only needs as many check-ins as there were days left in it.
- **Today never counts against you** until it's over. An unfinished current week also doesn't drag your percentage down.
- **Completion %** = completed scheduled check-ins ÷ scheduled check-ins in the range. For weekly habits, each week contributes `min(done, target) / target`.
- A **perfect day** is a day when at least one habit was due and every due habit was done.
- **Schedule edits are versioned**. Changing Gym from daily to Mon/Wed/Fri doesn't turn your old daily misses into rest days.

## Time zones

- A check-in stores the **calendar date** (`completed_on date`), which is the day on *your* wall clock, along with a UTC `created_at` timestamp.
- "Today" is computed with `Intl.DateTimeFormat` in your profile's IANA time zone, and all date math works on pure calendar days. Converting to UTC can never move a check-in to yesterday or tomorrow, and daylight saving changes don't matter.
- Your profile's time zone follows your device automatically, e.g. after you travel. The database uses the same zone to reject check-ins for future days (with one day of slack for a device that has just crossed midnight).
- Friends are shown in *their* local day. At 11 pm your time, a friend in London is already on tomorrow's list.

## Security & privacy model

- **Row Level Security on every table**, enforced in Postgres rather than in the UI:
  - You can only read groups and member lists for groups you belong to.
  - You can see another person's profile only if you share a group with them.
  - Another member's habit, schedule, check-ins, notes, reactions and comments are visible only if the habit is set to **My groups** *and* you share a group with them. Private habits are never readable by anyone else, even through the history function (`habit_history` runs with the caller's permissions).
  - Only the owner can create, edit or delete their habits and check-ins. Check-ins can't be moved to another day or habit (column-level grants plus a trigger).
  - You can react or comment only on check-ins you're allowed to see. You can delete your own comments, and comments on your own check-ins.
  - Only owners can rename a group, toggle its leaderboard, rotate the invite code, remove members or delete the group.
- **Least-privilege grants**: the `anon` role can't touch any table and can only call `username_available` and `get_invite_preview`. The `authenticated` role gets only the columns it needs; for example, it can't change `invite_code` or `user_id`.
- **Security-definer helpers** use an empty `search_path`, so they can't be hijacked.
- **Input validation** happens both in the UI (zod) and in the database (check constraints and triggers).
- Duplicate check-ins are impossible because of the unique constraint on `(habit_id, completed_on)`. Double taps and retries are no-ops.
- Sessions use Supabase Auth, stored in cookies and refreshed on each request by `src/proxy.ts`. Access tokens are verified by Supabase on every data request. Auth redirects only accept same-origin paths, so there are no open redirects.
- The secret or service-role key is used only in `/api/reminders/dispatch`, which requires `CRON_SECRET` (compared in constant time).
- Security headers include CSP, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy and a permissions policy.

## Testing

```bash
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm test             # unit tests: streaks, schedules, rates, time zones (Vitest)
npm run build        # production build
```

**Database security tests** run the real migration against a throwaway Postgres database, then act as different users to prove the privacy rules: group isolation, private habits, write protection, duplicate check-ins, invite codes, ownership transfer, account deletion and more.

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```

**End-to-end tests** (Playwright) cover signup, username checks, creating habits, check/undo/reload, notes from the history grid, invalid and valid invite links, joining a group, privacy between members, reactions, and an outsider being blocked:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:e2e
```

These need Postgres with `psql`. They use `tests/e2e/fake-supabase.mjs`, a small **test-only** stand-in for Supabase Auth and the REST API. It runs every request against the real schema as the real `authenticated`/`anon` roles, so RLS is exercised for real, without needing Docker. To use a system Chromium, set `PLAYWRIGHT_CHROMIUM_PATH`; otherwise run `npx playwright install chromium` once.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Missing Supabase configuration" | Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then restart `npm run dev` or redeploy. `NEXT_PUBLIC_*` values are baked in at build time |
| Signup says "check your email" but nothing arrives | Supabase's default email has a low rate limit. Wait, set up SMTP, or turn off **Confirm email** for testing |
| An email link opens and says "link invalid" | Add your URL to **Redirect URLs** and use the token-hash email templates from [Supabase setup](#supabase-setup) step 6 |
| Friends' data doesn't show up | Make sure you're both in the same group and the habit is set to **My groups**, not **Private** |
| No reminder notifications | Check all three items in [Reminders](#reminders-push-notifications). On iPhone, enable reminders from the home-screen app |
| Errors about `habit_history` or other functions | The migration didn't run completely. Re-run it in the SQL Editor |
