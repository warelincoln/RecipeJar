# WS-6 Storage Security — Deployment Runbook

## Prerequisites

- Server code deployed with signed URL + user-scoped path changes
- All env vars set: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Deployment Order

**Order matters. Do NOT flip buckets before running the migration.**

### Step 1: Deploy updated server code

The new code works with both public and private buckets (`createSignedUrl` works on both), so deploy first with no downtime risk.

```bash
# Deploy to production host (Railway / Render / Fly.io)
git push origin main
```

### Step 2: Run storage migration script

Moves all existing storage objects to user-scoped paths and updates DB references.

```bash
npx tsx server/scripts/migrate-storage-user-scoped.ts
```

Verify output shows 0 errors.

### Step 3: Flip buckets to private

In Supabase Dashboard → Storage:

1. Click `recipe-images` bucket → Settings → Toggle **Public** OFF
2. Click `recipe-pages` bucket → Settings → Toggle **Public** OFF

Alternatively, the server's `ensureRecipeImagesBucket()` now sets `public: false` on startup, so restarting the server will flip `recipe-images` automatically. For `recipe-pages`, use the dashboard.

### Step 4: Verify on device

1. Open the app on the physical iPhone
2. Navigate to recipe list — all images should load (signed URLs)
3. Open a recipe detail — hero image loads
4. Create a new draft, take a photo — upload succeeds
5. Parse the draft — OCR works via `download()` (no public URL fallback)
6. Save the recipe — hero image appears

### Rollback

If images break after flipping to private:

1. In Supabase Dashboard → Storage, toggle buckets back to **Public**
2. Images will load again immediately (signed URLs also work on public buckets)
3. Investigate and fix before re-attempting
