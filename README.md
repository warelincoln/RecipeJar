# Orzo

## 0. Fast Handoff

If you are a new developer or an AI agent, start here.

### What this repo is

- Monorepo with 3 workspaces:
  - `shared/` — domain types
  - `server/` — Fastify + Drizzle + parsing + validation
  - `mobile/` — React Native app + XState import flow
- Main product promise: take a recipe from either **camera**, **photo library**, or **URL**, validate it deterministically, then save only if the result is acceptable.
  - **Concurrent import queue**: users can import up to **3 image-based recipes concurrently** — the server parses in the background while the user queues additional imports. A dedicated **Import Hub** screen manages all pending imports, and an app-wide **floating banner** indicates queue status from any screen.
  - **Servings & ingredient scaling**: every recipe captures a **baseline servings** count. Ingredients are stored as **structured data** (`amount`, `amountMax`, `unit`, `name`, `isScalable`). The detail screen provides an interactive **servings stepper** that scales ingredient amounts in real time (client-side multiplication, mixed-number formatting with unicode fractions rounded to ⅛). No unit conversion — just numeric scaling.

### Fastest way to get running

1. From the repo root, run `npm install`  
   - Runs **`patch-package`** (see `patches/*.patch` — required for RN 0.76 + `react-native-svg` iOS build).  
   - Runs **`scripts/write-orzo-dev-host.cjs`** (writes gitignored `mobile/src/devLanHost.ts` for LAN API/Metro; edit or re-run if your Mac's IP changes).
2. Create `server/.env` from `server/.env.example`
3. Start phone dev services with `npm run dev:phone`
4. Verify:
   - API: `curl http://127.0.0.1:3000/health` → `{"status":"ok"}`
   - Metro: `curl http://127.0.0.1:8081/status` → `packager-status:running`
5. For native iPhone changes only, run `cd mobile && ./run.sh device`

### Default development assumptions

- Default iOS target is a **physical iPhone over Wi-Fi**, not the simulator.
- Default local ports:
  - API: `3000`
  - Metro: `8081`
- Most day-to-day edits are **JS-only** and only require Fast Refresh / Reload, not a new native build.

### Dev app vs production app (two apps on one phone)

The Debug build installs as **"Orzo Dev"** (`app.orzo.ios.dev`) — a separate app that coexists with the production **"Orzo"** (`app.orzo.ios`) on the same phone. Dev and prod also hit **separate Supabase projects**, so local schema/auth/storage experiments never touch production data.

| | Orzo Dev (Debug) | Orzo (Release) |
|---|---|---|
| **Bundle ID** | `app.orzo.ios.dev` | `app.orzo.ios` |
| **API target** | Local laptop (`http://<LAN_IP>:3000`) | Railway (`https://api.getorzo.com`) |
| **Supabase project** | `nrdomcszbvqnfinrjvuz` (dev) | `ttpgamwmjtrdnsfmdkec` (production) |
| **Auth redirect scheme** | `app.orzo.ios.dev://auth/callback` | `app.orzo.ios://auth/callback` |
| **Auth methods** | Email/password (email confirmation disabled) | Email (confirm on), Apple, Google |
| **How to build** | Xcode Debug (Cmd+R) | Xcode Release / Archive |

**Dev workflow:**
1. Make code changes locally
2. Run `npm run dev:phone` (starts local API + Metro)
3. Build Debug in Xcode → "Orzo Dev" installs on phone, hits local API
4. Test changes on phone
5. When satisfied, push to `master`.

> ⚠️ **Important:** Pushing to `master` auto-deploys the **Fastify server** to Railway. It does **NOT** update the mobile app on your phone. The iOS app is a compiled binary — whatever JS/UI code was bundled into it at Xcode build time is what runs. Mobile UI or JS changes only land on the phone after you rebuild the app in Xcode (see below).

#### Updating the production "Orzo" app on your phone

Pushing mobile code to GitHub doesn't touch the Orzo app on your phone. To see JS/UI changes (e.g. new colors, new screens, new logic) in the production "Orzo" app, rebuild with Release config:

1. **Plug in the iPhone** and select it as the destination in Xcode's top bar (next to the scheme name — it should show your phone's device name, not a simulator)
2. **Product menu → Scheme → Edit Scheme...** (or press `⌘ <`)
3. Left sidebar: click **Run**. On the right, change **Build Configuration** from **Debug** to **Release**. Close the dialog.
4. **Press `⌘ R`** (Product → Run)

Xcode builds a Release version, installs it on the phone as "**Orzo**" (replacing the previous production binary), and launches it. No Metro needed — Release builds bundle the JS into the `.ipa` at build time, so the app is standalone.

**To switch back to the dev loop:** repeat step 2 and change Build Configuration back to **Debug**. Then `⌘ R` installs "Orzo Dev" again and Metro hot-reloads your edits without a rebuild.

**Command-line alternative** (if you prefer not to use the Xcode UI):

```bash
xcodebuild -workspace mobile/ios/Orzo.xcworkspace \
  -scheme Orzo -configuration Release \
  -destination "id=<your-device-udid>" \
  -derivedDataPath "$HOME/Library/Developer/Xcode/DerivedData/Orzo-device-release" \
  -allowProvisioningUpdates build

xcrun devicectl device install app --device <your-device-udid> \
  "$HOME/Library/Developer/Xcode/DerivedData/Orzo-device-release/Build/Products/Release-iphoneos/Orzo.app"
```

Get your device UDID from Xcode → Window → Devices and Simulators, or `xcrun devicectl list devices`.

**Why this matters:** Until TestFlight is wired up (Phase 0.2 of `ROADMAP.md`), you are the distribution mechanism for your own device — Apple has no channel to push new builds automatically. Once TestFlight is live, archiving and uploading to App Store Connect will push new builds to any TestFlight tester's device automatically. Until then, every UI/JS change to the production app requires a Release rebuild + install.

**How it works:** `mobile/src/services/api.ts` uses `__DEV__` to switch between local and production API. `mobile/src/services/authRedirect.ts` uses `__DEV__` to select the correct URL scheme for auth callbacks. `mobile/src/services/supabase.ts` uses `__DEV__` to select the dev vs production Supabase URL + anon key. `Info.plist` uses `$(PRODUCT_BUNDLE_IDENTIFIER)` and `$(PRODUCT_NAME)` build variables so both the URL scheme and display name are derived from the Xcode build configuration. The Debug config in `project.pbxproj` sets `PRODUCT_BUNDLE_IDENTIFIER = app.orzo.ios.dev` and `PRODUCT_NAME = "Orzo Dev"`, while Release keeps `app.orzo.ios` and `Orzo`.

**Keychain isolation:** Each app has its own keychain scope (derived from bundle ID), so sessions are fully isolated — signing in on one does not affect the other.

### Start here in the codebase

- `mobile/src/theme/colors.ts`
  - Canonical palette module — raw tokens (`TERRACOTTA`, `ESPRESSO`, `SAGE_GREEN`, `PAPRIKA`, `GOLDEN_AMBER`, `MUTED_PLUM`, `DUSTY_ROSE`, `SAND`, etc.) and semantic aliases (`PRIMARY`, `TEXT_PRIMARY`, `TEXT_SECONDARY`, `DIVIDER`, `ERROR`, `SUCCESS`, `WARNING`). **Import from here rather than hardcoding hex values** — future palette tweaks are single-file edits
- `mobile/src/screens/HomeScreen.tsx`
  - Jar fan actions (Camera=`GOLDEN_AMBER`, Photos=`DUSTY_ROSE`, URL=`SAGE_GREEN`, Add Folder=`MUTED_PLUM`), Photos picker, photo preview screen, button styling, FAB auto-open for concurrent imports; **long-press** folder chips (not the virtual **All Recipes** chip) for rename/delete
- `mobile/src/screens/ImportFlowScreen.tsx`
  - Route bootstrapping and state-to-view mapping; concurrent flow uses `enqueueImport` (not XState) for camera/photo imports; XState only for URL imports and hub resume
- `mobile/src/screens/ImportHubScreen.tsx`
  - Queue management screen: displays all pending/completed imports, review/retake/cancel actions, "Import Another"
- `mobile/src/stores/importQueue.store.ts`
  - Zustand store with AsyncStorage persistence for managing concurrent import entries (up to 3)
- `mobile/src/features/import/enqueueImport.ts`
  - Client-side upload + background parse trigger with retry and orphan cleanup
- `mobile/src/features/import/importQueuePoller.ts`
  - Polls server for parsing status with exponential backoff, AppState-aware
- `mobile/src/components/PendingImportsBanner.tsx`
  - App-wide floating pill indicator (top-right); blinking dot, tappable to Import Hub
- `mobile/src/features/import/machine.ts`
  - Import flow state machine and actors; `parseDraft` handles `202 Accepted` via polling; resume populates `capturedPages` from server pages
- `mobile/src/features/import/useRecipeParseReveal.ts` + `recipeParseReveal.ts`
  - Word-by-word preview reveal after parse (~6000 WPM); `ImportFlowScreen` `parseRevealToken`
- `mobile/src/services/api.ts`
  - Mobile API client: `authenticatedFetch()` injects Bearer token on all requests (including 4 raw multipart uploads), single-flight `refreshOnce()` token refresh, 401 retry → signOut fallback. Draft page upload metadata passthrough, **`POST`/`DELETE` recipe hero image** (`/recipes/:id/image`), `cancel` method for drafts; **`collections.update`** (`PATCH`) and **`collections.delete`** (204-safe, no JSON parse on success); **`request()`** error messages prefer Fastify **`message`** then **`error`**
- `mobile/src/services/supabase.ts`
  - Supabase client init: **`__DEV__` ternary picks dev vs production Supabase URL + anon key** (same pattern as `api.ts` and `authRedirect.ts`), `react-native-keychain` storage adapter (Keychain service `app.orzo.session`), `detectSessionInUrl: false`, polyfills for URL and crypto. Startup logs `[orzo] Supabase: DEV|PROD <url>` to Metro for quick confirmation of which project the build is wired to.
- `mobile/src/stores/auth.store.ts`
  - Zustand auth store: `session`, `user`, `isLoading`, `isAuthenticated`, `pendingPasswordReset`. `initialize()` restores from Keychain, subscribes to `onAuthStateChange`. `signOut()` clears Keychain + resets recipes/collections/importQueue stores.
- `mobile/src/screens/OnboardingScreen.tsx`
  - 3-card swipeable carousel (first-launch only, AsyncStorage flag)
- `mobile/src/screens/AuthScreen.tsx`
  - Social-first login hub: Apple Sign-In (SHA-256 nonce via `js-sha256`), Google Sign-In (`iosClientId` + `webClientId`, nonce extracted via `jwt-decode`), email sign-in/up links
- `mobile/src/screens/SignInScreen.tsx`
  - Email/password login form with show/hide toggle, "Forgot password?" link
- `mobile/src/screens/SignUpScreen.tsx`
  - Email registration: display name, 12-char password hint, email confirmation redirect to EmailConfirmationScreen
- `mobile/src/screens/ForgotPasswordScreen.tsx`
  - Password reset email request via `resetPasswordForEmail()` with `redirectTo` to app scheme
- `mobile/src/screens/EmailConfirmationScreen.tsx`
  - "Check your inbox" prompt after sign-up
- `mobile/src/screens/ResetPasswordScreen.tsx`
  - Standalone new-password form, rendered by four-state root on `type=recovery` deep link
- `mobile/src/screens/AccountScreen.tsx`
  - Profile display, email change, linked providers (Link/Unlink for Apple/Google), Security section (MFA enrollment/unenrollment), Sign Out, Sign Out All Devices, Delete Account
- `mobile/src/screens/MfaChallengeScreen.tsx`
  - TOTP code entry during MFA sign-in challenge; allows sign-out if user cannot verify
- `mobile/src/screens/CollectionScreen.tsx`
  - Folder **`MoreHorizontal`** menu (rename / delete), **`CreateCollectionSheet`** rename mode, **`DeleteCollectionConfirmSheet`**, **404** handling when folder was deleted elsewhere
- `mobile/src/components/CreateCollectionSheet.tsx`
  - **`mode: "create" | "rename"`**, live Lucide preview from **`getCollectionIcon`** while typing
- `mobile/src/components/RecipeQuickActionsSheet.tsx`
  - **`RecipeQuickActionsSheet`** + optional **`emphasisLabel`**; **`DeleteCollectionConfirmSheet`** for folder delete confirm
- `mobile/src/stores/collections.store.ts`
  - **`updateCollection`**, **`deleteCollection`** (local list + **`fetchRecipes`** after delete)
- `server/src/api/collections.routes.ts`
  - **`PATCH /collections/:id`** rename; **`DELETE`** returns 204
- `server/src/api/recipes.routes.ts`
  - Assign-to-collection validates collection exists (**404** if missing)
- `server/src/api/drafts.routes.ts`
  - Draft creation, page upload, parse (fire-and-forget `202`), cancel, save endpoints; idempotency guards; resolved page image URLs
- `server/src/parsing/parse-semaphore.ts`
  - In-memory semaphore limiting concurrent OpenAI Vision API calls to 2
- `server/src/parsing/ingredient-parser.ts`
  - Deterministic regex/rules-based ingredient line decomposer: fractions, unicode, ranges, unit canonicalization, non-scalable detection. Used by URL structured adapter + Rule A (re-parse on saved recipe edit)
- `server/src/domain/validation/rules.servings.ts`
  - `SERVINGS_MISSING` (BLOCK) — fires when `candidate.servings` is null or ≤ 0; user must specify servings before saving
- `mobile/src/utils/scaling.ts`
  - Client-side scaling engine: `scaleAmount`, `formatAmount` (mixed numbers, unicode fractions, ⅛ rounding), `scaleIngredient` (headers verbatim, non-scalable lines verbatim, range support)
- `mobile/src/navigation/types.ts`
  - Navigation param lists: `AuthStackParamList` (Onboarding, Auth, SignIn, SignUp, ForgotPassword, EmailConfirmation) + `Account` route in `RootStackParamList`. `ResetPasswordScreen` is standalone (not in a navigator).
- `server/src/middleware/auth.ts`
  - Fastify `onRequest` hook: verifies Supabase access token via `getUser()`, sets `request.userId`; `/health` exempt. Records session (user agent + IP) after successful auth. **All endpoints return 401 without a valid token.**
- `server/src/middleware/step-up-auth.ts`
  - Step-up authentication helpers: `requireRecentAuth(maxAgeSeconds)` checks JWT `iat` claim, `requireAal2IfEnrolled()` checks MFA assurance level. Local JWT payload decoding (no remote call).
- `server/src/api/account.routes.ts`
  - Account management endpoints: `DELETE /account` (soft delete), `POST /account/recovery-codes`, `POST /account/verify-recovery-code`, `GET /account/recovery-codes/remaining`, `GET /account/sessions`.
- `server/src/services/mfa-recovery.service.ts`
  - MFA recovery code generation (10 codes, SHA256-hashed), verification (mark as used), remaining count.
- `server/src/services/session-tracker.service.ts`
  - Session recording (upsert by user+device), listing, stale cleanup.
- `server/src/persistence/schema.ts`
  - Drizzle schema: `profiles` table (maps 1:1 with `auth.users`) + `userId` NOT NULL FK on `recipes`, `collections`, `drafts`, `recipe_notes` + `mfaRecoveryCodes` + `userSessions`
- `docs/AUTH_RLS_SECURITY_PLAN.md`
  - Comprehensive security plan: 8 work streams (WS-1 through WS-8). **All 8 complete.** This is the authoritative reference for the auth architecture.
- `docs/SECURITY_CHECKLIST.md`
  - Manual security audit checklist: Supabase dashboard, Apple/Google developer accounts, key rotation, human access, server, storage, data protection.
- `docs/PRODUCTION_DEPLOY.md`
  - Cloud deployment guide for Fastify API (Railway, Render, Fly.io), environment variables, mobile rebuild steps.
- `server/drizzle/0008_auth_profiles_user_id.sql` through `server/drizzle/0012_cascade_user_data_on_profile_delete.sql`
  - Migration 0008: profiles table, auto-create trigger, user_id columns, indexes. Migration 0009: RLS enabled on all tables. Migration 0010: MFA recovery codes table. Migration 0011: user sessions table. Migration 0012: cascade user data on profile delete.
- `server/scripts/migrate-0008-backfill.ts`
  - One-time backfill script: creates banned `migration-seed@getorzo.com` user, assigns any legacy rows, enforces NOT NULL + FK. Idempotent. Executed against prod (April 2026) and dev (2026-04-16).
- `server/scripts/apply-all-migrations.ts`
  - Replays every `server/drizzle/*.sql` in filename order against whatever `DATABASE_URL` the env holds. Use from `server/` after pointing `server/.env` at the dev project to bring a fresh Supabase project up to schema parity. Idempotent — treats `already exists` as skip.
- `server/scripts/migrate-storage-user-scoped.ts`
  - Storage path migration: moves objects from flat paths to user-scoped paths, updates DB columns. Idempotent.
- `server/scripts/hard-delete-accounts.ts`
  - Cron script: permanently deletes accounts soft-deleted 30+ days prior (storage, profile row, auth.users row).
- `server/src/parsing/image/`
  - Upload-time normalization and parse-time OCR prep

### Current image import UX

- `Camera` (concurrent queue):
  - Jar → Camera → capture → reorder → **enqueue** (upload + background parse) → ParsingView with "Import Another" / "Review Recipes" → Import Hub → review each → save
  - User can queue up to **3 concurrent image imports**. While one parses (~30s), they can start another.
- `Photos` (concurrent queue):
  - Jar → Photos → iOS system picker → full-screen photo preview → **enqueue** → same concurrent flow as Camera
- `URL` (separate, not queued):
  - Jar → URL → WebView browser → capture the loaded page HTML when possible → import via the existing URL pipeline (synchronous, uses XState machine directly)
- `Hub review` (from Import Hub):
  - Tap a "Ready for review" or "Needs retake" card → `ImportFlow` with `resumeDraftId` + `fromHub` → XState resume → preview/edit → save → auto-return to Import Hub

### Critical current gotchas

- **Auth is fully wired end-to-end.** Every endpoint except `/health` requires a `Bearer` token. The mobile app sends tokens automatically via `authenticatedFetch()` in `api.ts`. If you're testing the API directly (curl, Postman), get a token via `supabase.auth.signInWithPassword()` or the Supabase dashboard.
- **Production API is live at `https://api.getorzo.com`.** The Fastify server is deployed on Railway (auto-deploys on push to `master`). The mobile app uses the LAN IP in debug builds and `https://api.getorzo.com` in release builds (see `mobile/src/services/api.ts`). Environment variables (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`) are configured in the Railway dashboard. DNS is managed via Cloudflare (`api` CNAME → Railway, DNS-only mode).
- **Debug and Release builds are separate apps.** Debug installs as "Orzo Dev" (`app.orzo.ios.dev`), Release installs as "Orzo" (`app.orzo.ios`). Both coexist on the same phone. Auth redirect URLs use the bundle ID as the scheme — see `mobile/src/services/authRedirect.ts`. Apple/Google Sign-In are **not configured** for the dev bundle ID; use email/password auth during development.
- **`server/.env` is dev-only.** Local `server/.env` points at the **dev** Supabase project (`nrdomcszbvqnfinrjvuz`); Railway's environment points at **production** (`ttpgamwmjtrdnsfmdkec`). The two projects have independent credentials — resetting one cannot break the other. Schema migrations, RLS changes, storage experiments, and test users should always run against dev first. Apply the same migration to prod only via an explicit scoped runner (future: a script guarded by `ORZO_I_REALLY_MEAN_PROD=1`); never by running a script with `server/.env` loaded. After any `.env` edit restart the local dev server (`npm run dev:phone`) and verify the connection before reporting it fixed.
- **Apple client secret expires ~6 months** from generation (April 2026). The `.p8` key is used to generate a JWT. When it expires, regenerate using the script pattern in the conversation history or via `docs/AUTH_RLS_SECURITY_PLAN.md`.
- **New API routes (e.g. `PATCH /collections/:id`):** If folder **rename** fails with a generic error or Fastify **`Route PATCH:… not found`**, the Node process on port **3000** is almost certainly **stale**. Kill listeners on **3000**/**8081** and run **`npm run dev:phone`** again from the repo root. Release builds talk to **`api.getorzo.com`** (Railway), which auto-deploys from `master` — push to trigger a rebuild.
- If you change only `mobile/src/**`, reload the app. Do **not** rebuild natively.
- If you add/change a native dependency or touch `Podfile`, run `cd mobile/ios && pod install`, then `cd ../ && ./run.sh device`.  
  **`pod install`** also runs a **`Podfile` `post_install` hook** that rebuilds **`RCT-Folly` public `folly/json` header symlinks** on macOS case-insensitive volumes (fixes missing `folly/json/dynamic.h` during native compile).
- Do **not** skip **`npm install` at the repo root** after clone: **`patch-package`** applies `patches/react-native+0.76.9.patch` (spaces-in-path fixes for `react-native-xcode.sh`, `with-environment.sh`, and Hermes `replace_hermes_version.js`) and `patches/react-native-svg+15.15.4.patch` (RNSVG + Yoga on New Architecture).
- `mobile/run.sh` is convenient, but its `device` path only prints the final `xcodebuild` line. If you see `(2 failures)` or an invalid bundle, run raw `xcodebuild` to get the real compiler errors.
- Xcode `26.4` can fail building Hermes' bundled `fmt` pod with `consteval` errors. The project works around this in `mobile/ios/Podfile` by patching `Pods/fmt/include/fmt/base.h` during `pod install` to force `FMT_USE_CONSTEVAL 0`.

## 1. What This Project Is

Orzo converts cookbook page photos and recipe URLs into structured digital recipes. It is a **trust-gated, validation-first** ingestion system. No recipe is saved unless it passes a deterministic validation engine. The system never trusts AI output directly — every parsed result is validated, and the user must explicitly resolve or acknowledge all issues before a save is allowed.

**What is implemented (MVP):**

- Fastify API server with full draft lifecycle (create, upload pages, parse, edit, validate, save)
- GPT-5.4 Vision image parsing (sends page photos to OpenAI, receives structured extraction with signal-rich prompt — including per-ingredient structured fields and servings)
- URL recipe parsing with 4-tier cascade: JSON-LD → Microdata → DOM boundary extraction → AI fallback (with fetch retry, browser UA fallback, quality gate, extraction logging, and metadata capture for servings)
- **Servings & ingredient scaling**: every recipe stores `baselineServings`. Ingredients are persisted with structured fields (`amount`, `amountMax`, `unit`, `name`, `raw`, `isScalable`). Parsing extracts these from GPT output (image/URL) or via a **deterministic regex/rules-based ingredient parser** (JSON-LD/microdata strings + Rule A re-parse on saved recipe edit). Missing servings is a `BLOCK`-severity validation issue — the user must specify servings before saving. Detail screen provides an interactive servings stepper that scales ingredient amounts client-side (mixed-number formatting with unicode fractions, ⅛ rounding, no unit conversion).
- Deterministic validation engine with 8 rule modules and 13 issue codes (3 severities: BLOCK, FLAG, RETAKE)
- Save-decision logic with 3 save states (`SAVE_CLEAN`, `SAVE_USER_VERIFIED`, `NO_SAVE`)
- Drizzle ORM schema with 13 PostgreSQL tables (including `profiles`, `collections`, `recipe_collections` join table, `recipe_notes`, `mfa_recovery_codes`, `user_sessions`), indexes, cascade deletes; optional **`image_url`** on `recipes` (migration `0005`), **`baseline_servings`** + structured ingredient columns on `recipe_ingredients` (migration `0007`), **`profiles`** table + **`user_id`** on 4 domain tables (migration `0008`), **RLS policies** on all 13 tables (migration `0009`), **MFA recovery codes** (migration `0010`), **user sessions** (migration `0011`)
- **Full authentication & security hardening (server + mobile)** — Supabase Auth configured (email/password, Apple Sign-In, Google OAuth, TOTP MFA). Fastify JWT middleware verifies tokens on every non-public route and sets `request.userId`. All repositories scope queries by `userId`. Postgres RLS enabled on all 13 public tables. `@fastify/rate-limit` on all API routes (global 100/min, parse 10/hr). Step-up auth for sensitive actions (JWT `iat`/`aal` claims). MFA recovery codes. Session tracking. Auth header redacted from logs. Mobile: Supabase client with Keychain session, auth-gated navigation (onboarding → auth → MFA challenge → app), Apple/Google/email sign-in screens, `authenticatedFetch()` with single-flight token refresh, password reset via deep link, account screen (sign-out, sign-out-all, email change, MFA enrollment/unenrollment, provider linking, account deletion). Existing data backfilled to a banned seed user.
- Supabase Storage integration for **draft page images** (`recipe-pages` bucket) and **saved recipe hero images** (`recipe-images` bucket) — both **private buckets** with **signed URLs** (60-min TTL) and **user-scoped paths** (`{userId}/...`)
- **Concurrent import queue** (up to 3 image-based recipes): fire-and-forget `202 Accepted` parse endpoint, server-side parse concurrency semaphore (max 2 OpenAI Vision calls), client-side Zustand store with AsyncStorage persistence, exponential-backoff poller, Import Hub screen, app-wide floating banner, enqueue function with retry and orphan cleanup, idempotency guards on parse and save, startup cleanup of stuck/cancelled drafts, draft cancel endpoint with Supabase image cleanup
- XState v5 state machine for mobile import flow (9 states — simplified, no correction or warning gate states); used for URL imports and hub resume; camera/photo imports use the concurrent `enqueueImport` path
- React Native mobile app with auth-gated navigation, screens, Zustand stores (auth + recipes + collections + import queue), authenticated API client
- Collections feature: create collections, **rename** (`PATCH /collections/:id`) and **delete** folder (recipes become uncategorized; join rows cascade), many-to-many recipe-collection join table (UI currently single-assignment, schema supports multi), collection view screen, "All Recipes" virtual folder; **long-press** folder chips on home or **⋯** on collection screen for folder actions; **`DeleteCollectionConfirmSheet`** for destructive confirm
- Recipe editing after save: full edit screen with title, description, ingredients, steps, collection assignment, optional **hero photo** (pick/compress/upload or remove; uses multipart **`POST /recipes/:id/image`**)
- **Recipe hero image API:** **`POST /recipes/:id/image`** (multipart file) and **`DELETE /recipes/:id/image`**; **`GET /recipes`** and **`GET /recipes/:id`** (and related update responses) include resolved public **`imageUrl`** and **`thumbnailUrl`** fields for clients
- Home screen with search bar, two-column recipe card grid (thumbnails via **`react-native-fast-image`** when a hero image exists), horizontal collections row (always visible with "All Recipes" first), **long-press real folders** to rename/delete, centered jar FAB with modal (camera, photos, URL, create collection), three empty states (no recipes, all organized, no search results)
- Long-press recipe cards to assign/move/remove collection membership with toast notification and undo
- User notes: multiple text notes per recipe (max 250 chars each), add/edit via modal, delete with confirmation, newest-first with date and "Edited" label, displayed on recipe detail screen below steps
- Star rating: half-star precision (0.5–5.0), tap-to-toggle UX (first tap → half star, second tap → full, third tap → half), clearable to unrated, debounced API persistence, compact read-only display on grid cards (gold star + numeric value, hidden when unrated)
- Real-time client-side search by recipe title on home screen and all collection/folder views
- Lucide icon system (`lucide-react-native`) — all UI icons use Lucide components (no emoji/unicode glyphs). Collection folders auto-assign a contextual icon and color based on their name (keyword rules live in **`mobile/src/features/collections/collectionIconRules.ts`**; falls back to a neutral folder style for unmatched names)
- **Terracotta brand palette applied across the mobile app** (migrated 2026-04-14) — canonical palette tokens live in **`mobile/src/theme/colors.ts`** (`PRIMARY`/`TERRACOTTA`, `PRIMARY_LIGHT`/`WARM_CREAM`, `TEXT_PRIMARY`/`ESPRESSO`, `SAGE_GREEN`, `PAPRIKA`, `GOLDEN_AMBER`, `MUTED_PLUM`, `DUSTY_ROSE`, etc.). Screens import tokens instead of hardcoding hex values. `collectionIconRules.ts` uses muted palette variants (bright Tailwind greens/reds/pinks/purples softened to `SAGE_GREEN`/`PAPRIKA`/`DUSTY_ROSE`/`MUTED_PLUM`) while food-semantic warm inline hexes (oranges, browns) are preserved. Jar fan actions on Home have four contrasting palette colors (Camera: amber, Photos: rose, URL: sage, Add Folder: plum); the FAB "+" and all primary CTAs are `PRIMARY` terracotta.
- **URL import (WebView):** Jar "**URL**" opens `WebRecipeImportScreen` — omnibar, **Google** search for non-URL typed queries (`resolveOmnibarInput` in `webImportUrl.ts`), and **Save to Orzo** now tries to capture the currently loaded page HTML from the WebView before handing off to `ImportFlow`. Requests to major ad/tracking hosts are blocked in `onShouldStartLoadWithRequest` for a cleaner browse experience. **tel: / mailto: / sms:** and **intent:** (Android) require a confirmation alert before leaving the app. If HTML capture fails for a technical reason (injection failure, timeout, message transport failure, oversized payload), the app falls back once to the existing server-side URL fetch path.
- **Home clipboard prompt:** If the pasteboard has text (`Clipboard.hasString()` — avoids proactive `getString()` / permission churn on iOS), a bottom sheet offers **Paste**; reading and URL validation happen only on that tap. After **Paste** or dismiss, the sheet stays suppressed until the app returns from **background** (not `inactive`, so system dialogs like paste permission do not re-enable the prompt).
- **Photo library import:** Jar "**Photos**" fan action opens the system image picker (`react-native-image-picker`). After the user picks an image, the app shows a full-screen preview with **Back** and **Import This Photo**. **Back** reopens the library picker so the user can choose a different image. **Import This Photo** sends the asset through the same upload → parse → preview → save pipeline as camera-captured images. On parse failure, a "Could Not Read Photo" screen with a "Go Home" button replaces the camera-oriented retake flow. Permission denial shows a gentle alert with an "Open Settings" link.
- **Recipe Saved → Add more:** URL imports and Photos imports return to Home; camera imports return to `ImportFlow` in image mode.
- URL input view (`UrlInputView`) remains in `ImportFlow` when URL mode is entered without a pre-filled URL (e.g. deep links later). There are now three URL acquisition modes: **`server-fetch`** (default URL import path), **`webview-html`** (browser-backed import from `WebRecipeImportScreen`), and **`server-fetch-fallback`** (used only when browser HTML capture fails technically). Clipboard and manual URL entry still use the server-fetch path unless they are explicitly routed through the browser first.
- **Parse preview reveal:** After a successful parse (not draft resume), the preview screen reveals title/ingredients/steps **word-by-word** at ~**6000 WPM**; users with **Reduce Motion** see full text immediately (`useRecipeParseReveal`, `recipeParseReveal.ts`, `parseRevealToken` in `ImportFlowScreen`). Optional **`ParseRevealEdgeGlow`** accent during reveal; validation issues can use shared **`issueDisplayMessage`** copy.
- Server-side automated tests (validation, parsing, save-decision, API integration, state machine)
- iOS UI tests via XCUITest (home screen, navigation, import flow screens, cancel flows)

**What is NOT implemented:**

- Offline/local-first sync
- Multi-collection assignment UI (schema supports many-to-many; UI currently assigns one collection at a time)
- Recipe sharing or export
- Unit conversion (e.g. 15 tbsp → ¾ cup + 3 tbsp) — scaling multiplies the numeric amount only
- Grocery list (planned: add a recipe to a grocery list with adjustable serving size)
- Email template branding (Supabase sends default unbranded emails; customize in dashboard)

---

## Documentation Index

The README intentionally stays slim so any agent can read it in one pass. Detailed docs live in [`docs/`](docs/) and at the repo root.

| Topic | Doc | When to read it |
|---|---|---|
| **System architecture** — validation engine, save-decision, state machine + concurrent queue | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Before changing how parses are validated, how saves are gated, or how the import queue is wired |
| **First-time setup** — prerequisites, env vars, Supabase pooler URL, `drizzle-kit push` | [`docs/SETUP.md`](docs/SETUP.md) | Fresh clone, new machine, or onboarding a new contributor |
| **Running the backend & mobile app** — Fast iteration workflow, iOS device default, Android emulator, build errors | [`docs/RUNNING.md`](docs/RUNNING.md) | Day-to-day "what command do I run?" |
| **End-to-end testing** — `curl` walkthrough + top QA scenarios | [`docs/TESTING.md`](docs/TESTING.md) | Smoke-testing a fresh server, scripting integration checks |
| **Project structure** — full annotated file tree | [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md) | Looking up where a particular module lives |
| **Troubleshooting** — symptom → cause → fix table | [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | When something breaks at runtime or build time |
| **Development workflow** — adding rules, modifying parsers, extending the state machine, auth/security architecture, testID conventions | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Before writing non-trivial server or mobile code |
| **Status & known gaps** — proven-live evidence, test coverage, what's NOT yet proven | [`docs/STATUS.md`](docs/STATUS.md) | Sanity check before shipping or before claiming a feature works |
| **Current state assessment** — what's built today vs. what each roadmap phase promises | [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) | Sanity-checking the roadmap against ground truth |
| **Brand identity & color palette** — terracotta tokens, typography, shadow recipes | [`docs/BRAND.md`](docs/BRAND.md) | Designing UI, building marketing surfaces, picking a color |
| **Auth & RLS security plan** — 8 work streams (all complete) | [`docs/AUTH_RLS_SECURITY_PLAN.md`](docs/AUTH_RLS_SECURITY_PLAN.md) | Touching auth, sessions, or RLS policies |
| **Security audit checklist** — Supabase dashboard, key rotation, human access | [`docs/SECURITY_CHECKLIST.md`](docs/SECURITY_CHECKLIST.md) | Pre-launch security review or routine audit |
| **Production deployment** — Railway / Render / Fly.io recipes + mobile rebuild | [`docs/PRODUCTION_DEPLOY.md`](docs/PRODUCTION_DEPLOY.md) | Deploying or moving the API host |
| **Manual QA checklist** — full 11-scenario matrix | [`QA_CHECKLIST.md`](QA_CHECKLIST.md) | Manual test passes |
| **Changelog** — dated release notes | [`CHANGELOG.md`](CHANGELOG.md) | Catching up after a long break |
| **Roadmap** — phase overview, gating, revenue model, dependency graph (per-phase deep dives in `docs/ROADMAP_PHASE_*.md`) | [`ROADMAP.md`](ROADMAP.md) | Planning the next iteration |
| **ELI5** — non-technical explanation | [`ELI5.md`](ELI5.md) | Explaining the project to someone outside engineering |

---

## 3. System Architecture (overview)

The deep dive — validation engine internals, save-decision outcomes, state-machine transitions, and concurrent-queue design — lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). What follows is the minimum mental model.

### Monorepo Layout

```
Orzo/              ← npm workspace root
├── shared/             ← TypeScript domain types (no runtime deps)
├── server/             ← Fastify API + Drizzle ORM + parsers + validation
└── mobile/             ← React Native app + XState machine + Zustand store
```

Workspaces are linked via npm workspaces. `shared/` is referenced as `@orzo/shared` by both `server/` and `mobile/`.

### Data Flow

```
Input (image or URL)
  → Optimize (sharp: auto-orient, resize ≤3072px, JPEG 85% for storage / 90% for OCR)
  → Parse (GPT-5.4 Vision for images, JSON-LD/Microdata/DOM/GPT-5.4 AI cascade for URLs with retry, quality gate, and extraction logging)
  → Structure (GPT returns per-ingredient amount/unit/name directly; JSON-LD/Microdata strings run through deterministic ingredient-parser.ts)
  → Normalize (raw extraction → ParsedRecipeCandidate with parseSignals, servings, structured ingredients)
  → Validate (8 rule modules run in fixed order → ValidationResult; SERVINGS_MISSING blocks save)
  → Edit (user corrects in PreviewEdit, specifies servings if missing, confirms/dismisses FLAG issues inline)
  → Re-validate (PATCH /candidate triggers revalidation)
  → Save Decision (decideSave checks issues + dismissed warnings)
  → Save (recipe + structured ingredients + steps + baselineServings + source pages persisted atomically)
  → View (detail screen: servings stepper scales ingredient amounts client-side via scaling.ts)
```

For the rule-by-rule breakdown, severity semantics, save-decision table, and the full XState diagram, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 15. Changelog

Full release notes are in [`CHANGELOG.md`](CHANGELOG.md). For known gaps and proven-live evidence, see [`docs/STATUS.md`](docs/STATUS.md).
