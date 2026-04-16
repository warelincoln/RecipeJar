# Phase 0 — Foundation (Weeks 1–4)

> **What this doc covers:** The detailed feature breakdowns for Phase 0: Auth (0.1), Dev/Prod Isolation (0.1b), Ship Prep & TestFlight (0.2), Subscription Infrastructure (0.3), Cloud Sync & Offline Access (0.4). For the high-level phase overview and dependencies, see [`../ROADMAP.md`](../ROADMAP.md).

**Goal:** Make Orzo a real product that can accept money, ship to testers, and support multiple users. Nothing here is exciting — it's all plumbing. But without it, everything else is built on sand.

---

## 0.1 — User Authentication & Accounts

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
- **WS-8 (Abuse Controls & Testing):** `@fastify/rate-limit` on all Fastify API routes (global 100/min, parse 10/hr, draft creation 30/hr). Authorization header redacted from logs. Auth/IDOR integration tests (12 tests). Manual security checklist ([`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md)). Auth event logging extended.
- **Production deployment:** Dockerfile and deployment guide ([`PRODUCTION_DEPLOY.md`](PRODUCTION_DEPLOY.md)) for Railway, Render, Fly.io.
- **Database:** 2 new migrations (`0010_mfa_recovery_codes`, `0011_user_sessions`), 13 public tables total.

**Production API is live at `https://api.getorzo.com`** (Railway, auto-deploys from `master`). All auth work is complete. The next blocker for TestFlight is App Store Connect setup (listing, screenshots, privacy policy).

**Migration strategy for existing data:** ✅ Complete. Seed user (`migration-seed@getorzo.com`, banned) owns all 211 pre-auth rows. Storage objects migrated to user-scoped paths.

**Why this is first:** Every feature after this touches user identity. Subscriptions need a user to bill. Sync needs a user to sync. Sharing needs a user to share with. This is the foundation of the foundation.

---

## 0.1b — Dev/Prod Environment Isolation

| | |
|---|---|
| **Effort** | S-M (1–2 days for dev Supabase, more if third-party auth is mirrored) |
| **Revenue impact** | None directly — prevents production incidents and unsafe migration work |
| **Depends on** | 0.1 (Auth — complete), production deployment (complete) |
| **Status** | **Complete** — Pillar 4 (separate "Orzo Dev" app) done April 2026; Pillar 2 (separate dev Supabase) done 2026-04-16. Pillars 1 (Git branching) and 3 (separate Railway service) remain deferred — not needed for solo development. |

**Why this exists:** `master` now auto-deploys to Railway and the production app talks to live infrastructure. App-level isolation is already in place, but local development still shares the same Supabase project as production. That is acceptable for UI work, but risky for schema changes, RLS changes, auth configuration, storage changes, and migration rehearsals.

**What is already implemented (Pillar 4 — Xcode dev build):**

- [x] Debug builds install as **"Orzo Dev"** (`app.orzo.ios.dev`) — a separate app alongside production "Orzo" (`app.orzo.ios`)
- [x] `project.pbxproj` Debug config: `PRODUCT_BUNDLE_IDENTIFIER = app.orzo.ios.dev`, `PRODUCT_NAME = "Orzo Dev"`
- [x] `Info.plist` uses `$(PRODUCT_BUNDLE_IDENTIFIER)` for URL scheme and `$(PRODUCT_NAME)` for display name — dynamic per build config
- [x] `mobile/src/services/authRedirect.ts` uses `__DEV__` to select the correct auth callback scheme
- [x] Four screen files updated to use `AUTH_REDIRECT_URL` instead of hardcoded redirect strings
- [x] Separate `OrzoDev.entitlements` for the Debug config (allows independent Apple Sign-In App ID registration)
- [x] Local dev app hits the local API server; Release app hits Railway
- [x] Auth via email/password works on dev build; Apple/Google Sign-In require separate App ID registration (not yet done — not needed for dev)

**New target architecture:**

- **Orzo Dev** (`app.orzo.ios.dev`) → local Fastify API → **dev Supabase**
- **Orzo** (`app.orzo.ios`) → Railway API → **production Supabase**

**What was built (Pillar 2 — separate Supabase for dev, 2026-04-16):**

- [x] Second Supabase project created (`nrdomcszbvqnfinrjvuz`, same org, `us-west-2`)
- [x] Local `server/.env` now points at the dev project (Session pooler URL — direct is IPv6-only)
- [x] Railway continues to point at production Supabase only (untouched)
- [x] All 13 Drizzle migrations replayed against dev via new `server/scripts/apply-all-migrations.ts` iterator (idempotent; treats `already exists` as skip)
- [x] `migrate-0008-backfill.ts` run against dev — banned seed user created; `verify-0008.ts` + `verify-0009-rls.ts` both pass (41+ RLS policies across 11 tables)
- [x] Dev auth configured for `app.orzo.ios.dev://auth/callback` (Site URL + redirect allowlist)
- [x] Email/password only for dev (Apple/Google deferred — would require separate App ID registration + a new Google OAuth iOS client ID)
- [x] Email confirmation **disabled** on dev (Supabase free-tier shared-SMTP throttling made confirm-flow testing unreliable)
- [x] Storage buckets auto-created on first upload via existing `ensureRecipeImagesBucket()` — no pre-seeding needed
- [x] Mobile `mobile/src/services/supabase.ts` now selects URL + anon key via `__DEV__` ternary (matches `api.ts` + `authRedirect.ts` pattern); startup logs `[orzo] Supabase: DEV|PROD <url>` for quick verification
- [x] End-to-end verified on device: fresh sign-up in Orzo Dev → confirmed in dev `auth.users`, **not** in prod. Release Orzo still hits production cleanly.

**Why a separate dev Supabase is now required:**

- Schema and migration testing should not run against production data
- RLS and auth policy changes can accidentally lock out production users
- Storage/bucket experiments can pollute or break production assets
- Test users, drafts, imports, and failed parses should stay out of production
- Local dev and production should no longer share database credentials

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

**Caveats to plan for:**

- **Auth configuration drift:** Supabase Auth settings are not just code. The dev project needs its own Site URL, redirect allowlist, email settings, and provider configuration.
- **Third-party sign-in duplication:** Apple Sign-In and Google Sign-In may need separate dev-side setup if you want them to work in `Orzo Dev`. If not, document that dev uses email/password only.
- **Storage parity:** The dev project must recreate private buckets, policies, and expected path conventions or uploads/imports will fail in ways that do not reproduce production.
- **Migration discipline:** Once dev and prod are split, every schema change should be validated in dev first and then promoted deliberately to prod.
- **Seed data and cleanup:** Dev needs representative data, but it should be clearly fake and safe to wipe/reset.
- **Config complexity:** There will now be two sets of Supabase URLs, keys, redirect URLs, and dashboard settings to keep straight.
- **Hosted staging still absent:** This change isolates data and auth risk, but it does not replace a full staging API environment. If you later need production-like deploy testing, add a second Railway service then.

**Deferred for now:**

- Pillar 1 (Git branching): `dev` branch + merge-to-deploy workflow
- Pillar 3 (Railway dev service): Separate deployed API for dev/staging

**Recommended solo-dev workflow:** Make changes locally → run local API against **dev Supabase** → test in **"Orzo Dev"** → verify migration/auth/storage behavior safely → push vetted changes → Railway deploys production API → production app continues using production Supabase.

---

## 0.2 — Ship Prep & TestFlight

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

## 0.3 — Subscription Infrastructure

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

## 0.4 — Cloud Sync & Offline Access

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
