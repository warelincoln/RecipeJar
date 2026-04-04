# Production Deployment Guide

## Server Deployment (Fastify API)

The mobile app expects the production API at `https://api.recipejar.app` (configured in `mobile/src/services/api.ts`).

### Option A: Railway

```bash
# From repo root
railway login
railway init
railway link
railway up --service server
```

Set environment variables in Railway dashboard:
- `DATABASE_URL` — Supabase Postgres connection string (pooled)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (never expose to client)
- `SUPABASE_JWT_SECRET` — JWT secret for local verification
- `OPENAI_API_KEY` — OpenAI API key for recipe parsing
- `PORT` — Railway sets this automatically

Custom domain: Point `api.recipejar.app` CNAME to the Railway-provided domain.

### Option B: Render

1. Connect GitHub repo
2. Set root directory to repo root
3. Build command: `npm ci --workspace=@recipejar/shared --workspace=@recipejar/server`
4. Start command: `node --import tsx server/src/app.ts`
5. Set environment variables (same as above)
6. Custom domain: `api.recipejar.app`

### Option C: Fly.io

```bash
cd server
fly launch --dockerfile Dockerfile
fly secrets set DATABASE_URL="..." SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." OPENAI_API_KEY="..."
fly deploy
```

### Post-Deploy Verification

```bash
curl https://api.recipejar.app/health
# Expected: {"status":"ok"}
```

### Mobile Native Rebuild

After the production API is live, do a clean native build so the app connects to `api.recipejar.app` in release mode:

```bash
cd mobile
npx react-native run-ios --mode Release
```

### DNS Configuration

Point `api.recipejar.app` to your chosen cloud host via CNAME record.
Ensure HTTPS/TLS is configured (most platforms handle this automatically).
