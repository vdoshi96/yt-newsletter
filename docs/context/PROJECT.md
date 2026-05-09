# Project

`yt-newsletter` is a private, Vercel-hosted full-stack app for turning YouTube creator uploads into grounded daily and weekly learning digests.

## Product Intent

The reader is smart, not a programmer, and wants plain-English AI/topic explanations without hype or paid-course funnels. Digests should tie claims to transcript/source notes, mark uncertainty, and prefer free learning paths.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Postgres
- Supabase Storage
- Custom username/password auth
- Vercel Cron
- Server-only AI calls

## Seed Creator

Nate B. Jones: `https://www.youtube.com/@NateBJones`

## Non-Goals

- No public signup by default.
- No OAuth or magic links.
- No client-side AI provider calls.
- No OpenAI or Claude by default for MVP routing.
