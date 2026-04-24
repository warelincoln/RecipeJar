# Parsing — Known Limitations

Two parser families with distinct failure modes. **URL parsing** fails on sites
we can't extract from server-side (paywalls, bot challenges, malformed
structured data). **Image parsing** fails on visually-similar glyph
disambiguation where the LLM locks onto a wrong reading consistently.

Each entry records the failure mode, the user-visible behavior, and the
mitigation (if any). No silent successes: every known limitation surfaces
either as a BLOCK candidate (unusable recipe), a FLAG warning (usable but
flagged), or a UX nudge (peach-tinted fraction fields).

---

# Image Parsing — Known Limitations

The image parse cascade lives in `server/src/parsing/image/image-parse.adapter.ts`.
**Current architecture (shipped 2026-04-21):** single `gpt-4o` call with merged
schema, `temperature: 0`, `detail: "high"`, `max_completion_tokens: 4500`.
Replaced the 2026-04-19 split-call architecture after a 4-arm eval trade
study showed monolithic gpt-4o beats it on cost (-42%) with equal accuracy
and slightly better latency. See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
Image Parse section for the full history.

## Residual ~10% fraction misread rate on specific cookbook fonts

**Failure mode**: gpt-4o Vision at `detail:"high"`, 3072px, `temperature: 0`
occasionally locks onto a wrong reading for a visually-similar fraction glyph
(common flips: ⅔ ↔ ½, ⅓ ↔ ¼, 1 3/4 ↔ 1 1/4) — and because temperature is 0,
it gives the *same wrong answer every run on the same image*. This is not
random variance. Specific cookbook fonts, lighting, or column layouts cause
the model to commit to a specific mis-read the way a human might read
"il" as "ll" at a glance.

**Why we can't fix this with prompt tuning**: the `RECIPE_PROMPT`
already tells the model to pay close attention to fractions and prefer the
fraction matching surrounding character style. gpt-4o passed 5/5 eval
fixtures for fraction fidelity at the moment of the 2026-04-21 architecture
switch (same score as the gpt-5.4 ingredient call in the prior split
architecture), so the residual rate is a property of current vision-OCR
SOTA, not our model choice.

**2026-04-21 tailwind (WYSIWYG camera fix)**: the prior camera preview
used `resizeMode="cover"`, cropping the 3:4 sensor output to fill the
iPhone screen. Users framed pages tighter than the actual capture —
text rendered smaller in the captured pixels than expected. The new
`resizeMode="contain"` preview matches the capture frame exactly, so
users can frame tighter (get physically closer) with confidence.
Expected downstream: lower fraction misread rate over time as users
send tighter-framed shots. No measurement yet; watch Sentry
`server_parse_cost` + user fraction-error reports over the next week.

**Mitigation shipped (2026-04-19, refined 2026-04-21)**: fraction-
verification UX in `PreviewEditView` + `mobile/src/utils/fractions.ts`.
Ingredients with non-integer `amount` values render with a subtle peach
tint (`LIGHT_PEACH`). Persistent italic note above the ingredient list
when any fractional amount is present: "Peach-tinted amounts are AI
estimates — double-check fractions before cooking." (The original
one-time AsyncStorage-gated banner was replaced with an always-visible
note during 2026-04-19 dad-testing.)

**User experience today**: user sees the tint on every fractional
ingredient, can tap to edit any misread. Trained pattern from every mature
OCR product (Adobe Scan, Apple Notes, Google Lens, iOS Live Text).

**Future architectural unlocks**: hybrid OCR + low-detail-image
verification pass (send ingredients to gpt-4o-mini with explicit
"verify these against the image" instruction) — would catch most residual
misreads at ~3s added latency. Not yet scoped.

## Step count variance ±2-3 from source count on dense multi-action recipes

**Failure mode**: the monolithic gpt-4o call (concision rewrite portion)
occasionally splits one numbered step into multiple output steps when the
source paragraph contains multiple distinct sub-actions (e.g. a single
step saying "Preheat oven, brown butter, whisk dry ingredients, then fold
in wet" might be split into 4 output steps). Less often: merges two short
adjacent steps. Same behavior as the prior split-architecture's Call B.

**Why we can't force exact match**: cookbook formatting is inconsistent.
Some cookbooks number every sub-action as its own step; others lump 3-5
sub-actions into one numbered paragraph. The LLM's interpretation is often
defensible even when it differs from the user's count of "numbered
items on the page."

**Mitigation**: eval suite tolerates step count variance (warns at diff > 3
but doesn't fail). In production, the user sees numbered steps they can
freely edit, merge, or split from the preview screen. No data loss.

## Supabase Storage download hang — bounded at 18s (2026-04-19 follow-up)

**Fingerprint**: a single occurrence observed 2026-04-19 on a prod import
where `supabase.download` span ran for 60s (full XState timeout) before
returning. Second import 1 minute later worked in 15s. Transient, not
reproducible.

**Failure mode**: under degraded Supabase Storage, a `.download()` call
can stall indefinitely. Without a server-side timeout the parse background
job consumes mobile's full 60s XState budget, so the user sees the parsing
splash for a full minute and the eventual mobile-side timeout produces a
confusing UX (no server-side error, just "took too long").

**Mitigation (shipped 2026-04-19, same-day follow-up)**: per-page
`.download()` is wrapped in a generic `withTimeout<T>` helper
([`server/src/lib/timeout.ts`](server/src/lib/timeout.ts)) capped at 18s.
On timeout: throws `"supabase download timeout after 18000ms"`, sets
`timed_out=true` on the active `supabase.download` Sentry span, falls
through the existing `runParseInBackground` catch → `classifyParseError →
"fetch"` → `setParseError → mobile renders parse_failed and shows the
retake screen well inside the 60s XState window. Env-overridable via
`SUPABASE_DOWNLOAD_TIMEOUT_MS`. Same helper backs the URL sync path's
`fetchWithTimeout`. 5 unit tests + 1 integration test cover the wiring.

**Residual risk**: the underlying Supabase request is not cancellable (the
JS SDK's `.download()` doesn't accept `AbortSignal`); the work continues
in the background until it eventually settles or is GC'd. Cost is theoretical
at our scale (a few hundred parses/min worst case = a handful of orphaned
requests at any given time). If we ever see real memory pressure from this,
the fix would be to drop the SDK and call the Supabase REST endpoint via
`fetch` directly with an `AbortController`.

---

# URL Parsing — Known Limitations

Sites we have confirmed we cannot parse server-side without bespoke bot-bypass
or subscription-bypass infrastructure. Each entry records the URL fingerprint,
the failure mode, and what the user sees today. The import path still returns
a `STRUCTURE_NOT_SEPARABLE` error candidate for these — no silent success, no
partial recipe.

The parser cascade (JSON-LD → Microdata → DOM-AI) lives in
`server/src/parsing/url/url-parse.adapter.ts`. Extractor details:
`url-structured.adapter.ts` and `url-dom.adapter.ts`.

## gourmetmagazine.net (Ghost CMS, paywalled)

**Fingerprint**: `storage.ghost.io` asset domain, `<h3 class="gh-subscribe-title">`,
`Subscribe Now` CTA in article body.

**Failure mode**: JSON-LD declares `@type: "Article"` (not `Recipe`). The free
preview that ships in the HTML is a narrative blog essay — no ingredient list,
no numbered steps, no `recipeIngredient` / `recipeInstructions` markup. The
actual recipe sits behind a paid subscription and is only served to authenticated
sessions.

**Why we can't fix this server-side**: there's nothing to extract. The page
genuinely does not contain recipe structure until the user signs in; there is
no DOM region we could bound, no hidden JSON blob we could reveal. Bypassing
the paywall would be both a terms-of-service violation and technically brittle
(Ghost rotates session tokens).

**User experience today**: import fails with a generic
`STRUCTURE_NOT_SEPARABLE` BLOCK. A follow-up (not implemented here) would
detect the Ghost/paywall fingerprint and surface a friendlier "this article
appears to be subscriber-only — try a different URL or take a screenshot"
message on the client.

**Observed**: `https://gourmetmagazine.net/split-pea-soup-a-recipe/` (PostHog,
2026-04-17).

## Bot-block interstitials (cooks.com, Cloudflare challenges) — detected and surfaced as friendly UX

**Fingerprint** (one of):
- `<title>` contains "Are you Human?" (cooks.com)
- `<title>` contains "Just a moment" + body contains `cf-mitigated` / `challenge-form` / `__cf_chl_jschl_tk__` / `cf-browser-verification` (Cloudflare)
- `<title>` contains "Access Denied" / "Access Restricted" + body < 4 KB

**Failure mode**: the site serves an interstitial page instead of the recipe to any non-browser request. The HTML has no recipe markup — the cascade would previously cascade all the way to `"error"` with a generic "couldn't parse" surface.

**Detection (shipped 2026-04-23 evening)**: [`detectBotBlock`](../server/src/parsing/url/url-fetch.service.ts) inspects response bodies after fetch AND at the top of `parseUrlFromHtml` (for webview-captured interstitials). Returns a short label (`"bot_interstitial_are_you_human"` / `"cloudflare_challenge"` / `"access_denied"`) or null.

- Inside `fetchUrl`: throws a new `BotBlockError` when positive. `parseUrl` catches and emits the `bot-blocked` log tag with the label.
- Top of `parseUrlFromHtml`: catches when the iPhone in-app WebView captured and submitted the interstitial page as its HTML.

**User-facing UX (shipped 2026-04-23 late)**: both bot-block call sites in [`url-parse.adapter.ts`](../server/src/parsing/url/url-parse.adapter.ts) now call `buildErrorCandidate("url", pages, "url_bot_blocked")`. The candidate carries `extractionError: "url_bot_blocked"`. The new [`rules.extraction-error.ts`](../server/src/domain/validation/rules.extraction-error.ts) rule emits a `URL_BOT_BLOCKED` BLOCK-severity issue. [`validation.engine.ts`](../server/src/domain/validation/validation.engine.ts) centrally short-circuits the MISSING-field rules (`evaluateRequiredFields` / `evaluateIngredients` / `evaluateSteps` / `evaluateServings`) so the user sees exactly one actionable banner, not a stack of `TITLE_MISSING` + `INGREDIENTS_MISSING` + `STEPS_MISSING` noise on an empty candidate. Client copy in [`issueDisplayMessage.ts`](../mobile/src/features/import/issueDisplayMessage.ts): *"This site requires a real browser to view recipes. Try taking a screenshot of the page instead."* — the server message stays terse so UX copy changes don't require server redeploy.

**Severity choice**: `BLOCK`, not `RETAKE`. The XState machine routes `NEEDS_RETAKE` only on RETAKE-severity issues, which would dump the user on the photo-oriented `RetakeRequiredView` — wrong affordance for a URL. `BLOCK` keeps the user on `PreviewEditView` with a red banner, save disabled, and the one useful message. Issue is non-dismissible and non-resolvable because there's nothing the user can do inside the app — they have to leave and screenshot the page.

**Observed**: cooks.com/recipe/uq4665nf/road-kill-stew.html (4 attempts in 14 days, PostHog 2026-04-23). Real-world UX verification pending the next interstitial hit — the 2026-04-23 late smoke test saw cooks.com serve a real recipe page instead. Vitest integration test in [`parsing-domain-fixtures.test.ts`](../server/tests/parsing-domain-fixtures.test.ts) covers the end-to-end plumbing against the saved `cooks-interstitial.html` fixture.

## AI prompt duplicated aggregate times across all three fields — fixed

**Failure mode**: sites that state only an aggregate time (e.g. "ready in 30 minutes", "total time: 30 min" with no separate prep/cook) caused the URL AI adapter's gpt-5.4 extraction to fill all three fields with 30 — impossible math (prep + cook ≤ total).

**Fix shipped (2026-04-23 late)**: rule 3 added to [`url-ai.adapter.ts`](../server/src/parsing/url/url-ai.adapter.ts) PROMPT: *"If the source states only an aggregate time (e.g. 'ready in X minutes', 'total time: X'), populate totalTime only — leave prepTime and cookTime null unless stated separately. Do not split or duplicate an aggregate across the three fields."*

**Observed fingerprint site**: angiesrecipes.blogspot.com smarties-cookies post. Verified post-fix on iPhone Orzo Dev — times are coherent, no 30/30/30.

**Residual monitoring**: prompt tightening can have second-order effects. Watch PostHog `*TimeSource` distribution after this lands in production. If `"inferred"` rate spikes or `"explicit"` drops on sites that genuinely publish separate prep/cook times, re-tune.

## iPhone in-app WebView returns skeletal DOM for some pages

**Fingerprint**: `acquisitionMethod: "webview-html"` + `url_extraction` method
`"error"` + supplied HTML under ~15 KB and missing recipe body text
(`"ingredients"` / core ingredient keywords absent from the captured HTML).

**Failure mode**: the in-app WKWebView sometimes submits a captured DOM that
contains only the page shell (`<head>`, `<nav>`, `<footer>`) with no recipe
content. Either capture fires before JS-hydrated content finishes rendering,
or the page serves a different response to the WKWebView user-agent than to a
server fetch. Observed 2026-04-23 on `chefmichaelsmith.com` — WebView capture
was 13 KB of shell, curl with an iPhone UA from the same machine returned
53 KB with the full recipe.

**Mitigation shipped (2026-04-23)**: when `parseUrlFromHtml(suppliedHtml)`
returns an error candidate, [`drafts.routes.ts`](../server/src/api/drafts.routes.ts)
automatically retries via `parseUrl(url, sourcePages, "server-fetch-fallback")`
— a fresh server-side fetch of the canonical URL. This bypasses the WebView
capture entirely. Only fires on error; successful webview parses skip the
retry. Logs the retry via `webview_html_retry_via_server_fetch` for
observability.

**Residual risk**: if the webview capture succeeds enough to return *partial*
content that passes the quality gate at a structured-data tier but is
missing steps (for example), we'd save a BLOCK-severity candidate rather
than retrying. In practice the cascade is strict enough (JSON-LD quality gate
requires 2+ ingredients AND 1+ step AND title > 2 chars) that this is rare.
If it becomes a pattern we can extend the retry trigger to fire on any
candidate whose `stepCount < 1 || ingredientCount < 2` regardless of
extraction method.
