# Status, Proven Features & Known Gaps

> **What this doc covers:** Evidence tables for what is verified live, what is covered by tests, what runs on Android/iOS, what's been proven for the auth/security work streams, and what is **not yet** proven. Closes with technical notes and a known-gaps inventory. For changelog, see [`../CHANGELOG.md`](../CHANGELOG.md). For roadmap, see [`../ROADMAP.md`](../ROADMAP.md). Back to [`../README.md`](../README.md).

## Proven Live

All of the following were executed against a real Supabase PostgreSQL database and real OpenAI API key:

| What | Evidence |
|---|---|
| `drizzle-kit push` | All 13 tables (incl. `profiles`, `mfa_recovery_codes`, `user_sessions`), indexes, foreign keys, and RLS policies applied to Supabase |
| Auth middleware active | All endpoints except `/health` return 401 without valid Bearer token |
| `GET /health` | Returns `{"status":"ok"}` (public, no auth required) |
| `GET /recipes` (no token) | Returns `{"error":"Authentication required"}` (401) |
| Migration 0008 (profiles + user_id) | `profiles` table created, `user_id` NOT NULL FK on 4 domain tables, auto-create trigger on `auth.users` INSERT, seed user backfill complete (211 rows assigned) |
| Migration 0009 (RLS policies) | RLS enabled on all tables, 41+ policies verified via `pg_policies` query |
| Supabase Auth providers | Email/password, Apple Sign-In, Google OAuth configured and enabled in Supabase dashboard |
| MFA (TOTP) | App authenticator MFA enabled in Supabase, max 10 factors |
| Fastify server startup | Listens on `0.0.0.0:3000` |
| `POST /drafts` | Image draft created in real DB, returns UUID and `CAPTURE_IN_PROGRESS` |
| `GET /drafts/:id` | Returns draft with **`parsedCandidate` / `editedCandidate` / `validationResult`** (shared `RecipeDraft` names), plus `pages` and `warningStates` — not raw DB `*Json` column names |
| `POST /drafts/url` | URL draft created with `sourceType: "url"` |
| URL parse (JSON-LD) | BBC Good Food "Easy pancakes" — extracted title, 6 ingredients, 5 steps via JSON-LD cascade with quality gate. Validation: `SAVE_CLEAN` |
| `POST /drafts/:id/save` | Recipe persisted to `recipes` table with ingredients and steps |
| `GET /recipes/:id` | Full recipe retrieval confirmed |
| Supabase Storage bucket creation | `recipe-pages` and `recipe-images` buckets created programmatically as **private** (`public: false`) |
| Supabase Storage image upload | JPEG uploaded to user-scoped path, signed URL generated (60-min TTL), cleanup confirmed |
| Image upload via API | `POST /drafts/:id/pages` multipart upload stores file in Supabase Storage, creates `draft_pages` row |
| GPT-5.4 Vision parse | Image parse pipeline called OpenAI, correctly identified non-recipe content, validation flagged expected issues |
| GPT-5.4 URL AI fallback | Complex multi-sub-recipe page (Tonkotsu Ramen, 35 ingredients, 29 steps) extracted successfully via simplified prompt |
| OpenAI API connectivity | GPT-5.4 (image and URL) models respond, JSON mode works |

## Proven by Tests Only

### Server tests (Vitest)

| What | Test count | Coverage |
|---|---|---|
| Validation engine | 23 tests | All 12 issue codes, all severity levels (BLOCK, FLAG, RETAKE), multi-recipe FLAG downgrade |
| Save-decision logic | 8 tests | `SAVE_CLEAN`, `SAVE_USER_VERIFIED`, `NO_SAVE`, dismissed multi-recipe FLAG |
| Parsing + normalization | 35 tests | `normalizeToCandidate`, `buildErrorCandidate`, JSON-LD extraction (incl. HowToSection headers, ingredient objects, metadata), Microdata extraction, DOM boundary (structure preservation, noise removal, richest match), URL normalization, smart truncation |
| API integration | 16+ tests | All 11 draft endpoints + 11 recipe endpoints (CRUD + hero image + collection + notes CRUD + rating), full parse-edit-save flow |
| Auth & security | 12 tests | Auth middleware (401 missing/invalid, 200 valid, /health public), IDOR prevention (cross-user 404 for recipes, collections, drafts) |
| XState machine | 10 tests | Happy path, resume routing, retake flow, URL import (imports mobile `importMachine`, mock actors) |

All 139+ server tests pass (base 127 + 12 auth/security).

### iOS UI tests (XCUITest, run on physical iPhone 16)

| What | Coverage |
|---|---|
| Home screen elements | Title, subtitle, jar button, empty state/recipe list |
| Navigation (camera import) | Jar modal camera action opens capture view, cancel returns home |
| Navigation (URL import) | Jar modal URL action opens in-app WebView browser (`WebRecipeImport`) |
| Recipe detail | Tapping recipe card opens detail, back button returns home |
| Capture view | Cancel button present/tappable, shutter button present/tappable |
| URL import browser | WebView import screen: omnibar/close; Save hands off to import flow (testIDs `web-recipe-import-*`) |
| Import flow screens | Preview edit save button, cancel dialog, saved view, retake required |
| Debug/diagnostics | Dumps accessibility tree to console for debugging element queries |

Tests that depend on reaching deeper import flow states (saved, retake) use `guard ... else { return }` and skip gracefully when the server isn't running or the flow doesn't reach those states.

## Proven on Android Emulator

| What | Evidence |
|---|---|
| Android native build | Gradle compiles all native modules, APK installs on emulator |
| Metro JS bundle | ~9 MB bundle loads, hot reload works |
| App startup + navigation | HomeScreen renders, navigation to RecipeDetail and ImportFlow works |
| Camera permission | Declared in AndroidManifest.xml, Android permission dialog appears |

## Proven on Physical iPhone (iOS)

| What | Evidence |
|---|---|
| iOS native build | Xcode 26.4 compiles all native modules and CocoaPods dependencies, installs on physical iPhone |
| Camera capture flow | Photo taken of cookbook page via `react-native-vision-camera`, compressed via `sharp` server-side pipeline (3072px, JPEG 85%), uploaded to Supabase Storage, sent to GPT-5.4 Vision |
| GPT-5.4 Vision image parsing (real cookbook) | Soy Sauce Marinade recipe: extracted title, 8 ingredients, 1 step from a real cookbook photo. Fraction accuracy verified (⅓, ¼, etc.) |
| Full import flow on device | capture → reorder → upload → parse → preview → save — all working end-to-end |
| Collections | Created collections, assigned recipes via long-press, navigated to collection view |
| Folder rename & delete | Long-press folder on Home or **⋯** on collection screen: rename (`PATCH` live API), delete with confirm sheet; recipes return to home grid when folder removed |
| Recipe editing | Edited saved recipes (title, ingredients, steps, collection assignment) via RecipeEditScreen |
| Lucide icons | All icons render correctly as SVG via `lucide-react-native` |
| Recipe list + detail views | HomeScreen displays saved recipes, RecipeDetailScreen shows full recipe content |
| XCUITest UI tests | 19 of 21 automated UI tests pass on iPhone 16 (iOS 26.2). Tests verify home screen elements, FAB navigation, import flow screens, cancel dialogs, and recipe detail navigation |
| URL import browser | URL FAB opens in-app browser; user can save native page URL into existing URL import pipeline |
| Photos import browser flow | Photos FAB opens iOS system picker; selected image opens full-screen preview before import |
| Concurrent import queue (3 recipes) | Imported 3 recipes concurrently: 2 parsed successfully and were reviewed/saved from Import Hub; 1 flagged for retake — retake flow verified (retake button, page thumbnail, re-parse). Floating banner visible on Home, navigates to Import Hub. Queue limit enforced. |
| Import Hub close / review / cancel | Close button returns to Home. Review navigates to PreviewEditView with hero image from server pages. Cancel with confirmation dialog removes entry and cleans up server-side. |
| Post-save return from hub | After saving a recipe from hub review, auto-returns to Import Hub, recipes store refreshed — saved recipe appears on Home |
| Servings & ingredient scaling | Baseline servings captured from URL import (auto-detected from JSON-LD and DOM metadata), displayed in import preview with BLOCK validation when missing. Servings stepper on detail screen: free-type input, ±1 buttons, reset link. Ingredient amounts scale dynamically (mixed-number unicode fractions). Edit screen allows updating baseline servings. |

## Proven in WS-4 (Mobile Auth — April 2026)

| What | Evidence |
|---|---|
| Apple Sign-In (end-to-end) | User created in Supabase via `signInWithIdToken` with SHA-256 nonce. Profile auto-created by Postgres trigger. Session stored in Keychain. |
| Google Sign-In (end-to-end) | User created via `signInWithIdToken` with `iosClientId` + `webClientId`. Requires "Skip nonce check" in Supabase dashboard (Google SDK v16 limitation). |
| Email sign-up with verification | Registration sends verification email, user confirms, session established, recipes load. Password validation rejects weak passwords (12-char + letters+numbers). |
| Auth-gated navigation | Four-state root (splash → auth → password-reset → app). Unauthenticated users cannot reach app screens. |
| Bearer token injection | All API requests (including multipart uploads) include `Authorization: Bearer <token>` via `authenticatedFetch()`. Single-flight refresh on 401. |
| Sign-out | Clears Keychain session, resets all Zustand stores (recipes, collections, importQueue), returns to auth screen. |
| New user signup → profile auto-creation | Postgres trigger `handle_new_user` fires on Apple/Google/email signup — verified with real users. |
| Onboarding carousel | 3-card swipe shown on first launch, skipped on subsequent launches via AsyncStorage flag. |

## Proven in 0.1b (Dev/Prod Supabase Isolation — April 2026)

| What | Evidence |
|---|---|
| Separate dev Supabase project | Created in same org (ref `nrdomcszbvqnfinrjvuz`); schema applied via `apply-all-migrations.ts` iterator (all 13 drizzle SQL files replayed in filename order); idempotent. |
| Trigger + RLS on dev | `verify-0008.ts` passed (profiles table, user_id NOT NULL + FK on 4 domain tables, `handle_new_user` trigger, seed user). `verify-0009-rls.ts` passed (11 tables RLS-enabled, 44 policies). |
| Local `server/.env` points at dev | Only the Supabase trio (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) was swapped; `OPENAI_API_KEY` and `PORT` unchanged. Session pooler URL used because Supabase direct-connect hostnames are IPv6-only. |
| Mobile `supabase.ts` switches via `__DEV__` | Matches the pre-existing `api.ts` + `authRedirect.ts` pattern. Debug build logs `[orzo] Supabase: DEV <dev-url>` at startup; Release logs `PROD <prod-url>`. |
| End-to-end on device | Fresh email sign-up in Orzo Dev → session established → recipe imported → row + storage object present in dev Supabase; **dev test email does not appear in prod `auth.users`** (clinching cross-check). Production Orzo Release build still signs in with existing prod account and imports land in prod Supabase. |
| Railway untouched | No Railway env vars modified. Production API continues serving production Supabase. |

## Proven in WS-6/7/8 (Security Hardening — April 2026)

| What | Evidence |
|---|---|
| Private storage buckets | Both buckets set to `public: false`, signed URLs generated via `createSignedUrl()` with 60-min TTL. FastImage disk caching survives URL expiry. |
| User-scoped storage paths | All uploads use `{userId}/...` prefix. Migration script moved existing objects to user-scoped paths. |
| Account deletion (Apple requirement) | Double-confirmation dialog on AccountScreen, `DELETE /account` soft-deletes with `profiles.deleted_at`, bans user. Hard-delete cron script removes all data after 30 days. |
| Sign-out-all-devices | `supabase.auth.signOut({ scope: "global" })` revokes all refresh tokens. UI button on AccountScreen. |
| Email change | `supabase.auth.updateUser({ email }, { emailRedirectTo })` sends dual-confirmation. UI tested on device. |
| MFA TOTP enrollment | Enroll → QR URI → verify 6-digit code → factor confirmed. Unenroll with confirmation. |
| MFA challenge on sign-in | `MfaChallengeScreen` renders when `needsMfaVerify` is true. Accepts TOTP code, challenges and verifies. |
| Rate limiting | `@fastify/rate-limit` active: 100/min global, 10/hr on parse, 30/hr on draft creation. |
| Auth integration tests | 12 tests: 401 for missing/invalid tokens, userId injection, /health public, cross-user 404 for recipes/collections/drafts. |
| Step-up auth | `requireRecentAuth(300)` on account deletion checks JWT `iat` claim. |
| Session tracking | Auth middleware records user agent + IP on every request. `GET /account/sessions` returns session list. |
| Provider linking | AccountScreen shows interactive Link/Unlink for Apple and Google. |

## Not Yet Proven

| What | Why |
|---|---|
| Production server deployment | Fastify API runs on localhost only. Dockerfile and guide exist ([`PRODUCTION_DEPLOY.md`](PRODUCTION_DEPLOY.md)) but deployment not yet executed. Must be deployed before TestFlight. |
| Email template branding | Supabase sends default unbranded confirmation/reset/email-change emails. Must customize in Supabase dashboard before public launch. |
| Production Supabase Site URL + redirect allowlist | Dev project's Site URL is now `app.orzo.ios.dev://auth/callback` (done 2026-04-16). **Production** project's Site URL still reads `localhost:3000` and should be updated to `app.orzo.ios://auth/callback`, with the same value added to the redirect URL allowlist. |
| MFA recovery code usage during sign-in | Recovery codes generated and stored, but the MFA challenge screen does not yet offer a "Use recovery code" option (endpoint exists, UI not wired). |
| Hard-delete cron in production | `server/scripts/hard-delete-accounts.ts` exists but needs a scheduler (Railway cron, Render cron job, or external trigger). |
| Storage migration execution | `server/scripts/migrate-storage-user-scoped.ts` is ready but has not been run against production (safe to run — idempotent). |
| Homepage collections overhaul on device | Uncategorized-only home view, "All Recipes" virtual folder, real-time search, toast with undo, collection name tags — code complete but not yet fully tested on physical device |
| Multi-page image ordering UX | Single-page capture tested; multi-page reorder not yet tested on device |
| Real cookbook photo parsing quality at scale | Single recipe tested with good results; accuracy across varied cookbook formats (handwritten, glossy, multi-column) is untested |
| Bot-protected URL parsing from pasted/manual URLs | Clipboard/manual URL entry still depends on server fetch; AllRecipes, Simply Recipes may return 402/403 there. Browser-backed URL import is implemented, but broader device QA for blocked sites is still pending. |
| Concurrent import queue — edge cases | App backgrounding/foregrounding with active parses, queue rehydration after app restart, 3-way concurrent parse with server semaphore contention — not yet stress-tested |
| Servings accuracy across diverse sites | Tested on BBC Good Food (JSON-LD yield), Joshua Weissman (DOM metadata + AI), and several others. Sites with non-standard serving formats or no serving info at all will correctly trigger SERVINGS_MISSING BLOCK. Broader accuracy across recipe sites untested. |
| Ingredient scaling edge cases | Basic scaling verified (multiply numeric amount, mixed-number formatting). Edge cases: very large scale factors, count-based items (eggs) rounding, deeply nested sub-recipe ingredients — not yet exhaustively tested. |
| Image import servings extraction | GPT prompts now request servings; not yet tested across a wide range of cookbook photo formats. |

---

## Technical Notes

### Camera integration

`react-native-vision-camera` is used on a physical iPhone; capture calls **`takePhoto()`** with library defaults (older `qualityPrioritization` options are no longer on current `TakePhotoOptions` typings). Client-side compression via `react-native-compressor` was tested and removed — it caused native OOM crashes on high-resolution camera output. All image optimization happens server-side via `sharp` (see [`DEVELOPMENT.md`](DEVELOPMENT.md) → "Image optimization"). The iOS Simulator does not support camera — use a physical device for camera testing.

### Icon system

All UI icons use `lucide-react-native` (peer: **`react-native-svg@15.15.4`**, hoisted with root **`overrides`** and Metro **`extraNodeModules`** so only one native copy is linked). iOS needs the **`patch-package`** patch for that version under RN **0.76** New Architecture (see `patches/`). When upgrading React Native or SVG, re-verify native build and duplicate-RNSVG LogBox issues. Collection folder icons/colors come from **`mobile/src/features/collections/collectionIconRules.ts`** (`getCollectionIcon` + keyword rules); extend that module for new keywords.

### Image parsing quality

GPT-5.4 Vision with `detail: "high"` at 3072px resolution. Fraction accuracy verified. Parse time ~27 seconds per single-page recipe. See [`DEVELOPMENT.md`](DEVELOPMENT.md) → "Image optimization" for full pipeline details and the resolution/model iteration history.

## Known Gaps

- **Authentication & security (COMPLETE)**: All 8 work streams finished. Private storage buckets with signed URLs, user-scoped paths, account deletion, sign-out-all, MFA enrollment/challenge, step-up auth, rate limiting, recovery codes, session tracking, integration tests, security checklist. See [`DEVELOPMENT.md`](DEVELOPMENT.md) → "Authentication & security architecture".
- **Production deployment**: Fastify server runs on localhost for development. Dockerfile and deployment guide exist ([`PRODUCTION_DEPLOY.md`](PRODUCTION_DEPLOY.md)) but the server is not yet deployed to a cloud host. Must be deployed before TestFlight distribution. The mobile `api.ts` base URL needs updating to point to the production host.
- **Production Supabase dashboard configuration**: Production project's Site URL still reads `localhost:3000` and should be updated to `app.orzo.ios://auth/callback`; redirect URL allowlist needs the same. CAPTCHA not yet enabled. Email templates use default Supabase branding. (The **dev** project's Site URL and redirect allowlist were fixed during the 0.1b isolation work on 2026-04-16.)
- **MFA recovery code UI during sign-in**: Recovery code generation and verification endpoints exist, but the MFA challenge screen does not yet offer a "Use recovery code" option. The server endpoint is ready.
- **Hard-delete cron scheduler**: `server/scripts/hard-delete-accounts.ts` is written but needs a production scheduler (Railway cron, Render cron job, or external trigger).
- **Apple client secret expiration**: The Apple OAuth client secret (ES256 JWT from `.p8` key) expires ~October 2026. Must be regenerated before expiry. Tracked in [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md).
- **Bot-protected URLs**: AllRecipes, Simply Recipes, Food Network can block server-side fetches. Browser-backed URL import now mitigates this by sending client-captured HTML from `WebRecipeImportScreen` into the normal URL parsing pipeline, with a one-time fallback to server fetch if capture fails technically. Remaining failures are usually challenge pages, consent walls, or other non-recipe HTML. Clipboard/manual URL entry still relies on server fetch unless those flows are later routed through the browser.
- **Recipe metadata UI**: JSON-LD captures prep/cook/total time and image URL, but these timing fields are not yet displayed in the mobile UI. Servings are now captured and displayed.
- **Offline / local-first**: Not implemented. All operations require network access. Future: local SQLite with sync.
- **Multi-collection assignment UI**: Schema supports many-to-many; UI currently assigns one collection at a time.
- **Varied cookbook formats**: Only tested on a few printed cookbook pages. Accuracy across handwritten, glossy, multi-column layouts is unverified.
- **Multi-image photo library import**: MVP photo import supports a single image per import action, but the concurrent import queue allows users to quickly import multiple single-image recipes back-to-back (up to 3 concurrently). Multi-image selection with shared reorder within a single import action is planned (structural scaffolding in `PHOTOS_SELECTED` event accepts an array of image URIs).
- **Server image format hardening**: Server-side `optimizeForUpload` silently falls back to the original buffer on failure. Phase 2: throw an error and return 422 so unsupported formats fail clearly instead of producing bad OCR results.
