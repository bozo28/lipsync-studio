# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LipSync Studio — a virtual lipstick try-on web app. Users take/upload a selfie, pick a color, and get an AI-processed result image with the lipstick applied.

## Architecture

**Frontend**: Single `index.html` file (~3000 lines) — vanilla HTML/CSS/JS SPA, no build step. Deployed to GitHub Pages with custom domain `https://lipsyncstudio.app/`.

**Backend**: Cloudflare Worker (`worker/`) — TypeScript, deployed to `https://lipsync-worker.bburhan272.workers.dev`. Acts as a secure proxy between the frontend and external services.

**External services**:
- **Supabase**: Auth (ES256 JWT via JWKS), PostgreSQL for credits/usage tracking
- **Kie AI**: AI image processing (two-step: upload to `kieai.redpandaai.co`, then create task via `api.kie.ai`, results served from `tempfile.aiquickdraw.com`)
- **Cloudflare KV**: Rate limiting (10 req/min per user)

**Data flow**: Frontend gets Supabase JWT → sends base64 image + color to Worker → Worker verifies JWT, deducts credit, uploads to Kie AI, returns taskId → Frontend polls Worker for status → Worker proxies result image back to frontend.

## Commands

```bash
# Worker development (run from worker/ directory)
cd worker
npm run dev        # Local dev server (wrangler dev)
npm run deploy     # Deploy to Cloudflare

# Manage Worker secrets
npx wrangler secret put KIE_AI_API_KEY
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put SUPABASE_JWT_SECRET

# Frontend — no build step, just push to GitHub for Pages deployment
git push origin master
```

## Worker API Routes

| Route | Method | Auth | Handler |
|-------|--------|------|---------|
| `/api/apply` | POST | JWT | `routes/apply-lipstick.ts` — submit photo + color |
| `/api/task` | GET | JWT | `routes/task-status.ts` — poll task status |
| `/api/image` | GET | JWT | `routes/proxy-image.ts` — proxy images from Kie AI domains |
| `/health` | GET | No | Health check |

## Key Constraints

- **API keys must NEVER be in frontend code, git history, or any public file.** All secrets are stored as Cloudflare Worker secrets. The Supabase anon key in `index.html` is intentionally public (read-only, RLS-protected).
- The image proxy in `proxy-image.ts` has a domain whitelist — if Kie AI starts serving results from a new domain, it must be added there.
- Credit deduction uses an atomic Supabase RPC (`deduct_credit`). On AI failure, credits are refunded via REST PATCH.
- Frontend supports 6 languages: EN, FR, DE, ES, IT, TR. New user-facing strings need i18n entries in all languages.
- The `supabase-setup.sql` file documents the database schema but is run manually in Supabase SQL Editor, not via migrations.

## Worker Source Layout

```
worker/src/
├── index.ts           # Router, dispatches to routes
├── auth.ts            # JWT verification via Supabase JWKS
├── types.ts           # Env and interface definitions
├── middleware/         # CORS, rate limiting
├── routes/            # API endpoint handlers
├── services/          # Kie AI client, Supabase REST client
└── utils/             # Error classes, request validation
```
