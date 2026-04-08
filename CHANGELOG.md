# Orzo Changelog

### 2026-04-04 — WS-6/7/8: Storage security, session management, abuse controls & testing (complete)

All remaining authentication work streams are now complete. The full security hardening plan (`docs/AUTH_RLS_SECURITY_PLAN.md`) — 8 work streams, 20 tasks — is finished. WS-7 was split into WS-7a (TestFlight requirements) and WS-7b (post-TestFlight hardening) during the review; both are done.

**WS-6 — Storage Security (complete):**

- **Private buckets:** `ensureRecipeImagesBucket()` in `recipe-image.service.ts` now creates/updates buckets with `public: false`. Both `recipe-pages` and `recipe-images` are private.
- **Signed URLs:** `resolveImageUrls()` refactored from synchronous `getPublicUrl()` to async `createSignedUrl(path, 3600)` (60-minute TTL). All callers in `recipes.routes.ts`, `collections.routes.ts`, and `drafts.routes.ts` updated to `await`.
- **User-scoped storage paths:** All upload paths now include a `userId` prefix: `{userId}/recipes/{recipeId}/hero.jpg`, `{userId}/drafts/{draftId}/{pageId}.jpg`. Helper functions `heroPathFor(userId, recipeId)`, `thumbnailPathFor(userId, recipeId)`, `draftPagePathFor(userId, draftId, pageId)` enforce the convention.
- **OCR fallback removed:** Deleted `getPublicUrl` fallback in `drafts.routes.ts` parse path — if `download()` fails, the parse fails cleanly instead of constructing a URL that won't resolve on private buckets.
- **Migration script:** `server/scripts/migrate-storage-user-scoped.ts` moves existing storage objects from flat paths to user-scoped paths, updates DB columns, and handles the seed user's 211 rows. Idempotent.
- **`deleteAllUserStorage(userId)`:** New helper in `recipe-image.service.ts` removes all user-scoped objects from both buckets (used by account deletion hard-delete).

**Production deployment (complete):**

- **`server/Dockerfile`:** Multi-stage build for the Fastify API server.
- **`docs/PRODUCTION_DEPLOY.md`:** Deployment guide for Railway, Render, and Fly.io, including environment variables, health check path, and mobile app rebuild steps.

**WS-7a — TestFlight essentials (complete):**

- **Account deletion (Apple requirement):**
  - `DELETE /account` endpoint: calls `supabase.auth.admin.deleteUser(userId)` which cascades through `profiles` to all user data. Logs `account_deletion_requested` event. User can re-register with the same email immediately.
  - `server/scripts/hard-delete-accounts.ts`: cron script permanently deletes accounts soft-deleted 30+ days prior — removes storage objects, profile row (cascading to all related tables), and `auth.users` row.
  - Mobile: "Delete Account" section on AccountScreen with double-confirmation dialog ("Delete My Account" → "I Understand, Delete"), calls API then signs out.
- **Sign-out-all-devices:**
  - `signOutAll()` method in `auth.store.ts` calls `supabase.auth.signOut({ scope: "global" })`, resets all stores.
  - "Sign Out All Devices" button on AccountScreen with confirmation dialog.
- **Email change flow:** _Shelved (2026-04-04)._ UI and handler removed from AccountScreen. The server-side `supabase.auth.updateUser({ email })` call works and sends confirmation emails, but the iOS confirmation link redirect lands on `about:blank` in Safari due to a known limitation with custom URL scheme (`app.orzo.ios://`) server-side 302 redirects. Repeated testing also destabilizes the auth session. Not an Apple requirement. To re-enable: implement a hosted HTTPS redirect page or Universal Links, then restore the `handleChangeEmail` handler and "Change Email" UI on AccountScreen. See git history for the removed code.
- **MFA TOTP enrollment:**
  - "Security" section on AccountScreen: "Enable Two-Factor Authentication" → calls `supabase.auth.mfa.enroll({ factorType: "totp" })`, displays QR URI, accepts 6-digit verification code. "Disable" option with confirmation.
  - `MfaChallengeScreen.tsx`: dedicated screen for entering TOTP code during sign-in. Renders when `needsMfaVerify` is true (checked via `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`).
  - `App.tsx`: conditionally renders `MfaChallengeScreen` before the main app when MFA challenge is pending.
  - `auth.store.ts`: added `needsMfaVerify` state, MFA factor detection in `initialize()` and `onAuthStateChange`.

**WS-8 — Abuse controls & testing (complete):**

- **Token scrubbing:** Fastify Pino logger serializers configured in `app.ts` to redact the `Authorization` header from request logs.
- **API rate limiting:** `@fastify/rate-limit` installed and configured:
  - Global default: 100 requests/min per `userId` (falls back to IP for unauthenticated routes).
  - `POST /drafts/:draftId/parse`: 10/hour per user (expensive OpenAI Vision calls).
  - `POST /drafts`: 30/hour per user.
  - `POST /drafts/url`: 30/hour per user.
  - `onExceeded` logs `rate_limit_exceeded` event.
- **Auth event logging:** `EventType` union in `event-logger.ts` extended with `account_deletion_requested`, `auth_middleware_failure`, `rate_limit_exceeded`.
- **Integration tests:** `server/tests/auth-security.test.ts` — 12 Vitest tests covering auth middleware (401 for missing/invalid token, 200 with correct `request.userId`, `/health` public access) and IDOR prevention (cross-user 404 for recipes, collections, drafts).
- **Security checklist:** `docs/SECURITY_CHECKLIST.md` — comprehensive manual checklist covering Supabase dashboard settings, Apple/Google developer accounts, key rotation, human access, server hardening, storage, and data protection.
- **Supabase dashboard items:** Documented as checklist items — review rate limits, enable CAPTCHA (hCaptcha/Turnstile), customize email templates. These are dashboard-only configurations, not code changes.

**WS-7b — Post-TestFlight hardening (complete):**

- **Step-up authentication:** `server/src/middleware/step-up-auth.ts` provides:
  - `requireRecentAuth(maxAgeSeconds)`: preHandler that decodes JWT `iat` claim and returns 403 if the token is too old. Applied to account deletion (300s window).
  - `requireAal2IfEnrolled()`: preHandler that returns 403 if the user has MFA enrolled but session is not `aal2`.
  - Helper functions: `decodeJwtPayload()`, `getTokenIssuedAt()`, `getAuthAssuranceLevel()` for local JWT claim inspection without a remote call.
- **MFA recovery codes:**
  - `server/drizzle/0010_mfa_recovery_codes.sql`: migration creating `mfa_recovery_codes` table (`id`, `user_id` FK, `code_hash` SHA256, `used_at`, `created_at`) with RLS policies.
  - `server/src/services/mfa-recovery.service.ts`: generates 10 unique recovery codes, stores SHA256 hashes, returns plaintext codes. `verifyRecoveryCode()` checks hash and marks as used. `getRemainingCodeCount()` returns unused count.
  - API endpoints in `account.routes.ts`: `POST /account/recovery-codes` (generate, protected by `requireRecentAuth`), `POST /account/verify-recovery-code`, `GET /account/recovery-codes/remaining`.
  - Mobile API methods: `api.account.generateRecoveryCodes()`, `api.account.verifyRecoveryCode()`, `api.account.getRemainingRecoveryCodes()`.
- **Provider linking UI:** `LinkedRow` component on AccountScreen now shows interactive "Link" / "Unlink" buttons for Apple and Google providers. Calls `supabase.auth.linkIdentity()` / `unlinkIdentity()` with safety checks (cannot unlink last remaining provider).
- **Session device list:**
  - `server/drizzle/0011_user_sessions.sql`: migration creating `user_sessions` table (`id`, `user_id` FK, `device_info`, `ip_address`, `last_seen_at`, `created_at`) with RLS policy.
  - `server/src/services/session-tracker.service.ts`: `recordSession()` (upserts by user+device, deduplicating), `listSessions()`, `cleanupStaleSessions(days)`.
  - `auth.ts` middleware enhanced: records session (user agent + IP) after successful authentication (fire-and-forget, non-blocking).
  - `GET /account/sessions` endpoint returns all active sessions for the user.
  - Mobile API method: `api.account.getSessions()`.

**Schema changes:**

- `server/src/persistence/schema.ts`: added `mfaRecoveryCodes` and `userSessions` table definitions.
- Migrations `0010` and `0011` bring the total to 12 database migrations (0000–0011).
- Database now has 13 public tables (added `mfa_recovery_codes` and `user_sessions`).

**New files created:**

- `server/src/api/account.routes.ts` — account management endpoints (deletion, recovery codes, sessions)
- `server/src/middleware/step-up-auth.ts` — JWT claim inspection and step-up auth helpers
- `server/src/services/mfa-recovery.service.ts` — MFA backup code generation and verification
- `server/src/services/session-tracker.service.ts` — user session tracking service
- `server/scripts/migrate-storage-user-scoped.ts` — storage path migration script
- `server/scripts/hard-delete-accounts.ts` — 30-day hard delete cron script
- `server/tests/auth-security.test.ts` — auth middleware and IDOR integration tests
- `server/Dockerfile` — production container build
- `mobile/src/screens/MfaChallengeScreen.tsx` — MFA TOTP challenge screen for sign-in
- `docs/SECURITY_CHECKLIST.md` — manual security audit checklist
- `docs/PRODUCTION_DEPLOY.md` — cloud deployment guide
- `server/drizzle/0010_mfa_recovery_codes.sql` — MFA recovery codes table migration
- `server/drizzle/0011_user_sessions.sql` — user sessions table migration

**Files modified:**

- `server/src/services/recipe-image.service.ts` — private buckets, signed URLs, user-scoped paths, `deleteAllUserStorage`
- `server/src/api/recipes.routes.ts` — async `resolveImageUrls`, `userId` to image service calls
- `server/src/api/collections.routes.ts` — async `resolveImageUrls`
- `server/src/api/drafts.routes.ts` — async signed URLs, user-scoped draft page paths, removed public URL fallback, rate limiting
- `server/src/app.ts` — registered `accountRoutes`, `@fastify/rate-limit`, Pino header redaction
- `server/src/middleware/auth.ts` — session recording after successful auth
- `server/src/observability/event-logger.ts` — new auth event types
- `server/src/persistence/schema.ts` — `mfaRecoveryCodes` and `userSessions` tables
- `server/tests/integration.test.ts` — updated mocks for private buckets and `createSignedUrl`
- `mobile/src/screens/AccountScreen.tsx` — email change, sign-out-all, MFA enrollment/unenrollment, account deletion, provider linking UI, security section
- `mobile/src/stores/auth.store.ts` — `needsMfaVerify` state, `signOutAll()` method, MFA assurance level checks
- `mobile/src/services/api.ts` — `api.account.*` methods (deleteAccount, generateRecoveryCodes, verifyRecoveryCode, getRemainingRecoveryCodes, getSessions)
- `mobile/App.tsx` — `MfaChallengeScreen` conditional rendering

**Cross-cutting items documented (not yet implemented — tracked for future work):**

- **C1: Local JWT verification** — switching from `supabase.auth.getUser(token)` (remote call, ~100-200ms) to local HS256 JWT verification with `SUPABASE_JWT_SECRET`. Recommended before public launch; accepts 10-min revocation window.
- **C2: Password policy verification** — confirm Supabase dashboard minimum matches the mobile hint (12 chars).
- **C3: Apple client secret expiry** — ES256 JWT expires ~October 2026. Added to `docs/SECURITY_CHECKLIST.md`.

---

### 2026-04-04 — Fix: email change redirect URL + UX feedback

- **`emailRedirectTo` added** to `supabase.auth.updateUser()` call in `AccountScreen.tsx` — now passes `"app.orzo.ios://auth/callback"`, matching sign-up and forgot-password flows. Without this, Supabase fell back to the dashboard "Site URL" (`localhost:3000`), causing the confirmation link to land on the Fastify server and show "Authentication required."
- **UX improvement:** form collapses before the alert appears, providing immediate visual feedback that the action succeeded. Alert text updated to explain dual-confirmation requirement.
- **Supabase dashboard action needed:** Set "Site URL" to `app.orzo.ios://auth/callback` and add it to the "Redirect URLs" allowlist to prevent this class of issue for any flow that doesn't explicitly pass `emailRedirectTo`.

---

### 2026-04-03 — WS-4: Mobile authentication (complete)

Mobile app now authenticates users end-to-end. All three auth methods (Apple, Google, email/password) are functional and tested on a physical iPhone. The app is auth-gated — unauthenticated users see onboarding → auth screens; authenticated users see the main app.

**Dependencies installed (mobile):**

- `@supabase/supabase-js` — Supabase client SDK
- `react-native-keychain` — secure iOS Keychain session storage
- `@invertase/react-native-apple-authentication` — native Apple Sign-In
- `@react-native-google-signin/google-signin@16.1.2` — native Google Sign-In
- `react-native-get-random-values@^1.11.0` — `crypto.getRandomValues` polyfill for Hermes
- `react-native-url-polyfill` — `URL` API polyfill for Hermes (Supabase client requires it)
- `js-sha256` — lightweight SHA-256 for Apple Sign-In nonce security
- `jwt-decode` — JWT decoding for Google Sign-In nonce extraction

**New files created:**

- `mobile/src/services/supabase.ts` — Supabase client with `react-native-keychain` storage adapter, anon key config, `detectSessionInUrl: false`
- `mobile/src/stores/auth.store.ts` — Zustand store: `session`, `user`, `isLoading`, `isAuthenticated`, `pendingPasswordReset`, `initialize()`, `signOut()` (clears all stores + Keychain)
- `mobile/src/screens/OnboardingScreen.tsx` — 3-card swipeable carousel (Camera, FolderOpen, ChefHat icons), "Skip" / "Get Started", sets AsyncStorage flag
- `mobile/src/screens/AuthScreen.tsx` — social-first login hub: Apple Sign-In (with SHA-256 nonce security), Google Sign-In (with `iosClientId` + `webClientId`), email sign-in/sign-up links
- `mobile/src/screens/SignInScreen.tsx` — email/password form with show/hide toggle, "Forgot password?" link
- `mobile/src/screens/SignUpScreen.tsx` — email registration with display name, 12-char password minimum hint, email confirmation redirect
- `mobile/src/screens/ForgotPasswordScreen.tsx` — password reset email request via `resetPasswordForEmail()` with `redirectTo`
- `mobile/src/screens/EmailConfirmationScreen.tsx` — "Check your inbox" screen with resend capability
- `mobile/src/screens/ResetPasswordScreen.tsx` — standalone new-password form (rendered by four-state root on deep link recovery)
- `mobile/src/screens/AccountScreen.tsx` — profile display (avatar/initial, name, email), linked providers list, sign-out with confirmation, app version
- `mobile/src/navigation/types.ts` — `AuthStackParamList` (Onboarding, Auth, SignIn, SignUp, ForgotPassword, EmailConfirmation) + `Account` route in `RootStackParamList`
- `mobile/ios/Orzo/Orzo.entitlements` — Apple Sign-In capability

**Files modified:**

- `mobile/App.tsx` — **rewritten**: four-state auth-gated navigation (splash → AuthStack / ResetPasswordScreen / AppStack), deep link handler parsing Supabase hash fragments (`#access_token=...&type=recovery`), `AppPoller` and `PendingImportsBanner` moved inside `AppStack` (prevents unauthenticated API calls), `reconcileQueue()` triggered on auth state change
- `mobile/src/services/api.ts` — `authenticatedFetch()` wrapper injects `Authorization: Bearer <token>` on **all** requests (including 4 raw `fetch` calls for multipart uploads). Single-flight token refresh lock (`refreshOnce()`) prevents concurrent `refreshSession()` storms. 401 retry with one refresh attempt; on failure, triggers `signOut()`.
- `mobile/src/stores/recipes.store.ts` — added `reset()` method
- `mobile/src/stores/collections.store.ts` — added `reset()` method
- `mobile/src/stores/importQueue.store.ts` — added `reset()` method + `reconcileQueue()` guarded with auth session check (prevents unauthenticated API calls on rehydration), exported `reconcileQueue` for App.tsx
- `mobile/src/screens/HomeScreen.tsx` — profile avatar circle (top-right header), navigates to AccountScreen, shows user initial or avatar image, orange theme matching FAB
- `mobile/ios/Orzo/Info.plist` — added `CFBundleURLTypes` (URL schemes: `app.orzo.ios` for auth callbacks, reversed Google iOS Client ID for Google Sign-In), `GIDClientID`
- `mobile/ios/Orzo.xcodeproj/project.pbxproj` — `CODE_SIGN_ENTITLEMENTS` added to Debug + Release build configs

**Supabase dashboard configuration (required, not in code):**

- Apple provider: Bundle ID set to `app.orzo.ios` (not `app.orzo.ios.auth`)
- Google provider: "Skip nonce check" enabled (Google Sign-In SDK v16 generates internal nonces not exposed to JS)
- Redirect URL added: `app.orzo.ios://auth/callback`
- Email verification: enabled (sign-up requires email confirmation)

**Tested and verified on physical iPhone:**

- Apple Sign-In with nonce security (SHA-256 hash to Apple, hash to Supabase)
- Google Sign-In with `iosClientId` + `webClientId` configuration
- Email/password sign-up with email verification flow
- Password validation (rejects passwords not meeting requirements)
- Sign-out clears all stores and Keychain, returns to auth screen
- Profile avatar displays on home screen, navigates to account page
- Onboarding carousel shown on first launch, skipped on subsequent launches
- Auth-gated navigation prevents unauthenticated API access
- New user signup triggers Postgres `handle_new_user` trigger → profile auto-created

**What remains (pre-TestFlight):**

- ~~WS-6/7/8~~ — **All complete.** See 2026-04-04 changelog entry above.
- Email templates: Supabase sends unbranded confirmation/reset emails; customize in dashboard > Authentication > Email Templates
- Production deployment: Fastify server needs cloud hosting before TestFlight (Dockerfile and guide ready in `docs/PRODUCTION_DEPLOY.md`)

---

### 2026-04-03 — Authentication infrastructure, user ownership & Row Level Security

Server-side auth is now **live**. Every API endpoint (except `/health`) requires a valid Supabase access token in the `Authorization: Bearer <token>` header. All user data is scoped to the authenticated user. Postgres Row Level Security (RLS) is enabled on all 11 public tables as a defense-in-depth layer.

**Database (migrations `0008_auth_profiles_user_id` + `0009_rls_policies`):**

- **`profiles` table** — maps 1:1 with `auth.users` via FK `profiles_id_auth_users_fk` (CASCADE). Columns: `id` (uuid PK, matches auth UID), `display_name`, `avatar_url`, `subscription_tier` (default `'free'`), `subscription_expires_at`, `deleted_at` (for future soft-delete), `created_at`, `updated_at`.
- **Postgres trigger** `on_auth_user_created` — fires `AFTER INSERT ON auth.users`, auto-creates a `profiles` row pulling `display_name` and `avatar_url` from `raw_user_meta_data`. Defined via `handle_new_user()` (SECURITY DEFINER, `search_path = public`).
- **`user_id` column** added to `recipes`, `collections`, `drafts`, `recipe_notes` — each is `uuid NOT NULL`, FK to `profiles(id)`, with B-tree index (`idx_<table>_user_id`).
- **Seed user backfill** — a migration-only user (`migration-seed@getorzo.com`, id `2a739cca-69b9-4385-801f-946cd123041c`) was created via the Supabase Admin API. All 211 existing rows (9 recipes, 7 collections, 195 drafts, 0 notes) were assigned to this user. The seed user is banned for 100 years and cannot authenticate.
- **Row Level Security** enabled on all 11 public tables with 41 policies total. All policies target the `authenticated` role only; the `anon` role gets zero access. Direct-`user_id` tables (profiles, recipes, collections, drafts, recipe_notes) use `auth.uid() = user_id`. Child tables (draft_pages, draft_warning_states, recipe_collections, recipe_ingredients, recipe_steps, recipe_source_pages) use `EXISTS` subqueries via parent FK. The `service_role` used by Fastify bypasses RLS by design — code-level scoping is the primary defense.

**Server — auth middleware (`server/src/middleware/auth.ts`):**

- Fastify `onRequest` hook extracts `Bearer` token, verifies via `supabase.auth.getUser(token)`, and sets `request.userId`. Returns 401 for missing/invalid tokens. `/health` is exempt.
- Type augmentation: `FastifyRequest` extended with `userId: string`.
- Registered in `app.ts` before all route plugins.

**Server — repository layer (user scoping):**

- `collections.repository.ts` — all 5 methods (`create`, `list`, `findById`, `update`, `delete`) now accept `userId` and filter/insert accordingly using `and(eq(...), eq(...))`.
- `drafts.repository.ts` — `create()` includes `userId` in INSERT; `findById(id, userId)` scopes by user; new `findByIdInternal(id)` for background tasks (no user filter). System methods (`resetStuckParsingDrafts`, `deleteOldCancelledDrafts`) remain unscoped.
- `recipes.repository.ts` — `SaveRecipeInput` includes `userId`; `save()` inserts it; `findById(id, userId)`, `list(userId)`, `listByCollection(collectionId, userId)` scope by user; `update()` accepts optional `userId` for WHERE clause defense-in-depth.
- `recipe-notes.repository.ts` — all 5 methods (`listByRecipeId`, `findById`, `create`, `update`, `delete`) accept `userId` and scope accordingly.

**Server — route layer:**

- `drafts.routes.ts` — all handlers pass `request.userId` to repository calls; `create` includes `userId`; `save` route passes `userId` to `recipesRepository.save()`. Background parse (`runParseInBackground`) uses `findByIdInternal` (already authenticated at initiation).
- `recipes.routes.ts` — all recipe CRUD, image, collection assignment, notes CRUD, and rating handlers pass `request.userId`. Cross-user access returns 404 (not 403) per the security plan.
- `collections.routes.ts` — all handlers pass `request.userId`.

**Supabase configuration (WS-1, completed in prior session):**

- Auth providers enabled: Email/password, Sign in with Apple, Google OAuth.
- JWT access token TTL: 600 seconds (10 minutes).
- Refresh token rotation enabled with reuse detection.
- User sessions: inactivity timeout 7 days.
- Password policy: minimum 8 characters.
- MFA: TOTP (app authenticator) enabled, max 10 factors.
- Apple Services ID (`app.orzo.ios.auth`) configured with `.p8` key-based client secret (expires ~6 months, renewal needed).
- Google Cloud OAuth clients created (Web Application + iOS).
- iOS Bundle ID: `app.orzo.ios` (updated from default React Native identifier).

**Files created:**

- `server/src/middleware/auth.ts`
- `server/drizzle/0008_auth_profiles_user_id.sql`
- `server/drizzle/0009_rls_policies.sql`
- `server/scripts/migrate-0008-backfill.ts`
- `server/scripts/run-0008-phase1.ts`
- `server/scripts/run-0009-rls.ts`
- `server/scripts/verify-0008.ts`
- `server/scripts/verify-0009-rls.ts`

**Files modified:**

- `server/src/persistence/schema.ts` — profiles table + userId on 4 tables + indexes
- `server/src/persistence/collections.repository.ts` — userId scoping
- `server/src/persistence/drafts.repository.ts` — userId scoping + `findByIdInternal`
- `server/src/persistence/recipes.repository.ts` — userId scoping
- `server/src/persistence/recipe-notes.repository.ts` — userId scoping
- `server/src/api/drafts.routes.ts` — pass `request.userId`
- `server/src/api/recipes.routes.ts` — pass `request.userId`
- `server/src/api/collections.routes.ts` — pass `request.userId`
- `server/src/app.ts` — register auth middleware
- `server/drizzle/meta/_journal.json` — entries 8 and 9
- `mobile/ios/Orzo.xcodeproj/project.pbxproj` — bundle ID `app.orzo.ios`
- `mobile/run.sh` — bundle ID + `-allowProvisioningUpdates`

**What remains for full auth:** ~~WS-4 through WS-8~~ — **All complete.** See 2026-04-04 and 2026-04-03 (WS-4) changelog entries above.

See `docs/AUTH_RLS_SECURITY_PLAN.md` and the ROADMAP Phase 0.1 for the complete plan.

---

### 2026-03-31 — Servings, structured ingredients & dynamic scaling

Recipes now capture **baseline servings** (how many the recipe makes) and store ingredients with **structured fields** (`amount`, `amountMax`, `unit`, `name`, `raw`, `isScalable`). The detail screen shows an interactive **servings stepper** that scales ingredient amounts in real time.

**Database (migration `0007_structured_ingredients_servings`):**

- `recipes.baseline_servings` — nullable `numeric` column.
- `recipe_ingredients` — 6 new columns: `amount` (numeric), `amount_max` (numeric), `unit` (text), `name` (text), `raw_text` (text), `is_scalable` (boolean, default false).

**Shared types:**

- `Recipe.baselineServings: number | null`.
- `RecipeIngredientEntry` — added `amount`, `amountMax`, `unit`, `name`, `raw`, `isScalable`.
- `ParsedIngredientEntry` and `EditableIngredientEntry` — same structured fields.
- `ParsedRecipeCandidate.servings: number | null`.
- `EditedRecipeCandidate.servings: number | null`.
- New `ValidationIssueCode`: `SERVINGS_MISSING`.

**Server — parsing:**

- **Deterministic ingredient parser** (`server/src/parsing/ingredient-parser.ts`): regex/rules-based decomposition of ingredient text into `{ amount, amountMax, unit, name, isScalable }`. Handles fractions, unicode fractions, mixed numbers, ranges, unit canonicalization, and non-scalable lines (e.g. "salt to taste", "vegetable oil for deep frying"). Used by the URL structured adapter on JSON-LD/microdata ingredient strings and by **Rule A** (re-parse on saved recipe edit).
- **GPT prompts updated** (`image-parse.adapter.ts`, `url-ai.adapter.ts`): JSON schema now requests a top-level `servings: { min, max }` object and per-ingredient structured fields (`amount`, `amountMax`, `unit`, `name`).
- **URL structured adapter** (`url-structured.adapter.ts`): `parseYieldToServings()` converts `recipeYield` strings (JSON-LD/microdata) to numeric servings. Accepts "4", "serves 6", "6 people", "4 portions", "Makes 8", etc. Rejects non-person yields ("1 loaf", "24 cookies"). `parseIngredientLine()` runs on extracted ingredient text strings to populate structured fields.
- **DOM boundary extractor** (`url-dom.adapter.ts`): secondary scan for recipe metadata elements (`[class*="recipe-info"]`, `[class*="recipe-meta"]`, etc.) when the richest recipe body doesn't contain a serving count. Prepends metadata (e.g. "Prep 30 min Cook 12 hr Serves 6 people") so the AI sees servings context.
- **Smart truncation** (`url-ai.adapter.ts`): added "serves" and "servings" to section keywords so the truncation window starts from serving info rather than cutting it off.
- **Normalization** (`normalize.ts`): `RawExtractionResult` and `RawIngredient` carry structured fields and `servings`. `normalizeToCandidate` maps them to `ParsedRecipeCandidate`, taking the `min` value for ranges.
- **URL parse orchestration** (`url-parse.adapter.ts`): carries `fallbackServings` from structured data (if it fails the quality gate) and merges into the AI result.

**Server — validation:**

- **`rules.servings.ts`** (new): emits `SERVINGS_MISSING` with `BLOCK` severity if `candidate.servings` is null or not > 0. Wired into `validation.engine.ts` (7 → 8 rule modules).
- **`issueDisplayMessage.ts`**: user-facing message for `SERVINGS_MISSING`.

**Server — persistence:**

- **`drafts.repository.ts`**: `setParsedCandidate` includes `servings` when creating the `editedCandidateJson`.
- **`drafts.routes.ts`**: `PATCH /candidate` accepts `servings` and maps structured ingredient fields in the revalidation candidate. `POST /save` extracts `baselineServings` from the edited or parsed candidate and passes structured ingredient fields to `recipesRepository.save`.
- **`recipes.repository.ts`**: `save()` inserts `baseline_servings` and all structured ingredient columns. `findById()` and `list()` parse `baselineServings` from string to number. `update()` runs the deterministic **ingredient parser (Rule A)** on each ingredient text, populating structured fields on every saved-recipe edit.
- **`recipes.routes.ts`**: `PUT /recipes/:id` accepts `baselineServings`.

**Mobile — import flow:**

- **`PreviewEditView.tsx`**: "Servings" section with `TextInput` between Title and Ingredients. Displays `candidate.servings` and shows `SERVINGS_MISSING` validation warnings. `handleServingsChange` updates the candidate and triggers revalidation.
- **`machine.ts`**: `EDIT_CANDIDATE` event carries `validationResult` from the PATCH response. The `editedCandidate` derivation copies `servings` through from the parsed candidate.
- **`ImportFlowScreen.tsx`**: `candidateSyncPending` state prevents saving while the PATCH revalidation is in flight.

**Mobile — scaling engine (`mobile/src/utils/scaling.ts`):**

- `scaleAmount(amount, factor)`: multiplies an amount by the scaling factor.
- `formatAmount(value)`: formats a number as a mixed number with unicode fractions rounded to the nearest ⅛ (e.g. 1.75 → "1 ¾", 0.333 → "⅓").
- `scaleIngredient(ingredient, factor)`: applies scaling. Headers stay verbatim. Non-scalable or amount-less lines return `raw ?? text`. Scalable lines produce `"{scaled amount} {unit} {name}"` with range support.

**Mobile — RecipeDetailScreen:**

- **Servings control**: `TextInput` (free-type, 0.25–99 bounds) with +/− stepper buttons and a "Reset" link. Gated on `baseline != null` — only appears for recipes that have a saved `baselineServings`.
- **Scaled ingredients**: `scaleIngredient()` renders each ingredient with the current `scaleFactor` (computed as `displayServings / baseline`). Display servings are ephemeral (reset to baseline on recipe open).
- `useMemo` hooks for `displayServings` and `scaleFactor` are called unconditionally at the top level (before conditional returns) to avoid React Rules of Hooks violations.
- `refreshRecipe` callback syncs `displayServingsText` with the latest baseline when returning from the edit screen.

**Mobile — RecipeEditScreen:**

- "Servings" `TextInput` field between Title and Description, initialized from `recipe.baselineServings`. On save, `baselineServings` is parsed and included in the `api.recipes.update()` payload.

**Mobile — API client (`api.ts`):**

- `api.recipes.update` body type includes `baselineServings?: number | null`.

**Tests:**

- `validation.engine.test.ts`: `makeCandidate` helper includes `servings: 4` and structured ingredient fields. Header ingredient test includes full structured shape.
- `integration.test.ts`: `cleanCandidate` includes `servings: 4` and structured ingredient fields.

**Bug fixes during implementation:**

- **DB migration not applied**: the 0007 migration SQL was written but never executed against the database. Applied manually via a node script (columns didn't exist, so servings could never persist).
- **`save()` return mapping**: Drizzle `numeric` columns return strings; `save()` now converts `baselineServings` to `number` before returning.
- **React Rules of Hooks**: `useMemo` hooks in `RecipeDetailScreen` were after conditional early returns, causing 4 errors on recipe open. Moved to top level.
- **Validation state desync**: `handleEdit` in `ImportFlowScreen` wasn't passing the server's `validationResult` to the XState `EDIT_CANDIDATE` event, so the client's save button could stay enabled with stale validation. Fixed by threading `validationResult` through the event and adding `candidateSyncPending` to disable save while the PATCH is in flight.
- **`parseYieldToServings` too restrictive**: rejected "6 people", "4 portions", "Makes 8". Widened to accept common person-yield keywords and default to person-based for unknown qualifiers (only explicitly non-person yields like "1 loaf" are rejected).
- **DOM boundary missing serving info**: recipe metadata (e.g. "Serves 6 people") often lives in a separate element outside the main recipe body. Added secondary scan for `[class*="recipe-info"]` etc. and prepend to extracted text.
- **TypeScript errors**: fixed `drafts.routes.ts` image update spread (baselineServings type mismatch), and test fixtures missing structured fields.

---

### 2026-03-30 — Import Hub: retake photo finishes cleanly (camera dismisses)

When a queued import needed a **retake** and the user opened the flow from **Import Hub**, tapping **Done** after capturing a new photo incorrectly called the **new-import enqueue** path. That started a **second** queue entry while the XState machine stayed on **capture**, so the **camera UI stayed full-screen** and the experience felt like the import “restarted.”

**Mobile (`ImportFlowScreen.tsx`):**

- If **`draftId`** and **`retakePageId`** are set (retake from **`retakeRequired`**), **Done** / reorder **Confirm** now **`POST`** the image via **`api.drafts.retakePage`**, then trigger parse like other image flows.
- **From hub:** the **same** queue row moves to **`parsing`** immediately (thumbnail updated, **`preReviewStatus`** cleared), then **`navigation.goBack()`** when possible (else **`navigate("ImportHub")`**).
- **Not from hub:** **`send({ type: "RETAKE_SUBMITTED", imageUri })`** so the machine enters **`parsing`** and the existing **`parseDraft`** actor runs.

**Mobile (`machine.ts`):**

- **`RETAKE_PAGE`** now includes **`pageId`** and assigns **`context.retakePageId`** (wired from **`RetakeRequiredView`** per page).
- **`resumeDraft`** **`pages`** typing: **`ServerDraftPageRow`** + casts so **`tsc`** accepts **`serverPagesToCaptured`**.

---

### 2026-03-30 — Collection folder rename & delete

Users can **rename** folders (collections) and **delete** them. Renaming updates the stored `collections.name` and, on the client, the Lucide folder icon/color via existing keyword rules in **`collectionIconRules.ts`** (no icon field in the DB). Deleting a folder removes the `collections` row; **`recipe_collections`** join rows cascade-delete, so **recipes are not deleted**—they become uncategorized and appear again on the home grid (home lists only recipes with **no** collection assignment when not searching).

**API (`server/src/api/collections.routes.ts`):**

- **`PATCH /collections/:id`** — body `{ name: string }` (trimmed, required). Returns updated `{ id, name }`. **400** if name empty; **404** if collection missing.
- **`DELETE /collections/:id`** — unchanged behavior; responds **204** with **no JSON body**.

**Server (`server/src/persistence/collections.repository.ts`):**

- New **`update(id, name)`** — sets `name` and `updatedAt`.

**Server (`server/src/api/recipes.routes.ts`):**

- **`PATCH /recipes/:id/collection`** — before inserting into `recipe_collections`, verifies the collection exists via **`collectionsRepository.findById`**; **404** `{ error: "Collection not found" }` if the client targets a deleted folder (avoids opaque FK/500 errors).

**Mobile API (`mobile/src/services/api.ts`):**

- **`collections.update(id, name)`** — `PATCH` with JSON body.
- **`collections.delete`** — uses raw **`fetch`** and does **not** call **`response.json()`** on success (204 empty body). Shared **`request()`** parses errors using **`message`** or **`error`** from JSON for clearer **`ApiError`** text (Fastify route-not-found uses **`message`**).

**Mobile store (`mobile/src/stores/collections.store.ts`):**

- **`updateCollection`**, **`deleteCollection`**. After delete, calls **`useRecipesStore.getState().fetchRecipes()`** so home reflects uncategorized recipes. **`updateCollection`** guards against a null JSON body.

**Mobile UI:**

- **`CreateCollectionSheet`** — props **`mode: "create" | "rename"`**, **`initialName`**, **`onSubmit`**. Live icon preview when the name is non-empty. Rename errors: if **404** looks like an unregistered route (`Route PATCH:…`), alert explains **restart the dev API** or deploy the latest server.
- **`RecipeQuickActionsSheet`** — optional **`emphasisLabel`** for the accent line (folder name vs recipe title).
- **`DeleteCollectionConfirmSheet`** (same module as recipe quick-actions) — bottom-sheet confirm matching existing destructive styling; explains recipes move to home, not deleted.
- **`HomeScreen`** — **long-press** ( **`delayLongPress={400}`** ) on non-virtual folder chips → rename / delete; create flow uses **`mode="create"`**.
- **`CollectionScreen`** — **`MoreHorizontal`** header menu when **`!isAllRecipes`**; same rename/delete sheets; **`getRecipes`** **404** → alert + **`goBack()`**; collection picker assign/remove handles **404** with refetch + alert.
- **`RecipeEditScreen`** — **`useFocusEffect`** → **`fetchCollections()`** so folder chip labels stay fresh after renames elsewhere.

**Handoff notes for the next developer/AI:**

- **No new DB migration** — `collections` already had `name` and `updated_at`.
- **Restart the API** after pulling this work (`npm run dev:phone` or server workspace). A stale Node process returns Fastify **404** `Route PATCH:/collections/:id not found` — easy to mistake for an app bug.
- **Release builds** use **`https://api.getorzo.com`**; folder rename/delete requires that host to ship the same routes.
- Virtual **"All Recipes"** (`isAllRecipes` / `__all__`) has **no** folder menu or long-press folder actions.

---

### 2026-03-30 — Concurrent import queue (batch image imports)

Major feature: users can now import up to **3 image-based recipes concurrently**. After capturing or selecting a photo, the app immediately begins background parsing and offers "Import Another" so the user can queue additional imports while earlier ones parse. A dedicated **Import Hub** screen shows all queued imports and their statuses, and an app-wide **floating banner** indicates pending imports from any screen.

**Architecture — server-side background parsing:**

- `POST /drafts/:id/parse` now returns **`202 Accepted`** immediately for image imports, running the actual OpenAI Vision call in a **detached async function** (`runParseInBackground`). URL imports with browser-captured HTML still return results synchronously.
- **Parse concurrency semaphore** (`server/src/parsing/parse-semaphore.ts`): limits concurrent OpenAI Vision API calls to **2** to prevent rate-limit and resource exhaustion. Queued parse requests wait in a FIFO queue and are released in a `finally` block.
- **Idempotency guard** on `/parse`: rejects requests unless draft status is `READY_FOR_PARSE`, `CAPTURE_IN_PROGRESS`, or `NEEDS_RETAKE` (for retake re-parsing). Prevents duplicate parse triggers from race conditions or client retries.
- **Race-safe parse completion**: `setParsedCandidate()` uses a conditional `WHERE status = 'PARSING'` clause so a parse that finishes after the user cancelled the draft does not overwrite the `CANCELLED` status.
- **Save idempotency**: `POST /drafts/:id/save` rejects with `409` if the draft is already `SAVED`, preventing duplicate recipe creation on client retry.
- **Startup cleanup** (`server/src/app.ts`): on server boot, resets any zombie `PARSING` drafts (stuck from a previous crash) back to `READY_FOR_PARSE`, and deletes `CANCELLED` drafts older than 24 hours (with Supabase image cleanup).

**Database:**

- Migration **`0006_outgoing_beast.sql`**: adds nullable `parse_error_message` text column to `drafts`.
- **New draft statuses** in shared types: `PARSE_FAILED` and `CANCELLED` added to `DraftStatus` union.
- Postgres connection pool increased to `max: 20` (`server/src/persistence/db.ts`) to handle concurrent background parses.

**Server — new/modified endpoints:**

- `POST /drafts/:id/parse` — returns `202 Accepted` with `{ status: "PARSING" }` for image drafts; background work updates DB on completion or failure.
- `POST /drafts/:id/cancel` — sets draft status to `CANCELLED` and deletes associated Supabase Storage images. Used by the client to discard queued imports.
- `GET /drafts/:id` — pages now include `resolvedImageUrl` (full Supabase public URL) so the client can display page thumbnails when resuming drafts.

**Server — repository changes (`drafts.repository.ts`):**

- `setParsedCandidate()` accepts final `status` as a parameter and uses a conditional WHERE guard.
- New `setParseError()`: stores error message and sets status to `PARSE_FAILED`.
- New `resetStuckParsingDrafts()`: finds drafts stuck in `PARSING` for >10 minutes and resets them.
- New `deleteOldCancelledDrafts()`: removes `CANCELLED` drafts older than 24 hours.

**Server — resilience:**

- `OpenAI` client instantiated as a **module-scoped singleton** with `maxRetries: 2` for transient API errors (`image-parse.adapter.ts`).
- New event types in `event-logger.ts`: `parse_rejected_idempotent`, `parse_failed`, `draft_cancelled`, `startup_stuck_drafts_reset`, `startup_cancelled_drafts_cleaned`.

**Mobile — import queue store (`mobile/src/stores/importQueue.store.ts`):**

- New **Zustand** store with **`AsyncStorage` persistence** for managing concurrent import entries.
- `QueueEntry` interface: `localId` (client-generated UUID — stable key before `draftId` exists), nullable `draftId`, `status` (`uploading`, `parsing`, `parsed`, `needs_retake`, `parse_failed`, `reviewing`, `saving`), `thumbnailUri`, optional `title`, `addedAt` timestamp, optional `error`, `preReviewStatus`.
- Store methods: `addEntry`, `updateEntry`, `removeEntry`, `setReviewing`, `clearReviewing`, `canImportMore` (enforces 3-recipe limit).
- `reconcileQueue()` runs on rehydrate: polls each entry's server-side status, removes orphans, resets stale `reviewing` status.

**Mobile — queue poller (`mobile/src/features/import/importQueuePoller.ts`):**

- `useImportQueuePoller` hook: polls `GET /drafts/:id` for all `parsing`/`uploading` entries.
- **Exponential backoff**: 3s → 5s → 10s intervals.
- **AppState-aware**: pauses polling when the app is backgrounded, resumes on foreground.

**Mobile — enqueue function (`mobile/src/features/import/enqueueImport.ts`):**

- `enqueueImport()`: creates a local queue entry, calls `api.drafts.create()` + `api.drafts.addPage()` with **retry logic** (up to 2 attempts), triggers `api.drafts.parse()`.
- On final upload failure: calls `api.drafts.cancel()` to clean up server-side orphaned drafts and removes the local queue entry.

**Mobile — Import Hub (`mobile/src/screens/ImportHubScreen.tsx`):**

- New screen accessible via the floating banner or "Review Recipes" button.
- Displays `QueueCard` components for each queue entry with status-appropriate UI: shimmer for parsing, title + "Ready for review" for parsed, "Photo needs retake" for retake, "Couldn't read this photo" with Cancel for failed, muted state for reviewing/saving.
- "Import Another" button (shown when under the 3-recipe limit) navigates to Home with FAB auto-opened.
- Close button (X) in the header to navigate back to Home.
- Completion state: animated checkmark when the queue is empty, auto-navigates to Home after 3 seconds.
- Cancel entry: confirmation alert → `api.drafts.cancel()` + remove from queue.
- Review/retake: uses `navigation.push` (not `navigate`) to ensure a fresh `ImportFlowScreen` instance, preventing stale state.

**Mobile — Pending Imports Banner (`mobile/src/components/PendingImportsBanner.tsx`):**

- App-wide floating pill positioned at the **top-right** of the screen, aligned with the header subtitle.
- Shows on all screens **except** `ImportFlow`, `ImportHub`, and `WebRecipeImport`.
- Displays context-aware labels: "Parsing...", "1 ready", "2 ready", etc.
- **Blinking status dot**: orange while parsing, green when ready — opacity blinks between 100% and 15% for visibility.
- Tappable — navigates to Import Hub.
- Animated entry (spring slide-in from top).
- Uses `hitSlop` for easy tapping despite compact size.

**Mobile — ParsingView enhancements (`mobile/src/features/import/ParsingView.tsx`):**

- Accepts `queueEntries`, `onImportAnother`, and `onReviewRecipes` props.
- Shows queue status summaries: overlapping thumbnails and count text.
- "Import Another" button (if under limit) and "Review Recipes" button appear with a **2.5-second delayed fade-in** animation.

**Mobile — HomeScreen FAB changes:**

- Auto-opens the jar FAB when navigated to with `openFab: true` (from "Import Another" flows).
- Checks `canImportMore()` before launching new camera/photo imports; if at the 3-recipe limit, navigates directly to Import Hub.

**Mobile — ImportFlowScreen changes:**

- **Concurrent flow path**: all camera/photo library imports now call `enqueueImport()` and display the queue-aware `ParsingView` instead of using the XState machine's upload/parse states.
- XState machine is used only for **URL imports** and **hub resume** (review/retake from Import Hub).
- `fromHub` parameter: when true, skips `SavedView` after save and navigates directly back to Import Hub; cancel navigates to Import Hub instead of Home; error alerts navigate to Import Hub.
- Hub review rendering: concurrent flow `ParsingView` is explicitly suppressed when `fromHub` is true, allowing the XState-driven `PreviewEditView` to render.

**Mobile — PreviewEditView:**

- New `otherReadyCount` prop: displays a subtle, non-interactive "X more recipes ready" indicator between the hero image and the cancel button when reviewing from the hub.

**Mobile — XState machine changes (`machine.ts`):**

- `PARSE_FAILED` and `CANCELLED` added to `STATUS_TO_STATE` mappings (both → `idle`).
- `parseDraft` actor handles the server's `202 Accepted` response: enters a **polling loop**, calling `GET /drafts/:id` every 3 seconds until a terminal status is reached. Throws on `PARSE_FAILED` or `CANCELLED`.
- `CapturedPage` interface: added optional `retakeCount` field.
- **All three resume transition handlers** (`capture`, `previewEdit`, `retakeRequired`) now populate `capturedPages` from the server response pages — including `resolvedImageUrl` for display and `retakeCount`. This fixes: (a) retake screen showing no buttons when resumed from hub, (b) missing hero image in preview when resumed from hub.

**Mobile — navigation:**

- `ImportHub: undefined` added to `RootStackParamList`.
- `Home` params: optional `openFab?: boolean`.
- `ImportFlow` params: optional `fromHub?: boolean`.
- `navigationRef` created via `createNavigationContainerRef` in `App.tsx`, passed to `NavigationContainer` and `PendingImportsBanner`.

**Mobile — App.tsx:**

- Wrapped app tree in `SafeAreaProvider` (required for `PendingImportsBanner` which uses `useSafeAreaInsets` outside the navigator).
- Registered `ImportHubScreen` as a `fullScreenModal` screen.
- Mounted `PendingImportsBanner` and `useImportQueuePoller` (via `AppPoller` component) at the root level.

**Mobile — API client (`api.ts`):**

- `parse()` return type updated: `candidate` and `validationResult` are now optional (to handle `202` responses).
- New `cancel(draftId)` method: `POST /drafts/:id/cancel`.

**Dependencies:**

- `@react-native-async-storage/async-storage` added for queue persistence (pods installed, native build updated).

**Bug fixes during implementation:**

- `SafeAreaProvider` wrapping: `PendingImportsBanner` called `useSafeAreaInsets` outside the provider context, crashing the app on load.
- `navigation.push` vs `navigate` for hub reviews: reusing the same `ImportFlowScreen` instance retained stale `isConcurrentFlow` state, causing hub reviews to show `ParsingView` instead of `PreviewEditView`.
- Populated `capturedPages` on XState resume: without server page data, the retake screen had no pages to display (empty FlatList, no retake buttons), and the hero image in preview was null.
- Draft page `resolvedImageUrl`: server `GET /drafts/:id` now resolves Supabase public URLs for each page so resumed drafts can display page thumbnails.

### 2026-03-30 — Recipe hero images, Supabase services refactor, mobile UI polish

**Database**

- Migration **`0005_recipe_image_url`**: nullable **`image_url`** on **`recipes`** (storage-relative key for hero assets).

**Server**

- **`server/src/services/supabase.ts`**: shared Supabase client (replaces ad-hoc client creation in draft routes).
- **`server/src/services/recipe-image.service.ts`**: public **`recipe-images`** bucket (auto-created when missing), **`hero.jpg`** + **`thumb.jpg`** per recipe, upload/delete, **`resolveImageUrls`** for API JSON (`imageUrl` / `thumbnailUrl` public URLs).
- **`recipes.routes.ts`**: **`POST /recipes/:id/image`** (multipart), **`DELETE /recipes/:id/image`**; list/get/put/patch responses enrich recipes with resolved image URLs; **recipe delete** attempts storage cleanup (warns on failure).
- **`collections.routes.ts`**: recipes-by-collection responses use the same image URL resolution.
- **`drafts.routes.ts`**: uses shared Supabase + recipe-image helpers for draft page storage and image propagation where applicable.
- **`image-optimizer.ts`**: hero/thumbnail optimization alongside existing upload/OCR paths.
- **`recipes.repository.ts`**: **`setImage`** and related persistence.
- Minor updates across validation **`rules.*`** modules.
- **`integration.test.ts`**: coverage for new recipe image behavior.

**Shared**

- **`Recipe`**: optional **`imageUrl`** and **`thumbnailUrl`** on API-shaped payloads (resolved URLs for clients).

**Mobile**

- **`api.ts`**: **`uploadImage`**, **`removeImage`** for recipe hero photos.
- New UI: **`RecipeCard`**, **`RecipeImagePlaceholder`**, **`ShimmerPlaceholder`**, **`FullScreenImageViewer`**, **`CollectionPickerSheet`**, **`CreateCollectionSheet`**, **`RecipeQuickActionsSheet`**.
- **`features/collections/collectionIconRules.ts`**: collection icon/color rules extracted for reuse.
- **`ParseRevealEdgeGlow`**, **`issueDisplayMessage`** for import preview polish.
- **`HomeScreen`**, **`CollectionScreen`**, **`RecipeDetailScreen`**, **`RecipeEditScreen`**, and several import views updated for images, sheets, and layout.
- Dependencies: **`react-native-fast-image`**, **`react-native-linear-gradient`**, **`react-native-compressor`**, **`react-native-image-picker`** (lockfiles / iOS pods updated as needed).

**Docs**

- **`README.md`**: hero image feature, `recipe-images` bucket, migration note, project tree, API counts.

### 2026-03-28 — iOS build fixes, draft API wire format, import preview reveal, repo hygiene

**iOS / native (RN 0.76, New Architecture):**

- **`patches/react-native-svg+15.15.4.patch`:** RNSVG Fabric code used removed Yoga type `StyleSizeLength`; patched to `StyleLength` so the pod compiles. Applied on every `npm install` via root `postinstall` (`patch-package`).
- **`mobile/ios/Podfile` `post_install`:** On case-insensitive APFS, CocoaPods can leave broken `Pods/Headers/Public/RCT-Folly/folly/json` (empty dir, `json 2`, or `dynamic 2.h`). The hook deletes `json` / `json 2` and recreates symlinks from `Pods/RCT-Folly/folly/json` so `#include <folly/json/dynamic.h>` resolves. Re-runs on every `pod install`.
- **`patches/react-native+0.76.9.patch`:** (existing) upstream RN patch; still applied by `patch-package`.

**Monorepo — `react-native-svg` single copy:**

- Root **`package.json` `overrides`:** `"react-native-svg": "15.15.4"` so Lucide and the app share one version.
- **`mobile/package.json`:** explicit `react-native-svg@15.15.4` (peer of `lucide-react-native`).
- **`mobile/metro.config.js`:** `resolver.extraNodeModules["react-native-svg"]` points at one resolved install path so Metro does not bundle two copies (duplicate native registration / LogBox errors).

**Server — draft JSON over the wire matches `RecipeDraft`:**

- Persistence still uses columns `parsed_candidate_json`, `edited_candidate_json`, `validation_result_json`.
- **`GET /drafts/:draftId`** and **`PATCH /drafts/:draftId/candidate`** responses now expose **`parsedCandidate`**, **`editedCandidate`**, **`validationResult`** (not `*Json` keys), plus `pages` and `warningStates` on GET. Implemented in `server/src/api/drafts.routes.ts` (`draftRowToClientFields` / `draftRowToClientBody`).
- **Mobile `import` machine** `resumeDraft` assigns from those field names so draft resume works on device.

**Mobile — import preview UX:**

- After a fresh parse, **`PreviewEditView`** runs a **word-by-word “waterfall” reveal** (~**6000 WPM**, `60000/6000` ms per word) via `useRecipeParseReveal` + `recipeParseReveal.ts`; respects **Reduce Motion** (shows full text immediately). **`parseRevealToken`** from `ImportFlowScreen` gates animation vs resume.
- Earlier experimental SVG edge-glow overlay was **removed** in this release; a dedicated **`ParseRevealEdgeGlow`** component returned in **2026-03-30** as optional import-preview polish.

**Mobile — type / library alignment:**

- **`RecipeRatingInput`:** `Pressable` uses **`unstable_pressDelay={0}`** (RN 0.76 types no longer list `delayPressIn`).
- **`CaptureView`:** `takePhoto()` without options — current VisionCamera typings dropped `qualityPrioritization` on `TakePhotoOptions`.
- **`PreviewEditView`:** new steps from **Add Step** include **`isHeader: false`** for `EditableStepEntry`.

**Server — TypeScript fixes (tooling drift):**

- **`url-dom.adapter.ts`:** `cheerio.AnyNode` removed from typings; use **`AnyNode` from `domhandler`**.
- **`url-ssrf-guard.ts`:** DNS `lookup` with `{ all: true }` typed as **`LookupAddress[]`**.

**Tests:**

- **`server/tests/machine.test.ts`:** resume mocks use `parsedCandidate` / `editedCandidate` / `validationResult` to match API client shape.
- **`server/tests/integration.test.ts`:** GET draft asserts `parsedCandidate` present and `parsedCandidateJson` absent on JSON body.

**Verification (2026-03-28):** `npx patch-package --check`; `npm run typecheck` in `shared`, `server`, `mobile`; `npm test -w @orzo/server` (127 tests).

### 2026-03-26 — Browser-backed URL import for blocked recipe sites

**Mobile — in-app browser (`WebRecipeImportScreen`):**

- **Save to Orzo** now attempts to capture the currently loaded page HTML from the WebView before leaving the browser.
- Save uses the final navigated top-level URL, disables double-submit while capture is in flight, and enforces a client-side HTML size cap before import handoff.
- If HTML capture fails technically (`injection_failed`, `capture_timeout`, `page_not_ready`, `payload_too_large`, `message_transport_failed`), the browser falls back once to the existing server-fetch URL import path.

**Mobile + server contract:**

- `ImportFlow`, `machine.ts`, and `api.ts` now carry optional browser-captured HTML and acquisition metadata for URL imports.
- `POST /drafts/:draftId/parse` accepts optional URL HTML plus acquisition metadata without storing raw HTML on the draft.

**Server — URL parsing:**

- Split URL fetch from URL HTML parsing in `server/src/parsing/url/url-parse.adapter.ts` so fetched HTML and browser-captured HTML share the exact same JSON-LD → Microdata → DOM → AI cascade.
- Added explicit acquisition-source logging for `webview-html`, `server-fetch`, and `server-fetch-fallback`.
- Added server-side HTML size rejection for oversized browser payloads.

**Tests + docs:**

- Added regression coverage for browser-backed URL parse, technical-failure fallback, and “do not silently retry via server fetch after successful HTML capture.”
- Updated `README.md` and `QA_CHECKLIST.md` so future agents can quickly trace the new browser-backed URL import path and its fallback rules.

### 2026-03-25 — WebView URL import, clipboard prompt, import UX

**Mobile — in-app browser (`WebRecipeImportScreen`):**

- Jar **URL** opens full-screen WebView: omnibar, refresh, back/forward, **Save to Orzo** → `ImportFlow` URL mode (`StackActions.replace`).
- Default search for typed queries uses Google (`NEUTRAL_SEARCH_TEMPLATE` in `webImportUrl.ts`).
- Blocks common ad/tracking hostnames in `onShouldStartLoadWithRequest` (top-frame and subframe).
- External schemes (`tel:`, `mailto:`, `sms:`, `intent:`) prompt before `Linking.openURL`.

**Mobile — Home clipboard sheet (`ClipboardRecipePrompt`):**

- Shows when `Clipboard.hasString()` is true after focus delay; **Paste** calls `getString()` and validates URL via `parseClipboardForHttpsUrl`.
- Session suppression after paste or dismiss: module-level flag + ref; reset only on `AppState` **background** → **active** (not `inactive` → `active`, so iOS paste dialogs do not clear suppression).

**Mobile — other:**

- **Recipe Saved** → **Add more**: URL import path returns to `WebRecipeImport`; image import returns to `ImportFlow` `{ mode: "image" }`.
- Dependencies: `react-native-webview`, `@react-native-clipboard/clipboard`; `WebRecipeImport` route in `App.tsx` / `types.ts`.

**Docs:**

- README: WebView + clipboard + Add more behavior; **Known gaps** expanded for headless browser / client-side HTML extraction for bot-protected sites.

### 2026-03-22 — Image optimization pipeline

- Added `sharp`-based server-side image processing (`server/src/parsing/image/image-optimizer.ts`)
- `optimizeForUpload`: auto-orient, resize ≤3072px, JPEG 85% — runs at upload time before Supabase Storage
- `optimizeForOcr`: auto-orient, resize ≤3072px, JPEG 90% — runs at parse time, images sent as base64 data URLs to OpenAI
- Removed client-side `react-native-compressor` (caused native OOM crashes on high-res camera output)
- Changed `qualityPrioritization` from `"quality"` to `"balanced"` in `react-native-vision-camera` capture
- Upgraded image parsing model from GPT-5.3 to GPT-5.4 with `detail: "high"` for accurate fraction reading
- Tested and removed classical OCR preprocessing (grayscale, CLAHE, sharpen) — degraded neural vision model accuracy
- 3072px resolution required for reliable fraction reading; 2048px caused consistent ⅓→½ misreads across gpt-4o and gpt-4o-mini

### 2026-03-22 — User notes and star rating

**Shared types:**
- Added `RecipeNote` interface (`id`, `text`, `createdAt`, `updatedAt`) and `NOTE_MAX_LENGTH = 250` constant in `shared/src/constants.ts`
- Extended `Recipe` with `rating: number | null` (0.5–5.0 in half steps, or null for unrated) and `notes: RecipeNote[]` (populated on `GET /recipes/:id`, empty array on list endpoints)

**Database (migration 0004):**
- Created `recipe_notes` table (uuid PK, FK to recipes with cascade delete, text, timestamps) with index on `recipe_id`
- Added nullable `rating_half_steps` integer column to `recipes` (stored as 1–10 internally, mapped to 0.5–5.0 in the API)

**Server — repositories:**
- `recipe-notes.repository.ts` (new): CRUD for notes (`listByRecipeId`, `findById`, `create`, `update`, `delete`) + `touchRecipeUpdatedAt` helper to bump parent recipe timestamp on mutations
- `recipes.repository.ts`: `findById` now loads notes (newest-first); list endpoints include `rating` mapped from `ratingHalfSteps`; added `setRating(recipeId, halfSteps)` method

**Server — routes (4 new endpoints):**
- `POST /recipes/:id/notes` — create note (text trim + length validation)
- `PATCH /recipes/:id/notes/:noteId` — update note text
- `DELETE /recipes/:id/notes/:noteId` — delete note
- `PATCH /recipes/:id/rating` — set or clear rating (validates 0.5-step values)

**Mobile — new components:**
- `RecipeRatingInput.tsx`: interactive 5-star rating with half-star precision. Tap-toggle UX: first tap → half star, second tap → full, third tap → half. Uses `onPressIn` + `delayPressIn={0}` for instant touch response. Maintains local state with ref-based tracking for stable callbacks. Debounces API calls (600ms) so rapid tapping sends only the final value.
- `CompactRecipeRating.tsx`: read-only compact display for grid cards — small gold star icon + numeric value (e.g., "4.5"). Returns null when unrated, so no space is consumed on unrated cards.
- `RecipeNotesSection.tsx`: notes list sorted newest-first with date and "Edited" label (compares `createdAt` vs `updatedAt`). Add/edit via React Native `Modal` with multiline `TextInput`, character counter, and `KeyboardAvoidingView`. Delete via `Alert.alert` confirmation. Long-press to delete, tap to edit.

**Mobile — screen integration:**
- `RecipeDetailScreen.tsx`: rating input between description and ingredients; notes section after steps. Rating fires API call without refetching the full recipe (avoids expensive re-render).
- `HomeScreen.tsx` and `CollectionScreen.tsx`: `CompactRecipeRating` rendered on recipe cards.

**Mobile — API client:**
- Added `createNote`, `updateNote`, `deleteNote`, `setRating` methods to `api.recipes`

**Server tests:**
- Added integration tests for notes CRUD (create, 251-char reject, empty reject, missing recipe 404, edit, wrong-recipe 404, delete) and rating (set half-star, clear to null, invalid value, out of range, missing recipe)

**Bug fixes during implementation:**
- Fixed Metro crash: `shared/src/index.ts` exported `NOTE_MAX_LENGTH` with `.js` extension (`"./constants.js"`) which Metro couldn't resolve. Changed to extensionless `"./constants"`. Other exports use `.js` but are all `export type` (erased at compile time), so Metro never resolves them.
- Applied database migration 0004 (had not been run against Supabase)
- Restarted server to pick up new route registrations

### 2026-03-22 — Remove LayoutAnimation (crash fix)

- Removed all `LayoutAnimation.configureNext()` calls from `HomeScreen.tsx` and `CollectionScreen.tsx` — back-to-back calls while a toast was active caused iOS crashes
- Removed Android `UIManager.setLayoutAnimationEnabledExperimental(true)` from `App.tsx`
- Added try/catch around all async `handleSelection` callbacks in both screens to prevent unhandled promise rejections on network errors

### 2026-03-22 — Homepage collections overhaul: uncategorized view, search, "All Recipes", toast + undo

**Schema (many-to-many join table):**
- Replaced `collection_id` nullable FK on `recipes` with a `recipe_collections` join table (composite PK on `recipe_id` + `collection_id`, cascade deletes on both FKs)
- Hand-written migration `0003_recipe_collections_join_table.sql`: creates join table, migrates existing data, drops old column and index
- Schema now supports many-to-many recipe-collection relationships; UI currently enforces single-assignment at the repository level

**Shared types:**
- Added `RecipeCollectionRef` interface (`{ id: string; name: string }`)
- Added `collections: RecipeCollectionRef[]` to the `Recipe` interface
- Exported `RecipeCollectionRef` from `shared/src/index.ts`

**Server — repository layer:**
- `recipes.repository`: `list()` and `findById()` now attach `collections` array via join table lookup; `listByCollection()` filters through join table; added `assignToCollection(recipeId, collectionId)` and `removeFromCollection(recipeId)` methods; `update()` handles collection assignment through the join table instead of setting a column
- `collections.repository`: simplified `delete()` — cascade deletes on join table handle orphaned links

**Server — routes:**
- `PATCH /recipes/:id/collection` now calls `assignToCollection()` or `removeFromCollection()` based on whether `collectionId` is provided or null
- All recipe responses now include a `collections` array

**Mobile — HomeScreen:**
- Added search bar (real-time client-side filtering by recipe title across all recipes)
- Homepage now shows only uncategorized recipes by default; search temporarily overrides this to show all matching recipes
- "All Recipes" virtual UI folder prepended to the collections row (always visible, not database-backed)
- Collection name tag shown on recipe cards only when they appear outside their natural context (search results or "All Recipes" view)
- `LayoutAnimation.configureNext(easeInEaseOut)` triggered on collection assignment/removal (not during search)
- Toast notification with undo on successful collection assignment (via `ToastQueue` component)
- Three empty states: "No recipes yet", "All recipes organized", "No recipes matching..."
- Collections row always visible (removed conditional rendering)
- `keyboardShouldPersistTaps="handled"` on all FlatLists

**Mobile — CollectionScreen:**
- Added search bar (real-time filtering within the collection)
- Accepts `isAllRecipes` flag from route params; when true, fetches all recipes and shows adaptive long-press options (assign/move/remove)
- Normal collections show long-press "Remove from [collection name]" only
- `LayoutAnimation` on removal, three empty states, collection name tags in "All Recipes" view
- `keyboardShouldPersistTaps="handled"` on FlatList

**Mobile — ToastQueue component (new):**
- `mobile/src/components/ToastQueue.tsx`: stackable toast notifications with sequential display, 4-second auto-dismiss, and per-toast undo callback
- Exposed via `forwardRef` / `useImperativeHandle` with `addToast()` method

**Mobile — other screens:**
- `RecipeDetailScreen`: uses `recipe.collections` array instead of `(recipe as any).collectionId`
- `RecipeEditScreen`: reads initial collection from `recipe.collections[0]?.id`
- `App.tsx`: enables `LayoutAnimation` on Android via `UIManager.setLayoutAnimationEnabledExperimental(true)`
- `navigation/types.ts`: added `isAllRecipes?: boolean` to Collection route params

**Integration tests:**
- Updated `recipesRepository` mock with `assignToCollection`, `removeFromCollection`, `listByCollection` methods

### 2026-03-22 — Auto-assign collection icons

- Collection folders on the home screen now automatically display a contextual Lucide icon and color based on their name, instead of all showing a brown `FolderOpen`
- 71 keyword rules covering: meal types (breakfast, lunch, dinner, dessert, snack, appetizer, side), dish types (soup, salad, pasta, pizza, burger, curry, casserole), baking (cake, bread, cookie, pie, donut), sweets (candy, lollipop, popsicle), proteins (chicken, beef, pork, fish, egg, bean), produce (fruit, apple, banana, carrot, citrus), drinks (coffee, tea, smoothie, cocktail, wine, beer), diets (vegan, vegetarian, keto, healthy, gluten free), cuisines (italian, mexican, asian, indian, french, greek), cooking methods (bbq, baking, slow cook), effort (quick, easy), planning (meal prep, freezer), occasions (holiday, party), seasons, and personal categories (favorite, family, chef, try)
- Unmatched collection names fall back to the original brown `FolderOpen` icon
- 55 Lucide icons imported, all verified to exist in `lucide-react-native@0.577.0`
- Single file change (`HomeScreen.tsx`), no server/database/migration impact

### 2026-03-22 — Multi-recipe FLAG downgrade

**GPT vision prompt (`image-parse.adapter.ts`):**
- Added rule: "If multiple distinct recipes are visible, extract only the most prominent or primary recipe. Do not merge content from adjacent recipes." The `multiRecipeDetected` signal is still reported, but the AI now knows to extract just one recipe.

**Validation rule (`rules.integrity.ts`):**
- Changed `MULTI_RECIPE_DETECTED` from `severity: "BLOCK"` to `severity: "FLAG"` with `userDismissible: true` and `userResolvable: true`
- Updated message: "Multiple recipes were detected in this image. Only one was extracted — please verify the content below is correct."
- Multi-recipe images no longer hard-block the import. Users see a dismissible warning and can verify/dismiss before saving.

**Tests:**
- Updated validation engine test: `MULTI_RECIPE_DETECTED` now asserts FLAG behavior (not BLOCK), `hasBlockingIssues: false`, `saveState: "SAVE_CLEAN"`
- Added save-decision test: dismissing the multi-recipe FLAG yields `SAVE_USER_VERIFIED` with `allowed: true`
- All 90 tests pass

### 2026-03-22 — Simplified URL AI prompt

**Prompt simplification (`url-ai.adapter.ts`):**
- Removed `ingredientSignals` and `stepSignals` arrays from the URL AI prompt — these OCR-specific signal fields were unnecessary for URL text parsing and nearly doubled output token count
- Removed signal fields: `structureSeparable`, `multiRecipeDetected`, `suspectedOmission`, `mergedWhenSeparable`, `missingName`, `missingQuantityOrUnit` from the requested JSON schema
- Kept only `signals.descriptionDetected` — the only signal relevant for URL parsing
- Lowered `max_completion_tokens` from 16,384 back to 4,096 (safe: complex recipes without signals ≈ 2,000 tokens)
- The image parser (`image-parse.adapter.ts`) is unchanged — it still uses the full signal-rich prompt

**Expected impact:**
- ~40% fewer output tokens for AI-parsed URLs
- Complex recipes (5+ sub-recipes, 30+ items) no longer exceed token limits
- 5-10 seconds faster for complex recipes
- ~40% lower AI cost per URL parse

### 2026-03-22 — Bulletproof URL parsing

**Fetch hardening (`url-fetch.service.ts`):**
- Added 1 retry with 1.5s backoff on transient errors (network failures, HTTP 5xx, 429)
- Added browser-like User-Agent fallback on HTTP 403 (helps with Cloudflare-protected recipe sites)
- Added URL normalization: strips `#fragment`, removes `/amp` suffixes, collapses double slashes
- Added 5MB response size guard via `Content-Length` check
- Added `Accept-Language: en-US,en;q=0.9` header for consistent English content on multilingual sites

**Structured data extraction (`url-structured.adapter.ts`):**
- `HowToSection.name` is now mapped as a step header entry with `isHeader: true` before its sub-steps (previously silently dropped)
- `extractStringArray` now handles ingredient objects (`{ text: "..." }`, `{ name: "..." }`) in addition to plain strings
- Added `extractMicrodata()` function: reads `itemprop` attributes from HTML elements as a fallback when no JSON-LD is present, returning a structured `RawExtractionResult` that skips the AI path entirely
- JSON-LD extraction now captures optional metadata: `recipeYield`, `prepTime`, `cookTime`, `totalTime`, `image`

**DOM boundary extraction (`url-dom.adapter.ts`):**
- Preserves newlines between `<li>`, `<p>`, `<br>`, and heading elements so the AI can distinguish separate ingredients and steps (previously collapsed all whitespace to single spaces)
- Added 6 new recipe plugin selectors: Mediavine/Create, Yummly, Zip Recipe, Meal Planner Pro, Cooked, WPRM container
- Now picks the richest (longest) match across all selectors instead of returning the first match
- Strips noise elements: buttons, print links, jump-to-recipe links, ratings, reviews
- Increased text cap from 10,000 to 12,000 chars

**AI fallback (`url-ai.adapter.ts`):**
- Smart truncation: biases the 8,000-char window to include recipe section keywords (ingredients, directions, steps) instead of blind `slice(0, 8000)`
- Passes source URL domain to the AI for context
- 1 retry with 2s delay on transient OpenAI errors (429, 5xx)
- Validates AI response structure (at least 1 ingredient, at least 1 step; title optional — validation engine flags missing titles) before accepting

**Orchestration (`url-parse.adapter.ts`):**
- Added quality gate after structured data extraction: requires 2+ ingredients, 1+ steps, title > 2 chars. Sparse JSON-LD falls through to Microdata/DOM+AI instead of returning a broken candidate
- Added Microdata as second tier in the cascade (JSON-LD → Microdata → DOM+AI → error)
- Added structured extraction logging: every URL parse logs which method succeeded (`json-ld`, `microdata`, `dom-ai`, `error`) with ingredient/step counts
- Added `extractionMethod` field to `ParsedRecipeCandidate` for debugging

**Shared types:**
- Added optional `extractionMethod` and `metadata` fields to `ParsedRecipeCandidate`
- Added optional `metadata` to `RawExtractionResult`

**Tests:**
- Added 17 new parsing tests (35 total, up from 18): HowToSection headers, ingredient objects, Microdata extraction, DOM structure preservation, noise removal, richest match selection, smart truncation, URL normalization, metadata extraction
- Fixed 3 stale validation tests that tested for removed rules (`INGREDIENT_QTY_OR_UNIT_MISSING`, `DESCRIPTION_DETECTED`)

### 2026-03-21 — Default fast mobile dev loop

- **Default Metro:** `cd mobile && npm start` (and `./run.sh metro`) no longer clears the Metro cache every time; cold cache is opt-in via `npm run start:reset` or `./run.sh metro-fresh`.
- **README Section 8** now leads with **Fast iteration workflow (default)** — one native install per session, then Fast Refresh; table documents when to use cold Metro vs full native rebuild (deploys, `pod install`, native code).
- **README Section 14** links mobile work to that workflow.

### 2026-03-21 — iOS default: physical iPhone (wireless)

- **README** states the normal iOS target is **Lincoln Ware's iPhone**, deployed with **`./run.sh device`** after one-time **Connect via network**; simulator is **`./run.sh sim`** only when explicitly wanted.
- **`mobile/run.sh`** comment documents the default UDID as that device; `IOS_DEVICE_UDID` override unchanged.

### 2026-03-21 — `npm run dev:phone` (API + Metro)

- Root **`package.json`** adds **`npm run dev:phone`**: runs **`@orzo/server`** `dev` and **`@orzo/mobile`** `start` together via **`concurrently`** (one terminal; Ctrl+C stops both). Use this before testing on a physical iPhone so the app never hits "Network request failed" from a missing API.
- **README Section 8** step 1 documents this as the default for phone testing.

### 2026-03-21 — Phone dev environment automation

- **`npm run ensure:phone`** / [`scripts/ensure-phone-dev.sh`](scripts/ensure-phone-dev.sh): verifies ports **3000** and **8081**, starts **API only**, **Metro only**, or **`dev:phone`** in the background as needed, waits until ready or times out.
- **`.cursor/rules/phone-testing-dev-env.mdc`**: Cursor always-on rule — the agent must verify or start API + Metro before telling the user to check the physical device.

### 2026-03-21 — Physical iPhone: force Metro to Mac LAN IP

- **`AppDelegate.mm`**: On a **physical device** in **Debug**, the JS bundle URL uses **`OrzoDevPackagerHost`** from **Info.plist** so Metro is always your Mac (same IP as `api.ts`), instead of falling back to a **stale offline bundle** where the UI never updates.
- **`Info.plist`**: `OrzoDevPackagerHost` (currently `192.168.146.239`), `NSLocalNetworkUsageDescription` for local-network access to Metro.

### 2026-03-21 — Major update: collections, recipe editing, validation simplification, Lucide icons

**Validation simplification:**
- Removed `CORRECTION_REQUIRED` severity entirely — all former CORRECTION_REQUIRED issues now emit `FLAG` with `userDismissible: true`
- Removed merged step detection (`STEP_MERGED` issue code and `mergedWhenSeparable` signal)
- Removed `hasCorrectionRequiredIssues` and `canEnterCorrectionMode` from `ValidationResult`
- Updated save-decision logic: only BLOCK and RETAKE issues block saving
- FLAGS are attention-only — users confirm/dismiss inline in the preview screen

**Collections feature:**
- Added `collections` table (id, name, created_at, updated_at) and `collection_id` nullable FK on `recipes` (later replaced by `recipe_collections` join table — see 2026-03-22 overhaul)
- Added `collections.repository.ts` with CRUD operations
- Added `collections.routes.ts`: POST /collections, GET /collections, GET /collections/:id/recipes, DELETE /collections/:id
- Added `recipes.update` and `recipes.assignCollection` to recipes repository and routes
- Added `collections.store.ts` (Zustand) for mobile state management
- Added `CollectionScreen.tsx` — displays recipes in a collection

**Recipe editing:**
- Added `RecipeEditScreen.tsx` — full edit screen for saved recipes (title, description, ingredients, steps, collection picker)
- Added Edit button to `RecipeDetailScreen.tsx`
- Added PUT /recipes/:id and PATCH /recipes/:id/collection API endpoints

**Home screen redesign:**
- Two-column recipe card grid with consistent spacing
- Horizontal collections row
- Replaced dual FABs with centered jar button opening a modal (camera, URL, create collection)
- Long-press recipe cards to assign/remove collection membership via ActionSheet

**State machine simplification:**
- Removed `guidedCorrection` and `finalWarningGate` states
- Simplified `ATTEMPT_SAVE` transition: goes directly to `saving` if no blocking issues or retakes
- Machine now has 9 states (down from 13)
- Deleted `GuidedCorrectionView.tsx` and `WarningGateView.tsx`

**Lucide icon migration:**
- Installed `lucide-react-native` and `react-native-svg@15.12.1` (compatible with RN 0.76)
- Replaced all emoji and unicode glyph icons across 7 files with Lucide components
- Icon mapping: jar→CookingPot, camera→Camera, link→Link, folder→FolderOpen, back→ChevronLeft, up/down→ChevronUp/Down, remove→X, add→Plus, check→Check

**AI model upgrade:**
- Changed image parsing model from GPT-4o to GPT-5.3 in `image-parse.adapter.ts`
- Changed URL AI fallback model from GPT-4o to GPT-5.4 in `url-ai.adapter.ts`

**Cursor-driven dev workflow:**
- Added `mobile/run.sh` convenience script (`metro`, `metro-fresh`, `sim`, `device`)
- Documented wireless debugging setup and Cursor-terminal workflow in README (see changelog entry **Default fast mobile dev loop** for the current default Metro behavior)

**Global padding fix:**
- Increased horizontal padding to 24px across all screens
- Ensured safe area handling on all screens

**Tests updated:**
- Updated server tests: validation engine, save-decision, machine tests all pass
- Removed tests for CORRECTION_REQUIRED, guided correction, warning gate, merged steps
- Updated XCUITests for new UI structure

### 2026-03-21 — iOS UI tests + URL input screen

**iOS UI testing (XCUITest):**
- Created `OrzoUITests` XCUITest target with 21 automated UI tests across 2 test files (`OrzoUITests.swift`, `ImportFlowUITests.swift`)
- Tests cover: home screen elements, FAB navigation, camera import flow, URL import flow, cancel confirmation dialogs, recipe detail navigation with back button, capture view buttons, URL input screen, and deeper import states (preview edit, saved, warning gate, retake, guided correction)
- Added `testID`, `accessibilityRole`, and `accessibilityLabel` props to all interactive React Native components across all screens for XCUITest element discovery
- All XCUITest queries use `app.descendants(matching: .any)["identifier"]` instead of type-specific queries (e.g., `app.buttons["id"]`) because React Native's `TouchableOpacity` does not reliably map to a native button in the iOS accessibility tree
- Tests use 120-second timeouts for initial home screen load to accommodate JS bundle download over the network on physical devices
- Fixed legacy `OrzoTests.m` unit test: changed search text from "Welcome to React" (React Native template default) to "Orzo", reduced timeout from 600 seconds to 30 seconds, renamed test method to `testRendersHomeScreen`
- Added `OrzoUITests` target to the `Orzo.xcscheme` shared scheme (both in `BuildActionEntries` and `Testables`) so tests appear in Xcode's Test Navigator and run with Cmd+U
- 19 of 21 tests pass on a physical iPhone 16 running iOS 26.2. The 2 tests that rely on reaching deeper import states (saved view, warning gate, etc.) skip gracefully when the API server is not running

**URL input screen:**
- Created `UrlInputView.tsx` — a dedicated screen for pasting recipe URLs, shown when the user taps the URL FAB (purple link button) on the home screen
- Previously, the URL FAB navigated to `ImportFlowScreen` with `mode: "url"` but no URL, causing it to fall through to the camera capture flow (a bug)
- `ImportFlowScreen.tsx` now checks: if `mode === "url"` and no `url` param was provided, it renders `UrlInputView` instead of starting the state machine. When the user submits a URL, the screen sends `NEW_URL_IMPORT` to the XState machine and the normal parsing flow begins
- The URL input screen includes basic validation (URL must start with `http`), a text field with URL keyboard type, and cancel/submit buttons with testIDs for XCUITest

### 2026-03-20 — Import flow fix + UX improvements

**Bug fixes:**
- Fixed import flow: `createDraft` and `addPage` actors were defined but never invoked in the XState machine. Added `uploading` and `creatingUrlDraft` intermediate states to properly create drafts and upload pages before parsing.
- Fixed `POST /drafts` failing with "Body cannot be empty when content-type is set to 'application/json'" — added a tolerant JSON content-type parser to the Fastify server.
- Fixed API base URL for physical device testing — `localhost` doesn't work on a physical iPhone; changed to LAN IP.
- Fixed Supabase database connection — direct-connect hostname (`db.*.supabase.co`) didn't resolve; switched to session pooler URL (`aws-0-us-west-2.pooler.supabase.com`).

**UX improvements:**
- Added warning dismiss/acknowledge buttons on FLAG issues in PreviewEditView ("OK, include" / "Undo" toggle).
- Added cancel buttons throughout the import flow (CaptureView, ReorderView, PreviewEditView, WarningGateView) with confirmation dialog before navigating home.
- Fixed HomeScreen header to use safe area insets instead of hardcoded padding, preventing text truncation on devices with Dynamic Island/notch.
