# Orzo Changelog

### 2026-04-23 (late evening) — iPhone smoke-test follow-ups: body-rescue, title heuristic, fast-path image

Three bugs surfaced in the first iPhone smoke test of the Tier 1+2C cycle. Same-session fix-and-verify. All three confirmed working live on Orzo Dev within 20 minutes of the first failed import. Committed as [`56c1f58`](https://github.com/warelincoln/RecipeJar/commit/56c1f58).

#### 1. notquitenigella.com 2010 rescue — extractDomBoundary returned null despite captured microdata

**Symptom.** notquitenigella.com/2010/12/02 post had 23 `<li itemprop="recipeIngredient">` items captured as `fallbackIngredients`, but `extractDomBoundary` returned null because the page has no recipe-class wrapper, no `recipeInstructions` microdata, and no `<h2>Directions</h2>` heading (the directions are inline `<p><strong>Beef layer</strong></p>` paragraphs). AI never ran; the recipe cascade ended in error despite having 23 high-fidelity ingredients in hand.

**Fix.** New `extractBodyTextForRescue` helper in [`url-parse.adapter.ts`](server/src/parsing/url/url-parse.adapter.ts): strips scripts/styles/nav/footer, caps at 20 KB, returns body text. Called only when `extractDomBoundary` returns null AND `fallbackIngredients.length >= 2` — AI runs on the rescued body text, the existing microdata-ingredients merge replaces AI's re-extracted ingredients with the tagged ones. Emits `microdata-partial-merged` log tag with `reason: "boundary_null_body_rescue"` for observability.

**Verified live:** notquitenigella 2010 now saves with **23 ingredients + 10 AI-extracted steps + hero image** via the body-rescue path.

#### 2. Heading-anchored title heuristic — walk back from ingredient heading

**Symptom.** brightfarms.com/recipes/lgbtq-pride-salad saved with title "BrightFarms Recipes" instead of "LGBTQ+ Pride Salad". Old heuristic was `$("h1").first().text()` which grabbed the site's h1 header; the real recipe title lives in a `<h3>` inside a sibling div — cross-parent, so naive sibling walks don't find it.

**Fix.** New `findRecipeTitle` helper in [`url-dom.adapter.ts`](server/src/parsing/url/url-dom.adapter.ts): marks the ingredient heading with a unique `data-orzo-ing-marker` attribute, queries `h1, h2, h3, h4, [data-orzo-ing-marker]` in one combined selector (cheerio returns matches in document order), iterates and captures the last heading text seen BEFORE the marker, removes the marker. Stable across cross-parent DOM structures. Falls back to `$("h1").first()` if no preceding heading found.

**Verified live:** brightfarms now titles the recipe "LGBTQ+ Pride Salad".

#### 3. ensureImageFromFreshFetch in the fast path

**Symptom.** jamieoliver.com/recipes/cheese/halloumi-strawberry-skewers parsed cleanly via `parseUrlStructuredOnly` (JSON-LD passed the quality gate, fast path returned immediately) — but the iPhone WebView capture sometimes strips the JSON-LD `image` field, so `metadata.imageUrl` came back null. The morning's `ensureImageFromFreshFetch` server-fetch image-recovery helper was only wired into `parseUrlFromHtml` — NOT into the sync fast path.

**Fix.** Call `ensureImageFromFreshFetch` in both `parseUrlStructuredOnly` success branches (json-ld + microdata fast paths). Same guard: only fires when `acquisitionMethod === "webview-html"` AND image is missing post-enrichment.

**Verified live:** jamieoliver now hits the fast path (`fastPath: true`) AND triggers `image_fallback_fresh_fetch recovered:true` → hero image attached from the Sanity CDN URL.

#### Tests

All 101 tests in `parsing-domain-fixtures.test.ts` + `parsing.test.ts` still pass. No new fixture tests added in this commit — the three fixes exercise existing code paths covered by the brightfarms-headings, notquitenigella-2010-microdata-partial, and jamieoliver synthetic-HTML tests.

#### Deployment follow-up — Railway auto-deploy recovered

During this cycle, Railway's GitHub App auto-deploy silently stopped firing for master pushes after commit [`9a22dfd`](https://github.com/warelincoln/RecipeJar/commit/9a22dfd) failed with "skipping 'Dockerfile' at 'server/Dockerfile'" on 3 successive builder retries. Added [`railway.json`](railway.json) in [`974b754`](https://github.com/warelincoln/RecipeJar/commit/974b754) with explicit `"dockerfilePath": "server/Dockerfile"` + `"builder": "DOCKERFILE"` + healthcheck + restart policy to pin build config in-repo.

Used `railway up --ci` (Railway CLI) to manually bypass the stuck auto-deploy for `9683fdf` and `56c1f58`. The CLI deploys succeeded and both commits went live. As of `56c1f58`, GitHub auto-deploy fired simultaneously with the CLI deploy — both built the same commit identically, demonstrating Railway's GitHub integration is back online (likely re-anchored by `railway.json`).

#### TODOS.md additions

- Preview title field typewriter animation restarts on every keystroke — mobile UI bug, observed during the brightfarms title edit. Likely the animated component's `key` prop is bound to the text content itself; every keystroke re-mounts the animation. Fix in `PreviewEditView.tsx` — bind key to draft id instead.

---

### 2026-04-23 (evening) — URL import Tier 1 + Tier 2C heuristics: microdata partial, bot-block detection, heading-anchored extraction

Follow-up session to the morning's URL-import fixes. Ran a 14-day PostHog scrape of 181 URL parses → 15 non-clean outcomes → clustered into 5 tractable failure modes → ran `/plan-eng-review` which reduced scope to the 3 highest-impact mechanisms. Shipped them plus the 3 image wins already coded that morning.

Railway auto-deploys on master merge. Mobile needed **zero changes** — every change is server-side. Every existing TestFlight (Build 3) and iPhone dev build picks up the new behavior automatically.

**Commits shipped (1 on master):**

- (this commit) — feat(parse): microdata partial match + bot-block detection + heading-anchored DOM extraction + 3 image wins

**Plan doc:** `~/.claude/plans/before-we-proceed-i-moonlit-trinket.md` — Tier 1A/E + Tier 2C + image wins, Tier 1B (long-step auto-split) and Tier 2D (`<br>`-paragraph) explicitly deferred to TODOS.md after review judgment.

#### A. Microdata partial match — unblocks ingredient-only microdata sites

[`extractMicrodata`](server/src/parsing/url/url-structured.adapter.ts) now returns a partial `RawExtractionResult` when a page has `<li itemprop="recipeIngredient">` items but no `recipeInstructions` microdata. Previously required both and returned null, forcing the cascade to re-extract ingredients via AI (lower fidelity than site-author markup).

New guard: `title && ingredients.length >= 2`. Partial results flow through `passesQualityGate` (which still requires `steps.length >= 1`) and fall through to DOM-AI — but the caller now captures them into a new `fallbackIngredients` variable in [`parseUrlFromHtml`](server/src/parsing/url/url-parse.adapter.ts), mirroring the existing `fallbackTitle`/`fallbackMetadata`/`fallbackServings` pattern.

The DOM-AI branch's merge rule: **if `fallbackIngredients.length >= 2`, replace `aiResult.ingredients` entirely.** Microdata markers come from the site author; AI is a regex pass — microdata wins. Emits a new `microdata-partial-merged` log tag for PostHog observability.

Fingerprint site: notquitenigella.com/2010/12/02/trailer-park-shepherds-pie (17 microdata ingredients, 0 instructions). Pre-fix: `extraction_method: "error"` (AI cascade failed). Post-fix: `dom-ai` with merged microdata ingredients + AI-extracted steps.

#### E. Bot-block interstitial detection — friendly failure on cooks.com + Cloudflare challenges

New `detectBotBlock(html): string | null` in [`url-fetch.service.ts`](server/src/parsing/url/url-fetch.service.ts) inspects response bodies for known interstitial fingerprints:

| Label | Trigger |
|---|---|
| `bot_interstitial_are_you_human` | `<title>` contains "Are you Human?" (cooks.com) |
| `cloudflare_challenge` | `<title>` contains "Just a moment" + body contains `cf-mitigated`/`challenge-form`/`__cf_chl_jschl_tk__`/`cf-browser-verification` |
| `access_denied` | `<title>` contains "Access Denied" or "Access Restricted" + body < 4KB |

Called at **two sites**:
1. Inside `fetchUrl` — throws `BotBlockError` when a server fetch returned an interstitial. `parseUrl` catches and emits `bot-blocked` log tag.
2. Top of `parseUrlFromHtml` — catches when the iPhone in-app WebView captured and submitted the interstitial as its "page". Returns a clean error candidate with `source: "webview_html"` log annotation.

Both paths converge on a single error candidate. The user still sees the generic "couldn't parse this recipe" message today (log-only scope per review decision C2); a follow-up TODO tracks surfacing a friendly validation error.

Fingerprint site: cooks.com (4 interstitial hits in 14-day PostHog log). Post-fix: `server_url_bot_blocked` event fires with the specific label per attempt.

#### C. Heading-anchored DOM extraction — unblocks WordPress/custom-CMS recipe posts

New `extractHeadingAnchored($)` strategy slotted between the existing itemprop-fallback and the generic `<main>/<article>` fallback in [`extractDomBoundary`](server/src/parsing/url/url-dom.adapter.ts).

Algorithm:
1. Scan `<h1>-<h6>` (not just h2-h4 — brightfarms.com uses `<h5>`) in document order. First heading matching `INGREDIENT_MARKER` becomes the ingredient anchor; first matching `INSTRUCTION_MARKER` becomes the direction anchor.
2. For each anchor, collect following DOM siblings until the next heading of the same or higher rank. Sub-headings (`<h3>For the sauce</h3>`) survive as inline labels inside the section.
3. **False-positive guard:** the ingredient block must satisfy (3+ measurement patterns) OR (5+ `<li>` elements), AND the direction block must contain at least one cooking verb. If either guard fails, return null and fall through.
4. Format as `{title}\n\nIngredients:\n{ing}\n\nInstructions:\n{steps}` — same shape as the existing itemprop fallback so downstream AI + logging are unchanged.

Guard shape (measurements OR 5+ items, not AND) was chosen during [`/plan-eng-review`](/Users/lincolnware/.claude/plans/before-we-proceed-i-moonlit-trinket.md) — catches minimalist recipes like "olive oil, salt, pepper, garlic" at the cost of slightly more permissive matching on listicles.

C1 — exported `INGREDIENT_MARKER`, `INSTRUCTION_MARKER`, `MEASUREMENT_PATTERN`, `COOKING_VERB_PATTERN` as module constants so the heading-anchor strategy reuses the exact same patterns as `hasRecipeKeywords`. No duplicate regex.

Fingerprint site: brightfarms.com/recipes/lgbtq-pride-salad (WordPress post with `<h5>Ingredients</h5>` + `<h5>Recipe Preparation</h5>` in separate div wrappers). Emits a new `heading-anchor` log tag.

#### Bundled image wins (coded earlier today, shipped with this commit)

- **`<link itemprop="image">` + `<meta itemprop="image">`** added to [`findImageUrl`](server/src/parsing/url/url-dom-enrichment.ts). Unblocks notquitenigella.com 2026 posts that use microformat-style image markers instead of `og:image`.
- **`resolveImageUrl` helper** rebases relative image URLs (`/uploads/...`) against the source page URL. Unblocks us.inshaker.com cocktail pages that publish `og:image` as site-relative.
- **`ensureImageFromFreshFetch` helper** in [`url-parse.adapter.ts`](server/src/parsing/url/url-parse.adapter.ts): when `acquisitionMethod === "webview-html"` AND post-enrichment image is still missing, do one extra server-side fetch of the URL and re-run `findImageUrl` on the fresh HTML. Unblocks jamieoliver.com / abouteating.com where the iPhone WKWebView capture strips or misses `<meta>` tags (Next.js SSR sites, hydration ordering).

Each fires behind a tight guard so the happy path pays zero cost.

#### Scope reductions (approved during plan review)

- **Dropped Tier 1B (long-`HowToStep` auto-split)** — risk of over-fragmenting genuine prose steps. Replaced by a TODOS entry tracking a manual "split this step" UX affordance instead of auto-splitting.
- **Dropped Tier 2D (`<br>`-separated paragraph extractor)** — single observed site (urologyhealth.org) in 14 days. Re-evaluate if pattern reappears.

#### Test coverage (+19 tests, 30 passing in parsing-domain-fixtures)

New describe blocks and fixtures in [`server/tests/parsing-domain-fixtures.test.ts`](server/tests/parsing-domain-fixtures.test.ts):

| Group | Tests | Fixture |
|---|---|---|
| notquitenigella.com 2010 — microdata partial match | 3 | `notquitenigella-2010-microdata-partial.html` (minified to ~2KB) |
| cooks.com — bot-block interstitial detection | 4 | `cooks-interstitial.html` (~1KB) |
| brightfarms.com — heading-anchored DOM extraction | 3 | `brightfarms-headings.html` (~2KB) |
| url-dom-enrichment — image URL discovery + resolution | 9 | synthetic HTML (no new fixtures needed) |

Includes a regression check: `detectBotBlock` returns null on all 9 existing recipe fixtures (no false positives).

#### Measured results

**Before this session's final sweep (from morning commit `5b5b6f5`):** 24 full / 1 no-hero / 5 failed.

**After this session (bulk 30-URL harness):** 23 full / 1 no-hero / 6 failed. The 1-recipe delta is AI nondeterminism on saveur.com (yesterday returned "Profiteroles" title, today returned null on the same page via same code path). Saveur has no JSON-LD and no microdata, so none of the new heuristics touch it — the title regression is transient AI output variance, not a logic bug. Confirmed by tracing the cascade.

**Test suite:** 274 passed / 2 failed / 2 skipped (pre-existing failures in `integration.test.ts` notes CRUD and `machine.test.ts` syntax, both unchanged from 2026-04-22).

#### TODOS.md created

New top-level [TODOS.md](TODOS.md) with 5 open items — the 2 directly approved during plan review (bot-block friendly error, manual step-split UX) plus 3 more captured from session deferrals (Squarespace paragraph-prefix, AI time prompt tightening, Joy of Baking ATS mixed-content fix).

---

### 2026-04-23 (morning) — URL-import cascade hardening (3 failure modes unblocked) + webview→server-fetch fallback + iOS Build 3

Session started as a **bulk regression test** — pointed the parser at 30 real recipe URLs drawn from the Paprika app's supported-sites list to see where we break. 21/30 full parses, 1/30 parse-without-hero, 8/30 failed. Of the 8 failures, 3 turned out to be real parser bugs (the others were bot-block 402s and stale URLs I picked). Fixed all 3 the same session; re-ran the 30-URL sweep → 24/30 full. Follow-up iPhone testing surfaced two additional issues specific to the mobile path (webview-captured HTML returning skeletal DOM; 5 MB remote-image cap rejecting Blogger originals at `/s5472/`). Both fixed. All four server fixes are live on Railway; **TestFlight Build 3** archived the prior night carries the app icon refresh + build number bump but **zero mobile code changes** — the parse fixes reach every existing build automatically via the Railway API.

**Commits shipped (2 on master):**

- [`a1970ba`](https://github.com/warelincoln/RecipeJar/commit/a1970ba) — fix(parse): unblock 3 URL import failure modes + webview→server-fetch fallback
- [`a4806ef`](https://github.com/warelincoln/RecipeJar/commit/a4806ef) — chore(ios): bump build to 3 + refresh app icon

#### Bulk URL test harness — `a1970ba`

[`server/scripts/bulk-url-parse-test.ts`](server/scripts/bulk-url-parse-test.ts) loops a hardcoded list of URLs through `parseUrl()` (no server boot, no auth, no DB writes), categorizes each result into **`full`** (recipe + hero image), **`no-hero`** (recipe + no image), or **`failed`** (error candidate / thrown), and dumps a markdown table + per-bucket URL list. Reusable for future regression sweeps — point it at any URL array and run `npx tsx server/scripts/bulk-url-parse-test.ts`. 30-URL run durations: JSON-LD hits ~200-700 ms, DOM-AI fallbacks 6-22 s (AI-bound), total ~2.5 min for the batch.

#### URL-parse cascade fixes — `a1970ba`

All 3 failures manifested as `all_paths_failed` (no extraction method in the cascade produced a candidate). Root-caused via a debug script that ran each adapter in isolation and printed what `extractDomBoundary` was returning.

**1. Class-based junk strip deleting recipe containers** — [`url-dom.adapter.ts`](server/src/parsing/url/url-dom.adapter.ts). Root cause: `$('[class*="sidebar"]').remove()` matched **state classes** like `has-sidebar`, `no-review`, `no-related` on WordPress theme wrappers. chefmichaelsmith.com's recipe div carried `class="has-sidebar has-thumbnail no-full-image no-review no-sharing no-author-box no-related ... recipe type-recipe ... hentry recipe-type-chicken ..."` — the substring match ate the entire recipe body. After the strip, `<main>`/`<article>` text dropped from ~4KB to 352 chars. Fix: new `PROTECT_CLASS_PATTERN` check — if an element's class list contains any of `recipe` / `hentry` / `post-content` / `entry-content` / `main-content` / `article-body` / `content-body` **as a whole space-bounded token**, skip the strip even when a junk selector matches. Tightened the PROTECT regex to whole-token matching (not substring) so UI controls like `jump-to-recipe` or `save-recipe` don't accidentally get protected. Class-based strips refactored from a single chained `$(sel1, sel2, ...).remove()` into a `stripWithProtection($, sel)` helper iterating per-selector so protection fires per-element. The tag-based strip (`script, style, nav, footer, header, aside, iframe, noscript`) is unchanged — those never contain recipes regardless of parent class.

**2. hRecipe microformat not in recipe selectors** — [`url-dom.adapter.ts`](server/src/parsing/url/url-dom.adapter.ts). Root cause: desktop www.joyofbaking.com uses the **pre-schema.org hRecipe microformat** (`<div class="hrecipe">` wrapping `<.fn>` title, `<.ingredient>` items, free-text instructions). None of the existing recipe selectors (`[class*="recipe-card"]`, `[class*="wprm-recipe"]`, etc.) matched — `.recipe` (CSS token-exact) doesn't match `hrecipe`, and none of our `[class*=...]` patterns used plain `recipe` because that would over-match. Fix: added `[class*="hrecipe"]` to the DOM recipe selector list. One-line change. Note that existing `tests/fixtures/joyofbaking-mobile-macarons.html` (MOBILE subdomain) uses a completely different template — flat HTML with labeled "Ingredients:" / "Instructions:" sections — so mobile already worked via the body-keyword fallback. Desktop specifically needed hRecipe support.

**3. Body-fallback keyword gate too strict** — [`url-dom.adapter.ts`](server/src/parsing/url/url-dom.adapter.ts). Root cause: `hasRecipeKeywords` required BOTH `\bingredients?\b` AND one of `\b(instructions?|directions?|method|preparation|steps)\b` in the body text. Blogger template on angiesrecipes.blogspot.com renders ingredients as a bare `<ul>` inside a `<table>` followed by an `<ol>` of steps — **no "Ingredients:" or "Directions:" headers exist anywhere on the page**. Fix: added a parallel signal path — if the body contains **3+ measurement patterns** (matching `\b\d+\s*(?:\/\s*\d+)?\s*(?:cups?|tbsps?|tsps?|ounces?|oz|pounds?|lbs?|grams?|g|kg|ml|liters?|quarts?|pints?|...)\b`) **AND** at least one cooking verb (matching `\b(heat|cook|bake|simmer|boil|stir|whisk|fry|roast|sauté|mix|combine|add|pour|preheat|melt|season|sprinkle|drizzle|serve|garnish|marinate|chop|slice|dice|mince|blend|fold)\b`), accept the body. Both signals must fire — prevents articles that merely mention cooking from triggering, since random cooking prose doesn't contain a density of measurement patterns. Angie's page has 11 measurement hits + `heat`/`simmer`/`fry` + multiple cooking verbs → fallback triggers → AI extracts 11 ingredients + 3 steps + hero image.

**Interaction with existing gourmetmagazine test** — the tightened PROTECT_CLASS_PATTERN (whole-token only) intentionally does NOT protect `tag-recipe` (suffix token on the article wrapper) in the gourmetmagazine-split-pea fixture. The accidentally-correct pre-fix behavior is preserved: `[class*="ad-"]` matches `is-head-middle-logo` (substring `ad-` inside `head-`), strips the body, DOM boundary returns null, AI is not called, error candidate returned. This is fragile — if that specific class combination ever disappeared we'd try to parse a subscribe-gate teaser — but it's a pre-existing condition and the test holds. Noted as a known limitation for future tightening.

#### Webview→server-fetch auto-retry — `a1970ba`

[`drafts.routes.ts`](server/src/api/drafts.routes.ts) `runParseInBackground` path. Problem surfaced during iPhone testing after the cascade fixes: curl-based `parseUrl("https://chefmichaelsmith.com/recipe/classic-chicken-stew/")` succeeded (53 KB of HTML, full recipe content), but the identical URL tapped in the in-app WebView failed with `all_paths_failed` in 302 ms. Captured the iPhone's actual submitted HTML via dev-only `fs.writeFile` logging → **13 KB**, containing `<head>` + `<nav>` + `<footer>` but **zero recipe content**. No mention of `"chicken thighs"` / `"boneless"` / `"simmer"` / `"ingredients"` in the entire capture. JavaScript-hydrated content or early capture — either way, the webview path returned a skeletal DOM for this page. Fix: when `parseUrlFromHtml(suppliedHtml)` returns `candidate.extractionMethod === "error"`, the route now retries via `parseUrl(draft.originalUrl, sourcePages, "server-fetch-fallback")` — fresh fetch bypasses whatever the in-app WebView did and gets the full page. Only fires on error (successful webview parses skip the retry). Error candidates from the retry preserve the original failure (we don't double-fail the user). New `webview_html_retry_via_server_fetch` logEvent for observability. Cleaned up the dev-only `fs.writeFile` dump after diagnosis.

#### Hero-image remote cap raised 5 MB → 20 MB — `a1970ba`

[`recipe-image.service.ts`](server/src/services/recipe-image.service.ts) `REMOTE_IMAGE_MAX_BYTES`. Problem: Angie's Recipes' hero URL is `https://blogger.googleusercontent.com/.../s5472/IMG_4347.JPG` — Google serves the uploader's original at full resolution when the path has `/s{width}/`, so a 5472×… JPEG arrived as **6,533,481 bytes** (6.2 MB). Our download helper rejected it with the 5 MB cap, returning null silently, so the recipe saved with no hero. User reported the hero showed in the preview review banner (loaded directly from the remote URL) but disappeared on the recipe card + detail view. Diagnosis: added `hero_image_attach` logEvent that records metadata URL + attach outcome + failure reason. Next test surfaced `attached: false, reason: "download_failed", errorMessage: null` — which pinpointed the size-cap path (reason `null` errorMessage = not a thrown exception). `curl -sI` on the URL confirmed `content-length: 6533481`. Fix: raised cap to 20 MB. `optimizeForHero()` (sharp) still resizes every stored image to 1200px at JPEG 80% regardless, so the cap's role is defense-in-depth against obviously malicious payloads (a hostile site serving `/s50000/` of a tarball). Also added `hero_image_attach` as a proper logEvent type for future diagnostics.

#### Joy of Baking ATS error — deferred

iPhone WebView refused to load `https://www.joyofbaking.com/ChocolateChunkCookies.html` with `NSURLErrorDomain -1022` ("the resource could not be loaded because the App Transport Security policy requires the use of a secure connection"). The parent URL is HTTPS but the page embeds HTTP sub-resources (YouTube iframes + Facebook/Pinterest buttons over HTTP). iOS 13+ WebView defaults to blocking HTTP content mixed into HTTPS pages, so the whole page fails to render. Not a parse-cascade issue — the server can still `curl` the page and parse it (confirmed in the bulk test). Fix requires Info.plist `NSAllowsArbitraryLoadsInWebContent = true` or a domain-specific exception for `joyofbaking.com`. Queued for a future mobile session since it needs a TestFlight rebuild.

#### Angie's 30-30-30 time misread — deferred

AI returned `prep: 30, cook: 30, total: 30` for angiesrecipes paprika chicken — impossible math (prep + cook should equal or be less than total). The page only states "ready in just 30 minutes" once. Root cause: AI prompt doesn't distinguish "if only one aggregate time is stated, populate total only — don't fan it across all three fields." Not a parse-cascade bug; prompt-quality issue. Queued for a prompt-tightening iteration alongside the time-inference work from 2026-04-22.

#### iOS Build 3 + app icon refresh — `a4806ef`

- `CURRENT_PROJECT_VERSION` 2 → 3 in both Debug and Release configurations ([`mobile/ios/Orzo.xcodeproj/project.pbxproj`](mobile/ios/Orzo.xcodeproj/project.pbxproj)) — user archived Build 3 the night of 2026-04-22 and pushed to TestFlight.
- All 8 `AppIcon.appiconset/icon-{40,58,60,80,87,120,180,1024}.png` regenerated from new source `ORZO_ICON_4_22_26.png` (added at repo root).
- Landing page icons updated to match (`landing/icon-{180,1024}.png`).
- Removed stale `Orzo icon.png` at repo root (superseded by the dated source).

Build 3 contains **no server-side parse code** — those changes are live via Railway regardless. Build 3 ships the new icon to TestFlight testers; existing Build 2 testers also pick up every parse fix automatically the next time they import a recipe.

#### Measured results on the 30-URL sweep

**Before fixes (baseline sweep, 2026-04-23 05:35 UTC):**

| Bucket | Count | Notes |
|---|---|---|
| full (recipe + hero) | 21 | JSON-LD or microdata hit, image extracted |
| no-hero (recipe, no image) | 1 | Broke Ass Gourmet (dom-ai parse succeeded, no `og:image` or hero candidate) |
| failed | 8 | 3 real parser bugs + 3 bot-block 402s (Serious Eats, Simply Recipes, WaPo) + 2 stale URLs I picked (Pioneer Woman 404, Epicurious/Gourmet 404) |

**After fixes (re-run, 2026-04-23 18:41 UTC):**

| Bucket | Count | Delta |
|---|---|---|
| full (recipe + hero) | 24 | +3 — Angie's (dom-ai, json-ld-quality-gate-fail → body-measurement fallback), Chef Michael Smith (dom-ai, strip protection), Joy of Baking (dom-ai, hrecipe selector) |
| no-hero | 1 | unchanged |
| failed | 5 | -3 — only non-parser failures remain (stale URLs + Dotdash 402s) |

**Regression tests + fixtures:**

- [`server/tests/parsing-domain-fixtures.test.ts`](server/tests/parsing-domain-fixtures.test.ts): 3 new test groups, one per site. Each asserts `extractDomBoundary` returns > 500 chars of content with recipe-specific text markers. No AI mock needed — the assertion is on the DOM adapter output, which is the layer that was broken in each case.
- New fixtures under [`server/tests/fixtures/`](server/tests/fixtures/):
  - `chefmichaelsmith-chicken-stew.html` (53 KB, full page) — exercises PROTECT against `has-sidebar` + `no-review` + `no-related` state classes.
  - `joyofbaking-desktop-chocolate-chunk.html` (58 KB, full page) — exercises `[class*="hrecipe"]` DOM selector.
  - `angiesrecipes-paprika-chicken.html` **minified to 62 lines** from the original 6,020 — preserves only the structural signals that matter (no `<main>`/`<article>`/recipe classes, `<ul>` measured items, `<ol>` prose steps, one prominent hero `<img>`). The 6 K lines of Blogger sidebar widgets in the raw HTML were pure bloat.

Total new test coverage: **+3 tests**, 11 passing in the domain-fixtures suite (was 8 before). Full server suite: 215 passed, 2 failed, 1 skipped — the 2 failures are pre-existing in `integration.test.ts` notes CRUD (unrelated to parse; verified by stashing my changes and re-running).

**Follow-ups queued:**

1. **Prompt-tighten the AI time extraction** — so "ready in 30 minutes" populates only `totalTime` rather than all three `prepTime` / `cookTime` / `totalTime` fields with the same value. Angie's 30-30-30 is the current fingerprint.
2. **Joy of Baking ATS** — add `NSAllowsArbitraryLoadsInWebContent = true` (or a `joyofbaking.com` NSExceptionDomains entry) to [`Info.plist`](mobile/ios/Orzo/Info.plist) so the in-app WebView can render pages with HTTP-mixed sub-resources. Requires TestFlight Build 4.
3. **Broke Ass Gourmet hero image** — parse succeeds via dom-ai but no image URL is extracted. Likely fixable via better `og:image` / `twitter:image` sniffing in `enrichFromDom`. Low priority; single site, non-blocking UX.
4. **Gourmetmagazine `is-head-middle-logo` false-positive strip** — noted above. The current behavior is accidentally correct (strips body → null → error → user gets friendly "can't parse this" message). But fragile. Ideal fix: replace substring `[class*="ad-"]` strip with a whole-token regex filter, same pattern as PROTECT. Scope: tiny; risk: could surface other pages that were being correctly stripped by the loose match. Defer until we see a prod failure caused by this.

---

### 2026-04-22 — Time gap-fill + DOM top-up + "derived" TimeSource

Server-side fix for recipes where the source publishes prepTime + cookTime but not totalTime — JSON-LD partials on sites like savoryonline.com, where "READY IN 35 MINS" is template-computed at render time rather than serialized. Pre-change behavior persisted those recipes with `total_time_minutes = NULL` and relied on the mobile detail screen to compute `~35m total` at render time. Now the total is authoritative in the DB, rendered clean (no `~` prefix) because the source components are explicit and the sum is arithmetic — not an AI guess.

Railway auto-deploy on master merge. Mobile needed **zero changes** — existing strict `=== "inferred"` checks naturally skip the new `"derived"` value. No TestFlight Build 3 needed for this specific change.

**PR shipped — [PR #10](https://github.com/warelincoln/RecipeJar/pull/10) ([`09ef6b1`](https://github.com/warelincoln/RecipeJar/commit/09ef6b1)):**

#### Server-side gap-fill at save — `6a53e2a`

`POST /drafts/:id/save` in [`drafts.routes.ts`](server/src/api/drafts.routes.ts) now derives total = prep + cook and persists it when the parse omitted total, so long as both prep and cook are non-null AND the user didn't explicitly override `totalTimeMinutes` via the TimesReviewBanner (including clearing to null — user intent wins over derivation). Stricter than the client render-time fallback at [`RecipeDetailScreen.tsx:343-358`](mobile/src/screens/RecipeDetailScreen.tsx) which treats a missing half as 0; the server version requires both components. Client fallback stays for pre-change legacy rows.

Introduces **`"derived"`** as a 4th [`TimeSource`](shared/src/types/recipe.types.ts) value, distinct from `"inferred"` (AI estimate) so the UI can render arithmetic sums clean. The save-path `resolveTime` helper's return type widened via the shared `TimeSource` import; the `recipesRepository.save` input type widened the same way. New `any_derived_time_final` PostHog field on the `server_recipe_saved` event for observability of when the gap-fill fires vs. the DOM top-up catches it first.

5 integration tests in [`integration.test.ts`](server/tests/integration.test.ts) cover: happy path derive (prep 15 + cook 30 → total 45 tagged `"derived"`), strict rule (only prep present → no derive), explicit total wins (no gap-fill), user-cleared total via banner wins (`totalTimeMinutes: null` in edited), user-confirmed total wins.

#### DOM top-up for totalTime — `66dbe91`

[`enrichFromDom`](server/src/parsing/url/url-dom-enrichment.ts) now populates `metadata.totalTime` tagged `"explicit"` when JSON-LD/Microdata omitted it but recipe-scoped DOM text has a labeled duration: `"READY IN 35 MINS"`, `"Total: 45 min"`, `"Total time: 1 hour 15 min"`. New `TOTAL_TIME_LABEL` regex anchors on `total time | ready in | total` + optional separator, then `DURATION_PATTERN` matches `X hr Y min` / `45 mins` / `2 hours` / `1h 30m`. Retry loop skips leading false matches like `"Total fat: 20g"` and finds the real total later in the same element. Recipe-scope-only, **no full-body fallback** — the word "total" appears too often in nutrition panels, comments, and marketing prose to scan unbounded text safely.

`enrichedTotalTime` flag added to all 5 extraction log sites (sync JSON-LD, sync Microdata, async JSON-LD, async Microdata, async DOM-AI) in [`url-parse.adapter.ts`](server/src/parsing/url/url-parse.adapter.ts) for PostHog observability.

8 new tests in [`parsing.test.ts`](server/tests/parsing.test.ts) `describe("total-time top-up")` cover: "Ready in X" extraction, combined hour+min, hour-only, "Cook time" NOT matching as total, no-overwrite of existing JSON-LD value, false-match recovery past "Total fat: 15g", and explicit body-scope exclusion so marketing copy like "Ready in 5 min — our quickest site!" doesn't leak through.

**How the two paths stack:**

| Stage | What it catches | Tagged as |
|---|---|---|
| JSON-LD / Microdata `totalTime` | `totalTime: "PT35M"` in structured data | `"explicit"` |
| DOM top-up (new) | "Ready in 35 mins" / "Total: 35 min" in recipe-scoped HTML | `"explicit"` |
| Save-time gap-fill (new) | Prep + cook both present, total still absent | `"derived"` |
| TimesReviewBanner edit/accept | User interacted with the preview | `"user_confirmed"` |
| Vision / URL-AI prompt | Model estimated when source didn't state | `"inferred"` |
| None of the above | — | `null` |

**Measured results on live dev import (savoryonline "Creamy Pasta Primavera"):**

Pre-change: detail chip showed `15m prep · 20m cook · ~35m total` via client render-time derivation, DB value `total_time_minutes = NULL`.

Post-change: DOM top-up picks up "READY IN 35 MINS" from their recipe card markup, tagged `"explicit"`, persisted. Detail chip reads `15m prep · 20m cook · 35m total` — no `~` prefix. User verified end-to-end on physical iPhone. Railway `/health` confirmed post-deploy.

**Follow-ups queued (all lower priority):**

1. **Backfill legacy `total_time_source='inferred'` rows** where both prep and cook are `'explicit'` and `total = prep + cook` exactly — flip to `'derived'` to drop the `~` prefix on recipes imported earlier today under the original gap-fill design. User opted to let them age out naturally; skipping for now. One-liner SQL in STATUS.md when wanted.

2. **Extend DOM top-up to prep + cook labels** — current scope is total-only. Expanding to `"Prep: X"` / `"Cook: X"` would catch sites that visually label both but don't JSON-LD them. Risk: misreading sidebar/metadata that look like time but aren't recipe times. Would need more test cases. Defer until we hit a real site that needs it.

3. **Consider dropping the `~` prefix on the client render-time fallback** at `RecipeDetailScreen.tsx:343-358` for pre-change legacy rows. The fallback fires only when `totalTimeMinutes == null`, which now rarely happens for newly-saved recipes. Current behavior ships `~` unconditionally for the legacy path, which is defensible (truly unknown provenance) but arguably pessimistic when prep+cook sources are both `"explicit"`. Low priority.

---

### 2026-04-21 — Parse UX polish (10 bugs/improvements) + camera WYSIWYG + image-parse cost reduction (-42%)

Six-hour session, nine PRs merged to master. Three distinct work streams: (a) a batch of 5 UX polish bugs the user reported from TestFlight Build 2 testing, which expanded to 5 more adjacent fixes once in the code, (b) a silent but high-impact camera-preview fix that was making every captured image wider than the user expected (OCR quality drag we never measured), (c) a full eval-driven cost trade study of the image parse architecture that replaced the 2026-04-19 split-call design with a single gpt-4o call — -42% per-recipe cost with identical accuracy and unchanged latency.

Railway is fully deployed. Mobile changes need a TestFlight Build 3 cut when convenient.

**PRs shipped (9 merges, 14 commits on master):**

#### Parse UX polish — PR #6 ([`fe6d0cd`](https://github.com/warelincoln/RecipeJar/commit/fe6d0cd))

User started the session with 5 bug reports. Investigation expanded the scope to 5 more adjacent fixes. All 10 landed on one branch over 5 atomic commits.

- **`aaebd4f` fix(parser): recognize leading N/M as fraction, not integer + garbage** — [`server/src/parsing/ingredient-parser.ts`](server/src/parsing/ingredient-parser.ts) `parseAmount()` previously consumed the leading integer and then required the remainder to start with `\d+` before treating it as a slash fraction. For `"1/2 cup flour"` this returned `amount=1` with `rest="/2 cup flour"`, so the downstream `name` field inherited `"/2 cup flour"` and the rendered ingredient became `"1 /2 cup flour"`. Scaling compounded: 2× → `"2 /2 cup flour"`. Fix adds a bare-slash branch: if rest starts with `/\d+` after the initial integer and there was no decimal, the original input was `N/M`. Bug only manifested on `PUT /recipes/:id` (post-save edit re-parse via `recipes.repository.ts:355`); preview-save kept original structured fields without re-parsing, so first-save looked fine. 18 regression tests in new `server/tests/ingredient-parser.test.ts`.
- **`0a3952f` fix(parse): strip parenthetical page references from ingredients** — cookbook recipes routinely include navigation aids like `"(page 228)"`, `"(see page 12)"`, `"(p. 45)"` inside ingredient lines. These are print-book cross-references, not recipe content. Two-layer defense: [`server/src/parsing/image/prompts.ts`](server/src/parsing/image/prompts.ts) `INGREDIENTS_PROMPT` rewritten from "preserve as-is" to "strip any parenthetical page references" as the primary defense; `stripPageRefs` regex in [`server/src/parsing/normalize.ts`](server/src/parsing/normalize.ts) as the safety net. Guarded against over-stripping — `"(14 oz)"` (compound amount syntax) and `"(optional)"` stay intact; only matches explicit page/pg/p. tokens followed by digits. 9 new test cases.
- **`d6e7814` fix(validation): remove INGREDIENT_MERGED FLAG — always a false positive** — every real-world instance was a legitimate compound ingredient ("salt and pepper to taste", "oil and vinegar for dressing"), never a case where the model actually crammed two separate ingredients into one line. Rule block deleted from [`rules.ingredients.ts`](server/src/domain/validation/rules.ingredients.ts), code removed from `ValidationIssueCode` union, mobile `issueDisplayMessage` case removed. The `mergedWhenSeparable` field stays in the parse schema to avoid breaking strict-JSON validation on inflight drafts.
- **`a5e9d0a` fix(validation): gentler flags — BLOCK→FLAG + clear stale issues as user types** — two changes bundled, same "user owns their data" theme. Server: downgrade all 4 BLOCK rules to dismissible FLAGs — `INGREDIENTS_MISSING`, `STRUCTURE_NOT_SEPARABLE`, `CONFIRMED_OMISSION`, `RETAKE_LIMIT_REACHED`. Messages rewritten in the softer FLAG tone; `userDismissible: true` so the existing "Looks good" button pattern enables save after acknowledgment. `decideSave()` needed no change — with `hasBlockingIssues` always false it falls through to the SAVE_USER_VERIFIED path. Mobile: new `isLocallyResolved` helper in [`PreviewEditView.tsx`](mobile/src/features/import/PreviewEditView.tsx) hides field-level issues whose local resolution is obvious — TITLE_MISSING clears the instant the user types a character. Red border + summary badge disappear before the server PATCH round-trip completes. "Before you save" heading dropped — always "Give these a look" now.
- **`ccb6cff` fix(recipe-card): onError fallback to hero URL + retry-busted cacheKey** — home-screen thumbnails intermittently failed and never recovered because FastImage's failure cache keys on the stable `cacheKey` (pathname + updatedAt). Fix in [`RecipeCard.tsx`](mobile/src/components/RecipeCard.tsx): `onError` handler swaps to the hero URL on first thumb failure; `attempt` counter suffixed to cacheKey on retry so FastImage treats it as a fresh identity and bypasses its failure cache; `broken` state renders the orzo placeholder instead of the infinite shimmer when both thumb + hero fail.

#### Dev server restart hard rule — ([`b14f8a4`](https://github.com/warelincoln/RecipeJar/commit/b14f8a4))

After the user caught a "fix not working" issue that turned out to be `tsx watch` silently dropping a file-change reload (24-hour-old server process kept serving pre-edit code), wrote [`CLAUDE.md`](CLAUDE.md) at repo root with a hard rule: after any code change, kill + restart the server and Metro, verify `/health`, confirm the new PID's start time is in the current minute. Most likely cause is watchman recrawls on the repo path containing spaces (`MACBOOK PRO DESKTOP/Orzo`). Rule applies to every edit under `server/src/**`, `mobile/src/**`, `shared/src/**`, or config files.

#### LOW_CONFIDENCE_STRUCTURE RETAKE→FLAG — ([`868061a`](https://github.com/warelincoln/RecipeJar/commit/868061a))

Follow-up to the gentler-flags pass. User testing surfaced that a clear screenshot of an ingredient list (no title, no steps — a legitimate supported use case per the 2026-04-19 decision) was being routed to the retakeRequired screen because the vision model marks such pages as "structurally uncertain" via `parseSignals.lowConfidenceStructure=true`. The rule emitted RETAKE severity, which `save-decision.ts` gates on alongside `hasBlockingIssues` — so even with all BLOCKs already downgraded, the user was trapped on retake UI with no save path. Fix: `LOW_CONFIDENCE_STRUCTURE` now emits FLAG (dismissible) unconditionally. Rule no longer has an `allPagesExhausted` branch because FLAG doesn't escalate. `POOR_IMAGE_QUALITY` stays as RETAKE — that signal IS about photo readability and retaking genuinely helps. The wall-photo case continues to nudge retake; the ingredient-screenshot case now lands on PreviewEdit where the user can dismiss flags and save.

#### Retake-screen Cancel button — ([`ab8ec6d`](https://github.com/warelincoln/RecipeJar/commit/ab8ec6d))

User noticed that the only way to discard a failed-import draft from the retakeRequired screen was to tap Retake → open camera → hit Cancel from the camera view. Fix adds a top-left Cancel link on [`RetakeRequiredView`](mobile/src/features/import/RetakeRequiredView.tsx) that mirrors the PreviewEditView pattern. Wired through to the existing `handleCancel` flow: confirmation alert → `api.drafts.cancel(draftId)` → queue cleanup if hub-sourced → navigate. Also fixes a latent issue on the photos-library entry path where the old "Go Home" button navigated without calling `api.drafts.cancel` — draft was left in `NEEDS_RETAKE` status until the 24h cleanup. "Go Home" text changed to "Discard Import" for clarity; `testID` preserved for XCUITest compatibility.

#### Camera WYSIWYG preview — ([`9978d5d`](https://github.com/warelincoln/RecipeJar/commit/9978d5d))

**Silent but high-impact quality win.** User noticed that the camera preview showed the cookbook page more zoomed-in than what the captured photo actually contained. Diagnosis: `react-native-vision-camera`'s default `resizeMode="cover"` crops the 3:4 sensor output to fill the taller iPhone screen edge-to-edge, hiding the horizontal edges of what the camera will actually capture. Every user (including the builder during dad-testing) had been believing they were framing the cookbook page tightly, but the captured photo was significantly wider — the page rendered smaller in the captured pixels than the user expected. This quietly crushed OCR accuracy across every photo-based parse the app has ever done. Fix is one prop: `resizeMode="contain"` in [`CaptureView.tsx`](mobile/src/features/import/CaptureView.tsx). Preview now matches the 3:4 capture frame exactly, with black letterboxes above/below. Users can frame tighter — get physically closer to the page — with confidence that the capture matches the preview. Expected downstream effect: higher baseline OCR accuracy on every new parse, without any prompt or model changes.

#### Image-parse cost trade study — PRs #7, #8, #9

Five-phase work driven by user observation that the 2026-04-19 split-call architecture was costing ~3.5¢/recipe (actual measurement ended up being ~4.8¢ — underestimate by 37%) and wouldn't scale cost-wise beyond a few thousand parses/month. Full plan at `~/.claude/plans/snug-waddling-quiche.md`. Constraints: latency must not regress, fraction fidelity must hold 5/5 on the eval fixtures.

##### Phase 1 — cost instrumentation — PR #7 ([`728d4ef`](https://github.com/warelincoln/RecipeJar/commit/728d4ef))

- **`51e8698` feat(parse): add cost instrumentation to image-parse adapter** — no architecture change, just visibility. New [`server/src/parsing/image/pricing.ts`](server/src/parsing/image/pricing.ts): lookup table mapping `model → {inputPerMillion, outputPerMillion}` + `estimateCostUsd(model, usage)`. Covers gpt-5.4, gpt-4o, gpt-4o-mini, Claude Sonnet 4.5/4.6, Claude Haiku 4.5 with their dated aliases. Per-call telemetry: [`image-parse.adapter.ts`](server/src/parsing/image/image-parse.adapter.ts) captures `response.usage.{prompt_tokens, completion_tokens}` + wall-clock `latencyMs`; emits `parse_tokens` server-log event + `server_parse_tokens` PostHog analytics event per call. Per-recipe aggregate: `server_parse_cost` PostHog event sums cost across whichever legs settled, tagged with architecture label. Partial-success parses are first-class in the data so dashboards don't silently drop them. 10 unit tests at [`server/tests/pricing.test.ts`](server/tests/pricing.test.ts).

##### Phases 2-3 — multi-arm eval harness + 4 candidate adapters — ([`f3c4b89`](https://github.com/warelincoln/RecipeJar/commit/f3c4b89))

- **`f3c4b89` feat(parse): multi-arm eval harness + 4 candidate adapters** — [`server/src/parsing/image/arms/`](server/src/parsing/image/arms/) directory with shared monolithic prompt + merged JSON schema + 4 arm files: Arm 0 wraps the production split-call via exported internals (no duplication), Arm 1 is gpt-4o monolithic, Arms 2-3 are Claude Sonnet 4.6 and Haiku 4.5 using Anthropic's tool-use pattern for structured JSON output. Each arm implements `parseForEval` returning `{candidate, calls[], wallClockMs}` so the eval scorer is architecture-agnostic. [`server/tests/image-parse-eval.test.ts`](server/tests/image-parse-eval.test.ts) refactored to loop arms × fixtures, scoring ingredient-fraction fidelity (hard gate on Arm 0, report-only for others), step-count / numeric / tool preservation, latency, tokens, cost. Prints comparison table at suite end + writes JSONL to `server/tests/eval-results/eval-<ts>.jsonl` for machine-readable diffing. Candidate arms load dynamically with env-var gating — harness runs incrementally even when some arms aren't ready. `@anthropic-ai/sdk ^0.90.0` added as a server workspace dependency.

- **`4428588` fix(eval): correct Anthropic model IDs + dotenv override + arm filter** — three discovered-during-Phase-4 fixes. Anthropic model IDs use hyphens not dots: `claude-sonnet-4-6` (newer than planned 4.5, same price tier) and `claude-haiku-4-5-20251001` (dated alias pins behavior). `import "dotenv/config"` doesn't override existing shell env — when the eval is invoked from the Claude Code host, `ANTHROPIC_API_KEY=""` is injected into the subprocess env and dotenv silently skips. Switched to explicit `loadDotenv({ override: true })` with a comment explaining why. Added `EVAL_ARMS` env-var filter so a subset of arms can be re-run without paying for already-clean data. Pricing table updated with real Anthropic rates.

##### Phase 4 — eval results (the data that justified the Phase 5 decision)

| Architecture | Fraction gate | p50 latency | p50 cost | Verdict |
|---|---|---|---|---|
| Split gpt-5.4 + gpt-4o (prior prod) | 5/5 | 19.4s | $0.0481 | baseline |
| **gpt-4o monolithic** | **5/5** | **18.7s** | **$0.0278** | **winner** |
| Claude Sonnet 4.6 monolithic | 4/5 | 37.7s | $0.0614 | rejected: 2× slower + 28% more expensive |
| Claude Haiku 4.5 monolithic | 3/5 | 22.2s | $0.0230 | rejected: fails fraction gate (systematic 2× misreads) |

##### Phase 5 — ship gpt-4o monolithic — PR #8 ([`b19c04c`](https://github.com/warelincoln/RecipeJar/commit/b19c04c))

- **`0908e3e` feat(parse): ship gpt-4o monolithic as production image parse** — [`image-parse.adapter.ts`](server/src/parsing/image/image-parse.adapter.ts) replaced with single `callMonolithic` via gpt-4o, merged schema, `max_tokens:4500`, `temperature:0`. All the cost instrumentation from Phase 1 preserved — events now tagged `architecture: "mono_gpt4o"`. [`prompts.ts`](server/src/parsing/image/prompts.ts) `RECIPE_PROMPT` replaces `INGREDIENTS_PROMPT` + `STEPS_PROMPT` (union of prior rules + single-pass lead-in). [`schemas.ts`](server/src/parsing/image/schemas.ts) `recipeSchema` replaces the two split schemas (strict-mode compatible). Exports `RecipeExtractionResult` + `recipeToRawExtraction` helper (coerces null→undefined on metadata fields). `arms/` directory deleted — winning arm's logic now IS production. [`image-parse.adapter.test.ts`](server/tests/image-parse.adapter.test.ts) rewritten for single-call mocks (11 tests covering happy path, OpenAI throw, zero ingredients, empty content, length-truncation, one-call-per-parse assertions, model/schema/detail/temp/tokens config). [`image-parse-eval.test.ts`](server/tests/image-parse-eval.test.ts) simplified from multi-arm to single-arm regression guard with ongoing cost/latency summary. `docs/ARCHITECTURE.md` gains an "Image Parse" section with the full history table + eval results.

##### Post-ship hotfix — PR #9 ([`e0d14e9`](https://github.com/warelincoln/RecipeJar/commit/e0d14e9))

- **`4bdfed6` fix(save): re-parse ingredient text on draft save, don't trust stale fields** — caught during live iPhone testing. User edited `"3 cups water"` to `"2/3 cups water"` in preview, saved. Recipe detail showed `"3 cup water"`. Tapped Edit → text field showed `"2/3 cups water"` (correct). Tapped Save on edit → detail finally rendered `"⅔ cup water"`. Root cause: the preview editor only mutates `ing.text` on edit; structured `amount/unit/name` fields stay at parse-time values. `POST /drafts/:id/save` trusted those stale structured fields verbatim, so the recipe row had `text="2/3 cups water"` but `amount=3, unit="cup", name="water"` — and the detail screen's `scaleIngredient` render composes from structured fields, not text. `PUT /recipes/:id` (post-save edit) already re-parsed via `parseIngredientLine`, which is why the second save propagated the fix. Fix: one `parseIngredientLine(ing.text)` call per non-header ingredient at draft-save time in [`drafts.routes.ts`](server/src/api/drafts.routes.ts), same pattern `recipes.repository.ts` has used since day one. Regression test in [`integration.test.ts`](server/tests/integration.test.ts) asserts `recipeRepo.save` receives parser-derived values when the client sends deliberately stale structured fields.

**Measured results on user's two live iPhone test imports after Phase 5 ship:**

- Parse 1 (verbose recipe, 2,315 completion tokens): API call 25.8s / total elapsed 26.6s / cost $0.031 / 100% fraction accuracy
- Parse 2 (simpler, 994 completion tokens): API call 22.7s / total elapsed 23.5s / cost $0.018 / 100% fraction accuracy
- **Median: ~24s latency / ~$0.024 cost / 100% accuracy**
- Input tokens 3,032 both parses (vs 5,611 pre-merge baseline) — single-call image dedup working as designed
- Production real-world p50 is at the high end of the eval p50 range (eval 18.7s, prod 22-26s). Output tokens drive latency; verbose recipes + OpenAI API variance account for the gap. Still under the latency ceiling; room for follow-up work if we want to chase output-token reduction.

**What ships where:**

- **Railway:** all server-side changes live (bugs 2, 3, 4, validation severity consolidation, LOW_CONFIDENCE→FLAG, save-reparse fix, cost instrumentation, monolithic gpt-4o).
- **TestFlight Build 2:** users get all the server-side wins automatically. Missing: optimistic flag-clearing, thumbnail onError fallback, retake Cancel button, WYSIWYG camera. **TestFlight Build 3 needed to ship these.**
- **Local dev (physical iPhone via LAN):** all wins live.

**Follow-ups queued (all optional, lower-priority now):**

1. **Cut TestFlight Build 3** to push mobile-side changes (Bugs 1b, 4 mobile, 5 + WYSIWYG camera + retake Cancel) to TestFlight testers. ~30 min of Xcode archive + App Store Connect upload.
2. **Reduce sharp output size** from 3072px → 2048px. WYSIWYG unlock means smaller images should still OCR cleanly. Another potential 20-30% cost reduction on top of today's change. ~30 min + eval re-run.
3. **Output token optimization.** Current monolithic call outputs 1-2.3k tokens; latency scales with output. Two options: drop `stepSignals`/`ingredientSignals` arrays from the schema (they're not load-bearing downstream), or tighten the step concision rule from ≤40 words to ≤30. Both need eval verification. ~1 hour each.
4. **Re-eval Claude when next version ships.** Today's loss was clear but Anthropic's vision models improve quickly. Haiku 4.5's systematic 2× fraction misread suggests a training-data gap that could close.

---

### 2026-04-19 — Image parse speed (2-3×) + split-call architecture + fraction verification UX + server Sentry

The biggest parse-speed win of the project. Image imports dropped from 30-45s baseline to p50 ~15s / p95 ~18s single-page (multi-page ~29-31s proportionally). Split the monolithic OpenAI Vision call into two parallel calls that merge client-side; one protects ingredient fraction fidelity, the other rewrites steps concisely on a faster model. Product decision: ingredient-only recipes now save (users routinely screenshot just the ingredient list). New fraction-verification UX compensates for the residual ~10% deterministic LLM misread rate on visually-similar glyphs. Full per-stage Sentry instrumentation on the server parse path. Shipped to Railway + TestFlight Build 2 end-of-day.

**Shipped in this cycle (2 PR merges, ~12 commits):**

#### Server Sentry instrumentation — PR #3 ([`53cf07c`](https://github.com/warelincoln/RecipeJar/commit/53cf07c))

- **`3890553` feat(observability): server Sentry instrumentation for parse pipeline** — added `@sentry/node ^10.49.0` to the server workspace. New `server/src/instrument.ts` initializes Sentry before any other module so auto-instrumentation can hook Fastify + HTTP before they load. `Sentry.setupFastifyErrorHandler(app)` after Fastify creation captures unhandled errors with request context. `tracesSampleRate: 1.0` in dev / `0.5` in production, profiling off, `sendDefaultPii: false`. Wrapped `runParseInBackground` in a top-level `parse.background` span with per-stage children (`supabase.download`, `image.optimize`, `parse.finalize`). `SENTRY_DSN` wired to Railway + `.env.example`, new Sentry project `orzo-server` under the `orzo` org.
- **`e219209` fix(observability): wrap background parse in `Sentry.startNewTrace`** — bug caught during first real-import test: `runParseInBackground` runs AFTER `POST /drafts/:id/parse` returned 202, so the HTTP request's trace has already finished. Child spans inherited the finished parent's `sampled=false` decision → every span silently dropped (0 accepted in dashboard despite `SpanExporter exported 4 spans` logs). `startNewTrace` detaches the background work from the dead parent and creates a fresh root trace.
- Health-check filter retained as a Sentry default — our `/health` pings were filtered server-side (by design) which explained the initial "zero spans" state before PR 5 work was real traffic.

#### Image parse split-call architecture — PR #5 ([`9c277ed`](https://github.com/warelincoln/RecipeJar/commit/9c277ed))

PR #4 was auto-closed by GitHub when PR #3's base branch was deleted; PR #5 is the same source branch re-pointed at master. All commits preserved.

- **`a27bf73` feat(parsing): split image parse into two parallel LLM calls** — core architecture change. `parseImages()` keeps its external signature but internally fans out into `callIngredients()` + `callSteps()` via `Promise.allSettled`, merging results client-side before calling `normalizeToCandidate`. Call A is accuracy-critical (owns title, servings, ingredients + fractions, metadata, page-level signals) and keeps `gpt-5.4` + `detail:"high"` + 3072px — the model + detail level we never touch to preserve fraction accuracy. Call B is summarization-tolerant (owns steps, description, `descriptionDetected`, stepSignals) and runs on `gpt-4o` with an explicit concision rule: "Each step ≤ 40 words. Preserve every numeric value, time, temperature, tool, and cross-reference." Total latency = `max(A, B)` instead of `A + B` with retries on failure. Dual-prompt fallback deleted — strict JSON schema on both calls guarantees valid output or a typed error.
- **`a27bf73` (same)** — partial-success flow. If Call A fails → `buildErrorCandidate` (no recipe without ingredients). If Call B fails → adapter sets `candidate.extractionError = "steps_failed"`, new rule in `rules.steps.ts` emits a `FLAG`-severity `STEPS_EXTRACTION_FAILED` issue that the existing warning-banner UI renders as "We couldn't read the step instructions from this photo. Edit them below or retake the page." Save stays allowed. Gated on `steps.length === 0` so the banner disappears once the user types.
- **`a27bf73` (same)** — product change: **ingredient-only recipes now save**. `STEPS_MISSING` downgraded `BLOCK` → `FLAG` with friendly copy ("No step instructions yet. Save ingredients-only or add steps below"). Lots of users screenshot just the ingredient list; forcing them to invent steps was bad UX. Mutually exclusive with `STEPS_EXTRACTION_FAILED` so no double-flag.
- **`a27bf73` (same)** — other wins bundled:
  - Removed redundant `optimizeForOcr` re-encode (~300-500ms saved per page). The upload-time buffer was already at 3072 @ 85%; the download-time re-encode at 3072 @ 90% was pure waste.
  - `POLL_INTERVAL` 3000ms → 750ms on the mobile XState machine + `GET /drafts/:draftId` added to the rate-limit allowlist in [`server/src/app.ts`](server/src/app.ts) (same pattern as `/health`) so 3 concurrent imports polling every 750ms don't trip the global 100-req/min limit.
  - `MAX_CONCURRENT` 2 → 3 in [`parse-semaphore.ts`](server/src/parsing/parse-semaphore.ts) to match the README's documented "3 image-based recipes concurrently" contract.
  - `Promise.all` in mobile `uploadDraft` actor — no-op for single-image today, load-bearing when multi-image import ships (STATUS.md:220).
  - Base64 imageContent built once in `parseImages` and shared across both calls (avoids duplicate allocations for multi-page imports).
- **`4f413b7` test(parsing): wire up eval suite with 5 real cookbook fixtures** — LLM eval suite at `server/tests/image-parse-eval.test.ts`, gated by `RUN_LLM_EVALS=1` (skipped in normal CI to avoid OpenAI cost, ~$0.25/full run). Fixtures in `server/tests/fixtures/recipe-images/<slug>/image.HEIC + expected.json` — real cookbook pages for Ika-Age, Nagoya Tebasaki, Rose Water Baklava, Takikomi-Gohan, Mochi Waffles. Scoring: strict fraction-amount tolerance (`< 0.001`), case-insensitive ingredient name substring match, step count within ±3, step numerics/tools with ≤25% drop tolerance. HEIC decoded via macOS `sips` (sharp's npm prebuilds don't include libheif on macOS). 27/27 assertions pass as regression gate.
- **`bc37e48` fix(parsing): drop Call A temperature 0.1 → 0 deterministic** — production testing surfaced 2-of-4 real imports with Unicode-fraction misreads (⅔ read as ½, ⅓ as ¼) on the fastest parses. Temp 0.1 left sampling variance on visually-similar glyph pairs that flipped on close calls. Dropping to temp=0 locks the reading deterministically. Confirmed gpt-5.4 accepts temperature=0 without error.
- **`bccb54d` fix(parsing): drop Call B temperature 0.1 → 0** — follow-up retest surfaced Call B rewriting "1 3/4 tsp salt" → "1 1/4 tsp salt" in a step rewrite. Same fix pattern — numeric fidelity doesn't benefit from sampling variety.
- **`d473610` feat(import): subtle peach tint on fractional ingredients + one-time verification tip** — fraction verification UX. Ingredients with non-integer amounts render with a subtle `LIGHT_PEACH` tint on the preview row (matches existing tinted-surface language for feature cards). One-time banner at the top of the ingredient list on first fraction-containing parse: "Double-check fractions before cooking — AI isn't always perfect on ½ vs ⅓." Dismissal persists under `fraction_verification_tip_seen_v1` AsyncStorage key. Compensates for the residual ~10% deterministic LLM misread rate on cookbook fonts the model consistently mis-parses — this kind of failure can't be prompt-fixed, so the UX invites user verification instead. Same pattern as Adobe Scan / Apple Notes / Google Lens for OCR confidence.

**Measured results (Sentry, ~25 real imports during the cycle):**

- Single-page parse: p50 ~14s, p95 ~18s. Range 10-18s.
- Multi-page parse (3-4 pages): ~29-31s.
- Baseline before PR 5: 30-45s (per `docs/STATUS.md:224` pre-edit, since removed).
- Fraction accuracy (real imports + 5-fixture eval): 90-100% across runs, with residual misreads now surfaced via the verification banner.

**Honest residual limitations documented in `docs/PARSING_KNOWN_LIMITATIONS.md`:**

- ~10% deterministic fraction misread rate on specific cookbook fonts where the model locks onto a consistent wrong reading (not random variance — temp=0 gives the same wrong answer every run on the same image). Can't be fixed by prompt tuning; fraction-verification UX is the compensation.
- Step count varies ±2-3 from source count on dense multi-action recipes. The eval tolerates this; users see numbered steps they can edit.

**Infrastructure notes:**

- New `orzo-server` Sentry project under `orzo` org, both `development` (`tracesSampleRate: 1.0`) and `production` (`0.5`) environments flowing.
- Railway env var `SENTRY_DSN` added to production. Auto-deploys on master push are now observable.
- TestFlight **Build 2** uploaded end-of-day with full mobile UX (fraction tint + banner, faster poll, partial-success display messages, `extractionError` shared type). Previous Build 1 testers will auto-receive when Apple finishes processing.

#### Supabase Storage download timeout — same-day follow-up

- **`<TBD>` fix(parsing): bound Supabase Storage `.download()` at 18s** — addresses the residual limitation called out earlier in this entry (one 60s hang observed during the cycle, Sentry trace `064c8b45504449af9d0d325efd0b8f7d`). New generic `withTimeout<T>(work, ms, label)` helper at [`server/src/lib/timeout.ts`](server/src/lib/timeout.ts) — `Promise.race` with proper `clearTimeout` cleanup. The existing inline `fetchWithTimeout` (URL sync path) refactored to use it, fixing the same dead-timer leak both helpers shared. Wired into `runParseInBackground`'s per-page `supabase.download` Sentry span: timeout throws `"supabase download timeout after Xms"`, the catch sets the active span's `timed_out=true` attribute, the existing outer try/catch routes it through `classifyParseError → "fetch"` for PostHog and calls `setParseError` so mobile sees a real parse-failed (and user gets the retake screen) inside the 60s XState budget instead of staring at the parsing splash for a full minute. Env-overridable via `SUPABASE_DOWNLOAD_TIMEOUT_MS` (lets ops tune per-environment without redeploy and lets the integration test drive 50ms instead of 18s). 5 unit tests for the helper + 1 integration test asserting the full timeout-to-`setParseError` wiring.

#### Per-shot capture review + shutter feedback — same-day follow-up

- **`<TBD>` feat(import): per-shot review screen + loud shutter feedback** — addresses the dad-test 2026-04-19 finding that the camera flow had two compounding UX failures: (1) tap shutter, no haptic, no flash, only a 48×64 thumbnail in the bottom-left corner — user with shaky hands concluded the photo failed and cancelled the entire import; (2) even on a successful capture, no way to verify framing/focus before the ~14-18s parse cycle reported back. New `reviewing` XState state in [`mobile/src/features/import/machine.ts`](mobile/src/features/import/machine.ts) sits between `capture` and itself: `PAGE_CAPTURED` now stages the photo into a new `pendingCapture` context field instead of appending; `KEEP_PENDING_PAGE` commits, `DISCARD_PENDING_PAGE` discards (and fires a `capture_review_retake` PostHog event for future Approach C tuning). New [`mobile/src/features/import/ReviewView.tsx`](mobile/src/features/import/ReviewView.tsx) renders the captured photo full-screen with two large 56pt buttons (Retake / Use This Photo) — VoiceOver focus jumps to the header on mount via `findNodeHandle` + `AccessibilityInfo.setAccessibilityFocus`. Shutter feedback in [`CaptureView.tsx`](mobile/src/features/import/CaptureView.tsx) fires haptic `impactMedium` + a 150ms white flash overlay synchronously BEFORE awaiting `takePhoto()` so the affordance lands within tens of milliseconds, not after the 200-400ms iOS round-trip. Page counter ("Page N", hidden for the first shot) anchors multi-page intent. `takePhoto()` now wrapped in try/catch with `Sentry.captureException` + `Alert.alert`. Reduce-motion respected (flash skipped when `AccessibilityInfo.isReduceMotionEnabled()` is true). 5 XState unit tests in [`server/tests/import-machine-reviewing.test.ts`](server/tests/import-machine-reviewing.test.ts). Spec-reviewed adversarially across 3 rounds (5/10 → 7.5/10 → 9/10) before code was written.

- **`<TBD>` fix(import): make fraction-verification context always visible (no AsyncStorage gate)** — second dad-test finding: the original peach-tinted-fractions UX had a one-time-ever banner gated by `fraction_verification_tip_seen_v1` AsyncStorage key. Anyone who dismissed without reading, or anyone using the app on someone else's phone (the dad case literally), saw peach-tinted ingredients with zero context. Replaced the dismissible `<View>` banner with a small persistent italic note (`Peach-tinted amounts are AI estimates — double-check fractions before cooking.`) that renders unconditionally whenever the recipe contains any fractional ingredient. Removed [`mobile/src/utils/fractionTip.ts`](mobile/src/utils/fractionTip.ts) (now dead). The note costs zero pixels on integer-only recipes and never naggs power users.

**Queued follow-ups (not shipped today):**

1. **Save-flow loading-state mismatch** — user reported the parsing splash animation plays for ~30s during an idle-session save retry. Add a distinct "Saving..." state. ~1 hour mobile polish.
2. **URL AI adapter port** — apply the same model swap + concision rules to [`url-ai.adapter.ts`](server/src/parsing/url/url-ai.adapter.ts) (text-only) to drop the 10-24s dom-ai tier latency flagged in the 2026-04-17 entry. ~2 hours once image path bakes.
3. **Flying-thumbnail capture animation** — deferred polish from the per-shot review PR; the haptic + flash already cover the "shutter fired" affordance. Wire as overlay above the capture FlatList with fixed-offset destination (avoid `onLayout`-on-empty-cell race). ~1-2 hr.

---

### 2026-04-17 — Observability + URL import overhaul + home-screen perf

A long day of work on top of the TestFlight build. Two full PostHog-driven observability layers, a full rethink of the URL import pipeline, a home-screen performance fix, and a cluster of small mobile polish items. Net result: URL imports dropped from ~4-5s to ~1s on the happy path, home-screen load dropped from "2-30s-depending-on-Supabase-mood" to consistent sub-second, image flicker on return visits eliminated, 4 previously-failing reputable sites (PBS, Joy of Baking) rescued, and every interesting import outcome now lands in PostHog with rich properties.

**Shipped in this cycle (17 commits on master, including 2 PR merges):**

#### Observability layer (PostHog, both client + server)

- **`2d110c5` feat(observability): rich PostHog events for URL + photo import failures** — added `posthog-node` to the server, wired a `trackAnalytics()` sidecar alongside the existing `logEvent()` sites in `drafts.routes.ts`. Every parse now emits `server_parse_completed`, `server_parse_validated`, `server_parse_failed`, `server_url_capture_failed`, and `server_recipe_saved` with URL, domain, extraction method, issue codes, parse duration, and save state. Mobile `analytics.ts` taxonomy expanded from 12 to 22 events with instrumentation at every xstate transition boundary in the import machine. Feature-flag gate (`analytics_firehose_enabled`) for remote kill without redeploy.
- **`3408d15` fix(parsing): tag buildErrorCandidate with extractionMethod "error"** — error-path parses were showing up as `extraction_method: "unknown"` in PostHog; now distinctly tagged so the tier-funnel tile counts them correctly.
- **`6fec459` feat(observability): hero-image-missing event + FLAG-level analytics** — distinct `server_hero_image_missing` event separating `no_metadata_url` (source didn't publish) from `download_failed` (we fetched but failed). `server_recipe_saved` carries `hero_image_attached`, `hero_image_failure_reason`, `had_metadata_image_url`. `server_parse_validated` carries `first_flag_code` + `has_flags` symmetric with the BLOCK side.
- **`9751ecc` feat(observability): time-source provenance on parse + save events** — per-time `prep/cook/total_time_source` (`"explicit" | "inferred" | null`), `time_completeness` scorecard, `has_inferred_time` / `has_explicit_time` booleans, plus `*_final` variants on `server_recipe_saved` that include `"user_confirmed"` when the TimesReviewBanner was accepted.
- Railway env vars configured: `POSTHOG_API_KEY_SERVER`, `POSTHOG_HOST`, `ANALYTICS_FIREHOSE_ENABLED`. Server-side SDK gated off in non-production + killable via env flip without redeploy.
- PostHog dashboard **"Orzo — Import Health"** built in the UI with 9 tiles: live failure feed, top failing domains, top block codes, extraction-tier funnel, photo vs URL failure trend, SERVINGS_MISSING feed, hero-miss feed, hero attachment rate by domain, FLAG code breakdown, time-completeness by domain, inferred-time parses feed. Full spec in `docs/ANALYTICS_SETUP.md`.

#### URL import pipeline (Path 1)

- **`c603129` perf(parsing): synchronous fast path for JSON-LD + Microdata URL imports** — the biggest perceived-latency win of the day. `POST /drafts/:id/parse` used to always return 202 and kick off a background job the mobile client would poll every 3 seconds. Now runs JSON-LD + Microdata **inline** (new `parseUrlStructuredOnly()` helper, ~50-200ms). On success, returns 200 with the full candidate + validation result inline, mobile's xstate actor returns directly without polling. Only falls through to 202 + background when the AI tier is actually needed. Extracted shared `finalizeParseResult()` helper so validation, DB writes, and analytics emission are identical across sync + background paths. Fetch timeout capped at 4s on the sync path with graceful fall-through to the 60s-budget background. 4s RTT + 3s poll wait cut; mobile required zero changes (the poll-guard check was already in place).
- **`3814c62` feat(parsing): DOM fallback for missing JSON-LD image + servings** — adds `enrichFromDom()` that tops up a successful JSON-LD/Microdata extraction from `<meta property="og:image">`, `<meta name="twitter:image">`, `<link rel="image_src">`, plus WPRM, Tasty, `itemprop="recipeYield"`, and regex yield patterns for sites that publish structured data but omit image / recipeYield (BBC Good Food, America's Test Kitchen, Washington Post, Pioneer Woman, etc). Never overwrites values the structured data already provides.
- **`d48aacf` fix(images): normalize protocol-relative URLs before downloading hero** — Cluster A. hungry-girl.com publishes `metadata.imageUrl: "//d2gtpjxvvd720b.cloudfront.net/..."` (protocol-relative). Node's `fetch()` throws "Invalid URL" on those. Added `normalizeImageUrlForFetch()` that prepends `https:` to protocol-relative URLs and returns null for data URLs / non-http schemes / document-relative paths. 8 unit tests.
- **PR #2 — Cluster D (`cdbd04c` + `ca51a6c`)**: 4 URL imports from reputable sites were falling through to the error tier. Root causes fixed:
  - **pbs.org**: Recipe lives under JSON-LD `@graph` with ingredients but no `recipeInstructions`, so it fails the quality gate. The real content is in `<article id="recipeBody">` which wasn't in our boundary selector set. pbs.org also authors `yield` (schema.org alias) instead of `recipeYield`.
  - **Blanket `[class*="print"]` removal was nuking Tailwind utilities.** `print:break-after-avoid-page` on pbs.org's ingredient/step elements was matching our print-button cleanup, deleting the recipe before selectors could find it. Narrowed to specific button patterns.
  - **m.joyofbaking.com** — decades-old HTML, no JSON-LD, no Microdata, no `<main>` / `<article>`, no recipe wrapper. Added a keyword-gated body-text fallback that only activates when the DOM contains both an ingredient marker and an instruction marker.
  - **gourmetmagazine.net** — Ghost CMS paywall. Documented as a known limitation in `docs/PARSING_KNOWN_LIMITATIONS.md` with fixture test confirming we still return a clean error candidate without invoking the AI.
- Real HTML fixtures saved under `server/tests/fixtures/` + per-domain tests in `server/tests/parsing-domain-fixtures.test.ts`.

#### Home-screen + list-endpoint performance

- **`bb5d20b` perf(recipes): batch signed-URL generation for list endpoints** — the home-screen load was scaling linearly with recipe count and sometimes hitting 20-30s. Root cause: `GET /recipes` called `resolveImageUrls` per recipe, each doing 2 parallel `createSignedUrl` calls. 50 recipes = 100 parallel HTTPS calls to Supabase Storage, which queues under concurrency. Added `resolveImageUrlsBatch()` using Supabase's `createSignedUrls` batch endpoint — a single HTTP call returns every signed URL for an input array. Applied to `GET /recipes` + `GET /collections/:id/recipes`. Supabase round-trips dropped from 2 × N per request to exactly 2 per request.
- **PR #1 — `89e47a3` perf(recipes): cache signed URLs server-side to stop image flicker** — after the batch fix, home-screen load was fast but images re-downloaded on every focus because each `GET /recipes` generated fresh signed URLs with new `?token=…&expires=…` query strings. FastImage treated the new URL as a different image. Added in-memory `Map<path, {signedUrl, expiresAt}>` cache in `recipe-image.service.ts`. Same signed URL returned for up to 55 minutes per path; Supabase signing only paid for paths missing or near-expiry. 5 cache unit tests.

#### Validation + mobile polish

- **`7733165` fix(validation): SERVINGS_MISSING is a FLAG, not a BLOCK** — missing servings was preventing saves entirely; now surfaces as a dismissible warning. Severity flipped, `userDismissible` set to true.
- **`a6e475d` polish(mobile): Build 2 pack — servings copy, FastImage cacheKey, optimistic save insert** — three small mobile-side improvements landed together:
  - Updated SERVINGS_MISSING display copy to match the FLAG behavior ("Add it now or skip — you can save either way.")
  - FastImage `cacheKey` on RecipeCard derived from the signed URL's pathname plus `updatedAt`. Complements the server-side cache: even if the server cache busts (Railway restart, TTL miss), the mobile disk cache still matches on the stable pathname and no re-download happens.
  - New `addRecipe()` action on the Zustand recipes store. xstate `saving → saved` transition prepends the saved recipe directly into the store; Home/Collection screens render the new card in the same React tick, no wait for refetch. HomeScreen's focus-triggered `fetchRecipes()` still runs as stale-while-revalidate insurance.

#### Cluster B closed as working-as-designed

- "totalTime only" sites (Betty Crocker, Bon Appétit, Pillsbury, Southern Living, Washington Post) publish `totalTime` but not prep/cook separately. Inspected `RecipeDetailScreen`'s time chip row — it already filters null prep/cook entries and renders totalTime-only recipes as a clean `45m total` chip. No code change needed; the PostHog `time_completeness = partial` label was an analytics observation, not a UX gap.

#### Verification (end-to-end, production + Orzo Dev)

Tests 1-15 passed end-to-end across both production Orzo (TestFlight) and Orzo Dev (local). Key measurements:

- BBC Good Food + Serious Eats URL imports: **~1s** (was ~4-5s)
- Home screen cold load with 70 recipes: **~1s** (was 20-30s variable)
- Home → detail → home: **no image flicker** (was visible reload every time)
- PBS + m.joyofbaking.com: **import successfully** (was STRUCTURE_NOT_SEPARABLE fail)
- hungry-girl.com: **hero image attaches** on save (was silently missing)
- Photo vision imports: still slow (~40s), unchanged — future optimization

#### Deferred / follow-up items (not in this cycle)

- **NYT / PBS hero image via WebView HTML capture** — server-fetched HTML sometimes misses og:image (bot-served degraded page). Routing these through the in-app WebView's HTML capture would get real browser output.
- **dom-ai tier latency (~10-24s)** — model swap to gpt-4o-mini or tighter DOM boundary would halve it.
- **Photo vision latency (~40s)** — biggest UX cliff remaining. Needs model swap and/or the shell-insert pattern from Path 3.
- **Preview hero image** — import preview doesn't render `metadata.imageUrl` until after save. Small polish.
- **Cluster C — JSON-LD-with-no-times async AI inference** — blocked on Path 3 (async enrichment + detail-screen update mechanism).
- **Path 3 itself** — architectural lift that would unlock photo vision speedup and Cluster C in one move.
- **Build 2 TestFlight archive** — the three mobile items in `a6e475d` (+ any of the deferred Build 2 items when ready) need to be archived via Xcode Release scheme and uploaded for production testers to pick up.

---

### 2026-04-16 (evening) — Phase 0.2: First TestFlight build LIVE

Orzo's first internal TestFlight build is installed on a real tester's iPhone. The stack from code to end-user finally connects end-to-end: Xcode archive → App Store Connect → TestFlight on a real device. All 8 Steps of Phase 0.2 landed in a single session.

**Shipped in this cycle (3 server/mobile commits + this docs commit):**

- **`a445e90` feat(mobile): Phase 0.2 TestFlight prep — Sentry, PostHog, Info.plist, launch screen** — the core infrastructure.
- **`d472dd3` fix(server): raise /drafts/:id/parse rate limit from 10/hr to 100/hr** — beta hotfix after the first tester hit the cap within minutes.
- **`7bf810c` fix(validation): do not fire RETAKE_LIMIT_REACHED on URL imports** — beta hotfix for a latent `Array.every()` over empty array bug.

**Observability:**

- **`@sentry/react-native` 8.8.0** + native RNSentry (pod + source maps via Xcode build phase). `initSentry()` at `App.tsx` module load, `Sentry.wrap(App)` on the default export. DSN lives in `mobile/src/config/sentry.ts`, gated off in `__DEV__`, 10% trace sample, `sendDefaultPii: false`.
- **`posthog-react-native` 4.42.0** (pure-JS, no pod). Typed 12-event taxonomy in `mobile/src/services/analytics.ts`, gated off in `__DEV__`. Project key US region.
- `auth.store.ts` `identifyUser()` calls both `analytics.identify()` and `Sentry.setUser()` on sign-in / session restore; `clearIdentity()` on sign-out. Symmetric via `onAuthStateChange`.
- Event instrumentation (v1, minimal): `recipe_viewed` (`RecipeDetailScreen`), `import_started` (`ImportFlowScreen` camera + photos), `recipe_saved` (xstate `saveDraft` actor).
- **Sentry verification via MCP:** `orzo/react-native` project received 2 production events within 30 minutes of first install — a test crash (`-[RNSentry crash]`) and two App Hang events from the tester's rate-limited URL imports.

**App Store Connect:**

- App record created: **Orzo - Cookbook** (Apple App ID `6762439164`, bundle `app.orzo.ios`, category Food & Drink, age rating **17+** — temporary, pending SFSafariViewController migration for unrestricted-web-access).
- Privacy nutrition labels saved (email, photos, recipe content, user ID linked to analytics + app functionality; crash + performance data not linked).
- Privacy Policy URL: `https://getorzo.com/privacy`. Terms: `https://getorzo.com/terms`. Landing deployed on Cloudflare Pages from `landing/` directory.
- TestFlight internal group `Testing` created with automatic build distribution enabled.

**iOS binary hardening (`mobile/ios/Orzo/Info.plist` + `Podfile`):**

- Launch screen migrated from `systemBackgroundColor` (white) to warm cream `#FFF8F0`.
- App locked to light mode via `UIUserInterfaceStyle = Light` (terracotta palette is light-only).
- `ITSAppUsesNonExemptEncryption = false` — auto-answers export compliance prompt on every archive upload.
- Removed empty `NSLocationWhenInUseUsageDescription`, rewrote `NSLocalNetworkUsageDescription` for App Review, strengthened camera + photo usage strings.
- `$VCEnableLocation = false` added to Podfile — disables VisionCamera's CLLocation APIs so the binary no longer triggers ITMS-90683 on future archives (Build 1 still got the warning; delivery succeeded anyway).

**Real TestFlight feedback (first hour on device):**

- Internal tester hit the `parse: 10/hr` rate limit within their first wave of URL imports (logs showed `rate_limit_exceeded` + `429` + `retry in 43 minutes`). Bumped to 100/hr and pushed (`d472dd3`). Railway in-memory counters reset on deploy, so the tester unblocked immediately.
- `RETAKE_LIMIT_REACHED` validation rule false-fired on URL imports. Root cause: `Array.prototype.every()` returns `true` for an empty array, and URL imports have `sourcePages: []`. Guarded the rule with an early return when no pages exist (`7bf810c`).
- **Four flagged follow-ups** (spawned as separate Cowork tasks): (1) SFSafariViewController migration to drop the 17+ age rating, (2) Hermes `dSYM` upload for full native crash symbolication, (3) PDF URL import support (tester pasted a .pdf recipe link), (4) `schema.org/Drink` type handling in the URL structured adapter (tester imported a cocktail recipe with valid JSON-LD that wasn't being recognized).

**Deferred to post-TestFlight (tracked in `docs/ROADMAP_PHASE_0.md` 0.2 section):**

- Public App Store submission workflow: screenshots, description, keywords, preview video.
- External TestFlight public link (requires Beta App Review).
- Email template branding on Supabase.

**Files modified:** 16 (13 mobile infra + 2 server hotfixes + this changelog). **Files created:** `mobile/src/config/sentry.ts`, `mobile/src/services/analytics.ts`.

---

### 2026-04-16 (afternoon) — Bulk select mode + polish

Second of two cross-cutting UX upgrades landed today. Long-press any recipe card on Home or inside a collection → iOS-Photos-style multi-select (checkmarks, no jiggle). Delete or move N recipes in a single server round-trip.

**Shipped in this cycle (4 commits):**

- **`750bf88` feat: bulk select mode on Home + Collection (delete / move / haptics)** — the core feature.
- **`2a19180` feat: bulk-mode polish — inline new folder, correct delete copy, hide FAB, stronger haptics** — four on-device-feedback fixes applied after first pass.
- **`51b2e04` fix(bulk): preserve the long-pressed card as selected on bulk-mode entry** — guards against `onPress` firing after `onLongPress` on some iOS devices, which was instantly deselecting the card that just entered bulk mode.

**Mobile primitives (new):**

- **`mobile/src/hooks/useBulkSelection.ts`** — reusable hook owning `bulkMode` flag + `selectedIds: Set<string>` + `enterBulk` / `toggle` / `selectAll` / `clear` / `exit`. Fires light haptics on entry and selection haptics on toggle. Shared by Home + Collection.
- **`mobile/src/services/haptics.ts`** — wrapper around `react-native-haptic-feedback`. `tap()` = `impactMedium` (bulk-mode entry), `toggle()` = `impactLight` (selection toggle). Calibrated after feedback that the original `impactLight` / `selection` pair was imperceptible on-device. Errors swallowed — haptics are polish, not functional.
- **`mobile/src/components/BulkActionsBar.tsx`** — floating bottom bar, `Animated.spring` slide-in/out, two actions with a configurable primary variant (`"add-to-collection"` on Home + All Recipes / `"remove-from-collection"` inside a specific collection) + Delete. Disables both actions when `count === 0`. Respects safe-area bottom inset.

**Mobile screen updates:**

- **`HomeScreen.tsx` + `CollectionScreen.tsx`:** long-press card → `bulk.enterBulk(item.id)`. Header swaps to `Cancel / "N selected" / Select All` when in bulk mode; title, search, collections row hide. Jar FAB + fan hidden in bulk mode (it was peeking out from behind the action bar and starting a new import mid-selection is a weird flow). Grid `contentContainerStyle.paddingBottom` increases to `96 + insets.bottom` so the bar doesn't truncate the last row. Primary action handler per screen: picker flow on Home / All Recipes, null-assign flow inside a collection.
- **`RecipeCard.tsx`:** optional `bulkMode` + `selected` props. Renders a 26px checkmark circle top-right — filled `PRIMARY` with white check when selected, empty white outline over a 25%-opacity scrim when not.
- **`RecipeQuickActionsSheet.tsx` → `RecipeDeleteConfirmSheet`:** optional `count?: number` prop. When `>1` copy becomes "Delete N recipes?" with plural details. Also fixed: when `count === 1` the sheet now receives the actual title of the single-selected recipe instead of an empty string.
- **`ToastQueue.tsx` → `ToastItem`:** `onUndo` now optional. Undo button hidden when omitted. Bulk-operation toasts are informational-only since restoring N recipes from a deleted state isn't cheap.

**Server bulk endpoints (new):**

- **`POST /recipes/bulk-delete`** body `{ ids: string[] }` → `{ deletedCount: number }`. Single DB transaction. Silently filters `ids` to user-owned rows (`bulkDelete(userId, ids)` in `recipes.repository.ts`), mirrors the existing `delete()` app-level cascade (ingredients → steps → source_pages → recipe_collections → recipes), and returns the list of actually-deleted IDs so the route can trigger Supabase Storage hero-image cleanup for those only. Inherits the global 100/min rate limit.
- **`PATCH /recipes/bulk-collection`** body `{ ids: string[], collectionId: string | null }` → `{ updatedCount: number }`. Validates collection ownership via `collectionsRepository.findById` before touching any rows. Single transaction clears existing assignments for the owned ids and optionally inserts new rows. `collectionId: null` clears in bulk.
- Both endpoints return **JSON bodies (not 204)** — the mobile `request()` helper calls `.json()` on every response and would break on a 204.

**Inline "+ New folder" in `CollectionPickerSheet.tsx`:**

- New optional `onCreateNewCollection` callback. When provided, a terracotta `+ New folder` row renders at the top of the list. Tap closes the picker and fires the callback; parent screens open a `CreateCollectionSheet` and, on save, create the folder **and** assign the selection to it in one user action.
- Zero-collection users see a picker with only the `+ New folder` row + subtitle "Start a new folder to organize your recipes." Replaces the old dead-end "No collections yet — create one from the home screen" alert.
- Wired in both HomeScreen bulk flow and CollectionScreen bulk flow (the All Recipes variant).

**Native dep:**

- `react-native-haptic-feedback` v3.0.0 added. Requires `cd mobile/ios && pod install` + Xcode Debug rebuild on first pick-up. All other PR B code hot-reloads.

**Dev environment side-fix:**

- Dev Supabase project was missing the `recipe-pages` bucket (unlike `recipe-images`, there was no `ensureRecipeImagesBucket()` auto-create guard for it). Surfaced via photo upload failing during the earlier PR A testing. Created the bucket manually on dev; production project was already fine.

**Edge-case fix (commit `51b2e04`):**

On some iOS devices `onPress` fires briefly after `onLongPress` for the same gesture. In bulk-select mode this caused the freshly-selected card to be immediately toggled OFF the instant bulk mode appeared — users saw `"0 selected"` right after long-press. Fixed by recording the id + timestamp of the long-press in a ref, and swallowing any press that targets the same id within 600ms. Applied identically to HomeScreen and CollectionScreen.

**Files modified:** 15 (mobile screens, components, store, API client, server routes, repo).  
**Files created:** `mobile/src/components/BulkActionsBar.tsx`, `mobile/src/hooks/useBulkSelection.ts`, `mobile/src/services/haptics.ts`.  
**Verification:** All tests pass. Full bulk flow tested end-to-end on physical iPhone (multi-select, delete, move, remove, inline new folder, haptics, grid padding, FAB hidden, press-after-longpress guard).

---

### 2026-04-16 (midday) — Recipe detail upgrades (PR A): source chip, prep/cook/total times with AI inference, servings quick chips

Five cross-cutting recipe UX enhancements shipped in one commit (`5c04b97`). Moves Orzo from "parses a recipe" to "a usable everyday cookbook." Four land as code; the fifth (AI step/description summarization) stays as schema-only groundwork so we don't need a second migration when we build it.

**Recipe detail screen (`mobile/src/screens/RecipeDetailScreen.tsx`):**

- **Source provenance chip:** URL imports render a hostname chip with a `Globe` icon (tap → Safari). Photo imports render an "Imported from photo" pill + a horizontal thumbnail strip of source page images, each tappable to open the existing `FullScreenImageViewer`.
- **Time chips row:** `"Xm prep · Ym cook · Zm total"` between description and rating. Hidden when all three are null. AI-inferred unconfirmed values render **italic with a `~` prefix**; explicit and user-confirmed values render clean.
- **Derived total fallback:** when the source supplies prep+cook but no total (common JSON-LD gap, e.g. savoryonline), display `~Xm total` computed client-side from prep + cook.
- **Servings quick chips:** ½ / 2× / 3× row above the existing stepper, with active-chip highlight. The slider was dropped after pushback — stepper + chips cover 95%+ of real cooking math without a native-pod dependency.

**Recipe edit screen (`mobile/src/screens/RecipeEditScreen.tsx`):**

- New "Times (minutes, optional)" section with three numeric inputs: Prep / Cook / Total.
- **Auto-sum:** total auto-fills from prep + cook whenever total is empty, tracked via `totalIsAutoFilled` so manually entered totals are preserved ("manual total always wins"). Label reads "Total (auto)" while auto-filled, "Total" once the user overrides. If the user clears total, auto-sum resumes.

**Import preview review banner (`mobile/src/features/import/PreviewEditView.tsx`):**

- New **TimesReviewBanner** renders when at least one time was AI-inferred. Three editable fields pre-seeded with the estimates + an "Accept estimates" button. Editing a field or tapping Accept confirms the value; save persists `source = "user_confirmed"`. Explicit-only or null-only parses skip the banner entirely. Banner flips to "Times confirmed" state with a green border once everything is confirmed.

**Shared types:**

- New `TimeSource` type in `shared/src/types/recipe.types.ts`: `"explicit" | "inferred" | "user_confirmed"`.
- `Recipe` extended with `prepTimeMinutes` / `cookTimeMinutes` / `totalTimeMinutes` / `prepTimeSource` / `cookTimeSource` / `totalTimeSource` / `descriptionSummary` (all nullable).
- `RecipeStepEntry` extended with `summaryText: string | null` (Feature 5 groundwork).
- `EditedRecipeCandidate` carries optional `prepTimeMinutes` / `cookTimeMinutes` / `totalTimeMinutes` for pre-save user overrides from the review banner.
- `ParsedRecipeCandidate.metadata` extended with optional `prepTimeSource` / `cookTimeSource` / `totalTimeSource` (`"explicit" | "inferred"`).

**Server:**

- **Migration `0013_recipe_times_and_summary.sql`:** adds `prep_time_minutes`, `cook_time_minutes`, `total_time_minutes`, `description_summary` to `recipes`, and `summary_text` to `recipe_steps`. All nullable, additive, idempotent via `ADD COLUMN IF NOT EXISTS`.
- **Migration `0014_recipe_time_sources.sql`:** adds `prep_time_source`, `cook_time_source`, `total_time_source` text columns to `recipes` (values: `"explicit" | "inferred" | "user_confirmed" | null`).
- **Vision prompt (`server/src/parsing/image/image-parse.adapter.ts`) + URL-AI prompt (`server/src/parsing/url/url-ai.adapter.ts`)** now emit `{prepTime, prepTimeSource, cookTime, cookTimeSource, totalTime, totalTimeSource}`. The model is asked to label each time `"explicit"` if literally stated on the page, `"inferred"` if estimated, `null` if it can't tell. JSON-LD / Microdata extractions in `url-structured.adapter.ts` are auto-tagged `"explicit"` (structured data is always authored, never estimated).
- **New utility `server/src/parsing/time.ts`:** `isoDurationToMinutes` — parses `PT1H30M`, `PT15M`, `PT45S`, etc. Null / malformed / sub-minute → `null`. 10-test Vitest suite at `server/tests/time.test.ts`.
- **Save handler (`server/src/api/drafts.routes.ts`):** resolves each time in priority order — edited override (source `"user_confirmed"`) → parsed metadata (source `"explicit"` or `"inferred"` from parse) → null. Repo `update()` automatically flips source to `"user_confirmed"` whenever a time field is supplied via `PUT /recipes/:id` (reviewing in RecipeEditScreen implies user consent).
- **Routes now return a proper `sourceContext` object.** Previously the shared `Recipe` type declared `sourceContext` but the server emitted the fields flat (`sourceType`, `originalUrl`, `sourcePages`) — latent dead code in the old detail screen's meta footer that no one noticed. Fixed via a new `enrichRecipeResponse` wrapper applied to every `/recipes` endpoint. New `resolveSourcePageUrl` helper produces signed URLs for the `recipe-pages` bucket so source page thumbnails display correctly.

**Mobile:**

- New utility `mobile/src/utils/time.ts`: `formatMinutes(n)` (e.g. `90 → "1h 30m"`), `hasAnyTime(...)`, `isoDurationToMinutes` (mirror of the server helper for pre-save banner use).
- `mobile/src/services/api.ts` — `recipes.update()` body extended with the three time-minutes fields.

**Files modified:** 23. **Files created:** 5 (`0013_*.sql`, `0014_*.sql`, `server/src/parsing/time.ts`, `server/tests/time.test.ts`, `mobile/src/utils/time.ts`).

---

### 2026-04-14 — Mobile app terracotta palette migration

The mobile app UI has been fully migrated from the MVP blue-forward palette to the canonical terracotta brand palette codified in `ROADMAP.md` → "Brand Identity & Color Scheme" (2026-04-10). The app icon, landing page, and emails were already on the new palette; this closes the gap so the mobile chrome, App Store listing, and every screen the user actually touches are visually unified.

**New file: `mobile/src/theme/colors.ts`** — canonical source-of-truth module for all palette tokens. Exports both raw palette names (`TERRACOTTA`, `ESPRESSO`, `SAGE_GREEN`, `PAPRIKA`, etc.) and semantic aliases (`PRIMARY`, `TEXT_PRIMARY`, `ERROR`, `SUCCESS`, `DIVIDER`, etc.). Components import these instead of hardcoding hex values. Two new tokens added for soft food-semantic icon variety: `MUTED_PLUM` (`#8E6B90`) and `DUSTY_ROSE` (`#BC6F83`).

**37 files migrated** across screens, features, and components. ~846 insertions, ~569 deletions. Every hardcoded blue-family hex (`#2563eb`, `#eff6ff`, `#3b82f6`, `#7c3aed`) and every Tailwind gray (`#111827`, `#6b7280`, `#d1d5db`, `#e5e7eb`) replaced with imported tokens.

**Hex → token migration summary:**

| Old hex | → New token | Role |
|---|---|---|
| `#2563eb`, `#3b82f6`, `#60a5fa` | `PRIMARY` (`#C4633A`) | Primary CTAs, icons, links |
| `#eff6ff` | `PRIMARY_LIGHT` (`#FFF8F0`) | Page backgrounds |
| `#111827`, `#1f2937` | `TEXT_PRIMARY` (`#2D1F14`) | Headings, primary body |
| `#6b7280`, `#9ca3af`, `#888` | `TEXT_SECONDARY` (`#7A6E64`) | Secondary text, placeholders |
| `#374151`, `#4b5563` | `TEXT_TERTIARY` (`#4A3F36`) | Tertiary labels, button text |
| `#d1d5db`, `#e5e7eb` | `DIVIDER` (`#E8DFD5`) | Borders, separators |
| `#dc2626`, `#ef4444`, `#991b1b` | `ERROR` (`#C43A3A`) | Destructive actions, errors |
| `#16a34a` | `SUCCESS` (`#6B8F71`) | Success states, checkmarks |
| `#eab308` | `GOLDEN_AMBER` (`#D4952B`) | Star ratings, badges |
| `#fef2f2`, `#fecaca`, `#fee2e2` | `TINT_RED` (`#F8E4E4`) | Destructive confirmation surfaces |
| `#fef3c7` | `TINT_AMBER` (`#FBF0DC`) | Amber badge backgrounds |

**`collectionIconRules.ts` — food-semantic icon colors softened and unified:**

Preserved warm inline hexes (food-semantic oranges and browns that harmonize with terracotta): `#f59e0b`, `#ea580c`, `#f97316`, `#d97706`, `#92400e`, `#78350f`, `#a16207`, `#ca8a04`, `#b8860b`.

Bright Tailwind colors softened to muted palette variants:

| Old (bright) | → New (muted) | Rule categories |
|---|---|---|
| `#16a34a`, `#22c55e`, `#059669` (bright greens) | `SAGE_GREEN` | lunch, sandwich, apple, salad, vegan, vegetarian, side, tea, holiday |
| `#dc2626`, `#ef4444`, `#b91c1c` (bright reds) | `PAPRIKA` | dinner, pizza, italian, beef, healthy |
| `#ec4899`, `#f472b6`, `#e11d48` (bright pinks) | `DUSTY_ROSE` | dessert, donut, candy, lollipop, fruit, asian, party, family, date night |
| `#7c3aed`, `#a855f7`, `#8b5cf6` (bright purples) | `MUTED_PLUM` | grape, wine, cake, pie, bake, appetizer, experiment |
| `#eab308` (bright yellow) | `GOLDEN_AMBER` | egg, banana, popcorn, favorite |
| `#0ea5e9`, `#3b82f6`, `#6366f1` (cool blues — originally food-semantic) | `WARM_TAUPE`, `GOLDEN_AMBER` | fish, greek, meal prep, cocktail, drink, french, world, quick |
| `#06b6d4` (cyan) | `DUSTY_TERRACOTTA` | popsicle, smoothie |
| `#64748b`, `#1e293b` (cool grays) | `WARM_GRAY`, `DARK_WARM_GRAY` | winter/fall/comfort, chef/special |

**HomeScreen jar fan actions — four contrasting palette colors:**

The four fan-out icons that reveal when the jar FAB is tapped each get a distinct palette color to make them visually distinguishable without clashing with the warm/cream aesthetic:

| Button | Color | Hex |
|---|---|---|
| Camera | `GOLDEN_AMBER` | `#D4952B` |
| Photos | `DUSTY_ROSE` | `#BC6F83` |
| URL | `SAGE_GREEN` | `#6B8F71` |
| Add Folder | `MUTED_PLUM` | `#8E6B90` |

The main jar FAB "+" button background migrated from the MVP warm orange `#fb923c` to `PRIMARY` (terracotta `#C4633A`), matching the "Go" button in the web import screen and other primary CTAs for chrome consistency.

**Preserved inline hexes (intentionally):**

- `#fdba74` on HomeScreen avatar fallback (user profile initial circle) — already warm and on-brand
- Gradient stops in `ParseRevealEdgeGlow.tsx` — all warm-tone stops (`#ea580c`, `#f97316`, `#fbbf24`, `#fde68a`, `#fff7ed`, etc.) intentional for the parse reveal animation

**Not in scope (leave for follow-up):**

- `mobile/ios/Orzo/LaunchScreen.storyboard` still uses `systemBackgroundColor` (white, not blue — no flash on cold start, but not warm cream either). Updating requires XML edits that risk Xcode storyboard rendering; skipped to keep risk low.

**Verification:**

- `grep -rn "#2563eb\|#eff6ff\|#111827\|#6b7280\|#d1d5db" mobile/src` → 0 results
- `npx tsc --noEmit` → only the pre-existing `AccountScreen.tsx:97` MFA-factor status error (unrelated to palette work — Supabase type says `f.status` is only `"verified"` but code checks for `"unverified"`)
- Full visual walkthrough pending on the "Orzo Dev" physical iPhone build

**Files modified:** 37 `mobile/src/**` TS/TSX files (screens, features/import, features/collections, components).  
**Files created:** `mobile/src/theme/colors.ts`.

---

### 2026-04-13 — Dev/prod app isolation: "Orzo Dev" debug build

Debug builds now install as **"Orzo Dev"** (`app.orzo.ios.dev`) — a separate app that coexists alongside the production **"Orzo"** (`app.orzo.ios`) on the same phone. This enables a local dev workflow where code changes can be tested on a physical iPhone before pushing to the repo.

- **Xcode build config:** Debug configuration in `project.pbxproj` updated with `PRODUCT_BUNDLE_IDENTIFIER = app.orzo.ios.dev`, `PRODUCT_NAME = "Orzo Dev"`, and a separate `OrzoDev.entitlements` file.
- **Dynamic Info.plist:** `CFBundleDisplayName` now uses `$(PRODUCT_NAME)` and the auth callback URL scheme uses `$(PRODUCT_BUNDLE_IDENTIFIER)`, so both resolve per build configuration (Debug → "Orzo Dev" / `app.orzo.ios.dev`, Release → "Orzo" / `app.orzo.ios`).
- **Auth redirect centralized:** Created `mobile/src/services/authRedirect.ts` — exports `AUTH_REDIRECT_URL` using `__DEV__` to select the correct scheme. Replaced hardcoded `"app.orzo.ios://auth/callback"` strings in `ForgotPasswordScreen`, `EmailConfirmationScreen`, `SignUpScreen`, and `AccountScreen`.
- **Auth on dev build:** Email/password works immediately. Apple/Google Sign-In require separate App ID registration (not yet done — not needed for development).
- **Same Supabase backend:** Both apps share the same Supabase project and database. No separate dev database needed.
- **Dev workflow:** Edit code locally → `npm run dev:phone` → build Debug in Xcode → test on "Orzo Dev" (hits local API at `LAN_IP:3000`) → push to `master` → Railway auto-deploys → production "Orzo" is updated.

**Files modified:** `project.pbxproj`, `Info.plist`, `ForgotPasswordScreen.tsx`, `EmailConfirmationScreen.tsx`, `SignUpScreen.tsx`, `AccountScreen.tsx`  
**Files created:** `OrzoDev.entitlements`, `authRedirect.ts`

---

### 2026-04-08 — Production deployment, external service configuration, Release build

The Fastify API server is now deployed in production on Railway at `https://api.getorzo.com`. All external services (Apple, Google, Supabase) are configured for the `app.orzo.ios` bundle identifier. A Release build has been tested end-to-end on a physical iPhone — sign-in, recipe import (URL + camera), and recipe viewing all work against the production API.

**Railway deployment:**

- `server/Dockerfile` fixed for production builds:
  - Root `postinstall` script (`patch-package && node scripts/write-orzo-dev-host.cjs`) removed at build time via `npm pkg delete scripts.postinstall` — `patch-package` is a devDependency not available in the workspace-scoped install, and `write-orzo-dev-host.cjs` is a local dev tool.
  - Explicit `npm install --no-save @img/sharp-linux-x64` added — `sharp` requires platform-specific native binaries that aren't installed by default when the install runs on macOS and the runtime is Linux x64.
  - Both fixes allow `esbuild`'s own `postinstall` (required by `tsx`) to run normally.
- Railway environment variables configured: `DATABASE_URL` (Supabase Postgres session pooler, port 5432), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.
- Health check: `GET /health` → `{"status":"ok"}`.
- Auto-deploy from `master` branch enabled.

**Custom domain:**

- `api.getorzo.com` CNAME record created in Cloudflare DNS pointing to Railway's generated domain.
- Proxy status set to **DNS only** (gray cloud) — required for Railway's SSL certificate management.
- Railway custom domain verified and SSL certificate provisioned.

**Apple Developer Portal:**

- App ID `app.orzo.ios` registered.
- Services ID `app.orzo.ios.auth` created (used for Sign in with Apple web flow via Supabase).

**Google Cloud Console:**

- Existing OAuth clients renamed from RecipeJar → Orzo.
- iOS OAuth client updated with bundle ID `app.orzo.ios`.
- Web OAuth client ID unchanged (used by Supabase Google provider).

**Supabase Dashboard:**

- Apple provider: Client ID updated to `app.orzo.ios`.
- Google provider: "Skip nonce check" confirmed enabled.
- Site URL set to `app.orzo.ios://auth/callback`.
- Redirect URLs allowlist includes `app.orzo.ios://auth/callback`.

**Xcode & iOS:**

- Bundle identifier: `app.orzo.ios`, team `82MCB6UFTX`, automatic code signing.
- Debug build verified: dev servers → LAN IP → local API.
- Release build verified: production API at `https://api.getorzo.com`.
- Release build command: `xcodebuild -workspace ios/Orzo.xcworkspace -scheme Orzo -configuration Release -destination "id=<device-udid>" -derivedDataPath "$HOME/Library/Developer/Xcode/DerivedData/Orzo-device-release" -allowProvisioningUpdates build`
- Install via: `xcrun devicectl device install app --device <device-udid> <path-to-.app>`

**react-native patch extended (`patches/react-native+0.76.9.patch`):**

- `sdks/hermes-engine/utils/replace_hermes_version.js`: quoted paths in `tar -xf` command — fixes Release builds failing when the project path contains spaces (e.g. `MACBOOK PRO DESKTOP`).
- `scripts/xcode/with-environment.sh`: quoted `$1` argument execution — same spaces-in-path fix.
- `scripts/react-native-xcode.sh`: used `printf '%q'` for `--config-cmd` to handle spaces in `$NODE_BINARY` and `$REACT_NATIVE_DIR`.
- These patches survive `npm install` via `patch-package`.

**Files modified:**

- `server/Dockerfile` — production build fixes (postinstall skip, sharp linux binary)
- `patches/react-native+0.76.9.patch` — extended with Hermes/xcode spaces-in-path fixes

---

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
