# Setup

> **What this doc covers:** Prerequisites, environment variables, and first-time setup steps to get a clean clone of Orzo running locally. After this, see [`RUNNING.md`](RUNNING.md) for day-to-day server/mobile workflows. Back to [`../README.md`](../README.md).

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| **Node.js** | 18.0.0 | https://nodejs.org/en/download — use LTS |
| **npm** | 9.0.0 | Bundled with Node.js |
| **Android Studio** | 2024.x (Ladybug+) | https://developer.android.com/studio — needed for Android emulator |
| **JDK** | 17 | Bundled with Android Studio, or https://adoptium.net/ |
| **CocoaPods** | 1.14+ | macOS only: `gem install cocoapods` |
| **Xcode** | 15+ | macOS only: App Store |

### Android Studio Setup (Windows)

1. Download and install Android Studio from https://developer.android.com/studio
2. During install, ensure these are checked: Android SDK, Android SDK Platform, Android Virtual Device
3. Open Android Studio → Settings → Languages & Frameworks → Android SDK
4. In SDK Platforms tab: install **Android 14 (API 34)** or higher
5. In SDK Tools tab: install **Android SDK Build-Tools 35.0.0**, **Android SDK Command-line Tools**, **Android Emulator**
6. Set environment variables:
   ```
   ANDROID_HOME = C:\Users\<you>\AppData\Local\Android\Sdk
   PATH += %ANDROID_HOME%\platform-tools
   PATH += %ANDROID_HOME%\emulator
   ```
7. Create an AVD: Android Studio → Device Manager → Create Virtual Device → Pixel 7 → API 34 → Download system image → Finish

Verify: open a terminal and run `adb devices`. If it prints `List of devices attached`, Android SDK is configured.

---

## Environment Variables

### Dev and production are fully isolated

The project runs against **two separate Supabase projects**:

| | Project ref | Used by |
|---|---|---|
| **Dev** | `nrdomcszbvqnfinrjvuz` | Local Fastify (loaded from `server/.env`) + "Orzo Dev" mobile app (Debug build) |
| **Production** | `ttpgamwmjtrdnsfmdkec` | Railway Fastify (env vars set in Railway dashboard) + "Orzo" mobile app (Release build) |

`server/.env` on your laptop should always point at the **dev** project. Railway holds production credentials independently. The mobile app automatically picks the right Supabase URL + anon key based on the `__DEV__` flag (see `mobile/src/services/supabase.ts`). Schema migrations and dashboard experiments should always run against dev first; promote to prod only via a scoped explicit runner.

### Setting `server/.env`

Create `server/.env` by copying `server/.env.example`:

```bash
cd server
cp .env.example .env
```

Then fill in these values (all four should reference the **dev** Supabase project unless you have a specific reason otherwise):

```env
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_PASSWORD@aws-0-YOUR_REGION.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=sk-proj-your-key
PORT=3000
```

### Where to get each value

| Variable | Where to find it | What breaks if missing |
|---|---|---|
| `DATABASE_URL` | Supabase dashboard → Settings → Database → Connection string → select **Session pooler** tab. Use the pooler URL, not the direct connection URL. If your password has special characters (`@`, `*`, `/`, `&`), URL-encode them. | Server cannot start. All database operations fail. `drizzle-kit push` fails. |
| `SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL | Image upload/download fails. Draft page upload returns 500. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → `service_role` key (under "Project API keys") | Image upload fails. Same as above. |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys → Create new secret key | `POST /drafts/:id/parse` fails for image drafts (GPT-5.4 Vision). URL AI fallback fails. JSON-LD and DOM extraction still work. |
| `PORT` | Optional. Defaults to `3000`. | Nothing. |

### Critical: Use the Session Pooler URL

Supabase direct-connect hostnames (`db.*.supabase.co`) resolve to IPv6-only addresses. Many Windows machines and some networks cannot route IPv6. The session pooler (`aws-0-REGION.pooler.supabase.com`) has IPv4 and works everywhere.

The pooler URL format:
```
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Note the username is `postgres.PROJECT_REF` (with a dot), not just `postgres`.

### URL-encoding passwords

If your Supabase password contains special characters, encode them:

| Character | Encoded |
|---|---|
| `@` | `%40` |
| `*` | `%2A` |
| `/` | `%2F` |
| `&` | `%26` |
| `#` | `%23` |
| `+` | `%2B` |

Example: password `@Fht*mB_Q7/&-Uz` becomes `%40Fht%2AmB_Q7%2F%26-Uz`

---

## First-Time Setup

Every command below should be run from the monorepo root (`Orzo/`) unless stated otherwise.

### Step 1: Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/Orzo.git
cd Orzo
```

### Step 2: Install all dependencies

```bash
npm install
```

Expected output ends with:

```
added XXX packages, and audited YYY packages in Zs
```

This installs dependencies for all three workspaces (`shared`, `server`, `mobile`) via npm workspaces.

### Step 3: Configure environment

```bash
cd server
cp .env.example .env
```

Edit `server/.env` and fill in all four required values. See "Environment Variables" above.

### Step 4: Create Supabase Storage bucket

In your Supabase dashboard: Storage → New bucket → Name: `recipe-pages` → Public: **enabled** → Create.

This bucket stores uploaded **draft** page images for parsing.

**Recipe hero images** use a separate bucket **`recipe-images`** (also public in the current single-user MVP). With a valid **`SUPABASE_SERVICE_ROLE_KEY`**, the server **creates this bucket on first use** if it does not exist; you can also create it manually the same way as `recipe-pages`.

Important: this public-bucket setup is a **temporary MVP shortcut**, not the target multi-user design. The auth/security plan requires converting user-owned media to **private buckets** with **signed URLs or an authenticated media proxy** before shipping real multi-user accounts.

### Step 5: Push database schema

```bash
cd server
npx drizzle-kit push
```

Expected output:

```
Reading config file 'drizzle.config.ts'
Using 'postgres' driver for database querying
[✓] Pulling schema from database...
[✓] Changes applied
```

This applies all migrations through the latest in `server/drizzle/` (including **`0007_structured_ingredients_servings`**, which adds `baseline_servings` to `recipes` and structured ingredient columns to `recipe_ingredients`). The baseline schema has 10 tables: `drafts`, `draft_pages`, `draft_warning_states`, `collections`, `recipes`, `recipe_collections` (join table with composite PK and cascade deletes), `recipe_ingredients`, `recipe_steps`, `recipe_source_pages`, `recipe_notes` (FK to recipes with cascade delete, indexed by recipe_id).

If you see `ECONNREFUSED` or `ENOTFOUND`: your `DATABASE_URL` is wrong, or you are not using the pooler URL. See "Environment Variables" above.

**Bringing up a fresh Supabase project from scratch** (e.g. a new dev project clone): `drizzle-kit push` alone is not enough — it creates tables from `schema.ts` but skips the Postgres `handle_new_user` trigger (migration 0008), RLS policies (migration 0009), and a few additional DDL bits baked into the raw SQL files. Instead, run the full replay iterator from the `server/` directory, then create the banned seed user:

```bash
cd server
npx tsx scripts/apply-all-migrations.ts     # replays every drizzle/*.sql in filename order; idempotent
npx tsx scripts/migrate-0008-backfill.ts    # creates migration-seed@getorzo.com (banned; no-op backfill on empty DB)
npx tsx scripts/verify-0008.ts              # confirm profiles + trigger + user_id columns
npx tsx scripts/verify-0009-rls.ts          # confirm RLS enabled + policy count
```

After that, routine schema updates continue to work via `drizzle-kit push` as above.

### Step 6: Start the server

```bash
cd server
npm run dev
```

Expected output:

```
{"level":30,"msg":"Server listening at http://127.0.0.1:3000"}
{"level":30,"msg":"Server listening on http://127.0.0.1:3000"}
```

### Step 7: Verify health

In a separate terminal:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok"}
```

If using PowerShell:

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

### Step 8: Run server tests

```bash
cd server
npm test
```

Expected output:

```
 ✓ tests/save-decision.test.ts (8 tests)
 ✓ tests/url-ssrf-guard.test.ts (14 tests)
 ✓ tests/validation.engine.test.ts (23 tests)
 ✓ tests/machine.test.ts (10 tests)
 ✓ tests/integration.test.ts (34 tests)
 ✓ tests/parsing.test.ts (38 tests)

 Test Files  6 passed (6)
      Tests  127 passed (127)
```

All 127 tests pass. Tests mock the database, Supabase, and OpenAI — they do not require live credentials.
