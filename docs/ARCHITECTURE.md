# Architecture

> **What this doc covers:** Deep dive into Orzo's image parse architecture, validation engine, save-decision logic, and the dual import architecture (XState machine path + concurrent queue path). For monorepo layout and the high-level data flow diagram, see [`../README.md`](../README.md). For where individual files live, see [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md).

## Image Parse

Single-call architecture (shipped 2026-04-21 after the cost trade study at `~/.claude/plans/snug-waddling-quiche.md`):

- **Model:** `gpt-4o`, vision-capable, `detail:high` on all image inputs.
- **One call** with a merged system prompt (see [`server/src/parsing/image/prompts.ts`](../server/src/parsing/image/prompts.ts)) covering both the ingredient-side (title, servings, ingredients, metadata, page-level signals) and step-side (steps, description, step signals) responsibilities.
- **Strict JSON schema** via OpenAI's `response_format.json_schema` strict mode (see [`server/src/parsing/image/schemas.ts`](../server/src/parsing/image/schemas.ts)). Schema shape mirrors `RawExtractionResult` in [`normalize.ts`](../server/src/parsing/normalize.ts) so downstream `normalizeToCandidate` consumes the response directly.
- **temperature: 0** for deterministic fraction reads (⅔ vs ½, ¼ vs ¾). Confirmed in production at temp:0.1 to flip on visually-similar glyphs; temp:0 locks the model onto the same reading every time for the same source.
- **max_completion_tokens: 4500.** Sum of the old split-call budgets (2500 + 2000). Covers the fattest recipes we've seen in eval.
- **Cost instrumentation:** per-parse `server_parse_tokens` + `server_parse_cost` PostHog events, plus a `parse_tokens` structured log event for grep-able triage. See [`server/src/parsing/image/pricing.ts`](../server/src/parsing/image/pricing.ts) for the rate table used to compute `estimated_cost_usd`.
- **Error paths:** OpenAI throws → `buildErrorCandidate` → retake UI. Valid JSON with zero ingredients (semantic gate) → same. `finish_reason: "length"` → error (raise max_completion_tokens + file an issue).

### Architecture history

| Period | Architecture | Why |
|---|---|---|
| Before 2026-04-19 | Single gpt-5.4 call | Simple but slow (30-45s p50, output token generation dominated on verbose cookbook pages) |
| 2026-04-19 to 2026-04-21 | Split: gpt-5.4 ingredients + gpt-4o steps in parallel | Cut p50 latency to ~15s at the cost of sending images through the API twice |
| 2026-04-21 onward | **Single gpt-4o call** | 42% cost reduction, slightly better p50 latency, same fraction fidelity |

### 2026-04-21 cost trade study eval results

5 real cookbook fixtures at [`server/tests/fixtures/recipe-images/`](../server/tests/fixtures/recipe-images/), scored by [`server/tests/image-parse-eval.test.ts`](../server/tests/image-parse-eval.test.ts) (gated by `RUN_LLM_EVALS=1`):

| Architecture | Fraction gate | p50 latency | p50 cost/parse | Verdict |
|---|---|---|---|---|
| Split gpt-5.4 + gpt-4o (prior prod) | 5/5 | 19.4s | $0.0481 | baseline |
| **gpt-4o monolithic** | **5/5** | **18.7s** | **$0.0278** | **winner (current prod)** |
| Claude Sonnet 4.6 monolithic | 4/5 | 37.7s | $0.0614 | rejected: 2× slower + 28% more expensive |
| Claude Haiku 4.5 monolithic | 3/5 | 22.2s | $0.0230 | rejected: fails fraction gate (systematic 2× misreads) |

At scale the 42% cost reduction is the biggest win: 10k parses/mo goes from ~$481 to ~$278, 100k from ~$4,810 to ~$2,780.

## URL Parse

The URL parse pipeline lives in [`server/src/parsing/url/`](../server/src/parsing/url/). It runs a tiered extraction cascade, and as of 2026-04-24 also a two-layer post-cascade rescue when the primary tiers all fail.

### Primary extraction cascade (in `parseUrlFromHtml`)

1. **JSON-LD structured data** — scans `<script type="application/ld+json">` for `@type: Recipe` nodes (including `@graph` nesting). Quality gate: `≥2 ingredients`, `≥1 step`, `title.length > 2`.
2. **Microdata** (`itemprop="recipeIngredient"` / `recipeInstructions`) — same quality gate. Partial microdata (ingredients-only, no instructions) is captured as `fallbackIngredients` and later merged into the DOM-AI tier's output so the higher-fidelity site-author markers win over AI re-extraction.
3. **DOM boundary + GPT-5.4 AI** — strips navs/footers/ads (respecting a `PROTECT_CLASS_PATTERN` allowlist for `recipe`/`hentry`/`post-content`/`entry-content` tokens), hunts for recipe-wrapper classes, falls back to heading-anchored extraction (h1-h6 matching `Ingredients?|Directions?|Instructions?|Method|Preparation|Steps` with measurement-density + cooking-verb guards), then `<main>`/`<article>`, then body-text rescue. The boundary text is fed to GPT-5.4 for extraction.

Each tier emits a `url_extraction` log event (and a PostHog `server_parse_*` event) with `method`, `acquisitionMethod`, `ingredients`, `steps`, `enriched*` fields.

### URL fallback cascade (shipped 2026-04-24)

When all primary tiers return an error candidate, `parseUrlFromHtml` calls `tryUrlFallback` **once** per parse (hard-capped by `FALLBACK_MAX_DEPTH = 1` to prevent A→B→A oscillation). Two layers:

**Layer 1 — Canonical short-circuit.** Reads `<link rel="canonical">`. If present and, after `normalizeUrlForCompare` (strip fragment + trailing slash + credentials, lowercase host), differs from the current URL, retries `parseUrl(canonical, ...)` directly. Critical guard: the normalization-equality check prevents self-referential canonicals (e.g. `<link rel="canonical" href="{self}">` — common for SEO duplicate-content defense) from infinite-recursing.

**Layer 2 — Scored link-fallback.** `findCandidateRecipeLinks(html, baseUrl)` collects all anchors + JSON-LD `@graph` Recipe URLs, de-dupes by normalized URL, and scores each:

| Signal | Points |
|---|---|
| JSON-LD `@graph` Recipe node with `url` | +15 |
| href path matches `/recipe(s)?/` | +5 |
| anchor text matches `view/see/jump to/get/read (the) recipe` | +3 |
| inside `[itemtype*="schema.org/Recipe"]` | +2 |
| inside `<article>` / `<main>` / `entry-content` / `post-content` | +2 |
| inside `<nav>` / `<footer>` / `<aside>` / `<header>` | −5 |
| `/print-recipe/` variant of same page | −3 |
| AMP variant | −3 |
| cross-domain (different eTLD+1, via `sameRegisteredDomain`) | −2 |
| same-domain | +1 |

Hard-filtered before scoring: self-fragments (`#foo`), `javascript:` / `mailto:` / `tel:` / `file:` / `data:` schemes, PDFs (can't parse as HTML), anchors whose normalized URL equals the current URL.

**Layer 3 — Ambiguity decline.** If the top candidate scores `< LINK_FALLBACK_MIN_SCORE` (5) OR `≥ LINK_FALLBACK_AMBIGUITY_COUNT` (8) candidates cluster within `LINK_FALLBACK_AMBIGUITY_WINDOW` (2 points) of the top, decline the fallback. Prevents roundup posts ("30 best cookie recipes") from silently grabbing an arbitrary link.

Both layers log `canonical-short-circuit` / `link-fallback` (with `declined`, `reason`, `topScore`, `candidateCount`, `clusterCount`, `resolvedUrl`) for telemetry.

### `resolved_url` persistence (drafts row)

When the fallback picks a URL, `setParsedCandidate` writes it to the new `drafts.resolved_url` column (migration 0015). On retry of `POST /drafts/:id/parse`, the route reads `draft.resolved_url ?? draft.original_url` and routes directly to the resolved URL — link discovery runs exactly once per draft. Sync fast-path and background-parse path both honor this. When hitting the resolved URL on retry, the route re-stamps `fallbackFromUrl` / `fallbackResolvedUrl` on the candidate so the mobile banner persists across draft re-open.

**Mobile surfacing.** `ParsedRecipeCandidate.fallbackFromUrl` and `fallbackResolvedUrl` (shared types) carry the original user URL + the server's resolved URL into the review screen. `PreviewEditView` renders a disclosure banner above the tab row — *"We followed a recipe link — the page you imported wasn't a recipe, but we found a link to {host}. Does this look right?"* — with an inline "Not the right page? Back to browser →" link that cancels the draft and re-opens the WebView at the original URL.

## Validation Engine

Located in `server/src/domain/validation/`. Runs rule modules in this exact order:

```
1. rules.extraction-error → URL_BOT_BLOCKED (BLOCK, non-dismissible)     [short-circuits the rest]
2. rules.structure        → STRUCTURE_NOT_SEPARABLE (FLAG, dismissible)
3. rules.integrity        → CONFIRMED_OMISSION (FLAG, dismissible), SUSPECTED_OMISSION (FLAG), MULTI_RECIPE_DETECTED (FLAG, dismissible)
4. rules.required-fields  → TITLE_MISSING (FLAG), INGREDIENTS_MISSING (FLAG, dismissible), STEPS_MISSING (FLAG)
5. rules.servings         → SERVINGS_MISSING (FLAG)
6. rules.ingredients      → INGREDIENT_NAME_MISSING (FLAG), OCR artifacts (FLAG)
7. rules.steps            → OCR artifacts (FLAG)
8. rules.retake           → LOW_CONFIDENCE_STRUCTURE (FLAG, dismissible), POOR_IMAGE_QUALITY (RETAKE; FLAG dismissible if limit hit)
```

**Centralized short-circuit (shipped 2026-04-23 late)**: when `rules.extraction-error` emits `URL_BOT_BLOCKED`, the engine **skips every downstream rule**. The user sees exactly one actionable banner ("This site requires a real browser…") instead of a stack of `TITLE_MISSING` + `INGREDIENTS_MISSING` + `STEPS_MISSING` noise on an empty candidate. Logic lives in `validateRecipe` at the top of [`validation.engine.ts`](../server/src/domain/validation/validation.engine.ts); the guard reads `candidate.extractionError === "url_bot_blocked"` (same union the [`STEPS_EXTRACTION_FAILED`](../server/src/domain/validation/rules.steps.ts) path already uses via `steps_failed`).

**Severity consolidation 2026-04-21:** every former image-parse BLOCK was downgraded to a dismissible FLAG. The user owns their data and can always save — we surface context, we don't gate. Matches the STEPS_MISSING decision from 2026-04-19 (ingredient-only recipes are legitimate). `URL_BOT_BLOCKED` (2026-04-23 late) is the first BLOCK to come back — not a save-policy reversal, but an acknowledgement that there's literally no candidate to save when the site blocks automation.

**Retake follow-up same day:** `LOW_CONFIDENCE_STRUCTURE` also downgraded from RETAKE to FLAG. The signal fires when the vision model considers a page structurally uncertain — which includes legitimate ingredient-only screenshots (no steps visible). Retaking a clear screenshot doesn't change anything; the signal is about content, not the photo. `POOR_IMAGE_QUALITY` stays as RETAKE because that IS about photo readability and retaking legitimately helps (e.g. better lighting on a cookbook page).

Note: `rules.description.ts` exists but is **not wired into** `validation.engine.ts`. The `DESCRIPTION_DETECTED` and `INGREDIENT_QTY_OR_UNIT_MISSING` checks were intentionally removed from the validation pipeline. `INGREDIENT_MERGED` was removed 2026-04-21 (every hit was a legitimate compound ingredient like "salt and pepper to taste").

| Severity | Effect on save | User action |
|---|---|---|
| `FLAG` | Does NOT block save | Confirm/dismiss inline, or just save |
| `RETAKE` | Blocks save | Retake photo; after limit, downgrades to dismissible FLAG |
| `BLOCK` | Blocks save, non-dismissible | Only `URL_BOT_BLOCKED` today. User has to leave the app and screenshot the page instead. |

FLAGs represent observations, not errors. A missing quantity ("salt" with no amount) is valid — many recipes write it that way. The system surfaces these so the user is aware, but never prevents saving based on them.

Retake escalation: `POOR_IMAGE_QUALITY` fires as `RETAKE` on first occurrence. After 2 retakes per page (`retakeCount >= 2` on all pages), escalates to dismissible `FLAG` as `RETAKE_LIMIT_REACHED`. `LOW_CONFIDENCE_STRUCTURE` is now FLAG directly and never drives the retake UI flow.

Each issue has a severity. The validation result aggregates:
- `hasBlockingIssues` — any BLOCK severity
- `requiresRetake` — any RETAKE severity
- `hasWarnings` — any FLAG severity
- `saveState` — `SAVE_CLEAN` only if no BLOCK and no RETAKE

## Save-Decision Logic

Located in `server/src/domain/save-decision.ts`. Three possible outcomes:

| Condition | saveState | allowed |
|---|---|---|
| Any BLOCK or RETAKE issue exists | `NO_SAVE` | `false` |
| Only FLAGs, and user dismissed at least one | `SAVE_USER_VERIFIED` | `true` |
| No FLAGs, or FLAGs exist but none dismissed | `SAVE_CLEAN` | `true` |

FLAGs never block saving. They are attention-only — the user can confirm/dismiss them inline in the preview screen, but saving is never blocked by FLAGs.

## State Machine & Concurrent Import Architecture

The import system has two distinct paths:

### 1. Concurrent queue path (camera and photo library imports)

Camera/photo imports bypass the XState machine for upload and parse. Instead, `ImportFlowScreen` calls `enqueueImport()` which:
1. Creates a local queue entry in the Zustand `importQueueStore` (with a client-generated `localId` as stable key)
2. Calls `api.drafts.create()` + `api.drafts.addPage()` (with retry and orphan cleanup on failure)
3. Triggers `api.drafts.parse()` (server returns `202 Accepted` immediately)
4. The `importQueuePoller` hook polls `GET /drafts/:id` with exponential backoff (3s → 5s → 10s) until the draft reaches a terminal status

The user sees `ParsingView` with queue context ("Import Another" / "Review Recipes" buttons), and can queue up to 3 concurrent imports. When ready, they review each import via the Import Hub, which launches `ImportFlow` with `resumeDraftId` + `fromHub` — at which point the XState machine takes over for the resume/review/save flow.

### 2. XState machine path (URL imports + hub resume)

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

### Server-side concurrency controls

- **Parse semaphore** (`server/src/parsing/parse-semaphore.ts`): max 2 concurrent OpenAI Vision calls; additional requests queue in-memory.
- **Idempotency guards**: `/parse` rejects unless draft status is `READY_FOR_PARSE`, `CAPTURE_IN_PROGRESS`, or `NEEDS_RETAKE`; `/save` rejects if already `SAVED`.
- **Race-safe status updates**: `setParsedCandidate()` uses `WHERE status = 'PARSING'` so a cancelled draft isn't overwritten by a completing parse.
- **Startup cleanup**: resets zombie `PARSING` drafts (stuck >10 min) and deletes `CANCELLED` drafts older than 24 hours.
- **Postgres pool**: increased to `max: 20` to handle concurrent background parses.

## Import-Review Screen (PreviewEditView)

Post-parse, every import (URL or image) lands on [`PreviewEditView`](../mobile/src/features/import/PreviewEditView.tsx) for user review before save. Screen structure:

```
┌─────────────────────────────────────────┐
│ [URL fallback banner — if applicable]   │   ← "we followed a link to {host}" +
├─────────────────────────────────────────┤     inline "Back to browser" link
│ [ Imported  │  Source ]                 │   ← segmented tab row
├─────────────────────────────────────────┤
│ Cancel            ← Back to browser     │   ← URL-import-only second button
├─────────────────────────────────────────┤
│ [active tab pane: display:none toggle]  │
│                                          │
│   Imported: ScrollView (hero + fields)  │
│   Source:   WebView (URL) or photo list │
│                                          │
└─────────────────────────────────────────┘
```

**Sibling-render tabs** (shipped 2026-04-24). Both the Imported ScrollView and the `SourceTabView` mount once on screen mount; the inactive pane is hidden via `display: none`. WebView retains scroll/cookie/login state across tab switches; the Imported pane retains keyboard focus and cursor position. Lazy-mount was rejected because the "did the WebView reload? do I need to wait again?" confusion cost outweighed the transient memory savings (WebView unmounts with the screen on save/cancel anyway).

**SourceTabView behavior.**
- **URL imports** — WebView loads `sourceUrl` (prefers server-resolved URL over user-pasted URL when the fallback cascade fired). On `onError`, falls back to an "Open in browser" button via `Linking.openURL`. HTTP 4xx responses are ignored (many sites 4xx a fresh WebView but render fine after redirect).
- **Image imports** — vertical ScrollView of captured pages with tap-to-zoom via `FullScreenImageViewer` (the same component used by `RecipeDetailScreen`'s source strip).

**Back-to-browser affordance** (URL imports only, shipped 2026-04-24). Screen-level pill next to Cancel + inline link inside the fallback banner. Tap → fires `api.drafts.cancel` (best-effort), clears the hub queue entry if present, then `navigation.navigate("WebRecipeImport", { initialUrl: state.context.url })`. Takes the user back to the exact URL they were viewing before they tapped Save, so a mis-picked fallback or any "wrong page" review can recover without losing their place. No confirm dialog — the label is explicit.

**Peach-tint gating** (shipped 2026-04-24). The "Peach-tinted amounts are AI estimates — double-check fractions before cooking" note + per-row `inputFractional` background tint render only when `sourceType === "image"`. URL imports read structured markup and aren't subject to the LLM vision fraction-glyph misread failure mode the tint warns about. See [`mobile/src/utils/fractions.ts`](../mobile/src/utils/fractions.ts) header comment for the original rationale.
