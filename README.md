# RecipeJar

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
   - Runs **`scripts/write-recipejar-dev-host.cjs`** (writes gitignored `mobile/src/devLanHost.ts` for LAN API/Metro; edit or re-run if your Mac’s IP changes).
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

### Start here in the codebase

- `mobile/src/screens/HomeScreen.tsx`
  - Jar fan actions, Photos picker, photo preview screen, button styling, FAB auto-open for concurrent imports; **long-press** folder chips (not the virtual **All Recipes** chip) for rename/delete
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
  - Mobile API client: draft page upload metadata passthrough, **`POST`/`DELETE` recipe hero image** (`/recipes/:id/image`), `cancel` method for drafts; **`collections.update`** (`PATCH`) and **`collections.delete`** (204-safe, no JSON parse on success); **`request()`** error messages prefer Fastify **`message`** then **`error`**
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

- **New API routes (e.g. `PATCH /collections/:id`):** If folder **rename** fails with a generic error or Fastify **`Route PATCH:… not found`**, the Node process on port **3000** is almost certainly **stale**. Kill listeners on **3000**/**8081** and run **`npm run dev:phone`** again from the repo root. Release builds talking to **`api.recipejar.app`** need that backend deployed with the same routes.
- If you change only `mobile/src/**`, reload the app. Do **not** rebuild natively.
- If you add/change a native dependency or touch `Podfile`, run `cd mobile/ios && pod install`, then `cd ../ && ./run.sh device`.  
  **`pod install`** also runs a **`Podfile` `post_install` hook** that rebuilds **`RCT-Folly` public `folly/json` header symlinks** on macOS case-insensitive volumes (fixes missing `folly/json/dynamic.h` during native compile).
- Do **not** skip **`npm install` at the repo root** after clone: **`patch-package`** applies `patches/react-native+0.76.9.patch` and `patches/react-native-svg+15.15.4.patch` (RNSVG + Yoga on New Architecture).
- `mobile/run.sh` is convenient, but its `device` path only prints the final `xcodebuild` line. If you see `(2 failures)` or an invalid bundle, run raw `xcodebuild` to get the real compiler errors.
- Xcode `26.4` can fail building Hermes' bundled `fmt` pod with `consteval` errors. The project works around this in `mobile/ios/Podfile` by patching `Pods/fmt/include/fmt/base.h` during `pod install` to force `FMT_USE_CONSTEVAL 0`.

## 1. What This Project Is

RecipeJar converts cookbook page photos and recipe URLs into structured digital recipes. It is a **trust-gated, validation-first** ingestion system. No recipe is saved unless it passes a deterministic validation engine. The system never trusts AI output directly — every parsed result is validated, and the user must explicitly resolve or acknowledge all issues before a save is allowed.

**What is implemented (MVP):**

- Fastify API server with full draft lifecycle (create, upload pages, parse, edit, validate, save)
- GPT-5.4 Vision image parsing (sends page photos to OpenAI, receives structured extraction with signal-rich prompt — including per-ingredient structured fields and servings)
- URL recipe parsing with 4-tier cascade: JSON-LD → Microdata → DOM boundary extraction → AI fallback (with fetch retry, browser UA fallback, quality gate, extraction logging, and metadata capture for servings)
- **Servings & ingredient scaling**: every recipe stores `baselineServings`. Ingredients are persisted with structured fields (`amount`, `amountMax`, `unit`, `name`, `raw`, `isScalable`). Parsing extracts these from GPT output (image/URL) or via a **deterministic regex/rules-based ingredient parser** (JSON-LD/microdata strings + Rule A re-parse on saved recipe edit). Missing servings is a `BLOCK`-severity validation issue — the user must specify servings before saving. Detail screen provides an interactive servings stepper that scales ingredient amounts client-side (mixed-number formatting with unicode fractions, ⅛ rounding, no unit conversion).
- Deterministic validation engine with 8 rule modules and 13 issue codes (3 severities: BLOCK, FLAG, RETAKE)
- Save-decision logic with 3 save states (`SAVE_CLEAN`, `SAVE_USER_VERIFIED`, `NO_SAVE`)
- Drizzle ORM schema with 10 PostgreSQL tables (including `collections`, `recipe_collections` join table, and `recipe_notes`), indexes, cascade deletes; optional **`image_url`** on `recipes` (migration `0005`), **`baseline_servings`** + structured ingredient columns on `recipe_ingredients` (migration `0007`)
- Supabase Storage integration for **draft page images** (`recipe-pages` bucket) and **saved recipe hero images** (`recipe-images` bucket — server ensures/creates a public bucket and stores `hero.jpg` + `thumb.jpg` per recipe)
- **Concurrent import queue** (up to 3 image-based recipes): fire-and-forget `202 Accepted` parse endpoint, server-side parse concurrency semaphore (max 2 OpenAI Vision calls), client-side Zustand store with AsyncStorage persistence, exponential-backoff poller, Import Hub screen, app-wide floating banner, enqueue function with retry and orphan cleanup, idempotency guards on parse and save, startup cleanup of stuck/cancelled drafts, draft cancel endpoint with Supabase image cleanup
- XState v5 state machine for mobile import flow (9 states — simplified, no correction or warning gate states); used for URL imports and hub resume; camera/photo imports use the concurrent `enqueueImport` path
- React Native mobile app with navigation, screens, Zustand stores (recipes + collections + import queue), API client
- Collections feature: create collections, **rename** (`PATCH /collections/:id`) and **delete** folder (recipes become uncategorized; join rows cascade), many-to-many recipe-collection join table (UI currently single-assignment, schema supports multi), collection view screen, "All Recipes" virtual folder; **long-press** folder chips on home or **⋯** on collection screen for folder actions; **`DeleteCollectionConfirmSheet`** for destructive confirm
- Recipe editing after save: full edit screen with title, description, ingredients, steps, collection assignment, optional **hero photo** (pick/compress/upload or remove; uses multipart **`POST /recipes/:id/image`**)
- **Recipe hero image API:** **`POST /recipes/:id/image`** (multipart file) and **`DELETE /recipes/:id/image`**; **`GET /recipes`** and **`GET /recipes/:id`** (and related update responses) include resolved public **`imageUrl`** and **`thumbnailUrl`** fields for clients
- Home screen with search bar, two-column recipe card grid (thumbnails via **`react-native-fast-image`** when a hero image exists), horizontal collections row (always visible with "All Recipes" first), **long-press real folders** to rename/delete, centered jar FAB with modal (camera, photos, URL, create collection), three empty states (no recipes, all organized, no search results)
- Long-press recipe cards to assign/move/remove collection membership with toast notification and undo
- User notes: multiple text notes per recipe (max 250 chars each), add/edit via modal, delete with confirmation, newest-first with date and "Edited" label, displayed on recipe detail screen below steps
- Star rating: half-star precision (0.5–5.0), tap-to-toggle UX (first tap → half star, second tap → full, third tap → half), clearable to unrated, debounced API persistence, compact read-only display on grid cards (gold star + numeric value, hidden when unrated)
- Real-time client-side search by recipe title on home screen and all collection/folder views
- Lucide icon system (`lucide-react-native`) — all UI icons use Lucide components (no emoji/unicode glyphs). Collection folders auto-assign a contextual icon and color based on their name (keyword rules live in **`mobile/src/features/collections/collectionIconRules.ts`**; falls back to a neutral folder style for unmatched names)
- **URL import (WebView):** Jar "**URL**" opens `WebRecipeImportScreen` — omnibar, **Google** search for non-URL typed queries (`resolveOmnibarInput` in `webImportUrl.ts`), and **Save to RecipeJar** now tries to capture the currently loaded page HTML from the WebView before handing off to `ImportFlow`. Requests to major ad/tracking hosts are blocked in `onShouldStartLoadWithRequest` for a cleaner browse experience. **tel: / mailto: / sms:** and **intent:** (Android) require a confirmation alert before leaving the app. If HTML capture fails for a technical reason (injection failure, timeout, message transport failure, oversized payload), the app falls back once to the existing server-side URL fetch path.
- **Home clipboard prompt:** If the pasteboard has text (`Clipboard.hasString()` — avoids proactive `getString()` / permission churn on iOS), a bottom sheet offers **Paste**; reading and URL validation happen only on that tap. After **Paste** or dismiss, the sheet stays suppressed until the app returns from **background** (not `inactive`, so system dialogs like paste permission do not re-enable the prompt).
- **Photo library import:** Jar "**Photos**" fan action opens the system image picker (`react-native-image-picker`). After the user picks an image, the app shows a full-screen preview with **Back** and **Import This Photo**. **Back** reopens the library picker so the user can choose a different image. **Import This Photo** sends the asset through the same upload → parse → preview → save pipeline as camera-captured images. On parse failure, a "Could Not Read Photo" screen with a "Go Home" button replaces the camera-oriented retake flow. Permission denial shows a gentle alert with an "Open Settings" link.
- **Recipe Saved → Add more:** URL imports and Photos imports return to Home; camera imports return to `ImportFlow` in image mode.
- URL input view (`UrlInputView`) remains in `ImportFlow` when URL mode is entered without a pre-filled URL (e.g. deep links later). There are now three URL acquisition modes: **`server-fetch`** (default URL import path), **`webview-html`** (browser-backed import from `WebRecipeImportScreen`), and **`server-fetch-fallback`** (used only when browser HTML capture fails technically). Clipboard and manual URL entry still use the server-fetch path unless they are explicitly routed through the browser first.
- **Parse preview reveal:** After a successful parse (not draft resume), the preview screen reveals title/ingredients/steps **word-by-word** at ~**6000 WPM**; users with **Reduce Motion** see full text immediately (`useRecipeParseReveal`, `recipeParseReveal.ts`, `parseRevealToken` in `ImportFlowScreen`). Optional **`ParseRevealEdgeGlow`** accent during reveal; validation issues can use shared **`issueDisplayMessage`** copy.
- Server-side automated tests (validation, parsing, save-decision, API integration, state machine)
- iOS UI tests via XCUITest (home screen, navigation, import flow screens, cancel flows)

**What is NOT implemented:**

- User authentication and multi-user data ownership (single-user MVP)
- Offline/local-first sync
- Multi-collection assignment UI (schema supports many-to-many; UI currently assigns one collection at a time)
- Recipe sharing or export
- Production deployment configuration
- Unit conversion (e.g. 15 tbsp → ¾ cup + 3 tbsp) — scaling multiplies the numeric amount only
- Grocery list (planned: add a recipe to a grocery list with adjustable serving size)

---

## 2. Current Status

### Proven Live

All of the following were executed against a real Supabase PostgreSQL database and real OpenAI API key:

| What | Evidence |
|---|---|
| `drizzle-kit push` | All 10 tables, indexes, and foreign keys applied to Supabase |
| Fastify server startup | Listens on `0.0.0.0:3000` |
| `GET /health` | Returns `{"status":"ok"}` |
| `POST /drafts` | Image draft created in real DB, returns UUID and `CAPTURE_IN_PROGRESS` |
| `GET /drafts/:id` | Returns draft with **`parsedCandidate` / `editedCandidate` / `validationResult`** (shared `RecipeDraft` names), plus `pages` and `warningStates` — not raw DB `*Json` column names |
| `POST /drafts/url` | URL draft created with `sourceType: "url"` |
| URL parse (JSON-LD) | BBC Good Food "Easy pancakes" — extracted title, 6 ingredients, 5 steps via JSON-LD cascade with quality gate. Validation: `SAVE_CLEAN` |
| `POST /drafts/:id/save` | Recipe persisted to `recipes` table with ingredients and steps |
| `GET /recipes/:id` | Full recipe retrieval confirmed |
| Supabase Storage bucket creation | `recipe-pages` bucket created programmatically |
| Supabase Storage image upload | JPEG uploaded, public URL generated, cleanup confirmed |
| Image upload via API | `POST /drafts/:id/pages` multipart upload stores file in Supabase Storage, creates `draft_pages` row |
| GPT-5.4 Vision parse | Image parse pipeline called OpenAI, correctly identified non-recipe content, validation flagged expected issues |
| GPT-5.4 URL AI fallback | Complex multi-sub-recipe page (Tonkotsu Ramen, 35 ingredients, 29 steps) extracted successfully via simplified prompt |
| OpenAI API connectivity | GPT-5.4 (image and URL) models respond, JSON mode works |

### Proven by Tests Only

**Server tests (Vitest):**

| What | Test count | Coverage |
|---|---|---|
| Validation engine | 23 tests | All 12 issue codes, all severity levels (BLOCK, FLAG, RETAKE), multi-recipe FLAG downgrade |
| Save-decision logic | 8 tests | `SAVE_CLEAN`, `SAVE_USER_VERIFIED`, `NO_SAVE`, dismissed multi-recipe FLAG |
| Parsing + normalization | 35 tests | `normalizeToCandidate`, `buildErrorCandidate`, JSON-LD extraction (incl. HowToSection headers, ingredient objects, metadata), Microdata extraction, DOM boundary (structure preservation, noise removal, richest match), URL normalization, smart truncation |
| API integration | 16+ tests | All 11 draft endpoints + 11 recipe endpoints (CRUD + hero image + collection + notes CRUD + rating), full parse-edit-save flow |
| XState machine | 10 tests | Happy path, resume routing, retake flow, URL import (imports mobile `importMachine`, mock actors) |

All 127 server tests pass.

**iOS UI tests (XCUITest, run on physical iPhone 16):**

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

### Proven on Android Emulator

| What | Evidence |
|---|---|
| Android native build | Gradle compiles all native modules, APK installs on emulator |
| Metro JS bundle | ~9 MB bundle loads, hot reload works |
| App startup + navigation | HomeScreen renders, navigation to RecipeDetail and ImportFlow works |
| Camera permission | Declared in AndroidManifest.xml, Android permission dialog appears |

### Proven on Physical iPhone (iOS)

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

### Not Yet Proven

| What | Why |
|---|---|
| Homepage collections overhaul on device | Uncategorized-only home view, "All Recipes" virtual folder, real-time search, toast with undo, collection name tags — code complete but not yet fully tested on physical device |
| User notes + star rating on device | Notes CRUD (add/edit/delete) and half-star rating with tap-toggle UX — API verified via curl and partial device testing; full end-to-end device QA pending |
| Multi-page image ordering UX | Single-page capture tested; multi-page reorder not yet tested on device |
| Real cookbook photo parsing quality at scale | Single recipe tested with good results; accuracy across varied cookbook formats (handwritten, glossy, multi-column) is untested |
| Bot-protected URL parsing from pasted/manual URLs | Clipboard/manual URL entry still depends on server fetch; AllRecipes, Simply Recipes may return 402/403 there. Browser-backed URL import is implemented, but broader device QA for blocked sites is still pending. |
| Concurrent import queue — edge cases | App backgrounding/foregrounding with active parses, queue rehydration after app restart, 3-way concurrent parse with server semaphore contention — not yet stress-tested |
| Servings accuracy across diverse sites | Tested on BBC Good Food (JSON-LD yield), Joshua Weissman (DOM metadata + AI), and several others. Sites with non-standard serving formats or no serving info at all will correctly trigger SERVINGS_MISSING BLOCK. Broader accuracy across recipe sites untested. |
| Ingredient scaling edge cases | Basic scaling verified (multiply numeric amount, mixed-number formatting). Edge cases: very large scale factors, count-based items (eggs) rounding, deeply nested sub-recipe ingredients — not yet exhaustively tested. |
| Image import servings extraction | GPT prompts now request servings; not yet tested across a wide range of cookbook photo formats. |

---

## 3. System Architecture

### Monorepo Layout

```
RecipeJar/              ← npm workspace root
├── shared/             ← TypeScript domain types (no runtime deps)
├── server/             ← Fastify API + Drizzle ORM + parsers + validation
└── mobile/             ← React Native app + XState machine + Zustand store
```

Workspaces are linked via npm workspaces. `shared/` is referenced as `@recipejar/shared` by both `server/` and `mobile/`.

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

### Validation Engine

Located in `server/src/domain/validation/`. Runs 8 rule modules in this exact order:

```
1. rules.structure       → STRUCTURE_NOT_SEPARABLE (BLOCK)
2. rules.integrity       → CONFIRMED_OMISSION (BLOCK), SUSPECTED_OMISSION (FLAG), MULTI_RECIPE_DETECTED (FLAG, userDismissible)
3. rules.required-fields → TITLE_MISSING (FLAG), INGREDIENTS_MISSING (BLOCK), STEPS_MISSING (BLOCK)
4. rules.servings        → SERVINGS_MISSING (BLOCK)
5. rules.ingredients     → INGREDIENT_MERGED (FLAG), INGREDIENT_NAME_MISSING (FLAG), OCR artifacts (FLAG)
6. rules.steps           → OCR artifacts (FLAG)
7. rules.retake          → LOW_CONFIDENCE_STRUCTURE (RETAKE or BLOCK if limit hit), POOR_IMAGE_QUALITY (RETAKE or BLOCK if limit hit)
```

Note: `rules.description.ts` exists but is **not wired into** `validation.engine.ts`. The `DESCRIPTION_DETECTED` and `INGREDIENT_QTY_OR_UNIT_MISSING` checks were intentionally removed from the validation pipeline.

There are only 3 severities (CORRECTION_REQUIRED was removed — all former CORRECTION_REQUIRED issues now emit FLAG):

| Severity | Effect on save | User action required |
|---|---|---|
| `FLAG` | Does NOT block save | User may confirm/dismiss inline in preview |
| `RETAKE` | Blocks save | User should retake the photo |
| `BLOCK` | Blocks save, no user fix possible | User must start over |

FLAGs represent observations, not errors. A missing quantity ("salt" with no amount) is valid — many recipes write it that way. The system surfaces these so the user is aware, but never prevents saving based on them.

Retake escalation: when `LOW_CONFIDENCE_STRUCTURE` or `POOR_IMAGE_QUALITY` fires, severity is `RETAKE`. After 2 retakes per page (`retakeCount >= 2` on all pages), severity escalates to `BLOCK` as `RETAKE_LIMIT_REACHED`.

Each issue has a severity. The validation result aggregates:
- `hasBlockingIssues` — any BLOCK severity
- `requiresRetake` — any RETAKE severity
- `hasWarnings` — any FLAG severity
- `saveState` — `SAVE_CLEAN` only if no BLOCK and no RETAKE

### Save-Decision Logic

Located in `server/src/domain/save-decision.ts`. Three possible outcomes:

| Condition | saveState | allowed |
|---|---|---|
| Any BLOCK or RETAKE issue exists | `NO_SAVE` | `false` |
| Only FLAGs, and user dismissed at least one | `SAVE_USER_VERIFIED` | `true` |
| No FLAGs, or FLAGs exist but none dismissed | `SAVE_CLEAN` | `true` |

FLAGs never block saving. They are attention-only — the user can confirm/dismiss them inline in the preview screen, but saving is never blocked by FLAGs.

### State Machine & Concurrent Import Architecture

The import system has two distinct paths:

**1. Concurrent queue path** (camera and photo library imports):

Camera/photo imports bypass the XState machine for upload and parse. Instead, `ImportFlowScreen` calls `enqueueImport()` which:
1. Creates a local queue entry in the Zustand `importQueueStore` (with a client-generated `localId` as stable key)
2. Calls `api.drafts.create()` + `api.drafts.addPage()` (with retry and orphan cleanup on failure)
3. Triggers `api.drafts.parse()` (server returns `202 Accepted` immediately)
4. The `importQueuePoller` hook polls `GET /drafts/:id` with exponential backoff (3s → 5s → 10s) until the draft reaches a terminal status

The user sees `ParsingView` with queue context ("Import Another" / "Review Recipes" buttons), and can queue up to 3 concurrent imports. When ready, they review each import via the Import Hub, which launches `ImportFlow` with `resumeDraftId` + `fromHub` — at which point the XState machine takes over for the resume/review/save flow.

**2. XState machine path** (URL imports + hub resume):

Located in `mobile/src/features/import/machine.ts`. XState v5 machine with 9 states. Used for URL imports (which are synchronous and not queued) and for resuming drafts from the Import Hub.

```
idle → capture (NEW_IMAGE_IMPORT — used only for retake from hub)
idle → uploading (PHOTOS_SELECTED — not used in concurrent flow)
idle → creatingUrlDraft (NEW_URL_IMPORT)
idle → resuming (RESUME_DRAFT — hub review/retake)

capture → reorder (DONE_CAPTURING)
reorder → uploading (CONFIRM_ORDER)

creatingUrlDraft → parsing (draft created, draftId assigned)
uploading → parsing (draft created, pages uploaded, draftId assigned)

parsing → previewEdit (clean parse or FLAG-only issues)
parsing → retakeRequired (RETAKE issues)

previewEdit → saving (ATTEMPT_SAVE, no blocking issues or retakes)

retakeRequired → capture (RETAKE_PAGE — retake photo)
retakeRequired → idle (RETAKE_GO_HOME — Photos entry only)

saving → saved (success, final state)
saving → previewEdit (error)
```

The `parseDraft` actor handles the server's `202 Accepted` response by entering a polling loop (`GET /drafts/:id` every 3s) until the parse completes. This is transparent to the machine — it receives the full parse result regardless of whether the server completed synchronously or asynchronously.

The `resumeDraft` actor populates `capturedPages` from the server's page data (including `resolvedImageUrl` for display and `retakeCount`), which the retake and preview screens need.

The `guidedCorrection` and `finalWarningGate` states were removed. FLAG issues are now handled inline in the preview screen (confirm/dismiss buttons) and never block saving. The machine invokes async actors for API calls (`createDraft`, `createUrlDraft`, `uploadDraft`, `parseDraft`, `saveDraft`, `resumeDraft`, `updateCandidate`).

**Server-side concurrency controls:**

- **Parse semaphore** (`server/src/parsing/parse-semaphore.ts`): max 2 concurrent OpenAI Vision calls; additional requests queue in-memory.
- **Idempotency guards**: `/parse` rejects unless draft status is `READY_FOR_PARSE`, `CAPTURE_IN_PROGRESS`, or `NEEDS_RETAKE`; `/save` rejects if already `SAVED`.
- **Race-safe status updates**: `setParsedCandidate()` uses `WHERE status = 'PARSING'` so a cancelled draft isn't overwritten by a completing parse.
- **Startup cleanup**: resets zombie `PARSING` drafts (stuck >10 min) and deletes `CANCELLED` drafts older than 24 hours.
- **Postgres pool**: increased to `max: 20` to handle concurrent background parses.

---

## 4. Prerequisites

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

## 5. Environment Variables

Create `server/.env` by copying `server/.env.example`:

```bash
cd server
cp .env.example .env
```

Then fill in these values:

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

## 6. First-Time Setup

Every command below should be run from the monorepo root (`RecipeJar/`) unless stated otherwise.

### Step 1: Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/RecipeJar.git
cd RecipeJar
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

Edit `server/.env` and fill in all four required values. See Section 5 above.

### Step 4: Create Supabase Storage bucket

In your Supabase dashboard: Storage → New bucket → Name: `recipe-pages` → Public: **enabled** → Create.

This bucket stores uploaded **draft** page images for parsing.

**Recipe hero images** use a separate bucket **`recipe-images`** (also public). With a valid **`SUPABASE_SERVICE_ROLE_KEY`**, the server **creates this bucket on first use** if it does not exist; you can also create it manually the same way as `recipe-pages`.

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

If you see `ECONNREFUSED` or `ENOTFOUND`: your `DATABASE_URL` is wrong, or you are not using the pooler URL. See Section 5.

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

---

## 7. Running the Backend

### Start command

```bash
cd server
npm run dev
```

This runs `tsx watch src/app.ts` — it auto-reloads on file changes.

For production (no watch):

```bash
cd server
npm start
```

### Expected logs on startup

```json
{"level":30,"msg":"Server listening at http://127.0.0.1:3000"}
{"level":30,"msg":"Server listening at http://[LAN_IP]:3000"}
{"level":30,"msg":"Server listening on http://127.0.0.1:3000"}
```

Each incoming request logs:

```json
{"level":30,"reqId":"req-1","req":{"method":"GET","url":"/health"},"msg":"incoming request"}
{"level":30,"reqId":"req-1","res":{"statusCode":200},"responseTime":0.5,"msg":"request completed"}
```

### Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Error: DATABASE_URL environment variable is required` | `.env` file missing or `DATABASE_URL` not set | Create `server/.env` from `.env.example`, fill in values |
| `ECONNREFUSED 127.0.0.1:5432` | `DATABASE_URL` points to localhost or a stale env var is overriding `.env` | Check `.env` has the Supabase pooler URL. In PowerShell, run `Remove-Item Env:DATABASE_URL` to clear stale vars |
| `getaddrinfo ENOTFOUND db.*.supabase.co` | Using the direct-connect URL instead of the pooler URL | Switch `DATABASE_URL` to the session pooler URL (see Section 5) |
| `ENETUNREACH` after DNS resolves to IPv6 | Machine has no IPv6 route | Use the pooler URL which resolves to IPv4 |
| `XX000 Tenant or user not found` | Wrong pooler region | Find the correct region — your Supabase dashboard shows it under Settings → Database. Common: `us-west-2`, `us-east-1`, `eu-west-1` |
| `SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required` | Missing Supabase credentials | Only thrown when a route that uses Supabase Storage is hit (image upload). Server starts without them. |
| Port 3000 already in use | Another process on port 3000 | Kill it, or set `PORT=3001` in `.env` |

---

## 8. Running the Mobile App

### Fast iteration workflow (default)

Use this for day-to-day work on screens, navigation, state, and API calls. **You should not run a full native build on every save** — that is what leads to 10–20 minute loops.

1. **API + Metro (required for a physical iPhone):** from the **repo root** (`RecipeJar/`), run:
   ```bash
   npm run dev:phone
   ```
   This starts **both** the Fastify API (`:3000`) and Metro (`:8081`) in one terminal. Leave it running while you test on the phone; **Ctrl+C** stops both. (Equivalent: two terminals — `cd server && npm run dev` and `cd mobile && npm start` — see Section 7 for server-only details.)

   To **start only what’s missing** in the background (e.g. after a reboot), from the repo root: `npm run ensure:phone` (runs [`scripts/ensure-phone-dev.sh`](scripts/ensure-phone-dev.sh)).
2. **Metro alone (if you already started the server elsewhere):**
   ```bash
   cd mobile
   npm start
   ```
   Same as `./run.sh metro`. Metro keeps its transform cache so startup and rebundling stay fast.
3. **Put the app on the phone** (skip when the app is already installed and you only changed JS; use a **second terminal** while `npm run dev:phone` stays running in the first — or after native changes):
   - **iOS — default for this project:** your **physical iPhone** over **Wi‑Fi**: `cd mobile && ./run.sh device` (see **iOS Step 4** for one-time wireless pairing). This builds, installs, and **opens the app on the phone**, not the simulator.
   - **iOS — simulator (only if you want it):** `cd mobile && ./run.sh sim` — use when you explicitly prefer the simulator (camera flows still need a real device).
   - **Android emulator:** `cd mobile && npx react-native run-android`.
4. **While you edit** files under `mobile/src/**` (and most JavaScript/TypeScript): changes apply via **Fast Refresh**. If something looks stuck, reload (**Cmd+R** in Simulator, or **shake the iPhone → Reload** on device) or use the dev menu. **Do not** run `./run.sh device` / `run-android` again for those edits — that triggers a **slow full Xcode/Gradle build** and is only needed when the **native** side changes.

**JavaScript vs native — what is “fast”**

| You changed | How you preview on the phone |
|---|---|
| `mobile/src/**`, `App.tsx`, styles, navigation, Zustand, etc. | Keep **`npm run dev:phone`** (or Metro + API) running; save the file → **Fast Refresh**, or shake → **Reload**. **No `./run.sh device`.** |
| `LaunchScreen.storyboard`, `Info.plist`, Android `res/`, new native dependency, `Podfile` | Metro **cannot** update these. Run **`./run.sh device`** (or `./run.sh sim`) **once** after the change. `./run.sh device` and `./run.sh sim` **stop any other `xcodebuild` first** so you don’t hit a locked DerivedData database. |

**What those repeating “Building the app…” lines mean**

React Native’s CLI prints lines like `- Building the app.....` over and over while **`xcodebuild` is running**. That is **one animated progress indicator**, not dozens of separate builds. Stopping **concurrent** `xcodebuild` processes (what `run.sh` does) prevents **two** builds from fighting over DerivedData; it does **not** make a **single** Xcode compile finish faster.

**How long native builds take (not the Metro / Fast Refresh path)**

| When | Typical behavior |
|---|---|
| **You only change `mobile/src/**` (JS/TS)** | **No** `./run.sh device` — seconds with Fast Refresh. |
| **First** device/simulator build after clone, or after **Clean Build Folder** / wiping DerivedData | Often **many minutes** (Pods, Swift/ObjC, all native deps). |
| **Later** `./run.sh device` with small native edits | Usually **much shorter** — incremental compile. Still slower than JS reload. |
| **Terminal looks “stuck” with no new text** | Often **not** a second build. Check **Xcode**, **Keychain**, or **macOS** for code-signing, Apple ID, 2FA, or “verification” dialogs. Until you complete those, `xcodebuild` waits. Opening **`RecipeJar.xcworkspace`** in Xcode and building once (**Cmd+R**) surfaces the same prompts in the GUI. |

**When you need more than the default**

| Situation | What to run |
|---|---|
| Weird Metro errors, stale resolution, big dependency or branch switch | `cd mobile && npm run start:reset` or `./run.sh metro-fresh` (cold Metro cache) |
| Changed `Podfile` / ran `pod install`, added a library with native code, edited `ios/` or `android/` | Full native install again: **`./run.sh device`** (physical iPhone), or `./run.sh sim` if you chose simulator, or `npx react-native run-android` |
| Release archive, clean-room verification, or Xcode “weird build” | Xcode **Product → Clean Build Folder**, then build; or delete Derived Data only when necessary |

The platform-specific steps below spell out prerequisites and one-time setup; **use `npm start` in Terminal 1** for normal development, not `--reset-cache` every time.

### Android (Windows or macOS)

#### Prerequisites check

```bash
adb devices
# Should print: List of devices attached

java -version
# Should print: openjdk version "17.x.x" or similar
```

If `adb` is not found, `ANDROID_HOME` is not set. See Section 4.
If `java` is not found, set `JAVA_HOME` to Android Studio's bundled JDK:
- **Windows:** `$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"` (PowerShell, per-session) or set it permanently via System Properties → Environment Variables.
- **macOS:** `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`

#### Step 1: Start an Android emulator

Open Android Studio → Device Manager → click the play button on your AVD.

Or from terminal:

```bash
emulator -avd YOUR_AVD_NAME
```

To list available AVDs: `emulator -list-avds`

Wait until the emulator fully boots to the home screen.

#### Step 2: Start Metro bundler

In **Terminal 1**:

```bash
cd mobile
npm start
```

Expected output:

```
info Welcome to React Native v0.76
info Starting dev server on port 8081...

Welcome to Metro v0.81.5
Fast - Scalable - Integrated

info Dev server ready
```

Leave this terminal running. **Do NOT press `a` to launch the app** — use the manual Gradle command below instead (see "Windows Gradle workaround").

If Metro misbehaves after dependency or branch changes, use `npm run start:reset` once (see **Fast iteration workflow** at the top of this section).

#### Step 3: Build and install

In **Terminal 2**:

```bash
cd mobile
npx react-native run-android
```

This compiles the native Android project and installs the app on the emulator. First build takes 3-8 minutes. **After that, leave Metro running and use Fast Refresh** — only re-run this step when the native project changes (see **Fast iteration workflow**).

##### Windows Gradle workaround

On Windows, Gradle 8.x has a known file-locking bug in `.gradle/` cache directories. If you see:

```
Could not move temporary workspace (...) to immutable location
```

Use this command instead of `npx react-native run-android`:

```powershell
cd mobile\android
Remove-Item -Recurse -Force .\.gradle -ErrorAction SilentlyContinue
.\gradlew.bat app:installDebug --no-daemon --no-build-cache --project-cache-dir C:\tmp\rj-gradle -PreactNativeDevServerPort=8081
```

This bypasses the problematic default cache location. Metro (running in Terminal 1) will serve the JavaScript bundle once the native app is installed.

#### Step 4: Server URL for Android emulator

The Android emulator cannot reach `localhost`. The API client is already configured for this — in dev mode it uses `http://10.0.2.2:3000` which maps to the host machine's `localhost:3000`. No code change needed.

If you change the server port, update `mobile/src/services/api.ts` accordingly.

### iOS (macOS only)

**Documented default:** develop and run on **Lincoln Ware's iPhone** (physical device) **wirelessly** after the one-time **Connect via network** step in Xcode. **`./run.sh device`** targets that phone by UDID in [`mobile/run.sh`](mobile/run.sh), builds from the CLI, installs, and launches the app on the device. The **simulator** is optional — use **`./run.sh sim`** only when you explicitly want the iOS Simulator instead.

#### Prerequisites

- Xcode 15+ (App Store)
- CocoaPods: `gem install cocoapods` (or `brew install cocoapods`)
- Xcode Command Line Tools: `xcode-select --install`

#### Step 1: Install iOS dependencies

```bash
cd mobile/ios
pod install
cd ..
```

If `pod install` fails with version conflicts, try:

```bash
cd mobile/ios
pod install --repo-update
cd ..
```

#### Step 2: Start Metro bundler

In **Terminal 1**:

```bash
cd mobile
npm start
```

Leave this running. Equivalent: `cd mobile && ./run.sh metro`.

Use `npm run start:reset` or `./run.sh metro-fresh` only when you need a cold Metro cache (troubleshooting or large JS tree changes) — not every session.

#### Step 3: Build and run (Cursor-driven workflow, recommended)

A convenience script [`mobile/run.sh`](mobile/run.sh) provides all common commands without needing Xcode open.

**Normal path — physical iPhone (wireless):** after Metro is running and Step 4 pairing is done once:

```bash
cd mobile
./run.sh device
```

That runs `react-native run-ios` with the UDID for **Lincoln Ware's iPhone** (see comment in `run.sh`). Xcode builds the app, installs it on the phone, and **opens it on the device** over Wi‑Fi (same network as the Mac). It does **not** use the simulator unless you run `./run.sh sim` instead.

**All commands:**

```bash
cd mobile

# Start Metro (default — fast, reuses cache)
./run.sh metro

# Start Metro with empty cache (troubleshooting / rare)
./run.sh metro-fresh

# DEFAULT: physical iPhone — build, install, launch on device (wireless after Step 4)
./run.sh device

# Optional: only when you want the simulator instead of the phone
./run.sh sim

# Optional: different iPhone — UDID from Xcode → Window → Devices and Simulators
# export IOS_DEVICE_UDID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" && ./run.sh device
```

**Key insight:** Most code changes are JS-only (screens, components, styles, state, API calls) and do NOT require a rebuild. Metro Fast Refresh updates the app while Metro stays running. You only need **`./run.sh device`** (or `./run.sh sim` if you use the simulator) again when native code or iOS project settings change (e.g., adding a library with native modules, modifying `project.pbxproj`, after `pod install`).

To list available simulators: `xcrun simctl list devices available`

#### Step 4: Physical iPhone — one-time wireless setup (required for `./run.sh device`)

**One-time wireless debugging setup (requires Xcode + USB):**
1. Connect **Lincoln Ware's iPhone** via USB
2. Open Xcode → Window → Devices and Simulators
3. Select the iPhone, check **"Connect via network"**
4. Wait for the globe icon to appear next to the device
5. Disconnect USB — future **`./run.sh device`** runs deploy **wirelessly** (phone and Mac on the same Wi‑Fi)

**After setup**, use `./run.sh device` from the terminal to build, install, and launch on the phone. No USB or Xcode GUI required for day-to-day runs.

If you replace the phone or the UDID changes, either update the default in `run.sh` or set `IOS_DEVICE_UDID` (see Step 3).

**Alternative (Xcode GUI):**
1. Open `mobile/ios/RecipeJar.xcworkspace` in Xcode (use `.xcworkspace`, NOT `.xcodeproj`)
2. Select your Apple Developer team: Project Navigator → RecipeJar target → Signing & Capabilities → Team
3. Connect your iPhone via USB or Wi-Fi, select it as the build target
4. Press **Cmd+R** to build and run

#### Step 5: Run iOS UI tests on a physical iPhone

The project includes an XCUITest target (`RecipeJarUITests`) with 21 automated UI tests. These tests launch the app on the device and interact with the UI programmatically.

**Prerequisites:**
- Metro must be running (Step 2 above — `npm start` / `./run.sh metro`)
- The API server should be running (`cd server && npm run dev`) if you want tests that depend on API responses to exercise their full paths
- Your iPhone must be selected as the build destination in the Xcode toolbar

**To run:**

1. Open `mobile/ios/RecipeJar.xcworkspace` in Xcode (use `.xcworkspace`, NOT `.xcodeproj`)
2. Select your iPhone as the destination in the Xcode toolbar
3. Press **Cmd+U** to run all tests

**What to expect:**
- The app will open and close ~20 times on your iPhone (once per test method)
- You'll see a "Downloading" progress bar as Metro sends the JS bundle to the device on each launch
- The full suite takes 10-15 minutes on a physical device because each test relaunches the app and re-downloads the JS bundle
- Results appear in Xcode's Test Navigator (Cmd+6) as green checkmarks or red X marks
- Tests that require specific server responses (e.g., a parse returning warnings) use `guard ... else { return }` and skip gracefully

**If tests can't find elements:**
- React Native elements use `testID` props which map to `accessibilityIdentifier` on iOS
- All XCUITest queries use `app.descendants(matching: .any)["identifier"]` to search the entire element tree regardless of native element type — this is required because React Native's `TouchableOpacity` doesn't always map to a native button
- The debug test (`testAAA_DebugDumpHomeScreen`) prints the full accessibility tree to the Xcode console — run it first if element queries are failing

**To run individual tests:**
- Open Test Navigator (Cmd+6), click the play button next to any specific test

#### iOS-specific notes

- iOS Simulator uses `localhost`, so the default API URL (`http://localhost:3000`) works without changes.
- For a **physical iPhone**, change `BASE_URL` in `mobile/src/services/api.ts` to your Mac's LAN IP: `http://192.168.x.x:3000`. Find your LAN IP with `ifconfig | grep "inet " | grep -v 127.0.0.1`.
- **Metro on a physical iPhone:** Debug builds read **`RecipeJarDevPackagerHost`** in [`mobile/ios/RecipeJar/Info.plist`](mobile/ios/RecipeJar/Info.plist) (host only, no `http://`, no port). It **must be the same LAN IP** as in `api.ts`, or the phone may load a **stale JS bundle** while API calls still work — so the UI never matches your latest `mobile/src` edits. After changing that plist key, run **`./run.sh device`** once. The simulator ignores this key and still uses the default packager discovery.
- Camera is **not available** in the iOS Simulator. Use a physical device to test camera capture flows.
- The app requires camera permission. The `Info.plist` should contain `NSCameraUsageDescription`. If missing, add it in Xcode: Info tab → add `Privacy - Camera Usage Description` with value `RecipeJar needs camera access to photograph cookbook pages`.

### Common mobile build errors

| Symptom | Cause | Fix |
|---|---|---|
| `SDK location not found` | `ANDROID_HOME` not set | Set env var to your Android SDK path. Create `mobile/android/local.properties` with `sdk.dir=C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk` |
| `JAVA_HOME is not set` | JDK path not configured | Set `JAVA_HOME` to Android Studio's bundled JBR (see prerequisites above) |
| `No connected devices` | Emulator not started | Start an AVD from Android Studio Device Manager before running the build |
| `Could not move temporary workspace` | Gradle file-locking on Windows | Use the `--project-cache-dir C:\tmp\rj-gradle` workaround above |
| `ViewManagerWithGeneratedInterface` errors | Library requires New Architecture | Ensure `newArchEnabled=false` in `mobile/android/gradle.properties` |
| `listen EADDRINUSE :::8081` | Another Metro instance running | Kill it: `Get-NetTCPConnection -LocalPort 8081 \| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` (PowerShell) |
| `Unable to resolve module` or SHA-1 error | Metro cache stale | Run `cd mobile && npm run start:reset` or `./run.sh metro-fresh` |
| `pod install` fails (iOS) | CocoaPods not installed or outdated | `gem install cocoapods` then `cd mobile/ios && pod install --repo-update` |
| `StyleSizeLength` / Yoga errors in **RNSVG** (iOS, New Arch) | Upstream `react-native-svg` C++ vs RN 0.76 Yoga | Repo pins **`react-native-svg@15.15.4`** (root `overrides` + `mobile` dep) and applies **`patches/react-native-svg+15.15.4.patch`** via `patch-package` on `npm install`. Ensure **`metro.config.js`** `extraNodeModules` keeps a **single** SVG copy. |
| `folly/json/dynamic.h` not found (iOS compile) | Broken `RCT-Folly` header symlinks on **case-insensitive APFS** | Re-run **`cd mobile/ios && pod install`** — `Podfile` rebuilds `Pods/Headers/Public/RCT-Folly/folly/json`. |
| `No bundle URL present` (iOS) | Metro not running | Start Metro in a separate terminal first |
| Xcode alert **Unable to boot device in current state: Booted** | Simulator already running; tooling tries to boot it again | Use `./run.sh sim` (it shuts down a booted **iPhone 17 Pro** first), or run `xcrun simctl shutdown all`, then build again |
| `database is locked` / `unable to attach DB` (DerivedData `build.db`) | Two **concurrent** `xcodebuild` runs (e.g. Xcode + terminal, or two terminals) | **`./run.sh device`** and **`./run.sh sim`** kill other `xcodebuild` processes before starting. Or run `pkill -9 xcodebuild`, wait a few seconds, then build again |

### Physical device (Android)

For a USB-connected Android device:

1. Enable Developer Options and USB Debugging on the device
2. Connect via USB, accept the debugging prompt
3. `adb devices` should list the device
4. `npx react-native run-android` targets the physical device

For physical device networking, change `BASE_URL` in `mobile/src/services/api.ts` to your machine's LAN IP:

```typescript
const BASE_URL = __DEV__
  ? "http://192.168.x.x:3000"
  : "https://api.recipejar.app";
```

Find your LAN IP: `ipconfig` (Windows) or `ifconfig` (macOS).

---

## 9. End-to-End Test Flow

This is a scripted walkthrough you can execute against the running server to verify the full pipeline. Uses `curl`. Replace `$DRAFT_ID` and `$RECIPE_ID` with actual UUIDs from responses.

Replace `$DRAFT_ID` and `$RECIPE_ID` with actual UUIDs from responses.

```bash
# 1. Create a draft (201 → returns {id, status: "CAPTURE_IN_PROGRESS"})
curl -s -X POST http://localhost:3000/drafts -H "Content-Type: application/json" -d '{}'

# 2. Upload an image page (201 → returns page with imageUri)
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/pages -F "page=@/path/to/recipe-photo.jpg"

# 3. Parse the draft (202 → returns {status: "PARSING"} for image drafts; poll GET /drafts/$DRAFT_ID until status is PARSED or NEEDS_RETAKE)
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/parse -H "Content-Type: application/json" -d '{}'
# Poll until parsing completes:
# curl -s http://localhost:3000/drafts/$DRAFT_ID | jq '.status'

# 4. (Optional) Edit the candidate — triggers revalidation
curl -s -X PATCH http://localhost:3000/drafts/$DRAFT_ID/candidate \
  -H "Content-Type: application/json" \
  -d '{"title":"Fixed Title","ingredients":[{"id":"i1","text":"2 cups flour","orderIndex":0,"isHeader":false}],"steps":[{"id":"s1","text":"Mix ingredients.","orderIndex":0}]}'

# 5. Save the recipe (201 → {recipe, saveDecision}; 422 if BLOCK/RETAKE issues remain)
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/save -H "Content-Type: application/json" -d '{}'

# 6. Fetch the saved recipe
curl -s http://localhost:3000/recipes/$RECIPE_ID
```

**URL-based flow** (alternative to image — no page upload needed):

```bash
curl -s -X POST http://localhost:3000/drafts/url -H "Content-Type: application/json" -d '{"url":"https://www.bbcgoodfood.com/recipes/easy-pancakes"}'
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/parse -H "Content-Type: application/json" -d '{}'
curl -s -X POST http://localhost:3000/drafts/$DRAFT_ID/save -H "Content-Type: application/json" -d '{}'
```

---

## 10. Manual QA Checklist

Full checklist is in `QA_CHECKLIST.md` with 11 scenarios, expected validation issues, save states, and machine transitions for each.

### 5 most important scenarios to test first

| Priority | Scenario | What it proves |
|---|---|---|
| 1 | **Clean single-page recipe (image)** | Happy path works end-to-end: capture → parse → validate → save |
| 2 | **Clean URL recipe (JSON-LD)** | URL cascade extracts structured data correctly |
| 3 | **Weak/blurred image** | RETAKE flow works, retake escalation to BLOCK |
| 4 | **FLAG confirm round-trip** | FLAG issues appear inline, user confirms/dismisses, SAVE produces SAVE_USER_VERIFIED |
| 5 | **Draft resume** | Abandoned drafts can be resumed at the correct machine state |

---

## 11. Project Structure

```
RecipeJar/
├── package.json                          # npm workspace root; `npm run dev:phone` starts API + Metro; `postinstall` → patch-package + dev LAN host script
├── patches/                              # patch-package: `react-native@0.76.9`, `react-native-svg@15.15.4` (do not delete; required after `npm install`)
├── scripts/                              # e.g. `ensure-phone-dev.sh`, `write-recipejar-dev-host.cjs`
├── .gitignore
├── README.md                             # this file
├── CHANGELOG.md                          # dated release notes; start here after a long break
├── QA_CHECKLIST.md                       # manual QA test scenarios
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
│   │   └── 0007_structured_ingredients_servings.sql # baseline_servings on recipes + structured ingredient columns (amount, amount_max, unit, name, raw_text, is_scalable)
│   ├── src/
│   │   ├── app.ts                        # server entry point, Fastify setup, route registration, startup cleanup (stuck parsing + old cancelled drafts)
│   │   ├── api/
│   │   │   ├── drafts.routes.ts          # 13 draft endpoints (create, upload, parse [202 fire-and-forget], edit, save [idempotent], cancel, etc.); resolved page image URLs on GET
│   │   │   ├── recipes.routes.ts         # 11 recipe endpoints (list, get, put, delete, hero image post/delete, assign collection, notes CRUD, rating)
│   │   │   └── collections.routes.ts     # 5 collection behaviors: POST create, GET list, GET :id/recipes, PATCH :id rename, DELETE :id (204)
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
│   │   │   └── event-logger.ts           # structured event logging (draft_created, parse_started, parse_failed, draft_cancelled, startup cleanup, etc.)
│   │   ├── services/
│   │   │   ├── supabase.ts               # shared Supabase client (service role)
│   │   │   └── recipe-image.service.ts   # recipe-images bucket, hero/thumb paths, upload/delete, resolved URLs on recipe JSON
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
│   │       ├── schema.ts                # 10 tables + recipes.baseline_servings + structured ingredient columns + drafts.parse_error_message
│   │       ├── drafts.repository.ts     # CRUD for drafts, pages, warning states + setParsedCandidate (race-safe, includes servings), setParseError, resetStuckParsingDrafts, deleteOldCancelledDrafts
│   │       ├── recipes.repository.ts    # CRUD for recipes, structured ingredients, steps, source pages + assignToCollection/removeFromCollection via join table + rating; update() runs Rule A (ingredient re-parse)
│   │       ├── recipe-notes.repository.ts # CRUD for recipe notes (create, update, delete, list by recipe) + touches parent recipe updatedAt
│   │       └── collections.repository.ts # collections: create, list, findById, update (name + updatedAt), delete
│   └── tests/
│       ├── validation.engine.test.ts    # 23 tests — all validation rules
│       ├── save-decision.test.ts        # 8 tests — save decision logic
│       ├── parsing.test.ts             # 38 tests — normalization, error candidate, URL extractors
│       ├── url-ssrf-guard.test.ts     # SSRF guard + fetchUrl redirect behavior
│       ├── integration.test.ts         # 34 tests — API endpoints incl. recipe hero image (mocked DB/storage)
│       └── machine.test.ts            # 10 tests — XState machine transitions
│
└── mobile/                              # React Native app
    ├── package.json
    ├── tsconfig.json
    ├── app.json                         # native project name: "RecipeJar"
    ├── index.js                         # app entry point
    ├── App.tsx                          # root component, SafeAreaProvider, NavigationContainer (with navigationRef), stack navigator (6 screens incl. ImportHub), PendingImportsBanner + AppPoller at root
    ├── run.sh                           # convenience script: metro (default), metro-fresh, sim, device
    ├── babel.config.js                  # RN babel preset + reanimated plugin
    ├── metro.config.js                  # monorepo watch folders, shared alias
    ├── react-native.config.js           # CLI project source dirs
    ├── Gemfile                          # Ruby deps for CocoaPods (iOS)
    ├── .gitignore
    ├── android/                         # Android native project (com.recipejar)
    ├── ios/                             # iOS native project (RecipeJar)
    │   ├── Podfile                      # CocoaPods config + post_install patches (includes Xcode 26.4 fmt/Hermes workaround)
    │   ├── RecipeJarTests/             # XCTest unit test target (1 test)
    │   │   ├── RecipeJarTests.m        # Verifies home screen renders "RecipeJar" text
    │   │   └── Info.plist
    │   └── RecipeJarUITests/           # XCUITest UI test target
    │       ├── RecipeJarUITests.swift   # Home screen, navigation, recipe detail tests
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
        │   └── RecipeDetailScreen.tsx   # single recipe view with Edit button, inline star rating, notes section, **servings stepper** (±1, free-type, reset), scaled ingredient display
        ├── utils/
        │   └── scaling.ts              # client-side ingredient scaling: scaleAmount, formatAmount (mixed numbers, unicode fractions, ⅛ rounding), scaleIngredient (headers/non-scalable verbatim, range support)
        ├── services/
        │   └── api.ts                  # API client (drafts incl. parse 202 + cancel; recipes incl. hero image + collection assign w/ 404 + update w/ baselineServings; collections list/create/update/PATCH + delete w/o JSON on 204)
        └── stores/
            ├── recipes.store.ts        # Zustand store for recipe list
            ├── collections.store.ts    # Zustand: fetch, create, updateCollection, deleteCollection (+ refetch recipes after delete)
            └── importQueue.store.ts    # Zustand store with AsyncStorage persistence for concurrent import queue (QueueEntry with localId, nullable draftId, status, thumbnailUri; max 3 entries; reconcileQueue on rehydrate)
```

---

## 12. Common Failure Points

### Supabase IPv6 DNS Issue

**Problem:** Supabase direct-connect hostnames (`db.*.supabase.co`) have only AAAA (IPv6) DNS records. Node.js on Windows often cannot resolve or route to these addresses. Symptoms: `getaddrinfo ENOTFOUND`, `ENETUNREACH`.

**Fix:** Use the **session pooler** URL instead. Format: `postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres`. This resolves to IPv4.

### Missing `.env` File

**Problem:** Server crashes immediately with `DATABASE_URL environment variable is required`.

**Fix:** Copy `server/.env.example` to `server/.env` and fill in values.

### Stale Environment Variables

**Problem:** On Windows, if you previously set `DATABASE_URL` as a system/user environment variable, it overrides the `.env` file.

**Fix:** In PowerShell, run `Remove-Item Env:DATABASE_URL` before starting the server. Or delete the system environment variable.

### Mobile Build Fails — No Android SDK

**Problem:** `npx react-native run-android` fails with "SDK location not found".

**Fix:** Install Android Studio, set `ANDROID_HOME` environment variable. See Section 4.

### Server Running Stale Code After File Changes

**Problem:** You change server files (`server/src/**`), but the running API process keeps serving the old code. Logs don't show expected output (e.g., new `console.log` lines never appear), or behavior doesn't match what's on disk.

**Cause:** The dev server runs via `tsx watch src/app.ts`, which uses a file watcher to detect changes and auto-restart. This watcher does not always fire — particularly when changes are made programmatically (e.g., by an AI agent or a script writing multiple files rapidly), or when new files are created in directories that weren't in the original watch tree. There is no visible error; the server keeps running the stale version silently.

**How to detect:** After making server-side changes, look for the `Server listening at ...` log message in the terminal. If it only appears once (from the original startup), the server never restarted. You can also add or change a `console.log` and verify it appears.

**Fix:** Manually restart the server. Kill the process (`lsof -iTCP:3000 -sTCP:LISTEN -t | xargs kill -9`) and re-run `npm run dev -w @recipejar/server` or `npm run dev:phone`. Always restart after major changes to server code — do not trust `tsx watch` to catch everything.

### Folder rename fails (or `Route PATCH:/collections/... not found`)

**Problem:** Mobile shows **Could not rename folder** / generic failure, or a dev sees Fastify **404** with **`Route PATCH:/collections/:id not found`** in the response body.

**Cause:** The API process does not include **`PATCH /collections/:id`** (stale server before pull, or production host not deployed).

**Fix:** Restart local API from current repo (**`npm run dev:phone`**). Verify with  
`curl -X PATCH http://127.0.0.1:3000/collections/<uuid> -H "Content-Type: application/json" -d '{"name":"x"}'`  
— expect **`{"error":"Collection not found"}`** for a fake UUID (route exists), not a Fastify route-not-found JSON shape. Deploy the same server revision for release builds using **`api.recipejar.app`**.

### Metro Port Conflict

**Problem:** `listen EADDRINUSE :::8081`.

**Fix:** Kill the existing process on port 8081. On Windows: `Get-NetTCPConnection -LocalPort 8081 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`.

### OpenAI Rate Limit or Invalid Key

**Problem:** `POST /drafts/:id/parse` returns 500 for image drafts.

**Fix:** Check `OPENAI_API_KEY` in `.env`. Verify the key is active at https://platform.openai.com/api-keys. Note: URL parsing with JSON-LD structured data does NOT require OpenAI and works without this key.

### Bot-Protected URLs Return Empty Parse

**Problem:** URL drafts for AllRecipes, Simply Recipes, etc. parse but return empty candidates with `NO_SAVE`.

**Cause:** These sites often block server-side HTTP requests (402/403). The plain server-fetch path can still fail there even with the browser-like UA retry.

**Current behavior:** If the user imports from `WebRecipeImportScreen`, the app first tries **`webview-html`** by capturing the loaded page HTML from the in-app browser and sending that HTML into the normal URL parsing cascade. If that capture fails technically, the app falls back once to **`server-fetch-fallback`** and the server retries with its existing `fetchUrl` logic. Clipboard/manual URL entry still uses **`server-fetch`** directly.

**Workaround:** For blocked sites, prefer the in-app browser URL flow over pasted/manual URL entry. If both paths still fail, the site is likely serving a consent wall, challenge page, or other non-recipe HTML to the client/session.

### react-native-screens / react-native-gesture-handler Build Error

**Problem:** Android native build fails with `ViewManagerWithGeneratedInterface` unresolved supertype errors.

**Cause:** The v4.x `react-native-screens` and v2.21+ `react-native-gesture-handler` require React Native's New Architecture (Fabric). With `newArchEnabled=false`, the generated interfaces don't exist.

**Fix:** The project pins `react-native-screens@~3.35.0` and `react-native-gesture-handler@~2.20.2`, which are the last versions compatible with the old architecture. If you upgrade these packages, verify `newArchEnabled` in `mobile/android/gradle.properties`.

### Gradle File-Locking on Windows

**Problem:** `Could not move temporary workspace (...) to immutable location` during Android build.

**Cause:** Gradle 8.x on Windows has a known bug where cache files get locked by the daemon or other processes.

**Fix:** Run the build with `--no-daemon --no-build-cache --project-cache-dir C:\tmp\rj-gradle`. See Section 8 for the full command. Also ensure Android Studio is closed when building from the command line.

### Xcode 26.4 `fmt` / Hermes Build Failure

**Problem:** iOS builds can fail in the `fmt` pod with errors like `call to consteval function ... is not a constant expression` from `Pods/fmt/include/fmt/format-inl.h`.

**Cause:** Hermes' bundled `fmt` version enables `consteval` under Apple Clang in Xcode 26.4, but that toolchain/path is currently unreliable for this pod.

**Fix:** The project patches `Pods/fmt/include/fmt/base.h` during `pod install` from `mobile/ios/Podfile` so `FMT_USE_CONSTEVAL` is forced to `0`. If you hit this error:

1. Run `cd mobile/ios && pod install`
2. Rebuild
3. If the error persists, verify the patch exists in `Pods/fmt/include/fmt/base.h`

### `run.sh device` Hides Real Xcode Errors

**Problem:** `./run.sh device` can print only `(2 failures)` and then fail to install an app bundle, which makes the true cause hard to see.

**Cause:** The device build script pipes `xcodebuild` output through `tail -1`, so you only see the last build line.

**Fix:** Run raw `xcodebuild` from `mobile/` when debugging native build failures:

```bash
xcodebuild -workspace ios/RecipeJar.xcworkspace \
  -scheme RecipeJar \
  -configuration Debug \
  -destination "id=<YOUR_DEVICE_UDID>" \
  build
```

---

## 13. Development Workflow

### Mobile app (fast default)

When you work on `mobile/src/**`, follow **Section 8 — Fast iteration workflow (default)**. For a **physical iPhone**, start **`npm run dev:phone`** from the repo root so **API + Metro** are always up before you open the app. The documented iOS default is **Lincoln Ware's iPhone** over **Wi‑Fi** (`./run.sh device` after one-time pairing), not the simulator. Run **`./run.sh device`** once per session (or after native/Pod changes), then use Fast Refresh. Use `npm run start:reset` or `./run.sh metro-fresh` only when Metro’s cache is suspect; use full native rebuilds for deploys and native changes.

### Tracing the import flow

When changing import behavior, trace it in this order. The import system has **two paths** depending on the source:

**Camera/Photos (concurrent queue path):**

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

**URL imports (XState path):**

1. `mobile/src/screens/HomeScreen.tsx` → URL fan action
2. `mobile/src/navigation/types.ts` — Route params including optional `urlHtml`, `urlAcquisitionMethod`, capture-failure metadata
3. `mobile/src/screens/ImportFlowScreen.tsx` — detects URL mode → XState machine
4. `mobile/src/features/import/machine.ts` — events, states, transitions, async actors; `parseDraft` handles `202` via polling
5. `mobile/src/services/api.ts` — upload/parse/save API calls
6. `server/src/api/drafts.routes.ts` — upload, parse, save endpoints; acquisition-source selection
7. `server/src/parsing/url/url-parse.adapter.ts` — 4-tier cascade for both fetched and browser-captured HTML

**Hub review/retake (XState resume path):**

1. `mobile/src/screens/ImportHubScreen.tsx` — taps card → `navigation.push("ImportFlow", { resumeDraftId, fromHub: true })`
2. `mobile/src/screens/ImportFlowScreen.tsx` — detects `resumeDraftId` → sends `RESUME_DRAFT` to XState; `fromHub` controls post-save navigation (skip SavedView, return to hub)
3. `mobile/src/features/import/machine.ts` — `resumeDraft` actor fetches draft, populates `capturedPages` from server pages, transitions to appropriate state

This is the shortest correct mental model for both human contributors and AI agents.

### Adding a validation rule

1. Create a new file in `server/src/domain/validation/` following the pattern of existing rule files (e.g., `rules.description.ts`)
2. The function signature must be: `(candidate: ParsedRecipeCandidate) => ValidationIssue[]`
3. Use only `BLOCK`, `FLAG`, or `RETAKE` severity (CORRECTION_REQUIRED does not exist)
4. Add the issue code to `shared/src/types/validation.types.ts` → `ValidationIssueCode` union
5. Import and add your rule to the `issues` array in `validation.engine.ts` — order matters (rules run top to bottom, currently 8 modules)
6. Add tests in `server/tests/validation.engine.test.ts`

### Modifying parsing

- **Image parsing:** Edit `server/src/parsing/image/image-parse.adapter.ts`. This constructs the GPT-5.4 Vision prompt (signal-rich: includes `ingredientSignals`, `stepSignals`, and top-level signal hints for OCR quality detection) and parses the response. The prompt instructs the AI to extract only the most prominent recipe when multiple are visible. The model is set via the `model` field in the `openai.chat.completions.create()` call. Uses `detail: "high"` for accurate fraction/quantity reading. Images are sent as base64 data URLs (downloaded from Supabase at parse time, processed through `optimizeForOcr`, encoded inline) to avoid an extra network hop for OpenAI.
- **Image optimization:** Edit `server/src/parsing/image/image-optimizer.ts`. Core paths: `optimizeForUpload` (auto-orient, resize ≤3072px, JPEG 85% — draft page storage) and `optimizeForOcr` (auto-orient, resize ≤3072px, JPEG 90% — before OpenAI Vision). Additional helpers produce **hero** and **thumbnail** JPEGs for saved recipe images (`recipe-images` bucket). Both use `sharp`. Classical OCR preprocessing (grayscale, CLAHE, sharpen) was tested and found to degrade OpenAI Vision accuracy. The 3072px resolution is required for accurate fraction reading (⅓ vs ½); 2048px caused consistent misreads across multiple OpenAI models.
- **URL parsing:** The cascade is in `server/src/parsing/url/url-parse.adapter.ts`. Both fetched HTML and browser-captured HTML now enter the same shared parser helper. The cascade tries JSON-LD structured data first (`extractStructuredData`), then Microdata (`extractMicrodata`), then DOM boundary extraction (`url-dom.adapter.ts`) piped to AI fallback via GPT-5.4 (`url-ai.adapter.ts`). The URL AI prompt is intentionally simplified compared to the image prompt — it requests only `title`, `ingredients`, `steps`, `description`, and `signals.descriptionDetected`, with no signal arrays. This reduces output tokens by ~40% and prevents token-limit failures on complex recipes. All structured extraction paths are quality-gated (min 2 ingredients, 1 step, title > 2 chars). Fetch still uses retry with backoff and browser UA fallback on 403. Structured logs now include both the extraction method and the acquisition method (`server-fetch`, `webview-html`, `server-fetch-fallback`). To change priority or add a new extraction method, modify the cascade in `url-parse.adapter.ts`.
- **URL fetch (SSRF mitigation):** `server/src/parsing/url/url-fetch.service.ts` follows redirects manually (max 10 hops) and calls `server/src/parsing/url/url-ssrf-guard.ts` on **each** URL in the chain. The guard allows only `http`/`https`, rejects URLs with embedded credentials, and refuses targets whose addresses fall in private, loopback, link-local, CGNAT, documentation, multicast, or reserved ranges (IPv4 and IPv6, including IPv4-mapped IPv6). For hostnames it uses `dns.promises.lookup` with `{ all: true, verbatim: true }` so checked addresses align with typical `getaddrinfo` behavior used for outbound TCP.
- **Ingredient parser:** `server/src/parsing/ingredient-parser.ts` is a deterministic regex/rules-based decomposer for free-text ingredient lines. It extracts `amount`, `amountMax` (for ranges like "1-2 tbsp"), `unit`, `name`, and `isScalable`. Handles unicode fractions (⅓, ¼, ¾, etc.), mixed numbers ("1 ½"), ranges ("2-3", "2 to 3"), unit canonicalization (case-insensitive, supports metric + imperial), and non-scalable detection ("salt to taste", "vegetable oil for deep frying", "a pinch of"). Used in two places: (1) by the URL structured adapter to parse JSON-LD/microdata ingredient strings, and (2) by `recipes.repository.update()` for **Rule A** — when a user edits an ingredient line on a saved recipe and saves, the server re-parses that line to update its structured fields. If parsing fails, the line is saved as non-scalable without blocking the save.
- **Servings extraction:** Servings are captured from three sources: (1) GPT prompts request a `servings: { min, max }` object and the `min` value becomes `ParsedRecipeCandidate.servings`, (2) JSON-LD `recipeYield` is parsed by `parseYieldToServings()` in `url-structured.adapter.ts` which accepts keywords like "serves", "people", "portions", "makes", "yields" and rejects non-person yields ("1 loaf", "24 cookies"), (3) the DOM boundary extractor performs a secondary scan for recipe metadata elements to capture serving counts that live outside the main recipe body. If all sources fail, `servings` is null and `SERVINGS_MISSING` fires as a BLOCK — the user must manually enter servings in the import preview before saving.
- **Normalization:** `server/src/parsing/normalize.ts` converts raw extraction output into `ParsedRecipeCandidate` with `parseSignals`, `servings`, and structured ingredient fields. Signal arrays from the image parser are populated; URL-sourced results (JSON-LD, Microdata, simplified AI) have empty signal arrays, which is safe — all signal fields are optional. To add new signals, extend the `parseSignals` interface in `shared/src/types/parsed-candidate.types.ts`.

### Adding API endpoints

1. Create or edit a route file in `server/src/api/`
2. Register it in `server/src/app.ts` via `app.register(yourRoutes)`
3. Add integration tests in `server/tests/integration.test.ts`

### Extending the state machine

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

### Servings & ingredient scaling architecture

**Data model:**

- `recipes.baseline_servings` (nullable numeric) — the canonical serving count. Set once during import, editable via `RecipeEditScreen`.
- `recipe_ingredients` has structured columns: `amount` (numeric), `amount_max` (numeric, for ranges), `unit` (text), `name` (text), `raw_text` (text, original line), `is_scalable` (boolean).
- At the shared type level: `Recipe.baselineServings`, `RecipeIngredientEntry.amount/amountMax/unit/name/raw/isScalable`, `ParsedRecipeCandidate.servings`, `EditedRecipeCandidate.servings`.

**How structured ingredients are populated:**

1. **GPT parsing** (image + URL AI fallback): the prompt JSON schema requests `amount`, `amountMax`, `unit`, `name` per ingredient. GPT returns structured data directly.
2. **JSON-LD / Microdata**: these sources provide ingredient text strings. `parseIngredientLine()` from `server/src/parsing/ingredient-parser.ts` decomposes them.
3. **Rule A (saved recipe edit)**: when a user edits an ingredient in `RecipeEditScreen` and saves, `recipes.repository.update()` runs `parseIngredientLine()` on each ingredient `text` to re-populate structured fields. If parsing fails, the ingredient is saved as non-scalable (`isScalable: false`, structured fields null) — the save is never blocked by a parse failure.

**Client-side scaling (ephemeral, no persistence):**

- `mobile/src/utils/scaling.ts`: `scaleAmount(amount, factor)` multiplies, `formatAmount(value)` renders as mixed numbers with unicode fractions (⅛ rounding), `scaleIngredient(ingredient, factor)` combines them.
- `RecipeDetailScreen` maintains a local `displayServingsText` state (reset to baseline on recipe open). The scale factor is `displayServings / baselineServings`. Each ingredient is rendered through `scaleIngredient()`.
- Headers (`isHeader: true`) and non-scalable lines (`isScalable: false`) are never scaled — they render verbatim.
- No unit conversion: 15 tbsp stays 15 tbsp (not converted to cups).

**Validation:**

- `SERVINGS_MISSING` (BLOCK severity, `rules.servings.ts`): fires when `candidate.servings` is null or ≤ 0. The user must enter servings in the import preview before saving.
- `PreviewEditView` shows the servings input and validation warning. `candidateSyncPending` in `ImportFlowScreen` disables save while the `PATCH /candidate` revalidation is in flight.

### Adding testID props for iOS UI testing

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

### Adding iOS UI tests

1. Add Swift test methods to `mobile/ios/RecipeJarUITests/RecipeJarUITests.swift` or `ImportFlowUITests.swift`
2. Use the `element("testID")` helper (calls `app.descendants(matching: .any)["testID"]`)
3. Always call `waitForHomeScreen()` at the start of each test — this waits up to 120 seconds for the JS bundle to download and the home screen to render
4. Use `guard element.waitForExistence(timeout:) else { return }` for screens that may not be reachable (e.g., retake required depends on a specific parse result)
5. Run tests from Xcode with Cmd+U (requires Metro running and iPhone connected)

---

## 14. Technical Notes & Known Gaps

### Camera integration

`react-native-vision-camera` is used on a physical iPhone; capture calls **`takePhoto()`** with library defaults (older `qualityPrioritization` options are no longer on current `TakePhotoOptions` typings). Client-side compression via `react-native-compressor` was tested and removed — it caused native OOM crashes on high-resolution camera output. All image optimization happens server-side via `sharp` (see Section 13 — "Image optimization"). The iOS Simulator does not support camera — use a physical device for camera testing.

### Icon system

All UI icons use `lucide-react-native` (peer: **`react-native-svg@15.15.4`**, hoisted with root **`overrides`** and Metro **`extraNodeModules`** so only one native copy is linked). iOS needs the **`patch-package`** patch for that version under RN **0.76** New Architecture (see `patches/`). When upgrading React Native or SVG, re-verify native build and duplicate-RNSVG LogBox issues. Collection folder icons/colors come from **`mobile/src/features/collections/collectionIconRules.ts`** (`getCollectionIcon` + keyword rules); extend that module for new keywords.

### Image parsing quality

GPT-5.4 Vision with `detail: "high"` at 3072px resolution. Fraction accuracy verified. Parse time ~27 seconds per single-page recipe. See Section 13 — "Image optimization" for full pipeline details and the resolution/model iteration history.

### Known gaps

- **Bot-protected URLs**: AllRecipes, Simply Recipes, Food Network can block server-side fetches. Browser-backed URL import now mitigates this by sending client-captured HTML from `WebRecipeImportScreen` into the normal URL parsing pipeline, with a one-time fallback to server fetch if capture fails technically. Remaining failures are usually challenge pages, consent walls, or other non-recipe HTML. Clipboard/manual URL entry still relies on server fetch unless those flows are later routed through the browser.
- **Recipe metadata UI**: JSON-LD captures prep/cook/total time and image URL, but these timing fields are not yet displayed in the mobile UI. Servings are now captured and displayed.
- **Authentication**: Single-user MVP. No auth, no user table, no data-ownership. Adding auth requires: user table, session/JWT middleware, user_id FKs, Supabase RLS policies.
- **Offline / local-first**: Not implemented. All operations require network access. Future: local SQLite with sync.
- **Multi-collection assignment UI**: Schema supports many-to-many; UI currently assigns one collection at a time.
- **Varied cookbook formats**: Only tested on a few printed cookbook pages. Accuracy across handwritten, glossy, multi-column layouts is unverified.
- **Multi-image photo library import**: MVP photo import supports a single image per import action, but the concurrent import queue allows users to quickly import multiple single-image recipes back-to-back (up to 3 concurrently). Multi-image selection with shared reorder within a single import action is planned (structural scaffolding in `PHOTOS_SELECTED` event accepts an array of image URIs).
- **Server image format hardening**: Server-side `optimizeForUpload` silently falls back to the original buffer on failure. Phase 2: throw an error and return 422 so unsupported formats fail clearly instead of producing bad OCR results.

---

## 15. Changelog

Full changelog is in [`CHANGELOG.md`](CHANGELOG.md). Summary of recent changes:

- **2026-03-31** — **Servings, structured ingredients & dynamic scaling:** every recipe stores `baselineServings`; ingredients persisted with structured fields (`amount`, `amountMax`, `unit`, `name`, `raw`, `isScalable`). New deterministic ingredient parser (`ingredient-parser.ts`) for JSON-LD/microdata strings and Rule A (re-parse on saved recipe edit). `SERVINGS_MISSING` validation rule (BLOCK severity). GPT prompts updated for structured output. URL DOM extractor captures serving metadata from auxiliary elements. Client-side scaling engine (`scaling.ts`) with mixed-number formatting and unicode fractions. Servings stepper on detail screen, servings input on import preview and edit screen. Migration `0007`. Details in changelog.
- **2026-03-30** — **Collection folder rename & delete:** `PATCH /collections/:id`, mobile long-press folders + collection-screen ⋯ menu, `DeleteCollectionConfirmSheet`, assign-to-collection **404** if folder missing, `RecipeEditScreen` refetches collections on focus; **restart API** after pull so `PATCH` is registered. Details in changelog.
- **2026-03-30** — **Concurrent import queue:** users can import up to 3 image-based recipes concurrently. Server returns `202 Accepted` for parse requests and processes in background with a concurrency semaphore (max 2 OpenAI Vision calls). Client-side Zustand store with AsyncStorage persistence, exponential-backoff poller, Import Hub screen, app-wide floating banner, enqueue function with retry/orphan cleanup. New endpoints: `POST /cancel`, idempotency guards, startup cleanup. New draft statuses: `PARSE_FAILED`, `CANCELLED`. Migration `0006` adds `parse_error_message`. Dependencies: `@react-native-async-storage/async-storage`. Details in changelog.
- **2026-03-30** — **Recipe hero images:** migration `0005_recipe_image_url`, Supabase **`recipe-images`** bucket, `POST`/`DELETE` `/recipes/:id/image`, API responses include **`imageUrl`** / **`thumbnailUrl`**; shared `Recipe` fields; refactored **`server/src/services/`** (Supabase client + `recipe-image.service.ts`); draft routes use shared helpers; image optimizer gains hero/thumbnail paths; mobile **Fast Image**, full-screen viewer, edit-screen photo pick/upload, refreshed home/collection/detail flows, new sheets/cards/shimmer; validation rule tweaks; integration tests updated. Details in changelog.
- **2026-03-28** — iOS: RNSVG Yoga patch + `patch-package`, RCT-Folly `folly/json` symlink fix in `Podfile`; monorepo SVG dedupe (overrides + Metro); **draft API** GET/PATCH return `RecipeDraft` field names (`parsedCandidate`, etc.); import **word-by-word preview reveal** (~6000 WPM); mobile/server TS fixes; tests updated. Details in changelog.
- **2026-03-25** — Photo library import via `react-native-image-picker` (jar "Photos" fan action, HEIC→JPEG via `assetRepresentationMode: "compatible"`, real MIME type/filename passthrough, Photos-aware retake screen with "Go Home" button, permission denial alert with Settings link); structural scaffolding for multi-image photo imports
- **2026-03-25** — In-app WebView URL import (Google search, ad-domain blocking, Save → ImportFlow), Home clipboard sheet with session suppression, conditional **Add more** after save, mobile deps (`react-native-webview`, clipboard); README roadmap for bot-protected URL parsing
- **2026-03-22** — Image optimization pipeline (`sharp`, 3072px, GPT-5.4, `detail: "high"`)
- **2026-03-22** — User notes and star rating (4 new API endpoints, 3 new mobile components, migration 0004)
- **2026-03-22** — Homepage collections overhaul (many-to-many join table, search, "All Recipes", toast + undo)
- **2026-03-22** — Auto-assign collection icons, multi-recipe FLAG downgrade, simplified URL AI prompt, bulletproof URL parsing
- **2026-03-21** — Collections, recipe editing, validation simplification, Lucide icon migration, iOS UI tests, URL input screen, dev workflow automation
- **2026-03-20** — Import flow fix, UX improvements
