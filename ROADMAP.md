# Orzo — Product Roadmap

## Path to $20k MRR

**Last updated:** 2026-04-10
**Target:** First paying customer by Q3 2026. $20k MRR by Q1 2027.
**Dev capacity:** Solo + AI agents (Cursor / Claude Code)
**Pricing model:** Freemium subscription — Free tier (limited) + Pro ($4.99/mo or $39.99/yr) + Cookbook Bundle ($19.99 one-time add-on)

---

## How to Read This Roadmap

The roadmap is organized into **6 phases**. Each phase has a strategic goal — the reason it exists, not just a list of features. Phases are sequential because they have real dependencies: you can't charge money without auth, you can't build grocery lists without structured ingredients (already done), you can't do Instacart integration without grocery lists.

Each feature includes:

- **Effort** — T-shirt size (S/M/L/XL) calibrated for solo dev + AI agents at proven velocity (full MVP shipped in 10 days)
- **Revenue impact** — How directly this drives subscriptions or retention
- **Depends on** — What must exist first
- **Tier** — Which tier gets the feature (Free / Pro)

Estimates assume part-time alongside PayWhirl.

---

## Brand Identity & Color Scheme

**Established:** 2026-04-10

This is the canonical brand palette for Orzo. It applies to the mobile app, landing page (`getorzo.com`), emails, App Store listing, marketing materials, and any future web surfaces. Any agent or designer working on Orzo should reference this section and use these exact values.

### Brand direction

**Mood:** Warm, appetizing, kitchen-forward. Mediterranean/terracotta tones that evoke clay pots, warm bread, and home cooking. Distinct from the blue/green palettes used by most recipe apps.

**Tagline:** "Your cookbook, upgraded."

**Icon:** Stylized cream/off-white orzo pasta grains arranged in a circular ring forming an "O" on a terracotta background. Full-bleed square (iOS applies rounded corners automatically). Source files live at `Orzo icon.png` (repo root) and `mobile/ios/Orzo/Images.xcassets/AppIcon.appiconset/icon-*.png` (all 8 iOS sizes: 40, 58, 60, 80, 87, 120, 180, 1024).

### Color tokens

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| **Primary** | Terracotta | `#C4633A` | Primary CTAs, buttons, brand accent, icon background |
| **Primary Hover** | Deep Terracotta | `#A14E2A` | Hover/pressed states on primary elements |
| **Primary Light** | Warm Cream | `#FFF8F0` | Page backgrounds, hero sections, surfaces |
| **Primary 50** | Light Peach | `#FDEEE3` | Subtle backgrounds, feature card tints, selected states |
| **Surface** | White | `#FFFFFF` | Cards, inputs, modals, sheets |
| **Text Primary** | Espresso | `#2D1F14` | Headings, primary body text |
| **Text Secondary** | Warm Gray | `#7A6E64` | Subtitles, helper text, secondary body |
| **Text Tertiary** | Dark Warm Gray | `#4A3F36` | Tertiary labels, muted emphasis |
| **Divider** | Sand | `#E8DFD5` | Borders, separators, dividers |
| **Accent — Amber** | Golden Amber | `#D4952B` | Ratings, highlights, badges, warm accent |
| **Accent — Green** | Sage Green | `#6B8F71` | Success states, verified indicators |
| **Accent — Red** | Paprika | `#C43A3A` | Errors, destructive actions |
| **Accent — Purple** | Warm Taupe | `#8B7355` | Tertiary accent (used sparingly) |
| **Accent — Pink** | Dusty Terracotta | `#B86B4A` | Alternate warm accent |

### Feature card tinted backgrounds (for icon wells)

Used for soft colored circles behind feature icons on the landing page. Each is a desaturated, warm-tinted version of its accent color:

| Accent | Background Tint |
|--------|-----------------|
| Primary (terracotta) | `#FDEEE3` |
| Amber | `#FBF0DC` |
| Green | `#E8F0E9` |
| Red | `#F8E4E4` |
| Purple | `#EDE8E0` |
| Pink | `#F5E6DD` |

### Typography

**Font family:** Inter (Google Fonts) — weights 400, 500, 600, 700. Fallback stack: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`. Inter is the closest web-safe font to San Francisco (iOS system font) and keeps the mobile app and web surfaces visually consistent.

### Shadow recipe for warm surfaces

`box-shadow: 0 8px 32px rgba(196, 99, 58, 0.2);` — a warm terracotta-tinted shadow instead of a neutral gray. Use sparingly on hero elements (app icon, primary CTA cards).

### Theme color for browser chrome / status bars

`#FFF8F0` (Warm Cream) — set in `<meta name="theme-color">` on web and as the status bar background on mobile.

### Mobile app application (agent instructions)

The mobile app (`mobile/src/**`) currently uses a blue-forward palette established during MVP development. Another agent should migrate it to the warm terracotta palette above. Key files that reference colors:

- `mobile/src/screens/AuthScreen.tsx` — canonical color constants (`PRIMARY_BLUE = '#2563eb'` → migrate to `#C4633A`, `PRIMARY_TEXT = '#111827'` → migrate to `#2D1F14`, `SECONDARY_TEXT = '#6b7280'` → migrate to `#7A6E64`)
- `mobile/src/screens/HomeScreen.tsx` — background `#eff6ff` → migrate to `#FFF8F0`
- `mobile/src/screens/OnboardingScreen.tsx` — button and accent colors
- `mobile/src/features/collections/collectionIconRules.ts` — 80+ keyword-based icon colors (these are category-specific and should be evaluated individually — some warm tones may stay, but blues should be replaced with warm equivalents)
- Any other component with inline `#2563eb`, `#eff6ff`, `#dbeafe`, or similar blue-family hex values

The goal is visual consistency across the app icon, mobile app UI, landing page, emails, and App Store listing. The terracotta palette is the source of truth going forward.

---

## Current State Assessment (as of 2026-04-10)

This section was generated by cross-referencing the roadmap against the actual codebase (server schema, API routes, mobile screens, shared types, and CHANGELOG). It captures what exists today so the roadmap phases can be read against ground truth.

### What's Built (MVP — shipped in ~10 days, 2026-03-21 → 2026-03-31)

**Recipe capture & import:**

- Camera capture (single and multi-page with reorder)
- Photo library import (iOS picker, HEIC→JPEG conversion, full-screen preview)
- URL import via in-app WebView browser (omnibar with Google search fallback, ad-domain blocking)
- Clipboard URL detection (auto-prompt when URL is on clipboard)
- 4-tier URL parsing cascade: JSON-LD → Microdata → DOM boundary extraction → GPT-5.4 AI fallback (all with quality gates)
- Image parsing via GPT-5.4 Vision with structured ingredient schema
- Image optimization pipeline (sharp: auto-orient, resize ≤3072px, JPEG 85%/90%)
- SSRF guard on all server-side URL fetches (blocks RFC 1918, loopback, link-local, CGNAT)

**Concurrent import queue:**

- Server: `POST /drafts/:id/parse` returns 202 Accepted, background parsing with in-memory semaphore (max 2 concurrent OpenAI calls, FIFO queue)
- Mobile: Zustand + AsyncStorage queue store, max 3 concurrent imports, exponential backoff polling (3s→10s), AppState-aware
- Import Hub screen for queue management (review, retake, cancel)
- Floating `PendingImportsBanner` pill (blinking dot, tappable to hub)
- Startup cleanup: resets zombie PARSING drafts (>5 min), deletes CANCELLED drafts (>24 hrs)

**Validation engine:**

- 7 rule modules running in fixed order: structure → integrity → required-fields → servings → ingredients → steps → retake
- 16 validation issue codes across 3 severities (FLAG, RETAKE, BLOCK)
- Save decision logic: SAVE_CLEAN / SAVE_USER_VERIFIED / NO_SAVE
- Per-issue dismissal tracking with undo
- Retake flow with 3-attempt limit per page (escalates RETAKE→BLOCK)

**Structured ingredients & scaling:**

- 6 columns on `recipe_ingredients`: `amount`, `amount_max`, `unit`, `name`, `raw_text`, `is_scalable`
- Deterministic ingredient parser (`ingredient-parser.ts`): unicode fractions (⅛–⅞), decimal, slash fractions, ranges, 60+ units, non-scalable detection ("to taste", "as needed", etc.)
- `baselineServings` on recipes (nullable numeric)
- Client-side ephemeral scaling: `scaleAmount()`, `formatAmount()` (mixed numbers, unicode fraction rounding), `scaleIngredient()`
- Servings stepper on RecipeDetailScreen (±1, free-type input, reset to baseline)
- `SERVINGS_MISSING` validation rule (BLOCK severity)
- No unit conversion (15 tbsp stays 15 tbsp — conversion is roadmap item 2.5)

**Recipe management:**

- Full CRUD: create (via import save), read (list + detail), update (title, description, servings, ingredients, steps, image, collection), delete
- Hero image upload/delete with Supabase storage (hero.jpg + thumb.jpg per recipe)
- Half-star recipe ratings (0.5–5.0, debounced persistence)
- User notes per recipe (add/edit/delete, max 250 chars, inline modal)
- Collections: create, rename, delete (cascade-safe), assign/move/remove recipes, auto-icon from 80+ keyword rules
- Virtual "All Recipes" collection, uncategorized recipe handling
- Client-side search (case-insensitive title matching, per-collection or global)

**Observability:**

- Structured JSON event logging (lifecycle, parsing, editing, URL-specific, startup events)
- Server health endpoint (`GET /health`)

**Testing:**

- 127 server tests (Vitest): validation, save-decision, parsing, API integration, state machine
- 21 iOS UI tests (XCUITest on physical iPhone 16): 19 passing, 2 state-dependent

**Tech stack:**

- Monorepo: `shared/` (TypeScript types) + `server/` (Fastify + Drizzle ORM + PostgreSQL) + `mobile/` (React Native 0.76 + XState 5 + Zustand 5)
- Supabase used for file/image storage AND authentication (NOT for database queries — server connects to Postgres directly via `postgres` driver + Drizzle ORM)
- Supabase Auth: Email/password + Apple Sign-In + Google OAuth configured, TOTP MFA enabled. **Mobile auth complete (WS-4)**: Supabase client, Keychain session, auth-gated navigation, all three sign-in methods functional.
- OpenAI GPT-5.4 for Vision and text extraction
- 10 database migrations (0000–0009)

### What's NOT Built (every roadmap feature from Phases 0–5)

| Feature | Status | Notes |
|---|---|---|
| **0.1 Auth** | **Complete — all 8 work streams done** | Server: `profiles` table, `user_id` on 4 domain tables, JWT auth middleware, user-scoped repositories, RLS (41 policies), private storage buckets with signed URLs, user-scoped storage paths, rate limiting (`@fastify/rate-limit`), step-up auth, MFA recovery codes, session tracking, account deletion (soft + hard delete cron), auth security integration tests. Mobile: Supabase client with Keychain, auth-gated navigation, onboarding carousel, Apple/Google/email sign-in, password reset deep link, account screen (sign-out, sign-out-all, email change, MFA enrollment/unenrollment, provider linking, account deletion), MFA challenge screen. Production deployment Dockerfile and guide created. See `docs/AUTH_RLS_SECURITY_PLAN.md`, `docs/SECURITY_CHECKLIST.md`, `docs/PRODUCTION_DEPLOY.md`. |
| **0.1b Dev/Prod Isolation** | Not started | Separate dev environment so feature work never touches production. Git `dev` branch, second Supabase project, second Railway service, separate Xcode scheme with `app.orzo.dev` bundle ID. |
| **0.2 Ship Prep & TestFlight** | Partially started | Apple Developer: App ID `app.orzo.ios` registered, Services ID `app.orzo.ios.auth` created, provisioning profile auto-managed by Xcode. Google Cloud: iOS OAuth client updated for `app.orzo.ios`. Supabase: Apple/Google providers configured, Site URL and redirect URLs set. Production API live on Railway. **Not started:** App Store Connect listing, analytics SDK, crash reporting, privacy policy. |
| **0.3 Subscriptions** | Not started | No RevenueCat, no paywall UI, no tier enforcement, no limits. All features available to everyone. |
| **0.4 Cloud Sync & Offline** | Not started | Server is authoritative, but no local SQLite cache, no offline viewing. All ops require network. |
| **1.1 Social Media Import** | Not started | General URL infra could handle some social URLs via AI fallback, but no platform-specific adapters (no YouTube transcript API, no Instagram/TikTok caption extraction). |
| **1.2 iOS Share Sheet** | Not started | Clipboard detection is a partial analog but not a share extension. |
| **1.3 Rate-Limited Free Tier** | Not started | Depends on 0.3. Import queue has client-side UX limit (3 concurrent) but no business/tier limits. |
| **2.1 Grocery List** | Not started | No tables, endpoints, or screens. |
| **2.2 Meal Planning** | Not started | |
| **2.3 "What Can I Cook?"** | Not started | |
| **2.4 Cook Mode** | Not started | |
| **2.5 Unit Conversion** | Not started | `scaling.ts` does amount multiplication only, not unit-to-unit conversion. |
| **2.6 Nutrition Estimates** | Not started | |
| **3.1 Cook Log** | Not started | No `cook_log` table. |
| **3.2 Cooking Stats** | Not started | |
| **3.3 Recipe Memories** | Not started | Notes exist but no "Story" field. |
| **3.4 Tags & Smart Collections** | Not started | Collections exist; tags do not. |
| **4.1 Instacart** | Not started | |
| **4.2 Cookbook Bundle** | Not started | Concurrent queue is a foundation. |
| **4.3 Recipe Substitutions** | Not started | |
| **4.4 Printed Cookbook** | Not started | |
| **5.1 Recipe Sharing** | Not started | |
| **5.2 Family Sharing** | Not started | |
| **5.3 Public Profiles** | Not started | |

### Architecture Notes for Phase 0

The roadmap describes "Supabase Auth integration" and "Supabase Row Level Security" in 0.1, and "Recipes live in Supabase Postgres" in 0.4. The current reality is:

- **Database:** Direct PostgreSQL connection via `postgres` driver + Drizzle ORM. No Supabase client SDK for DB queries.
- **Authentication (server-side — COMPLETE):** Supabase Auth is configured (Email/password, Apple, Google, TOTP MFA). Fastify JWT middleware (`server/src/middleware/auth.ts`) verifies tokens via `supabase.auth.getUser()` and sets `request.userId` on every non-public route. All repositories scope data access by `userId`. `profiles` table maps 1:1 with `auth.users` (auto-created via Postgres trigger on signup). All existing data backfilled to a banned seed user.
- **Row Level Security (COMPLETE):** RLS enabled on all 11 public tables with 41 policies. The `authenticated` role can only access own data via `auth.uid()` checks. The `anon` role has zero access. Fastify uses the `service_role` which bypasses RLS — code-level userId scoping is the primary defense; RLS is defense-in-depth.
- **Supabase Storage:** Two **private** buckets (`recipe-pages`, `recipe-images`). Server uses service role key for uploads/deletes and `createSignedUrl()` with 60-min TTL for client-facing URLs. All paths are user-scoped (`{userId}/...`).
- **Mobile auth (COMPLETE):** Supabase client installed on mobile with Keychain session storage. Auth-gated navigation (onboarding → auth screens → MFA challenge → main app). Apple Sign-In (SHA-256 nonce), Google Sign-In (with `iosClientId`), and email/password with verification all functional. `api.ts` sends Bearer tokens on all requests with single-flight refresh. Account screen with sign-out, sign-out-all, email change, MFA enrollment/unenrollment, provider linking, and account deletion. Password reset via deep link. MFA challenge screen intercepts sign-in when TOTP is enrolled. Tested end-to-end on physical iPhone.
- **Security hardening (COMPLETE):** `@fastify/rate-limit` on all API routes. Step-up auth for sensitive actions. MFA recovery codes. Session tracking. Auth header redacted from logs. Integration tests for auth middleware and IDOR prevention. Manual security checklist. See `docs/AUTH_RLS_SECURITY_PLAN.md`, `docs/SECURITY_CHECKLIST.md`.
- **Production deployment (COMPLETE):** Fastify server deployed on Railway at `https://api.getorzo.com`. Dockerfile fixed for production (skip root postinstall, install `@img/sharp-linux-x64`). DNS via Cloudflare CNAME (DNS-only mode). Environment variables set in Railway dashboard. Release builds tested and verified on physical iPhone.
- **Dev/prod app isolation (COMPLETE):** Debug builds install as "Orzo Dev" (`app.orzo.ios.dev`) alongside production "Orzo" (`app.orzo.ios`). Both apps coexist on the same phone. Dev app hits local API server; production app hits Railway. Auth redirect URLs, display name, and URL scheme are all derived from build configuration via `__DEV__` flag and Xcode build variables. See `mobile/src/services/authRedirect.ts`.
- **Remaining work:** Customize Supabase email templates. These are pre-TestFlight dashboard tasks, not code changes.

### Built Features Not Mentioned in Roadmap

The following shipped features are not called out as roadmap items (they're part of the MVP foundation but worth tracking):

- Recipe half-star ratings (0.5–5.0)
- Clipboard URL detection with auto-prompt
- In-app WebView browser with ad-blocking for URL import
- Multi-page image capture with drag-to-reorder
- Photo library import (separate from camera)
- 16-code validation engine with dismissal tracking
- Image optimization pipeline (sharp: multiple quality profiles for storage/OCR/hero/thumbnail)
- SSRF protection on server-side URL fetches
- Structured event logging
- Full recipe editing (title, description, servings, ingredients, steps, image, collection)
- Import state machine (XState) with resume from any draft state
- Draft lifecycle management (cancel, cleanup, stuck-draft recovery)

---

## Phase Overview

| Phase | Name | Timeline | Strategic Goal |
|---|---|---|---|
| 0 | Foundation | Weeks 1–4 | Make Orzo a real product that can ship to testers and accept money |
| 1 | Acquisition Engine | Weeks 5–6 | Give people reasons to download and import recipes |
| 2 | Daily-Use Retention | Weeks 7–10 | Make Orzo indispensable in the weekly cooking routine |
| 3 | Emotional Lock-In | Weeks 11–12 | Make leaving feel like losing a part of your life |
| 4 | Revenue Expansion | Weeks 13–15 | Add secondary revenue streams and premium upsells |
| 5 | Growth & Network Effects | Weeks 16–19 | Turn users into acquisition channels |

---

## Phase 0: Foundation (Weeks 1–4)

**Goal:** Make Orzo a real product that can accept money, ship to testers, and support multiple users. Nothing here is exciting — it's all plumbing. But without it, everything else is built on sand.

### 0.1 — User Authentication & Accounts

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Prerequisite for ALL revenue |
| **Depends on** | Nothing — start here |
| **Status** | **Complete. All 8 work streams (WS-1 through WS-8) finished.** |

**What has been built — Server (WS-1/2/3/5, complete):**

- Supabase Auth configured: email/password + Apple Sign-In + Google Sign-In, TOTP MFA enabled
- `profiles` table (maps 1:1 with `auth.users` via FK, auto-created by Postgres trigger on signup). Columns: `id`, `display_name`, `avatar_url`, `subscription_tier` (free/pro), `subscription_expires_at`, `deleted_at` (soft-delete ready), `created_at`, `updated_at`
- `user_id` NOT NULL FK added to `recipes`, `collections`, `drafts`, `recipe_notes` (indexed)
- Supabase Row Level Security (RLS) enabled on all 11 public tables with 41 policies — users can only access their own data via `auth.uid()`
- JWT session middleware on all Fastify routes (`server/src/middleware/auth.ts`) — verifies token via `supabase.auth.getUser()`, sets `request.userId`
- All 4 repository files (`collections`, `drafts`, `recipes`, `recipe-notes`) refactored to accept and enforce `userId` in every query
- All 3 route files (`collections`, `drafts`, `recipes`) updated to pass `request.userId`
- Existing data backfilled to a banned seed user (`migration-seed@getorzo.com`)
- Session/JWT settings: 600s access token TTL, refresh token rotation with reuse detection, 7-day inactivity timeout
- Password policy: minimum 12 characters, must contain letters and numbers
- Apple client secret generated (ES256 JWT from `.p8` key — expires ~6 months from April 2026, renewal needed)
- Migrations: `0008_auth_profiles_user_id.sql`, `0009_rls_policies.sql`

**What has been built — Mobile (WS-4, complete):**

- `@supabase/supabase-js` with `react-native-keychain` storage adapter (`mobile/src/services/supabase.ts`), anon key configured, `detectSessionInUrl: false`
- Zustand auth store (`mobile/src/stores/auth.store.ts`): session/user state, initialize from Keychain, `onAuthStateChange` subscription, `signOut` clears all stores
- Auth-gated navigation in `App.tsx`: four-state rendering (splash → AuthStack → ResetPasswordScreen → AppStack)
- Deep link handler: parses Supabase hash fragments (`#access_token=...&type=recovery`) for email confirmation and password reset
- Onboarding carousel (`OnboardingScreen.tsx`): 3-card swipe (Camera, FolderOpen, ChefHat), AsyncStorage flag, shows once
- Social-first auth hub (`AuthScreen.tsx`): Apple Sign-In with SHA-256 nonce (via `js-sha256`), Google Sign-In with `iosClientId` + `webClientId` and JWT nonce extraction (via `jwt-decode`), email sign-in/up links
- Email auth: `SignInScreen` (email/password + forgot password), `SignUpScreen` (registration with 12-char hint + email confirmation redirect), `ForgotPasswordScreen` (reset email via `resetPasswordForEmail()`), `EmailConfirmationScreen` (check inbox prompt)
- Password reset: `ResetPasswordScreen` (standalone, rendered by four-state root on `type=recovery` deep link)
- Account management: `AccountScreen` (profile avatar/initial, name, email, linked providers display, sign-out with confirmation)
- Profile avatar circle on HomeScreen header (top-right, `#fdba74` orange, user initial or avatar image, navigates to Account)
- `api.ts`: `authenticatedFetch()` injects Bearer token on all requests (including 4 raw multipart `fetch` calls), single-flight `refreshOnce()` lock, 401 retry → signOut fallback
- All Zustand stores (`recipes`, `collections`, `importQueue`) have `reset()` methods called on sign-out
- `importQueue.store.ts`: `reconcileQueue()` guarded against unauthenticated calls
- iOS config: `Info.plist` URL schemes (`app.orzo.ios`, reversed Google client ID), `GIDClientID`, `Orzo.entitlements` (Apple Sign-In), Xcode project references entitlements
- Hermes polyfills: `react-native-url-polyfill` (URL API), `react-native-get-random-values@^1.11.0` (crypto)

**Supabase dashboard settings (not in code, must be configured manually):**

- Apple provider: Bundle ID = `app.orzo.ios`
- Google provider: "Skip nonce check" enabled (Google Sign-In SDK v16 limitation)
- Site URL: should be set to `app.orzo.ios://auth/callback` (prevents email confirmation links from redirecting to localhost)
- Redirect URLs allowlist: must include `app.orzo.ios://auth/callback`
- Email verification: enabled
- Email templates: currently default Supabase branding (customize in dashboard > Authentication > Email Templates before public launch)
- CAPTCHA: not yet enabled (hCaptcha or Turnstile available — enable when abuse signals appear)

**Tested and verified on physical iPhone (April 2026):**

- Apple Sign-In → user created, profile auto-created by Postgres trigger
- Google Sign-In → user created (nonce skip required due to SDK v16)
- Email sign-up → verification email sent, confirmation received
- Email sign-in → session established, recipes load
- Password validation → rejects weak passwords
- Sign-out → clears Keychain + all stores, returns to auth screen
- Sign-out-all-devices → revokes all sessions globally
- Onboarding → shows once on first launch
- Email change → confirmation emails sent to both old and new addresses
- MFA enrollment → QR code displayed, TOTP verification successful
- Account deletion → double-confirmation dialog, soft delete applied
- Provider linking → Apple/Google link status displayed on AccountScreen

**What has been built — Storage, Session Management, Abuse Controls (WS-6/7/8, complete):**

- **WS-6 (Storage Security):** Both storage buckets (`recipe-pages`, `recipe-images`) converted to private. All image URLs use `createSignedUrl()` with 60-min TTL. Upload paths are user-scoped (`{userId}/recipes/...`, `{userId}/drafts/...`). Migration script handles existing objects. `getPublicUrl` OCR fallback removed.
- **WS-7a (TestFlight requirements):** Account deletion with Apple-required double confirmation (soft delete → 30-day hard delete cron), sign-out-all-devices, email change flow with dual-confirmation, MFA TOTP enrollment/unenrollment UI on AccountScreen, MFA challenge screen for sign-in.
- **WS-7b (Post-TestFlight hardening):** Step-up auth (JWT `iat`/`aal` claims), MFA recovery codes (custom `mfa_recovery_codes` table, generation/verification service), provider linking UI (Apple/Google), session device list (custom `user_sessions` table, session tracking in auth middleware).
- **WS-8 (Abuse Controls & Testing):** `@fastify/rate-limit` on all Fastify API routes (global 100/min, parse 10/hr, draft creation 30/hr). Authorization header redacted from logs. Auth/IDOR integration tests (12 tests). Manual security checklist (`docs/SECURITY_CHECKLIST.md`). Auth event logging extended.
- **Production deployment:** Dockerfile and deployment guide (`docs/PRODUCTION_DEPLOY.md`) for Railway, Render, Fly.io.
- **Database:** 2 new migrations (`0010_mfa_recovery_codes`, `0011_user_sessions`), 13 public tables total.

**Production API is live at `https://api.getorzo.com`** (Railway, auto-deploys from `master`). All auth work is complete. The next blocker for TestFlight is App Store Connect setup (listing, screenshots, privacy policy).

**Migration strategy for existing data:** ✅ Complete. Seed user (`migration-seed@getorzo.com`, banned) owns all 211 pre-auth rows. Storage objects migrated to user-scoped paths.

**Why this is first:** Every feature after this touches user identity. Subscriptions need a user to bill. Sync needs a user to sync. Sharing needs a user to share with. This is the foundation of the foundation.

---

### 0.1b — Dev/Prod Environment Isolation

| | |
|---|---|
| **Effort** | S (1–2 days) |
| **Revenue impact** | None directly — prevents production incidents that would destroy user trust |
| **Depends on** | 0.1 (Auth — complete), production deployment (complete) |
| **Status** | **Pillar 4 complete** — separate "Orzo Dev" app on phone. Pillars 1–3 deferred (not needed for solo dev). |

**Why this exists:** `master` now auto-deploys to Railway. A bad push breaks the live app for real users. Before building anything new, set up an isolated dev environment so all feature work, testing, and experimentation happens safely away from production.

**What was implemented (Pillar 4 — Xcode dev build):**

- [x] Debug builds install as **"Orzo Dev"** (`app.orzo.ios.dev`) — a separate app alongside production "Orzo" (`app.orzo.ios`)
- [x] `project.pbxproj` Debug config: `PRODUCT_BUNDLE_IDENTIFIER = app.orzo.ios.dev`, `PRODUCT_NAME = "Orzo Dev"`
- [x] `Info.plist` uses `$(PRODUCT_BUNDLE_IDENTIFIER)` for URL scheme and `$(PRODUCT_NAME)` for display name — dynamic per build config
- [x] `mobile/src/services/authRedirect.ts` uses `__DEV__` to select the correct auth callback scheme
- [x] Four screen files updated to use `AUTH_REDIRECT_URL` instead of hardcoded redirect strings
- [x] Separate `OrzoDev.entitlements` for the Debug config (allows independent Apple Sign-In App ID registration)
- [x] Auth via email/password works on dev build; Apple/Google Sign-In require separate App ID registration (not yet done — not needed for dev)

**Dev workflow:** Make changes locally → `npm run dev:phone` → build Debug in Xcode → test on "Orzo Dev" (hits local API) → push to `master` → Railway auto-deploys → production "Orzo" is updated.

**Both apps share the same Supabase project and database.** No separate dev database needed for solo development. The local API server and Railway both connect to the same Supabase Postgres.

**Files modified:**

| File | What changed |
|---|---|
| `mobile/ios/Orzo.xcodeproj/project.pbxproj` | Debug config: bundle ID, product name, entitlements path |
| `mobile/ios/Orzo/Info.plist` | `CFBundleDisplayName` → `$(PRODUCT_NAME)`, URL scheme → `$(PRODUCT_BUNDLE_IDENTIFIER)` |
| `mobile/ios/Orzo/OrzoDev.entitlements` | New file — copy of `Orzo.entitlements` for Debug config |
| `mobile/src/services/authRedirect.ts` | New file — `AUTH_REDIRECT_URL` derived from `__DEV__` |
| `mobile/src/screens/ForgotPasswordScreen.tsx` | Replaced hardcoded redirect with `AUTH_REDIRECT_URL` |
| `mobile/src/screens/EmailConfirmationScreen.tsx` | Replaced hardcoded redirect with `AUTH_REDIRECT_URL` |
| `mobile/src/screens/SignUpScreen.tsx` | Replaced hardcoded redirect with `AUTH_REDIRECT_URL` |
| `mobile/src/screens/AccountScreen.tsx` | Replaced hardcoded redirect with `AUTH_REDIRECT_URL` |

**Deferred (Pillars 1–3) — revisit if/when multi-developer or staging is needed:**

- Pillar 1 (Git branching): `dev` branch + merge-to-deploy workflow
- Pillar 2 (Supabase dev project): Separate database, auth, and storage for dev
- Pillar 3 (Railway dev service): Separate deployed API for dev/staging

---

### 0.2 — Ship Prep & TestFlight

| | |
|---|---|
| **Effort** | S (3–4 days) |
| **Revenue impact** | Prerequisite for real-world testing and App Store launch |
| **Depends on** | 0.1 (Auth) |

**What to build:**

- **Apple Developer Program setup:** ~~Provisioning profiles, signing certificates, bundle ID registration (`app.orzo.ios`)~~ **Done (2026-04-08):** App ID `app.orzo.ios` registered, Services ID `app.orzo.ios.auth` created, Xcode auto-managed signing with team `82MCB6UFTX`, Debug and Release builds verified on physical iPhone
- **App Store Connect listing:** App name, category (Food & Drink), age rating, App Store description, keywords, screenshots (at least iPhone 15 Pro + iPhone SE sizes), preview video (optional but high-impact)
- **Privacy nutrition labels:** Apple requires you to declare all data collected. With auth built, this includes: email address (account creation), photos (recipe images uploaded to Supabase), usage data (if analytics is added). Fill these out accurately — Apple rejects apps with incorrect privacy labels.
- **TestFlight distribution:** Archive build from Xcode, upload to App Store Connect, create a TestFlight group for internal testing. First build triggers Apple's beta review (usually <48 hours). After approval, distribute to external testers via public link or email invite.
- **Crash reporting:** Integrate Sentry (`@sentry/react-native`) for crash and error tracking on both JS and native layers. Free tier covers solo dev volume. This catches the issues your testers won't report.
- **Analytics:** Integrate PostHog (`posthog-react-native`). PostHog is open-source, has a generous free tier (1M events/mo), and gives you: event tracking, funnels, retention charts, and feature flags (useful for Phase 1+ rollouts). Track at minimum: import started/completed (by source type), recipe saved, recipe viewed, collection created, paywall shown/converted (when 0.3 is built). This data is essential for knowing which import method drives retention and where users drop off.
- **Privacy policy & terms of service:** Host on `getorzo.com/privacy` and `getorzo.com/terms`. Apple requires a privacy policy URL in the App Store listing. Can be simple markdown-to-HTML for v1 — cover what data you collect (email, recipe content, images), how it's stored (Supabase, PostgreSQL), and that you don't sell data.
- **App icon & launch screen:** Final app icon (1024×1024 for App Store, plus all device sizes via asset catalog), launch screen (simple branded splash).

**TestFlight steps (first-time checklist):**

1. In Apple Developer portal: register a new App ID with bundle identifier
2. Create a provisioning profile (App Store distribution) and download signing certificate
3. In Xcode: set the team, bundle ID, and signing profile. Ensure "Automatically manage signing" works, or configure manually.
4. Archive the app: Product → Archive in Xcode (requires a physical device or "Any iOS Device" as build target)
5. Upload to App Store Connect via Xcode Organizer → Distribute App → App Store Connect
6. In App Store Connect: create the app listing (name, category, privacy URL, etc.)
7. Once uploaded, go to TestFlight tab → select the build → submit for Beta App Review
8. After approval (~24–48 hrs first time, faster after): add internal testers (up to 100, no review needed) or create a public link for external testers (up to 10,000)

**Why this is 0.2, not later:** Without TestFlight, all testing happens on your device over a LAN dev server. You can't get real feedback from other people, and you can't validate auth or subscriptions in a production-like environment. Every week you delay TestFlight is a week of building features nobody else has tried.

---

### 0.3 — Subscription Infrastructure

| | |
|---|---|
| **Effort** | S (3–4 days) |
| **Revenue impact** | This IS the revenue mechanism |
| **Depends on** | 0.1 (Auth), 0.2 (Ship Prep — need App Store Connect listing for IAP product registration) |

**What to build:**

- RevenueCat SDK integration (handles Apple IAP + Google Play Billing + receipt validation + subscription lifecycle)
- Two subscription products: `orzo_pro_monthly` ($4.99/mo), `orzo_pro_annual` ($39.99/yr)
- One non-consumable (unlocked in Phase 4): `orzo_cookbook_bundle` ($19.99)
- **$1.99 Starter Pack (trial ramp):** A consumable IAP that grants 30 additional AI imports and starts a 15-day introductory window. At the end of the 15 days, the user auto-converts to the $4.99/mo Pro subscription (with required Apple disclosure). The intent is a low-friction on-ramp: "Not ready to commit? Pay $1.99 for 30 imports — we'll remind you before your Pro subscription starts in 15 days." This bridges the gap between free and $4.99/mo for users who need more time to see value.
  - **⚠️ RevenueCat confirmation needed:** Verify that RevenueCat supports a consumable IAP that triggers an auto-renewing subscription transition. Apple's StoreKit 2 supports introductory offers and promotional offers natively, but the specific flow (consumable → deferred subscription start) may need to be implemented as: (1) consumable purchase + (2) schedule a promotional offer that activates after 15 days, or (3) RevenueCat's "Experiments" / "Offerings" feature. Confirm the exact mechanism before building.
  - **Apple compliance:** Auto-renewing subscriptions require clear disclosure of price, renewal period, and how to cancel — both in the app and on the App Store listing. The 15-day-to-subscription transition must be communicated transparently to avoid App Review rejection or user trust issues.
- Paywall screen — shown when free-tier user hits a gated feature
- `subscription_tier` synced from RevenueCat webhooks to `users` table
- Free tier limits enforced:
  - Max 50 saved recipes
  - No camera/photo AI import (URL import only)
  - No grocery list
  - No nutrition info
  - No cook mode
  - No family sharing
- Settings screen: manage subscription, restore purchases

**Why RevenueCat:** It abstracts the nightmare of Apple/Google receipt validation, handles grace periods, billing retries, and gives you a real-time MRR dashboard. Solo devs should never hand-roll subscription infrastructure.

---

### 0.4 — Cloud Sync & Offline Access

| | |
|---|---|
| **Effort** | L (1–1.5 weeks) |
| **Revenue impact** | High — #1 reason people pay for recipe apps |
| **Depends on** | 0.1 (Auth) |

**What to build:**

- **Recommended approach (MVP):** Server-authoritative sync. Recipes live in Supabase Postgres. Mobile caches locally via SQLite (`@op-engineering/op-sqlite` or `expo-sqlite`). On app launch + on save, sync with server. Conflict resolution: last-write-wins with `updated_at` timestamps.
- Offline recipe viewing — read from local cache when no network
- Sync status indicator — subtle cloud icon, non-intrusive
- Background sync on app foreground via `AppState` listener
- **Future (v2):** Full local-first with CRDT sync (PowerSync, ElectricSQL). More complex but more resilient. Save for later.

**Why this matters for revenue:** Offline access is non-negotiable for a cooking app. Kitchens have bad WiFi. Phones get greasy. People cook at cabins without signal. If the app can't show recipes offline, it fails the most basic use case. Every paid competitor offers this.

---

## Phase 1: Acquisition Engine (Weeks 5–6)

**Goal:** Dramatically expand *how* recipes get into Orzo. Right now you have camera, photo library, and URL. The modern recipe discovery loop starts on TikTok and Instagram, not in a cookbook. If you aren't where the recipes are being found, you're invisible to the largest segment of potential users.

Social media import is prioritized here — before daily-use retention features — because **you can't retain users you never acquired**. This is the top of the funnel.

### 1.1 — Social Media Recipe Import (TikTok, Instagram, YouTube)

| | |
|---|---|
| **Effort** | S (2–3 days) |
| **Revenue impact** | Very high — #1 acquisition channel for recipe apps in 2026 |
| **Depends on** | 0.1 (Auth), 1.2 (Share Sheet Extension), existing URL import infrastructure |
| **Tier** | Free: 3 social imports/mo · Pro: unlimited |

**What to build:**

- **YouTube import:** Fetch video page, extract structured recipe from description or comments (many creators include full recipes). If no structured data, extract auto-generated transcript via YouTube API and pass to GPT for recipe extraction. Your existing AI fallback pipeline handles the heavy lifting.
- **Instagram import:** User shares Instagram post URL to Orzo (via iOS Share Sheet, built in 1.2). Fetch the post page, extract caption text, parse with GPT. For reels/video posts, use the caption (Instagram doesn't expose transcripts to third parties).
- **TikTok import:** Same pattern — user shares TikTok URL, fetch page, extract description/caption, GPT parse. TikTok captions are often sparse, so accuracy will be lower. Consider a "fill in what's missing" prompt for the user after AI extraction.
- **Import source tagging:** Tag each recipe with its source platform (camera, url, youtube, instagram, tiktok) for analytics and for showing a small source icon on recipe cards.

**Architecture notes:** Your 4-tier URL cascade (JSON-LD → Microdata → DOM → AI) is already built for this. Social media imports are essentially URL imports where the extraction leans heavier on the AI fallback tier. The main new work is platform-specific transcript/caption fetching — the Share Sheet extension (1.2) handles the "share from any app" gesture.

**Why this is Phase 1, not Phase 2:** ReciMe, Pestle, Honeydew, and Forkee all lead with social media import as their primary marketing message. The person who sees a recipe on TikTok and wants to save it is the highest-intent user you can find — they already want to cook, they just need a place to put the recipe. If Orzo doesn't catch that moment, someone else will.

---

### 1.2 — iOS Share Sheet Extension

| | |
|---|---|
| **Effort** | S (2–3 days) |
| **Revenue impact** | High — reduces friction for ALL imports, not just social |
| **Depends on** | 0.1 (Auth), existing URL import |
| **Tier** | Free |

**What to build:**

- iOS Share Extension target that accepts URLs
- Extension sends URL to Orzo app and triggers existing URL import flow
- Minimal UI in the extension: "Saving to Orzo..." → "Saved!" or "Open to review"
- Works from Safari, Chrome, TikTok, Instagram, YouTube, any app with share functionality

**Why this is separate from 1.1:** The Share Sheet works for ALL URLs, not just social media. It's the "save for later" gesture that makes Orzo feel native to iOS. Paprika and Mela both have this and it's one of their most-used features.

---

### 1.3 — Rate-Limited Free Tier AI Imports

| | |
|---|---|
| **Effort** | S (half day) |
| **Revenue impact** | High — creates natural upgrade pressure |
| **Depends on** | 0.3 (Subscriptions) |
| **Tier** | Free: 3 camera/photo AI imports per month · Pro: unlimited |

**What to build:**

- `ai_import_count` field on users table, reset monthly via cron or on-check
- Server-side enforcement: `/drafts` creation for image-type drafts checks count
- Client-side: show remaining imports ("2 of 3 AI imports remaining this month")
- When limit hit: show paywall with messaging — "Upgrade to Pro for unlimited cookbook scanning"
- URL imports remain unlimited on free tier (low cost to you, keeps the app useful)

**Why rate-limit imports, not recipe storage:** Gating storage feels punitive ("pay or lose your recipes"). Gating AI imports feels fair ("the expensive AI processing costs us money, so unlimited access is a premium feature"). Users intuitively understand that AI costs money. This is the same model that ChatGPT, Midjourney, and every other AI product uses.

---

## Phase 2: Daily-Use Retention (Weeks 7–10)

**Goal:** Give users reasons to open Orzo multiple times per week. These are the features that transform Orzo from a digitization tool into a cooking companion — and that justify a recurring subscription.

### 2.1 — Grocery List

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Very high — the single most important retention feature |
| **Depends on** | 0.1 (Auth), structured ingredients (already built) |
| **Tier** | Pro only |

**What to build:**

- `grocery_lists` table: `id`, `user_id`, `name`, `created_at`, `updated_at`
- `grocery_list_items` table: `id`, `list_id`, `name`, `amount`, `unit`, `recipe_id` (nullable), `is_checked`, `aisle` (nullable), `sort_order`
- "Add to Grocery List" button on recipe detail screen — uses structured ingredient data, respects current servings scale
- Grocery list screen: grouped by aisle (optional), check-off items, manual add, swipe-to-delete
- **Smart consolidation:** Two recipes that both need "2 cups flour" → list shows "4 cups flour" with both recipe names as source
- Persist checked state across app restart
- Clear completed items / clear all

**Why this is the #1 retention feature:** Your structured ingredient data (`amount`, `unit`, `name`, `isScalable`) is a massive head start. Most recipe apps parse free-text ingredients to build grocery lists. You already have structured data — the list practically builds itself. This is your biggest competitive advantage currently sitting unused.

---

### 2.2 — Meal Planning (Weekly Calendar)

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | High — the #2 retention feature, drives weekly engagement |
| **Depends on** | 2.1 (Grocery List) |
| **Tier** | Pro only |

**What to build:**

- `meal_plan_entries` table: `id`, `user_id`, `recipe_id`, `date`, `meal_slot` (breakfast/lunch/dinner/snack), `servings`
- Weekly calendar view: 7 columns, tap to assign a recipe to a slot
- "Plan This" button on recipe detail → date/slot picker
- "Add All to Grocery List" — generates a consolidated grocery list from an entire week's meal plan, with smart deduplication
- Simple week navigation (previous/next)
- Optional: "Surprise me" button to fill empty slots with random saved recipes

**Why meal planning depends on grocery list:** The killer flow is: browse recipes → plan the week → generate one grocery list → shop (or order via Instacart in Phase 4). Each step only works if the previous one exists. Meal planning without a grocery list output is just a pretty calendar.

---

### 2.3 — "What Can I Cook?" — Pantry-Based Recipe Filter

| | |
|---|---|
| **Effort** | S (3–4 days) |
| **Revenue impact** | High — daily-use trigger |
| **Depends on** | Structured ingredients (already built) |
| **Tier** | Free: basic matching · Pro: smart scoring + grocery list integration |

**What to build:**

- Simple pantry: user maintains a list of ingredients they have on hand (just names, no quantities for v1)
- Quick-add via common ingredient chips (chicken, rice, pasta, eggs, onion, garlic, etc.)
- "What Can I Cook?" screen: filters user's saved recipes by ingredient match
- Match scoring: "You have 7/9 ingredients for Chicken Tikka Masala" — sorted by match percentage
- Missing ingredient callout: "You're missing: garam masala, coconut milk"
- "Add missing to grocery list" button (ties into 2.1)

**Key distinction from competitors:** ChefGPT and FoodiePrep *generate new AI recipes* from your ingredients. That's cool but gimmicky — different recipe every time, quality varies, no trust. Orzo filters *your own saved recipes* — recipes you've validated, maybe cooked before, and trust. Fundamentally different and better for someone who's invested time building a personal cookbook.

---

### 2.4 — Cook Mode

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Medium — differentiator, natural Pro showcase |
| **Depends on** | Existing recipe detail screen |
| **Tier** | Pro only |

**What to build:**

- Full-screen step-by-step view: one step at a time, large text, swipe left/right to navigate
- Keep screen awake (`react-native-keep-awake`)
- Inline timers: detect time references in steps ("bake for 25 minutes") → tappable timer chip → countdown with notification
- Ingredient cross-off: tap ingredients as you use them
- Current step highlight with step counter ("Step 3 of 8")
- Quick-access ingredient list (swipe up or tab) without leaving cook mode
- Scaled ingredient amounts respected (uses current servings setting)

**Why this is Pro-only:** Cook mode is the feature people use *while actively cooking*. It's high-value, clearly premium, and easy to demonstrate in App Store screenshots. It creates a natural "moment of delight" that reinforces the subscription value.

---

### 2.5 — Unit Conversion

| | |
|---|---|
| **Effort** | S (half day) |
| **Revenue impact** | Low but high user satisfaction |
| **Depends on** | Structured ingredients (already built), `scaling.ts` |
| **Tier** | Pro only |

**What to build:**

- Extend `scaling.ts` with conversion rules: tbsp ↔ tsp ↔ cup ↔ fl oz ↔ ml ↔ l, oz ↔ lb ↔ g ↔ kg
- Smart conversion thresholds: `0.125 tbsp` → `⅜ tsp`, `16 tbsp` → `1 cup`
- Metric ↔ Imperial toggle on recipe detail screen (persistent per-user preference)
- Applied everywhere: recipe detail, cook mode, grocery list
- No conversion for count-based items ("3 eggs" stays "3 eggs")

**Why this is cheap and high-value:** Your ingredient parser already has `unit` and `amount` as structured fields. Conversion is pure client-side math on data you already have. One of the most requested features in recipe app reviews. Small effort, disproportionate user satisfaction.

---

### 2.6 — Nutrition Estimates

| | |
|---|---|
| **Effort** | S (3–4 days) |
| **Revenue impact** | Medium — retention for health-focused segment |
| **Depends on** | Structured ingredients (already built) |
| **Tier** | Pro only |

**What to build:**

- Integrate USDA FoodData Central database (free, public, ~370k foods). Download SR Legacy or Foundation dataset as a local lookup.
- Fuzzy-match parsed ingredient `name` to USDA entries (e.g., "chicken breast" → USDA equivalent)
- Calculate per-serving estimates: calories, protein, carbs, fat, fiber, sodium
- Display as a compact nutrition card on recipe detail screen
- Disclaimer: "Estimates based on USDA data. Actual values may vary."
- Optional: daily/weekly nutrition summary from meal plan (if 2.2 is built)

**Why estimates, not exact values:** Exact nutrition requires knowing exact brands, preparation methods, and portions. That's impossible for cookbook-scanned recipes. Estimates are honest, still useful, and avoid the liability of pretending to be precise. Use a clear "~" prefix on all values.

---

## Phase 3: Emotional Lock-In (Weeks 11–12)

**Goal:** Make Orzo feel like a personal artifact — something that becomes more valuable over time, harder to leave, and emotionally meaningful. These features are cheap to build but disproportionately powerful for retention.

The best analogy: Instagram started as a photo filter app. People stayed because their memories were there. Orzo starts as a digitization tool. People stay because their cooking life is there.

### 3.1 — "Cooked It" Log & Cooking Journal

| | |
|---|---|
| **Effort** | S (1 day) |
| **Revenue impact** | Medium — emotional lock-in, trivial to build |
| **Depends on** | 0.1 (Auth) |
| **Tier** | Free (basic) · Pro (photos + stats) |

**What to build:**

- `cook_log` table: `id`, `user_id`, `recipe_id`, `cooked_at`, `photo_url` (nullable), `notes` (nullable), `servings_made`
- "I Made This" button on recipe detail → optional photo + note → save
- Cook count badge on recipe cards ("Cooked 5×")
- "Cooking History" tab/section: chronological feed of what you've cooked, with dates and optional photos
- Sort recipes by "most cooked" and "recently cooked"
- Free tier: log without photos · Pro: photos + detailed stats

**Why this is so important:** This is the single cheapest feature with the highest emotional lock-in. Once someone has 6 months of cooking history in Orzo, switching to Paprika means losing that history. It's the same reason people don't leave Strava — their entire running history lives there. Build early so data accumulates from day one.

---

### 3.2 — Personal Cooking Stats & Year in Review

| | |
|---|---|
| **Effort** | S (1–2 days) |
| **Revenue impact** | Medium — shareable, drives word-of-mouth |
| **Depends on** | 3.1 (Cook Log) |
| **Tier** | Pro only |

**What to build:**

- Stats dashboard (computed client-side from `cook_log`):
  - Recipes cooked this month / this year
  - Most-cooked recipe (with count)
  - "Cooking streak" — consecutive weeks with at least one cook
  - New recipes tried vs. repeats ratio
  - Average rating of recipes cooked
  - Total recipes in library + growth over time
- **Year in Review** (December feature): Spotify Wrapped-style shareable summary
  - "In 2026, you cooked 89 meals from 42 recipes. Your most-made recipe was Grandma's Chicken Soup (12 times). You tried 23 new recipes."
  - Shareable card (generate as image) → social media, Messages
  - Every shared "Year in Review" card is a free ad for Orzo — a viral acquisition moment

---

### 3.3 — Recipe Memories & Story Annotations

| | |
|---|---|
| **Effort** | S (2–3 days) |
| **Revenue impact** | Low direct, high emotional |
| **Depends on** | Existing recipe notes feature |
| **Tier** | Free |

**What to build:**

- Extend the existing notes feature with a "Story" field on recipes — a longer-form text area for the personal history behind a recipe
- "This is my grandmother's recipe from 1972. She made it every Thanksgiving..."
- Displayed prominently on recipe detail, above ingredients
- Optional: attach a photo to the story (the original handwritten card, a photo of grandma cooking)

**Why this is free-tier:** This is the feature that makes people fall in love with Orzo during the free trial. It's what separates "a recipe app" from "my family's digital cookbook." It costs you nothing to serve (text + optional image) and creates deep emotional investment that makes the paywall conversion feel natural.

---

### 3.4 — Recipe Tags & Smart Collections

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Medium — organizational depth |
| **Depends on** | Existing collections feature |
| **Tier** | Free: manual tags · Pro: smart/auto tags |

**What to build:**

- User-defined tags on recipes (e.g., "weeknight", "comfort food", "date night", "kid-friendly", "under 30 min")
- Tag-based filtering and search
- **Smart auto-tags (Pro):** AI suggests tags based on recipe content at import time
  - "This recipe has chicken and takes ~20 minutes → suggesting: quick, poultry, weeknight"
  - Uses existing GPT integration — add tag suggestions to the parse prompt
- Pre-defined tag categories: Cuisine, Difficulty, Diet, Occasion, Time

---

## Phase 4: Revenue Expansion (Weeks 13–15)

**Goal:** Layer additional revenue streams on top of the core subscription. Each feature here either generates direct revenue or significantly increases willingness to pay for Pro.

### 4.1 — Instacart / Grocery Delivery Integration

| | |
|---|---|
| **Effort** | M (1 week dev + IDP approval wait) |
| **Revenue impact** | Very high — feature + affiliate revenue stream |
| **Depends on** | 2.1 (Grocery List) |
| **Tier** | Pro only |

**What to build:**

- Apply to Instacart Developer Platform (IDP) — they actively recruit recipe/meal planning apps. Your structured ingredient data and grocery list make you an ideal partner.
- "Order on Instacart" button on grocery list screen → opens Instacart with pre-populated cart
- IDP provides: item catalog matching, store selection, cart building, fulfillment, delivery tracking
- Affiliate commission on every order placed through Orzo (typically $1–3 per order)
- Future: add Walmart Grocery API, Amazon Fresh, or Kroger as additional delivery partners

**Revenue math:** If 500 Pro users order groceries through Orzo once per week at ~$2 commission, that's $4,000/mo in affiliate revenue — on top of subscription revenue.

**IDP application tips:** They want to see structured ingredient data, an active user base, and a clear recipe-to-cart flow. Emphasize your validation engine — "every ingredient in our app is structured and verified, not free-text." They vet partners but are actively expanding; recipe apps are their #1 target category.

---

### 4.2 — Cookbook Bundle (Batch Digitization Upsell)

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Medium — burst revenue at high-intent moments |
| **Depends on** | 0.3 (Subscriptions), concurrent import queue (already built) |
| **Tier** | $19.99 one-time IAP add-on |

**What to build:**

- "Digitize a Cookbook" mode: batch import flow optimized for scanning many pages
  - Sequential camera capture with page counter ("Page 7 of ~30")
  - Queue all pages, parse in background (leverage existing concurrent import queue)
  - Review all results in Import Hub, save the good ones
- Priority AI processing for bundle purchasers (skip the semaphore queue)
- Marketing hook: surface this IAP when user imports their 3rd camera recipe
  - "Looks like you're scanning a cookbook! Unlock batch import for $19.99"
- No recipe limit — the bundle unlocks the *mode*, not a count

**Why one-time, not subscription:** This captures the high-intent "I just discovered this app and want to scan grandma's cookbook RIGHT NOW" moment. Subscription friction at that moment kills conversion. $19.99 impulse purchase doesn't.

---

### 4.3 — Recipe Adaptation & Substitution Suggestions

| | |
|---|---|
| **Effort** | S (3–4 days) |
| **Revenue impact** | Medium — differentiator, reduces cooking friction |
| **Depends on** | Structured ingredients, GPT integration (already built) |
| **Tier** | Pro only |

**What to build:**

- "Substitute" button next to each ingredient on recipe detail
- Tap → AI generates 2–3 substitution options with usage notes:
  - "No heavy cream? → Try: coconut cream (same amount), Greek yogurt thinned with milk (3/4 amount), cashew cream (blend soaked cashews)"
- Diet-aware: if user has set dietary preferences, substitutions respect them
- Cache common substitutions to reduce API costs (most substitution pairs are stable)
- "Adapt Entire Recipe" (Pro): generate a full variant (e.g., "Make this vegan") — creates a new recipe in user's library linked to the original

**Cost management:** Substitution queries are short GPT calls (not Vision), so they're cheap. Cache aggressively — "substitute for heavy cream" will be asked thousands of times with the same answer.

---

### 4.4 — Printed Cookbook Generation

| | |
|---|---|
| **Effort** | M (1 week) |
| **Revenue impact** | Medium — high-emotion purchase, gift potential |
| **Depends on** | Recipe hero images, collections |
| **Tier** | Pro only (+ print cost per book) |

**What to build:**

- "Create a Cookbook" flow: select recipes (from a collection or cherry-pick), choose a cover template, add title and dedication
- Generate a print-ready PDF:
  - Cover page with title, optional photo, author name
  - Table of contents
  - One recipe per page: hero image, title, description, ingredients, steps
  - Optional "Story" field content below the recipe
  - Page numbers, section dividers by collection
- **Print-on-demand integration:** Partner with Blurb, Lulu, or similar
  - User previews book in-app → taps "Order Printed Copy" → redirected to print partner
  - Typical price: $25–40 per book. You earn 15–25% margin.
- **Digital PDF export** as a lighter alternative (Pro only)

**Why this matters beyond revenue:** "Turn your Orzo collection into a real printed cookbook for Mom's birthday" is the single most compelling marketing message for the cookbook digitization audience. It completes the circle: physical cookbook → digital → physical again, but curated and personalized. Every gifted cookbook is a Orzo advertisement.

---

## Phase 5: Growth & Network Effects (Weeks 16–19)

**Goal:** Turn existing users into acquisition channels. Every feature here creates reasons for a Orzo user to bring in non-users.

### 5.1 — Recipe Sharing & Export

| | |
|---|---|
| **Effort** | M (1 week — includes deep linking infrastructure) |
| **Revenue impact** | High — viral loop |
| **Depends on** | 0.1 (Auth), deep linking infrastructure (see below) |
| **Tier** | Free: 3 shares/mo · Pro: unlimited |

**What to build:**

- Share a recipe via:
  - **Link:** Generate a public URL (`getorzo.com/r/abc123`) with a clean web view of the recipe. Non-users see the recipe + "Get Orzo" CTA. This is your #1 organic acquisition channel.
  - **Messages / email:** Share as formatted text (title, ingredients, steps)
  - **Image card:** Generate a beautiful recipe card image (hero photo + title + key stats) for Instagram Stories, iMessage, etc.
- "Import from link" — Orzo users who receive a shared link can one-tap import into their own library
- Share analytics (Pro): see how many times your shared recipes were viewed/imported

**Deep linking prerequisite:** For shared links (`getorzo.com/r/abc123`) to open the app on iOS (or redirect to the App Store if not installed), you need:

- Apple Universal Links: an `apple-app-site-association` file hosted at `getorzo.com/.well-known/apple-app-site-association`, registered in Xcode's Associated Domains capability
- A lightweight web service (or static page) at `getorzo.com/r/:id` that renders a clean recipe view for non-app visitors (title, ingredients, hero image, "Get Orzo" CTA)
- App-side URL handling: when the app opens via a universal link, route to the recipe detail screen or trigger an import flow
- This infrastructure is also reusable for family invites (5.2) and public profiles (5.3)

**Copyright considerations for shared recipes:** The primary use case is "send my friend this recipe I found" — which means sharing content originally imported from third-party sources (cookbooks, food blogs, etc.). The legal landscape:

- **Ingredient lists** are generally not copyrightable — courts have consistently held that a factual list of ingredients and quantities is not creative expression (see *Publications Int'l v. Meredith Corp.*, 1996).
- **Recipe instructions**, however, *can be* copyrightable when they contain substantial literary expression (descriptive language, personal commentary, tips). The more a step reads like "stir until golden" vs. "lovingly stir until the butter dances into a golden haze," the more protection it has.
- **Photos** imported from third-party sites are copyrighted by the photographer/publisher.

**Recommended approach for v1:** When sharing a recipe that was imported from an external source (`sourceType: "url"`), share only the title, ingredient list, and a link back to the original URL (already stored in `originalUrl`). Omit the full step text and any imported hero image from the public share page. For user-created recipes (`sourceType: "image"` from their own cookbook) or recipes where the user has substantially edited the steps, full sharing is lower risk. This can be enforced server-side when generating the public share page.

**Viral math:** If 1,000 users share 2 recipes/month and each shared recipe is seen by 5 people, that's 10,000 monthly impressions of "Get Orzo" CTAs. At even 2% conversion, that's 200 new users/month — for free.

---

### 5.2 — Family Sharing & Household Accounts

| | |
|---|---|
| **Effort** | M (1–1.5 weeks) |
| **Revenue impact** | High — higher ARPU, lower churn |
| **Depends on** | 0.1 (Auth), 0.4 (Sync) |
| **Tier** | Pro only (up to 6 family members on one subscription) |

**What to build:**

- "Family Kitchen" — a shared recipe collection visible to all family members
- Family owner invites members via email or link
- Shared grocery list that syncs in real-time (everyone can add/check items)
- Shared meal plan calendar
- Individual libraries remain private; Family Kitchen is additive
- Each family member gets their own cook log and stats

**Pricing:** Family sharing included with Pro — no extra cost. This is the Apple Music / Spotify Family model. Slightly reduces per-user revenue but dramatically reduces churn (cancellation requires a *family discussion*, not a solo decision).

**Why this drives retention:** The moment a second person in the household depends on Orzo for the shared grocery list, cancellation becomes a multi-person decision. Multi-user dependency is the strongest form of lock-in.

---

### 5.3 — Public Profiles & Community Cookbooks (Optional / Long-term)

| | |
|---|---|
| **Effort** | L (1.5–2 weeks) |
| **Revenue impact** | Speculative — depends on community traction |
| **Depends on** | 5.1 (Sharing), 0.1 (Auth) |
| **Tier** | Free to browse · Pro to publish |

**What to build:**

- Optional public profile: display name, bio, public recipe count
- "Publish" a recipe to make it discoverable by other Orzo users
- Community cookbooks: curated collections published by users ("My 20 Best Italian Recipes")
- Browse/search published recipes, one-tap import to your own library
- Follow other cooks, see their new published recipes

**Why this is optional/long-term:** Community features are expensive to moderate, slow to reach critical mass, and distract from the core "personal cookbook" value prop. Only build this if Orzo has 10,000+ active users and you see organic sharing behavior. Don't chase this until everything above is solid.

---

## Feature Gating Summary

| Feature | Free | Starter Pack ($1.99) | Pro ($4.99/mo) |
|---|---|---|---|
| Saved recipes | 50 max | 50 max | Unlimited |
| URL import | Unlimited | Unlimited | Unlimited |
| Social media import | 3/month | 30 total | Unlimited |
| Camera/photo AI import | 3/month | 30 total | Unlimited |
| Collections & manual tags | Yes | Yes | Yes |
| Ingredient scaling | Yes | Yes | Yes |
| Search | Yes | Yes | Yes |
| Recipe stories / memories | Yes | Yes | Yes |
| Cook log (no photos) | Yes | Yes | Yes |
| Pantry filter (basic) | Yes | Yes | Yes |
| Grocery list | No | No | Yes |
| Meal planning | No | No | Yes |
| Cook mode | No | No | Yes |
| Nutrition estimates | No | No | Yes |
| Unit conversion | No | No | Yes |
| Instacart integration | No | No | Yes |
| Recipe substitutions | No | No | Yes |
| Smart auto-tags | No | No | Yes |
| Cook log with photos + stats | No | No | Yes |
| Family sharing (up to 6) | No | No | Yes |
| Recipe sharing | 3/month | 3/month | Unlimited |
| Printed cookbook | No | No | Yes (+ print cost) |
| Cookbook Bundle mode | — | — | $19.99 one-time add-on |

**Tier philosophy:** Free is generous enough to hook users and let them build a real library (50 recipes, unlimited URL import). The $1.99 Starter Pack is a low-commitment bridge — it gives power users enough AI imports to see the value of Pro without a monthly commitment, then auto-converts to Pro after 15 days. Pro gates the expensive features (unlimited AI imports, grocery list, meal planning, cook mode) and removes the recipe cap entirely. Never locks access to saved recipes — your data is always yours, even if you downgrade.

---

## Revenue Model & $20k MRR Path

### Target Economics

| Metric | Target |
|---|---|
| Pro monthly price | $4.99 |
| Pro annual price | $39.99 (~$3.33/mo effective) |
| Starter Pack (trial ramp) | $1.99 one-time (30 AI imports, auto-converts to Pro monthly after 15 days) |
| Blended ARPU (70% annual / 30% monthly) | ~$3.83/mo |
| Subscribers needed for $20k MRR (subs alone) | ~5,200 |
| Free-to-paid conversion rate (target) | 5–6% (Starter Pack expected to lift conversion vs. hard paywall) |
| Total users needed | ~87,000–104,000 |

### Supplementary Revenue Streams

| Source | Est. Monthly Revenue |
|---|---|
| Starter Pack purchases (users who buy but don't convert) | $500–1,500 |
| Instacart affiliate commissions | $2,000–4,000 |
| Cookbook Bundle one-time purchases | $1,000–2,000 |
| Printed cookbook margins | $500–1,000 |

With supplementary revenue, the subscriber target drops to ~3,500–4,000 for the same $20k MRR.

### Revenue Milestones

| When | Milestone | Est. MRR |
|---|---|---|
| Week 4 (Q3 2026) | TestFlight live, internal testing, App Store submission in progress | $0 |
| Week 6 (Q3 2026) | App Store launch with Phase 0 + 1 complete, first paying customers | $500–1,500 |
| Week 12 (Q3 2026) | Phase 2 + 3 live, organic growth + ASO | $3,000–5,000 |
| Week 19 (Q4 2026) | Instacart live, family sharing, viral loops active | $8,000–12,000 |
| Months 6–9 (Q1 2027) | Steady organic + word-of-mouth compound growth | $15,000–20,000 |

---

## What NOT to Build

Things that seem tempting but are traps for a solo dev:

| Temptation | Why Not |
|---|---|
| **Android-first or simultaneous launch** | Ship iOS first. Your dev setup, testing, and daily driver are iOS. Android comes after model validation with revenue. React Native makes the port straightforward later. |
| **Web app** | Adds an entire frontend codebase and deployment surface. Mobile-first is right for a cooking app. Web can come in year 2. |
| **AI recipe generation** | "Give me a recipe using chicken and rice" — this is ChefGPT's territory and the output is generic AI slop. Orzo's value is *your* recipes, validated and trusted. Don't dilute that. |
| **Social feed / discovery** | Community features are expensive to moderate, slow to grow, and distract from the personal cookbook value prop. Only consider at 10k+ users. |
| **Barcode scanning for pantry** | Cool feature, massive engineering effort (UPC database, camera scanning, edge cases). Simple text-based pantry is 90% of the value at 10% of the cost. |
| **Apple Watch / widgets** | Nice-to-have, but only after the core app is monetizing. Retention features, not acquisition features. |
| **Multi-language support** | English-first. Localization is a tax on every future feature. Add it when revenue justifies the cost. |

---

## Key Dependencies (Build Order)

```
0.1 Auth ──────────────┬──→ 0.1b Dev/Prod Isolation
                       │         │
                       │         └──→ 0.2 Ship Prep / TestFlight
                       │                   │
                       │                   └──→ 0.3 Subscriptions ──→ 1.3 Rate Limits
                       │
                       ├──→ 0.4 Sync / Offline
                       │
                       ├──→ 1.2 Share Sheet Extension
                       │         │
                       │         └──→ 1.1 Social Media Import
                       │
                       ├──→ 2.1 Grocery List ──────→ 2.2 Meal Planning
                       │         │                         │
                       │         └──→ 4.1 Instacart ───────┘
                       │
                       ├──→ 3.1 Cook Log ──→ 3.2 Stats / Year in Review
                       │
                       ├──→ Deep Linking infra ──→ 5.1 Sharing ──→ 5.2 Family ──→ 5.3 Community
                       │
Structured Ingredients ├──→ 2.3 What Can I Cook?
   (ALREADY BUILT)     ├──→ 2.5 Unit Conversion
                       ├──→ 2.6 Nutrition Estimates
                       └──→ 4.3 Substitution Suggestions

GPT Integration ───────→ 1.1 Social Media Import
   (ALREADY BUILT)     ├──→ 3.4 Smart Auto-Tags
                       └──→ 4.3 Substitution Suggestions

Existing Notes ────────→ 3.3 Recipe Memories / Stories

Existing Collections ──→ 3.4 Tags & Smart Collections

Existing Hero Images ──→ 4.4 Printed Cookbook Generation

Concurrent Queue ──────→ 4.2 Cookbook Bundle Mode
   (ALREADY BUILT)
```

---

## Changelog

| Date | Change |
|---|---|
| 2026-04-08 | Added 0.1b Dev/Prod Environment Isolation section: Git branching (`dev` branch), second Supabase project, second Railway service, separate Xcode scheme (`app.orzo.dev` bundle ID). Documents setup checklists, conditional file changes, and one-time vs ongoing tasks. |
| 2026-04-08 | Production deployment complete: Fastify API live on Railway at `https://api.getorzo.com`. Dockerfile fixed (skip root postinstall, install `@img/sharp-linux-x64`). Custom domain via Cloudflare CNAME (DNS-only). Apple Developer Portal setup (App ID, Services ID). Google Cloud OAuth client updated. Supabase providers configured. Release build verified on physical iPhone. `react-native+0.76.9.patch` extended with Hermes spaces-in-path fix. Updated 0.2 status to "Partially started." |
| 2026-04-04 | Auth complete: all 8 work streams (WS-1 through WS-8) finished. WS-6: private buckets, signed URLs, user-scoped paths. WS-7a: account deletion, sign-out-all, email change, MFA enrollment. WS-7b: step-up auth, MFA recovery codes, provider linking, session tracking. WS-8: rate limiting, auth header redaction, integration tests, security checklist. Production deployment Dockerfile and guide created. Updated 0.1 status to "Complete." Architecture notes updated. Feature table updated. |
| 2026-04-03 | Auth infrastructure: server-side auth complete. Updated 0.1 status from "Not started" to "In progress — server auth infrastructure complete." Architecture notes updated to reflect Supabase Auth configuration, JWT middleware, user-scoped repositories, and RLS policies. Feature table updated. Remaining work streams (WS-4 through WS-8) documented inline with explicit dependencies. |
| 2026-03-31 | Roadmap revision after full codebase cross-reference. Added 0.2 Ship Prep & TestFlight (analytics, crash reporting, privacy policy, App Store listing, TestFlight steps). Renumbered: Subscriptions→0.3, Sync→0.4. Added $1.99 Starter Pack trial ramp to 0.3 (auto-converts to Pro after 15 days, RevenueCat confirmation needed). Free tier cap raised from 15→50 recipes. Fixed dependency graph: 1.2 Share Sheet now precedes 1.1 Social Media Import. Added deep linking infrastructure as prerequisite for 5.1 Sharing. Added copyright considerations for recipe sharing (ingredients vs. instructions). Bumped Cook Mode (2.4) from S to M effort. Updated gating table with Starter Pack column. Adjusted revenue model: added Starter Pack revenue stream, updated conversion rate and user targets. |
| 2026-03-31 | Codebase cross-reference: added Current State Assessment section documenting all built MVP features vs. roadmap. Confirmed "already built" claims (structured ingredients, GPT integration, concurrent queue, notes, collections, hero images). Documented 12 shipped features not previously tracked in roadmap. Flagged Supabase architecture question for Phase 0. |
| 2026-03-31 | Revised timelines: compressed from 36 weeks to 18 weeks based on proven 10-day MVP velocity. Updated all effort estimates, phase timelines, and revenue milestones. |
| 2026-03-31 | Initial roadmap created. 6 phases, 22 features, targeting $20k MRR by Q1 2027. |
