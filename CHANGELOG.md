# RecipeJar Changelog

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

**Verification (2026-03-28):** `npx patch-package --check`; `npm run typecheck` in `shared`, `server`, `mobile`; `npm test -w @recipejar/server` (127 tests).

### 2026-03-26 — Browser-backed URL import for blocked recipe sites

**Mobile — in-app browser (`WebRecipeImportScreen`):**

- **Save to RecipeJar** now attempts to capture the currently loaded page HTML from the WebView before leaving the browser.
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

- Jar **URL** opens full-screen WebView: omnibar, refresh, back/forward, **Save to RecipeJar** → `ImportFlow` URL mode (`StackActions.replace`).
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

- Root **`package.json`** adds **`npm run dev:phone`**: runs **`@recipejar/server`** `dev` and **`@recipejar/mobile`** `start` together via **`concurrently`** (one terminal; Ctrl+C stops both). Use this before testing on a physical iPhone so the app never hits "Network request failed" from a missing API.
- **README Section 8** step 1 documents this as the default for phone testing.

### 2026-03-21 — Phone dev environment automation

- **`npm run ensure:phone`** / [`scripts/ensure-phone-dev.sh`](scripts/ensure-phone-dev.sh): verifies ports **3000** and **8081**, starts **API only**, **Metro only**, or **`dev:phone`** in the background as needed, waits until ready or times out.
- **`.cursor/rules/phone-testing-dev-env.mdc`**: Cursor always-on rule — the agent must verify or start API + Metro before telling the user to check the physical device.

### 2026-03-21 — Physical iPhone: force Metro to Mac LAN IP

- **`AppDelegate.mm`**: On a **physical device** in **Debug**, the JS bundle URL uses **`RecipeJarDevPackagerHost`** from **Info.plist** so Metro is always your Mac (same IP as `api.ts`), instead of falling back to a **stale offline bundle** where the UI never updates.
- **`Info.plist`**: `RecipeJarDevPackagerHost` (currently `192.168.146.239`), `NSLocalNetworkUsageDescription` for local-network access to Metro.

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
- Created `RecipeJarUITests` XCUITest target with 21 automated UI tests across 2 test files (`RecipeJarUITests.swift`, `ImportFlowUITests.swift`)
- Tests cover: home screen elements, FAB navigation, camera import flow, URL import flow, cancel confirmation dialogs, recipe detail navigation with back button, capture view buttons, URL input screen, and deeper import states (preview edit, saved, warning gate, retake, guided correction)
- Added `testID`, `accessibilityRole`, and `accessibilityLabel` props to all interactive React Native components across all screens for XCUITest element discovery
- All XCUITest queries use `app.descendants(matching: .any)["identifier"]` instead of type-specific queries (e.g., `app.buttons["id"]`) because React Native's `TouchableOpacity` does not reliably map to a native button in the iOS accessibility tree
- Tests use 120-second timeouts for initial home screen load to accommodate JS bundle download over the network on physical devices
- Fixed legacy `RecipeJarTests.m` unit test: changed search text from "Welcome to React" (React Native template default) to "RecipeJar", reduced timeout from 600 seconds to 30 seconds, renamed test method to `testRendersHomeScreen`
- Added `RecipeJarUITests` target to the `RecipeJar.xcscheme` shared scheme (both in `BuildActionEntries` and `Testables`) so tests appear in Xcode's Test Navigator and run with Cmd+U
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
