# Project Structure

> **What this doc covers:** Annotated file tree for the Orzo monorepo (root → `landing/` → `shared/` → `server/` → `mobile/`). Use this as a navigation aid alongside the "Start here in the codebase" section of [`../README.md`](../README.md).

```
Orzo/
├── package.json                          # npm workspace root; `npm run dev:phone` starts API + Metro; `postinstall` → patch-package + dev LAN host script
├── patches/                              # patch-package: `react-native@0.76.9`, `react-native-svg@15.15.4` (do not delete; required after `npm install`)
├── scripts/                              # e.g. `ensure-phone-dev.sh`, `write-orzo-dev-host.cjs`
├── .gitignore
├── README.md                             # quickstart + fast-handoff overview (this is the entry point)
├── CHANGELOG.md                          # dated release notes; start here after a long break
├── QA_CHECKLIST.md                       # manual QA test scenarios
├── docs/
│   ├── ARCHITECTURE.md                   # validation engine, save-decision logic, state machine + concurrent import architecture
│   ├── SETUP.md                          # prerequisites, environment variables, first-time setup
│   ├── RUNNING.md                        # running the backend + mobile app (iOS/Android), common build errors
│   ├── TESTING.md                        # E2E curl walkthrough + top QA scenarios
│   ├── PROJECT_STRUCTURE.md              # this file
│   ├── TROUBLESHOOTING.md                # common failure points and fixes
│   ├── DEVELOPMENT.md                    # adding rules, modifying parsing, extending state machine, auth/security architecture, testID conventions
│   ├── STATUS.md                         # current proven-live status, test coverage, technical notes & known gaps
│   ├── AUTH_RLS_SECURITY_PLAN.md         # comprehensive auth/RLS security plan (8 work streams; all complete)
│   ├── SECURITY_CHECKLIST.md             # manual security audit checklist (Supabase dashboard, Apple/Google dev accounts, key rotation, access)
│   └── PRODUCTION_DEPLOY.md              # cloud deployment guide (Railway, Render, Fly.io) with env vars and mobile rebuild steps
│
├── Orzo icon.png                         # master app icon source (1024x1024, cream orzo grains on terracotta background)
├── landing/                              # static "coming soon" landing page deployed to Cloudflare Pages (orzo-website.pages.dev)
│   ├── index.html                        # main page: hero, 3-step how-it-works, 6 feature cards, differentiator, email signup, privacy/terms links. Inline CSS (Inter font, warm terracotta palette) + inline JS (Klaviyo waitlist, Google Analytics, IntersectionObserver reveals)
│   ├── privacy.html                      # Privacy Policy (covers waitlist email collection + app data handling, Google Analytics disclosure)
│   ├── terms.html                        # Terms of Service (Apple-compliant account deletion policy, acceptable use, IP)
│   ├── icon-180.png                      # Apple touch icon (copied from mobile/ios/Orzo/Images.xcassets/AppIcon.appiconset/icon-180.png)
│   ├── icon-1024.png                     # og:image for social sharing (copied from iOS assets)
│   └── _headers                          # Cloudflare Pages security headers (X-Frame-Options, Referrer-Policy, cache-control per file type)
│
├── shared/                               # shared TypeScript types (no runtime deps)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                      # barrel export
│       ├── constants.ts                  # shared constants (NOTE_MAX_LENGTH = 250)
│       └── types/
│           ├── draft.types.ts            # DraftStatus, RecipeDraft, EditedRecipeCandidate (incl. servings + structured ingredients), DraftWarningState
│           ├── parsed-candidate.types.ts # ParsedRecipeCandidate (incl. servings + structured ParsedIngredientEntry), parseSignals shape
│           ├── recipe.types.ts           # Recipe (incl. baselineServings), RecipeNote, RecipeCollectionRef, RecipeIngredientEntry (structured), RecipeStepEntry
│           ├── save-decision.types.ts    # SaveDecision, RecipeSaveState
│           ├── signal.types.ts           # IngredientSignal, StepSignal, SourcePage
│           └── validation.types.ts       # ValidationResult, ValidationIssue, ValidationSeverity, ValidationIssueCode
│
├── server/                               # Fastify API server
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example                      # template for environment variables
│   ├── drizzle.config.ts                 # Drizzle Kit configuration
│   ├── vitest.config.ts                  # test runner config
│   ├── drizzle/                          # generated migration SQL
│   │   ├── 0000_new_raider.sql
│   │   ├── 0001_smart_champions.sql      # collections table + collectionId FK on recipes
│   │   ├── 0002_numerous_norman_osborn.sql
│   │   ├── 0003_recipe_collections_join_table.sql  # many-to-many: create join table, migrate data, drop column
│   │   ├── 0004_burly_yellow_claw.sql              # recipe_notes table + rating_half_steps column on recipes
│   │   ├── 0005_recipe_image_url.sql               # nullable image_url on recipes (hero image storage path key)
│   │   ├── 0006_outgoing_beast.sql                 # nullable parse_error_message on drafts (concurrent import error tracking)
│   │   ├── 0007_structured_ingredients_servings.sql # baseline_servings on recipes + structured ingredient columns (amount, amount_max, unit, name, raw_text, is_scalable)
│   │   ├── 0008_auth_profiles_user_id.sql          # profiles table (1:1 auth.users), auto-create trigger, user_id columns on 4 domain tables, indexes
│   │   ├── 0009_rls_policies.sql                   # RLS enabled on all tables, 41+ policies (authenticated role only, anon denied)
│   │   ├── 0010_mfa_recovery_codes.sql             # mfa_recovery_codes table (SHA256-hashed one-time codes, RLS policies)
│   │   └── 0011_user_sessions.sql                  # user_sessions table (device_info, ip_address, last_seen_at, RLS policy)
│   ├── Dockerfile                        # multi-stage production build for Fastify API
│   ├── scripts/
│   │   ├── migrate-0008-backfill.ts      # one-time backfill: seed user creation, user_id assignment, NOT NULL + FK enforcement (already executed)
│   │   ├── run-0008-phase1.ts            # applies migration 0008 SQL (already executed)
│   │   ├── run-0009-rls.ts               # applies migration 0009 SQL (already executed)
│   │   ├── verify-0008.ts                # verifies migration 0008 success (schema, data, constraints)
│   │   ├── verify-0009-rls.ts            # verifies RLS policies are active (table count, policy count)
│   │   ├── migrate-storage-user-scoped.ts # moves storage objects from flat paths to user-scoped paths + updates DB columns (idempotent)
│   │   └── hard-delete-accounts.ts       # cron: permanently deletes accounts soft-deleted 30+ days prior (storage, profile, auth.users)
│   ├── src/
│   │   ├── app.ts                        # server entry point, Fastify setup, auth middleware, rate limiting (@fastify/rate-limit), Pino header redaction, route registration, startup cleanup
│   │   ├── middleware/
│   │   │   ├── auth.ts                   # JWT auth middleware: verifies Supabase access token, sets request.userId, records session; /health exempt; returns 401 on missing/invalid token
│   │   │   └── step-up-auth.ts           # step-up auth helpers: requireRecentAuth(maxAgeSeconds), requireAal2IfEnrolled(), JWT claim decoders
│   │   ├── api/
│   │   │   ├── drafts.routes.ts          # 13 draft endpoints — all pass request.userId; per-route rate limits on parse (10/hr) and create (30/hr)
│   │   │   ├── recipes.routes.ts         # 11 recipe endpoints — all pass request.userId; cross-user access returns 404
│   │   │   ├── collections.routes.ts     # 5 collection behaviors — all pass request.userId
│   │   │   └── account.routes.ts         # account management: DELETE /account, recovery codes (POST generate, POST verify, GET remaining), GET sessions
│   │   ├── domain/
│   │   │   ├── save-decision.ts          # decideSave() — determines SAVE_CLEAN / SAVE_USER_VERIFIED / NO_SAVE
│   │   │   └── validation/
│   │   │       ├── validation.engine.ts  # validateRecipe() — runs all 8 rule modules
│   │   │       ├── rules.structure.ts    # STRUCTURE_NOT_SEPARABLE
│   │   │       ├── rules.integrity.ts    # CONFIRMED_OMISSION, SUSPECTED_OMISSION, MULTI_RECIPE_DETECTED (FLAG)
│   │   │       ├── rules.required-fields.ts # TITLE_MISSING, INGREDIENTS_MISSING, STEPS_MISSING
│   │   │       ├── rules.servings.ts     # SERVINGS_MISSING (BLOCK) — requires baseline servings before save
│   │   │       ├── rules.ingredients.ts  # per-ingredient signals (merged, missing name, qty, OCR)
│   │   │       ├── rules.steps.ts        # per-step signals (merged, OCR)
│   │   │       ├── rules.description.ts  # DESCRIPTION_DETECTED
│   │   │       └── rules.retake.ts       # LOW_CONFIDENCE_STRUCTURE, POOR_IMAGE_QUALITY, RETAKE_LIMIT_REACHED
│   │   ├── observability/
│   │   │   └── event-logger.ts           # structured event logging (draft lifecycle, auth events: account_deletion_requested, auth_middleware_failure, rate_limit_exceeded)
│   │   ├── services/
│   │   │   ├── supabase.ts               # shared Supabase client (service role)
│   │   │   ├── recipe-image.service.ts   # private buckets, signed URLs, user-scoped paths, hero/thumb, upload/delete, deleteAllUserStorage
│   │   │   ├── mfa-recovery.service.ts   # MFA recovery code generation (10 codes, SHA256), verification, remaining count
│   │   │   └── session-tracker.service.ts # user session recording (upsert by user+device), listing, stale cleanup
│   │   ├── parsing/
│   │   │   ├── normalize.ts             # normalizeToCandidate(), buildErrorCandidate() — maps structured ingredients + servings
│   │   │   ├── ingredient-parser.ts     # deterministic regex/rules-based ingredient line parser (fractions, ranges, units, non-scalable detection); used by URL structured adapter + Rule A
│   │   │   ├── parse-semaphore.ts       # in-memory semaphore limiting concurrent OpenAI Vision calls to 2 (FIFO queue, release in finally)
│   │   │   ├── image/
│   │   │   │   ├── image-parse.adapter.ts # GPT-5.4 Vision: signal-rich prompt, module-scoped singleton OpenAI client (maxRetries: 2), sends page images as base64 data URLs
│   │   │   │   └── image-optimizer.ts    # sharp: optimizeForUpload / optimizeForOcr + hero/thumbnail variants for saved recipe images
│   │   │   └── url/
│   │   │       ├── url-parse.adapter.ts  # orchestrates 4-tier cascade: JSON-LD → Microdata → DOM → AI (quality-gated, logged)
│   │   │       ├── url-fetch.service.ts  # fetches URL HTML: manual redirects (max 10), SSRF checks per hop, retry, browser UA fallback, normalization, size cap
│   │   │       ├── url-ssrf-guard.ts     # blocks private/special-use IPs; dns.lookup(all+verbatim) for hostnames
│   │   │       ├── url-structured.adapter.ts # extracts JSON-LD Recipe schema + Microdata (itemprop) fallback
│   │   │       ├── url-dom.adapter.ts    # Cheerio-based DOM boundary extraction with structure-preserving text
│   │   │       └── url-ai.adapter.ts     # GPT-5.4 fallback with simplified prompt (no signal arrays), smart truncation, retry, response validation
│   │   └── persistence/
│   │       ├── db.ts                     # Drizzle client initialization (lazy, uses DATABASE_URL, pool max: 20)
│   │       ├── schema.ts                # 13 tables: profiles, 4 domain tables (user_id NOT NULL FK), mfa_recovery_codes, user_sessions + structured ingredients + drafts.parse_error_message
│   │       ├── drafts.repository.ts     # CRUD for drafts, pages, warning states — all methods accept userId; findByIdInternal(id) for background tasks (no user filter); setParsedCandidate, setParseError, resetStuckParsingDrafts, deleteOldCancelledDrafts
│   │       ├── recipes.repository.ts    # CRUD for recipes — all methods accept userId; structured ingredients, steps, source pages + assignToCollection/removeFromCollection + rating; update() runs Rule A
│   │       ├── recipe-notes.repository.ts # CRUD for recipe notes — all methods accept userId; touches parent recipe updatedAt
│   │       └── collections.repository.ts # collections — all methods accept userId: create, list, findById, update (name + updatedAt), delete
│   └── tests/
│       ├── validation.engine.test.ts    # 23 tests — all validation rules
│       ├── save-decision.test.ts        # 8 tests — save decision logic
│       ├── parsing.test.ts             # 38 tests — normalization, error candidate, URL extractors
│       ├── url-ssrf-guard.test.ts     # SSRF guard + fetchUrl redirect behavior
│       ├── integration.test.ts         # 34 tests — API endpoints incl. recipe hero image (mocked DB/storage)
│       ├── auth-security.test.ts      # 12 tests — auth middleware (401/200), /health public, IDOR prevention (cross-user 404 for recipes/collections/drafts)
│       └── machine.test.ts            # 10 tests — XState machine transitions
│
└── mobile/                              # React Native app
    ├── package.json
    ├── tsconfig.json
    ├── app.json                         # native project name: "Orzo"
    ├── index.js                         # app entry point
    ├── App.tsx                          # root component, SafeAreaProvider, NavigationContainer, stack navigator, MfaChallengeScreen (conditional on needsMfaVerify), PendingImportsBanner + AppPoller at root
    ├── run.sh                           # convenience script: metro (default), metro-fresh, sim, device
    ├── babel.config.js                  # RN babel preset + reanimated plugin
    ├── metro.config.js                  # monorepo watch folders, shared alias
    ├── react-native.config.js           # CLI project source dirs
    ├── Gemfile                          # Ruby deps for CocoaPods (iOS)
    ├── .gitignore
    ├── android/                         # Android native project (com.getorzo.app)
    ├── ios/                             # iOS native project (Orzo)
    │   ├── Podfile                      # CocoaPods config + post_install patches (includes Xcode 26.4 fmt/Hermes workaround)
    │   ├── OrzoTests/             # XCTest unit test target (1 test)
    │   │   ├── OrzoTests.m        # Verifies home screen renders "Orzo" text
    │   │   └── Info.plist
    │   └── OrzoUITests/           # XCUITest UI test target
    │       ├── OrzoUITests.swift   # Home screen, navigation, recipe detail tests
    │       ├── ImportFlowUITests.swift  # Import flow screen tests (capture, URL input, preview, saved, etc.)
    │       └── Info.plist
    └── src/
        ├── components/
        │   ├── PendingImportsBanner.tsx  # app-wide floating pill (top-right): blinking status dot, tappable → ImportHub; hidden on import screens
        │   ├── ClipboardRecipePrompt.tsx # Home clipboard sheet: Paste reads clipboard → WebRecipeImport
        │   ├── ToastQueue.tsx           # stackable toast notifications with undo (used for collection assignment feedback)
        │   ├── RecipeRatingInput.tsx    # interactive half-star rating (tap-toggle: half→full→half, debounced API save, onPressIn for instant response)
        │   ├── CompactRecipeRating.tsx  # read-only compact rating for grid cards (gold star icon + numeric value, hidden when unrated)
        │   ├── RecipeNotesSection.tsx   # notes list + add/edit modal (multiline, char counter, KeyboardAvoidingView) + delete confirmation
        │   ├── RecipeCard.tsx           # grid card with optional FastImage thumbnail + quick actions entry points
        │   ├── RecipeImagePlaceholder.tsx / ShimmerPlaceholder.tsx # loading / empty image states
        │   ├── FullScreenImageViewer.tsx # pinch/zoom hero image viewer
        │   ├── CollectionPickerSheet.tsx # assign/move recipe to folder
        │   ├── CreateCollectionSheet.tsx # create folder or rename (`mode`); live `getCollectionIcon` preview
        │   └── RecipeQuickActionsSheet.tsx # recipe quick actions; optional `emphasisLabel`; `DeleteCollectionConfirmSheet` for folder delete
        ├── features/
        │   ├── collections/
        │   │   └── collectionIconRules.ts # Lucide icon + color rules for collection folders (shared by home + collection UI)
        │   └── import/
        │       ├── machine.ts           # XState v5 import flow state machine (9 states); parseDraft handles 202 via polling; resume populates capturedPages
        │       ├── enqueueImport.ts     # concurrent flow: create draft + upload page + trigger parse, with retry and orphan cleanup
        │       ├── importQueuePoller.ts # useImportQueuePoller hook: exponential backoff (3s→5s→10s), AppState-aware
        │       ├── CaptureView.tsx      # camera capture UI
        │       ├── ReorderView.tsx      # page reorder UI (Lucide ChevronUp/ChevronDown icons)
        │       ├── ParsingView.tsx      # loading/parsing UI + queue context (thumbnails, "Import Another", "Review Recipes" with delayed fade-in)
        │       ├── PreviewEditView.tsx  # recipe preview/edit with inline FLAG confirm/dismiss + servings input + "more recipes ready" indicator
        │       ├── RetakeRequiredView.tsx # retake prompt UI (uses capturedPages from server on resume)
        │       ├── SavedView.tsx        # success UI (Lucide Check icon)
        │       ├── UrlInputView.tsx     # URL paste screen when ImportFlow has no pre-passed URL
        │       ├── ParseRevealEdgeGlow.tsx # optional accent during parse preview reveal
        │       ├── issueDisplayMessage.ts # user-facing strings for validation issues
        │       └── webImportUrl.ts      # neutral search URL, strip credentials, search-result detection helpers
        ├── navigation/
        │   └── types.ts                # RootStackParamList (Home with openFab, ImportFlow with fromHub, ImportHub, WebRecipeImport with initialUrl)
        ├── screens/
        │   ├── HomeScreen.tsx           # search bar, two-column grid (`RecipeCard` + thumbnails), collections row + `collectionIconRules` + long-press folder rename/delete, jar FAB (auto-open on openFab, queue limit check), photos preview, clipboard prompt, toasts
        │   ├── ImportHubScreen.tsx      # concurrent import queue management: QueueCards by status, review/retake/cancel, "Import Another", close button, completion animation
        │   ├── CollectionScreen.tsx     # recipes in a collection or "All Recipes" (isAllRecipes flag), search bar, folder ⋯ menu (rename/delete), long-press remove/assign recipes, 404 → goBack if folder gone
        │   ├── RecipeEditScreen.tsx     # edit saved recipes (title, description, ingredients, steps, collection, **servings**); `useFocusEffect` refetches `fetchCollections` for renamed folder labels
        │   ├── ImportFlowScreen.tsx     # dual-path: camera/photo → enqueueImport (concurrent), URL/resume → XState; fromHub param controls post-save navigation; candidateSyncPending guards save during revalidation
        │   ├── WebRecipeImportScreen.tsx # in-app WebView: browse → Save passes native URL to ImportFlow
        │   ├── RecipeDetailScreen.tsx   # single recipe view with Edit button, inline star rating, notes section, **servings stepper** (±1, free-type, reset), scaled ingredient display
        │   ├── AccountScreen.tsx        # profile display, email change, linked providers (Link/Unlink), Security section (MFA enrollment/unenrollment), Sign Out, Sign Out All Devices, Delete Account
        │   └── MfaChallengeScreen.tsx   # TOTP code entry during MFA sign-in challenge; allows sign-out if user cannot verify
        ├── utils/
        │   └── scaling.ts              # client-side ingredient scaling: scaleAmount, formatAmount (mixed numbers, unicode fractions, ⅛ rounding), scaleIngredient (headers/non-scalable verbatim, range support)
        ├── services/
        │   ├── api.ts                  # API client (drafts, recipes, collections, account management: deleteAccount, generateRecoveryCodes, verifyRecoveryCode, getRemainingRecoveryCodes, getSessions)
        │   └── supabase.ts            # Supabase client with Keychain storage adapter, anon key, detectSessionInUrl: false
        └── stores/
            ├── auth.store.ts          # Zustand: session, user, isAuthenticated, needsMfaVerify, pendingPasswordReset; signOut, signOutAll; MFA assurance level detection
            ├── recipes.store.ts        # Zustand store for recipe list
            ├── collections.store.ts    # Zustand: fetch, create, updateCollection, deleteCollection (+ refetch recipes after delete)
            └── importQueue.store.ts    # Zustand store with AsyncStorage persistence for concurrent import queue (QueueEntry with localId, nullable draftId, status, thumbnailUri; max 3 entries; reconcileQueue on rehydrate)
```
