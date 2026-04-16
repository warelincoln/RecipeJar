# Development Workflow

> **What this doc covers:** How to make code changes — adding validation rules, modifying parsers, extending the state machine, scaling architecture, the full auth/security architecture, and conventions for `testID` props and iOS UI tests. For day-to-day server/mobile commands see [`RUNNING.md`](RUNNING.md). For high-level architecture see [`ARCHITECTURE.md`](ARCHITECTURE.md). Back to [`../README.md`](../README.md).

## Mobile app (fast default)

When you work on `mobile/src/**`, follow [`RUNNING.md`](RUNNING.md) → "Fast iteration workflow (default)". For a **physical iPhone**, start **`npm run dev:phone`** from the repo root so **API + Metro** are always up before you open the app. The documented iOS default is **Lincoln Ware's iPhone** over **Wi‑Fi** (`./run.sh device` after one-time pairing), not the simulator. Run **`./run.sh device`** once per session (or after native/Pod changes), then use Fast Refresh. Use `npm run start:reset` or `./run.sh metro-fresh` only when Metro's cache is suspect; use full native rebuilds for deploys and native changes.

## Tracing the import flow

When changing import behavior, trace it in this order. The import system has **two paths** depending on the source:

### Camera/Photos (concurrent queue path)

1. `mobile/src/screens/HomeScreen.tsx`
   - Entry-point buttons for Camera and Photos; checks `canImportMore()` before launching; FAB auto-open via `openFab` param
2. `mobile/src/screens/ImportFlowScreen.tsx`
   - Boot logic detects `mode === "image" && photoUri` → calls `enqueueImport()` instead of XState; sets `isConcurrentFlow`
3. `mobile/src/features/import/enqueueImport.ts`
   - Creates local queue entry, uploads to server, triggers background parse
4. `mobile/src/stores/importQueue.store.ts`
   - Queue state management (entries, statuses, persistence); `canImportMore()` enforces 3-recipe limit
5. `mobile/src/features/import/importQueuePoller.ts`
   - Polls `GET /drafts/:id` for parsing entries until terminal status; updates store
6. `mobile/src/features/import/ParsingView.tsx`
   - Renders queue summaries, "Import Another" / "Review Recipes" buttons
7. `mobile/src/screens/ImportHubScreen.tsx`
   - Queue management: review, retake, cancel; launches `ImportFlow` with `resumeDraftId` + `fromHub`
8. `server/src/api/drafts.routes.ts`
   - `POST /parse` returns `202 Accepted`, runs `runParseInBackground`; `POST /cancel` sets `CANCELLED`
9. `server/src/parsing/parse-semaphore.ts`
   - Limits concurrent OpenAI Vision calls to 2

### URL imports (XState path)

1. `mobile/src/screens/HomeScreen.tsx` → URL fan action
2. `mobile/src/navigation/types.ts` — Route params including optional `urlHtml`, `urlAcquisitionMethod`, capture-failure metadata
3. `mobile/src/screens/ImportFlowScreen.tsx` — detects URL mode → XState machine
4. `mobile/src/features/import/machine.ts` — events, states, transitions, async actors; `parseDraft` handles `202` via polling
5. `mobile/src/services/api.ts` — upload/parse/save API calls
6. `server/src/api/drafts.routes.ts` — upload, parse, save endpoints; acquisition-source selection
7. `server/src/parsing/url/url-parse.adapter.ts` — 4-tier cascade for both fetched and browser-captured HTML

### Hub review/retake (XState resume path)

1. `mobile/src/screens/ImportHubScreen.tsx` — taps card → `navigation.push("ImportFlow", { resumeDraftId, fromHub: true })`
2. `mobile/src/screens/ImportFlowScreen.tsx` — detects `resumeDraftId` → sends `RESUME_DRAFT` to XState; `fromHub` controls post-save navigation (skip SavedView, return to hub)
3. `mobile/src/features/import/machine.ts` — `resumeDraft` actor fetches draft, populates `capturedPages` from server pages, transitions to appropriate state

This is the shortest correct mental model for both human contributors and AI agents.

## Adding a validation rule

1. Create a new file in `server/src/domain/validation/` following the pattern of existing rule files (e.g., `rules.description.ts`)
2. The function signature must be: `(candidate: ParsedRecipeCandidate) => ValidationIssue[]`
3. Use only `BLOCK`, `FLAG`, or `RETAKE` severity (CORRECTION_REQUIRED does not exist)
4. Add the issue code to `shared/src/types/validation.types.ts` → `ValidationIssueCode` union
5. Import and add your rule to the `issues` array in `validation.engine.ts` — order matters (rules run top to bottom, currently 8 modules)
6. Add tests in `server/tests/validation.engine.test.ts`

## Modifying parsing

- **Image parsing:** Edit `server/src/parsing/image/image-parse.adapter.ts`. This constructs the GPT-5.4 Vision prompt (signal-rich: includes `ingredientSignals`, `stepSignals`, and top-level signal hints for OCR quality detection) and parses the response. The prompt instructs the AI to extract only the most prominent recipe when multiple are visible. The model is set via the `model` field in the `openai.chat.completions.create()` call. Uses `detail: "high"` for accurate fraction/quantity reading. Images are sent as base64 data URLs (downloaded from Supabase at parse time, processed through `optimizeForOcr`, encoded inline) to avoid an extra network hop for OpenAI.
- **Image optimization:** Edit `server/src/parsing/image/image-optimizer.ts`. Core paths: `optimizeForUpload` (auto-orient, resize ≤3072px, JPEG 85% — draft page storage) and `optimizeForOcr` (auto-orient, resize ≤3072px, JPEG 90% — before OpenAI Vision). Additional helpers produce **hero** and **thumbnail** JPEGs for saved recipe images (`recipe-images` bucket). Both use `sharp`. Classical OCR preprocessing (grayscale, CLAHE, sharpen) was tested and found to degrade OpenAI Vision accuracy. The 3072px resolution is required for accurate fraction reading (⅓ vs ½); 2048px caused consistent misreads across multiple OpenAI models.
- **URL parsing:** The cascade is in `server/src/parsing/url/url-parse.adapter.ts`. Both fetched HTML and browser-captured HTML now enter the same shared parser helper. The cascade tries JSON-LD structured data first (`extractStructuredData`), then Microdata (`extractMicrodata`), then DOM boundary extraction (`url-dom.adapter.ts`) piped to AI fallback via GPT-5.4 (`url-ai.adapter.ts`). The URL AI prompt is intentionally simplified compared to the image prompt — it requests only `title`, `ingredients`, `steps`, `description`, and `signals.descriptionDetected`, with no signal arrays. This reduces output tokens by ~40% and prevents token-limit failures on complex recipes. All structured extraction paths are quality-gated (min 2 ingredients, 1 step, title > 2 chars). Fetch still uses retry with backoff and browser UA fallback on 403. Structured logs now include both the extraction method and the acquisition method (`server-fetch`, `webview-html`, `server-fetch-fallback`). To change priority or add a new extraction method, modify the cascade in `url-parse.adapter.ts`.
- **URL fetch (SSRF mitigation):** `server/src/parsing/url/url-fetch.service.ts` follows redirects manually (max 10 hops) and calls `server/src/parsing/url/url-ssrf-guard.ts` on **each** URL in the chain. The guard allows only `http`/`https`, rejects URLs with embedded credentials, and refuses targets whose addresses fall in private, loopback, link-local, CGNAT, documentation, multicast, or reserved ranges (IPv4 and IPv6, including IPv4-mapped IPv6). For hostnames it uses `dns.promises.lookup` with `{ all: true, verbatim: true }` so checked addresses align with typical `getaddrinfo` behavior used for outbound TCP.
- **Ingredient parser:** `server/src/parsing/ingredient-parser.ts` is a deterministic regex/rules-based decomposer for free-text ingredient lines. It extracts `amount`, `amountMax` (for ranges like "1-2 tbsp"), `unit`, `name`, and `isScalable`. Handles unicode fractions (⅓, ¼, ¾, etc.), mixed numbers ("1 ½"), ranges ("2-3", "2 to 3"), unit canonicalization (case-insensitive, supports metric + imperial), and non-scalable detection ("salt to taste", "vegetable oil for deep frying", "a pinch of"). Used in two places: (1) by the URL structured adapter to parse JSON-LD/microdata ingredient strings, and (2) by `recipes.repository.update()` for **Rule A** — when a user edits an ingredient line on a saved recipe and saves, the server re-parses that line to update its structured fields. If parsing fails, the line is saved as non-scalable without blocking the save.
- **Servings extraction:** Servings are captured from three sources: (1) GPT prompts request a `servings: { min, max }` object and the `min` value becomes `ParsedRecipeCandidate.servings`, (2) JSON-LD `recipeYield` is parsed by `parseYieldToServings()` in `url-structured.adapter.ts` which accepts keywords like "serves", "people", "portions", "makes", "yields" and rejects non-person yields ("1 loaf", "24 cookies"), (3) the DOM boundary extractor performs a secondary scan for recipe metadata elements to capture serving counts that live outside the main recipe body. If all sources fail, `servings` is null and `SERVINGS_MISSING` fires as a BLOCK — the user must manually enter servings in the import preview before saving.
- **Normalization:** `server/src/parsing/normalize.ts` converts raw extraction output into `ParsedRecipeCandidate` with `parseSignals`, `servings`, and structured ingredient fields. Signal arrays from the image parser are populated; URL-sourced results (JSON-LD, Microdata, simplified AI) have empty signal arrays, which is safe — all signal fields are optional. To add new signals, extend the `parseSignals` interface in `shared/src/types/parsed-candidate.types.ts`.

## Adding API endpoints

1. Create or edit a route file in `server/src/api/`
2. Register it in `server/src/app.ts` via `app.register(yourRoutes)`
3. **Every route handler must use `request.userId`** — the auth middleware populates this on all non-public routes. Pass it to repository methods. To make a route public, add its path to `PUBLIC_ROUTES` in `server/src/middleware/auth.ts`.
4. Add integration tests in `server/tests/integration.test.ts`

## Extending the state machine

The XState machine is now used only for **URL imports** and **hub resume** (review/retake). Camera/photo imports use the `enqueueImport` → `importQueueStore` → `importQueuePoller` path and bypass XState for upload/parse.

To add new states or events to the XState machine:

1. Edit `mobile/src/features/import/machine.ts`
2. Add new states to the `states` object
3. Add new events to the `ImportEvent` union type
4. If the state invokes an async operation, add a new actor in the `actors` object of `setup()`
5. Create the corresponding view component in `mobile/src/features/import/`
6. Add the state→component mapping in `mobile/src/screens/ImportFlowScreen.tsx`
7. Add tests in `server/tests/machine.test.ts`

To modify the concurrent queue behavior:

1. Queue limits and entry shape: `mobile/src/stores/importQueue.store.ts`
2. Upload/parse trigger: `mobile/src/features/import/enqueueImport.ts`
3. Polling behavior: `mobile/src/features/import/importQueuePoller.ts`
4. Queue UI: `mobile/src/screens/ImportHubScreen.tsx` (hub), `mobile/src/features/import/ParsingView.tsx` (inline), `mobile/src/components/PendingImportsBanner.tsx` (app-wide indicator)
5. Server concurrency: `server/src/parsing/parse-semaphore.ts` (semaphore limit), `server/src/api/drafts.routes.ts` (idempotency guards, background parse)

## Servings & ingredient scaling architecture

### Data model

- `recipes.baseline_servings` (nullable numeric) — the canonical serving count. Set once during import, editable via `RecipeEditScreen`.
- `recipe_ingredients` has structured columns: `amount` (numeric), `amount_max` (numeric, for ranges), `unit` (text), `name` (text), `raw_text` (text, original line), `is_scalable` (boolean).
- At the shared type level: `Recipe.baselineServings`, `RecipeIngredientEntry.amount/amountMax/unit/name/raw/isScalable`, `ParsedRecipeCandidate.servings`, `EditedRecipeCandidate.servings`.

### How structured ingredients are populated

1. **GPT parsing** (image + URL AI fallback): the prompt JSON schema requests `amount`, `amountMax`, `unit`, `name` per ingredient. GPT returns structured data directly.
2. **JSON-LD / Microdata**: these sources provide ingredient text strings. `parseIngredientLine()` from `server/src/parsing/ingredient-parser.ts` decomposes them.
3. **Rule A (saved recipe edit)**: when a user edits an ingredient in `RecipeEditScreen` and saves, `recipes.repository.update()` runs `parseIngredientLine()` on each ingredient `text` to re-populate structured fields. If parsing fails, the ingredient is saved as non-scalable (`isScalable: false`, structured fields null) — the save is never blocked by a parse failure.

### Client-side scaling (ephemeral, no persistence)

- `mobile/src/utils/scaling.ts`: `scaleAmount(amount, factor)` multiplies, `formatAmount(value)` renders as mixed numbers with unicode fractions (⅛ rounding), `scaleIngredient(ingredient, factor)` combines them.
- `RecipeDetailScreen` maintains a local `displayServingsText` state (reset to baseline on recipe open). The scale factor is `displayServings / baselineServings`. Each ingredient is rendered through `scaleIngredient()`.
- Headers (`isHeader: true`) and non-scalable lines (`isScalable: false`) are never scaled — they render verbatim.
- No unit conversion: 15 tbsp stays 15 tbsp (not converted to cups).

### Validation

- `SERVINGS_MISSING` (BLOCK severity, `rules.servings.ts`): fires when `candidate.servings` is null or ≤ 0. The user must enter servings in the import preview before saving.
- `PreviewEditView` shows the servings input and validation warning. `candidateSyncPending` in `ImportFlowScreen` disables save while the `PATCH /candidate` revalidation is in flight.

## Authentication & security architecture (all 8 work streams complete)

**All authentication and security hardening work is finished.** The system has 5 defense layers:

1. **Supabase Auth** manages user accounts, sessions, and tokens (Email/password, Apple Sign-In, Google OAuth, TOTP MFA). Configuration is in the Supabase dashboard, not in code.
2. **Fastify middleware** (`server/src/middleware/auth.ts`) intercepts every request (except `/health`), extracts the `Bearer` token, verifies via `supabase.auth.getUser(token)`, sets `request.userId`. Returns 401 for missing/invalid tokens. Also records each request to the `user_sessions` table (user agent + IP, fire-and-forget).
3. **Repositories** — every data access method accepts `userId` and includes it in Drizzle WHERE clauses. Cross-user access returns no rows (surfaced as 404, not 403).
4. **RLS (defense-in-depth)** — Postgres Row Level Security on all 13 public tables. The `service_role` bypasses RLS by design — code-level scoping is primary.
5. **Rate limiting** — `@fastify/rate-limit` enforces global (100/min per userId) and per-route limits (parse: 10/hr, draft creation: 30/hr). Authorization headers are redacted from Fastify Pino logs.

### Additional security infrastructure

- **Step-up auth** (`server/src/middleware/step-up-auth.ts`): `requireRecentAuth(maxAgeSeconds)` checks JWT `iat` claim, `requireAal2IfEnrolled()` checks MFA assurance level. Applied to account deletion.
- **MFA recovery codes** (`server/src/services/mfa-recovery.service.ts`): 10 single-use codes per user, SHA256-hashed in `mfa_recovery_codes` table. Endpoints: `POST /account/recovery-codes`, `POST /account/verify-recovery-code`, `GET /account/recovery-codes/remaining`.
- **Session tracking** (`server/src/services/session-tracker.service.ts`): records device info per request, `GET /account/sessions` lists active sessions.
- **Account deletion**: `DELETE /account` soft-deletes (sets `profiles.deleted_at`, bans user). `server/scripts/hard-delete-accounts.ts` permanently removes accounts 30+ days after soft delete (cascading to all user data and storage objects).
- **Storage security**: both buckets (`recipe-pages`, `recipe-images`) are **private**. All client-facing URLs use `createSignedUrl()` (60-min TTL). All upload paths are user-scoped (`{userId}/...`). `deleteAllUserStorage(userId)` removes all user objects from both buckets.

### Mobile auth features

- Auth-gated navigation: splash → AuthStack → MfaChallengeScreen (if TOTP enrolled) → ResetPasswordScreen (if recovery deep link) → AppStack
- Auth screens: OnboardingScreen, AuthScreen (Apple/Google/email), SignInScreen, SignUpScreen, ForgotPasswordScreen, EmailConfirmationScreen, ResetPasswordScreen, MfaChallengeScreen
- AccountScreen: profile display, email change, linked providers (Apple/Google with interactive Link/Unlink), Security section (MFA enrollment/unenrollment), Sign Out, Sign Out All Devices, Delete Account
- `auth.store.ts`: `needsMfaVerify` state for MFA challenge, `signOutAll()` for global sign-out, MFA assurance level detection

### Account management endpoints

| Endpoint | Description | Protection |
|---|---|---|
| `DELETE /account` | Soft-delete account (30-day grace period) | `requireRecentAuth(300)` |
| `POST /account/recovery-codes` | Generate 10 MFA recovery codes | `requireRecentAuth(300)` |
| `POST /account/verify-recovery-code` | Verify a recovery code | Auth required |
| `GET /account/recovery-codes/remaining` | Count unused recovery codes | Auth required |
| `GET /account/sessions` | List active sessions | Auth required |

**Supabase dashboard settings (manual, not in code) — two projects to keep in sync:**

- **Production project (`ttpgamwmjtrdnsfmdkec`)** — serves the Release "Orzo" app via Railway. Apple Bundle ID = `app.orzo.ios`, Google "Skip nonce check" enabled (SDK v16 limitation), Site URL = `app.orzo.ios://auth/callback`, redirect URL allowlist includes `app.orzo.ios://auth/callback`, email verification enabled.
- **Dev project (`nrdomcszbvqnfinrjvuz`)** — serves the Debug "Orzo Dev" app via the local Fastify server. Email/password provider only (Apple/Google deferred; would require separate App ID + OAuth client ID for `app.orzo.ios.dev`), Site URL = `app.orzo.ios.dev://auth/callback`, redirect URL allowlist includes `app.orzo.ios.dev://auth/callback`, email confirmation **disabled** (Supabase shared-SMTP throttling on free tier made confirm-flow testing unreliable).

See [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md) for the full production configuration audit.

**Integration tests** (`server/tests/auth-security.test.ts`): 12 tests covering auth middleware (401 for missing/invalid token, 200 with correct userId, /health public) and IDOR prevention (cross-user 404 for recipes, collections, drafts).

### Cross-cutting items tracked for future work

- **C1: Local JWT verification** — switch from `supabase.auth.getUser(token)` (remote call, ~100-200ms latency) to local HS256 verification with `SUPABASE_JWT_SECRET`. Recommended before public launch. Accepts 10-min revocation window.
- **C2: Password policy** — confirm Supabase dashboard minimum matches mobile hint (12 chars). Dashboard default may be 8.
- **C3: Apple client secret expiry** — ES256 JWT expires ~October 2026. Tracked in [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md).

**Reference:** [`AUTH_RLS_SECURITY_PLAN.md`](AUTH_RLS_SECURITY_PLAN.md) (architecture), [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md) (manual audit), [`PRODUCTION_DEPLOY.md`](PRODUCTION_DEPLOY.md) (deployment).

## Adding testID props for iOS UI testing

All interactive React Native elements that should be queryable by XCUITest must have three props:

```tsx
<TouchableOpacity
  testID="my-button"
  accessibilityRole="button"
  accessibilityLabel="my-button"
  onPress={handlePress}
>
```

- `testID` maps to `accessibilityIdentifier` on iOS — this is how XCUITest finds elements
- `accessibilityRole="button"` ensures the element appears as a button in the iOS accessibility tree
- `accessibilityLabel` provides a secondary lookup path for XCUITest queries

In the XCUITest Swift files, always query elements using `app.descendants(matching: .any)["identifier"]` rather than `app.buttons["identifier"]` because React Native elements don't always map to the expected native element type.

Non-interactive elements (Text, View containers) only need `testID`:

```tsx
<View testID="my-screen">
<Text testID="my-title">Title</Text>
```

## Adding iOS UI tests

1. Add Swift test methods to `mobile/ios/OrzoUITests/OrzoUITests.swift` or `ImportFlowUITests.swift`
2. Use the `element("testID")` helper (calls `app.descendants(matching: .any)["testID"]`)
3. Always call `waitForHomeScreen()` at the start of each test — this waits up to 120 seconds for the JS bundle to download and the home screen to render
4. Use `guard element.waitForExistence(timeout:) else { return }` for screens that may not be reachable (e.g., retake required depends on a specific parse result)
5. Run tests from Xcode with Cmd+U (requires Metro running and iPhone connected)
