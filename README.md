# yt-newsletter

A private Next.js App Router dashboard that turns YouTube creator uploads into grounded daily newspaper-style digests, weekly newsletters, and optional weekly podcast audio.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Custom username/password auth with Argon2id and HTTP-only cookies
- Supabase Postgres for app data
- Supabase Storage for generated podcast/image assets
- Vercel Cron-compatible queue endpoints
- Server-side AI provider routing for DeepSeek, Qwen/DashScope, Kimi, and Gemini

## Local Setup

```bash
npm install
npm run env:setup
npm run db:migrate
npm run seed
npm run dev
```

Open `http://localhost:3000`.

`npm run env:setup` validates required variable names and appends generated local secrets/defaults to `.env.local`. It never prints secret values.

## Supabase Setup

1. Create a Supabase project.
2. Put the database connection string in `.env.local` as `DATABASE_URL`.
3. Add the Supabase API values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Apply the schema:

```bash
npm run db:migrate
```

The migration creates the requested app tables, enables RLS to avoid accidental public Supabase API access, and creates the `yt-newsletter-assets` Storage bucket.

## Environment

Use `.env.example` as the template. Required external-account values:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
YOUTUBE_API_KEY
DEEPSEEK_API_KEY
KIMI_API_KEY
QWEN_API_KEY
DASHSCOPE_API_KEY
GEMINI_API_KEY
FIRST_ADMIN_USERNAME
FIRST_ADMIN_PASSWORD
```

Local generated/default values:

```text
CRON_SECRET
COOKIE_SECRET
APP_ENV
NEXT_PUBLIC_APP_URL
SUPABASE_STORAGE_BUCKET
MONTHLY_AI_BUDGET_USD
MAX_BACKFILL_VIDEOS_PER_JOB
MAX_VIDEOS_PROCESSED_PER_CRON_RUN
TRANSCRIPT_RETRY_HOURS
GENERATE_IMAGES
GENERATE_AUDIO
```

Do not commit `.env.local`.

## Seed Data

Seed the first admin from `FIRST_ADMIN_USERNAME` and `FIRST_ADMIN_PASSWORD`:

```bash
npm run seed:user
```

Seed the starter creator, Nate B. Jones:

```bash
npm run seed:creator
```

This does not ingest 50 videos. The dashboard defaults to 5 videos unless the user selects more.

## Manual Ingestion

From the UI:

1. Sign in.
2. Go to `/app/creators`.
3. Paste a YouTube creator/channel/video URL.
4. Choose 5, 10, 25, or 50 videos.
5. Start ingestion.
6. Go to `/app/settings` and click “Run ingest now,” or call the cron endpoint.

From the command line:

```bash
npm run ingest:process
```

Protected endpoint:

```bash
curl -X POST http://localhost:3000/api/admin/run-ingest-now \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Cron

Configured in `vercel.json`:

- `/api/cron/process-ingest` every 5 minutes
- `/api/cron/check-creators` daily

Both require `CRON_SECRET` via `Authorization: Bearer ...`, `x-cron-secret`, or `?secret=...`.

## Vercel Setup

If using the Vercel CLI:

```bash
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add DATABASE_URL production
vercel env add YOUTUBE_API_KEY production
vercel env add DEEPSEEK_API_KEY production
vercel env add KIMI_API_KEY production
vercel env add QWEN_API_KEY production
vercel env add DASHSCOPE_API_KEY production
vercel env add GEMINI_API_KEY production
vercel env add FIRST_ADMIN_USERNAME production
vercel env add FIRST_ADMIN_PASSWORD production
vercel env add CRON_SECRET production
vercel env add COOKIE_SECRET production
vercel --prod
```

Repeat environment variables for `preview` as needed.

Manual import:

1. Go to Vercel Dashboard.
2. Import `https://github.com/vdoshi96/yt-newsletter`.
3. Add the environment variables from `.env.example`.
4. Deploy.

## GitHub

Remote origin should be:

```bash
git remote add origin https://github.com/vdoshi96/yt-newsletter.git
git branch -M main
git push -u origin main
```

Verify local and remote `main`:

```bash
git rev-parse HEAD
git rev-parse origin/main
```

## Verification

```bash
npm test
npm run lint
npm run build
```
