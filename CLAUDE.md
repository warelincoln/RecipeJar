# CLAUDE.md — Orzo project rules for Claude

> This file is auto-loaded by Claude Code. Read every section.

---

## 🔴 HARD RULE — Restart dev server + Metro after ANY code change

**Every time you edit code in this repo, you MUST kill and restart the local API server (port 3000) and Metro (port 8081) before verifying behavior or telling the user the change works.**

### Why this rule exists

`tsx watch` on this Mac silently drops file-change reloads. Confirmed by PID + start-time inspection on 2026-04-21: a 24-hour-old server kept serving pre-edit code while we believed hot-reload had picked up the change. The user had to test manually on a physical iPhone and report "this isn't fixed" before the stale process was discovered.

The most likely cause is watchman's recrawl warnings combined with the repo path containing spaces (`MACBOOK PRO DESKTOP/Orzo`). Debug later if you want — **for now, do not trust watch-mode reloads in this repo. Restart.**

The same rule applies to Metro: Fast Refresh mostly works, but any change that restructures module boundaries, adds hooks, or touches shared types should trigger a full reload. Don't guess. Restart.

### The restart command

From the repo root (**`/Users/lincolnware/Desktop/MACBOOK PRO DESKTOP/Orzo`**):

```bash
# 1. Kill everything on 3000 and 8081
pkill -f "tsx watch" 2>/dev/null
pkill -f "react-native start" 2>/dev/null
pkill -f "npm run dev:phone" 2>/dev/null
sleep 2

# 2. Verify ports are clear
lsof -iTCP:3000 -iTCP:8081 -sTCP:LISTEN -P -n 2>&1

# 3. Restart fresh (backgrounded, logs to /tmp/orzo-dev-phone.log)
npm run ensure:phone

# 4. Verify /health before doing anything else
curl -s -m 3 http://127.0.0.1:3000/health
# Expected: {"status":"ok"}

# 5. Confirm the new PID by inspecting start time
ps -o pid,lstart,command -p $(lsof -iTCP:3000 -sTCP:LISTEN -n -P -t)
# STARTED column should show the current minute, NOT yesterday's date.
```

### When this rule applies

- **Every** edit under `server/src/**`
- **Every** edit under `mobile/src/**`
- **Every** edit under `shared/src/**`
- **Every** edit to `package.json`, `.env`, `tsconfig.json`, or any config file

If you made the edit and haven't restarted, **you have not verified it**, and you must not tell the user the change is working.

### Telling the user the iPhone also needs a reload

After the server + Metro restart, the iPhone app is still running the previous JS bundle in memory. Always tell the user: **"Shake the iPhone → tap Reload"** (or press `r` in the Metro terminal) before they re-test. Otherwise they'll see stale UI while the server serves fresh data, which is confusing.

---

## Project orientation

Orzo is a React Native (mobile) + Fastify (server) recipe-parsing app.

- **`server/`** — Fastify API, tsx watch dev mode, Railway prod deploy on master merge.
- **`mobile/`** — React Native app, Metro bundler, iOS-first. Physical iPhone `Lincoln Ware's iPhone` wireless Debug build via `cd mobile && ./run.sh device`. TestFlight for prod builds.
- **`shared/`** — TypeScript types shared between server and mobile. `@orzo/shared` workspace.

Key runtime docs:
- [`docs/RUNNING.md`](docs/RUNNING.md) — canonical day-to-day dev commands.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — validation engine, save-decision, state machine.
- [`docs/STATUS.md`](docs/STATUS.md) — what's proven live vs. tested vs. gaps.
- [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) — inventory of shipped features.
- [`CHANGELOG.md`](CHANGELOG.md) — history.

### The typical local dev topology

- **Mac LAN IP** baked into `mobile/ios/Orzo/Info.plist` (`OrzoDevPackagerHost`) and `mobile/src/devLanHost.ts` (auto-regenerated on `npm install` by `scripts/write-orzo-dev-host.cjs`).
- iPhone Debug build (`__DEV__ = true`) hits `http://<LAN-IP>:3000` for the API and Metro on `:8081`.
- TestFlight build (`__DEV__ = false`) hits `https://api.getorzo.com` (Railway).

### Platform-specific gotchas

- Repo path contains spaces (`MACBOOK PRO DESKTOP/Orzo`). Always quote paths in `cd` and file operations. Watchman warns about recrawls — see the hard rule above.
- Mobile tests: XCUITest target requires Metro + server running + iPhone paired.
- Server tests: `npm run test -w @orzo/server` for Vitest. LLM eval suite gated on `RUN_LLM_EVALS=1`.

---

## Memory hooks for future sessions

- **Never reset shared credentials.** DB password is shared with Railway. Ask the user for the current value.
- **Don't type into dashboards via the Chrome extension.** Give the user instructions instead.
- **Minimize back-and-forth.** Trace the full dependency chain before making changes; verify every link before reporting fixed.
- **Schema migrations touching `.returning()` or reads: apply to prod BEFORE pushing the code that references the column.** Railway auto-deploys on push to `master`, and Drizzle's `db.query.*.findFirst` + `.returning()` on insert both auto-SELECT every column defined in the current `schema.ts`. The instant the new deploy lands, every insert/read against a table with a new-schema column that doesn't exist on the prod DB → Postgres "column X does not exist" → user sees "Import didn't finish" on every URL/image import. **Dev and prod use SEPARATE Supabase projects** (`nrdomcszbvqnfinrjvuz` vs `ttpgamwmjtrdnsfmdkec`); applying to dev does nothing for prod. Correct sequence:
  1. Apply migration to PROD DB (via `DATABASE_URL='<prod>' npx tsx server/scripts/apply-XXXX.ts`)
  2. Verify column present on prod
  3. `git push` → Railway deploys
  4. Apply migration to DEV DB (via `server/.env` pointing at dev + `npx tsx server/scripts/apply-XXXX.ts`)
  5. Restart local dev

  Observed 2026-04-24: migration 0015 (`drafts.resolved_url`) was applied to dev only; push → Railway deployed code that reads the column → prod drafts INSERT `.returning()` failed → all TestFlight URL/image imports broken until prod migration applied. Fix takes ~5s once prod DATABASE_URL is in hand — additive `ADD COLUMN IF NOT EXISTS` is safe to apply under live traffic.
