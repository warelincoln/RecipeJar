# TODOS

Open work items captured during review + planning sessions. Each entry has enough context to pick up 3 months later without re-reading the source commit.

For implementation plans, see [`.claude/plans/`](/Users/lincolnware/.claude/plans/). For shipped history, see [CHANGELOG.md](CHANGELOG.md).

---

## Surface bot-block as a user-friendly validation error

**What.** Add a `URL_BOT_BLOCKED` validation issue code emitted when `parseUrlFromHtml` returns a bot-blocked error candidate. Mobile renders a friendly message: "This site requires a real browser to view recipes. Try taking a screenshot of the page instead."

**Why.** Current behavior (shipped 2026-04-23) detects bot-block interstitials (cooks.com "Are you Human?", Cloudflare challenges, Access Denied) in [`detectBotBlock`](server/src/parsing/url/url-fetch.service.ts) and logs the label via PostHog `server_url_bot_blocked`. But the user still sees the generic "we couldn't parse this recipe" message — no signal that the site blocks automation vs our parser being broken.

**Pros.** Users get actionable guidance. Reduces support questions. Low code cost once the bot-block signal is already in the pipeline (already added).

**Cons.** Expands mobile surface area. Must stay in sync with the server-side `detectBotBlock` label set.

**Context.** PostHog `server_url_bot_blocked` rate is ~4 hits / 14 days at the time of 2026-04-23 landing. Re-evaluate when it passes 1/day sustained — then the UX payoff is clearly worth the mobile surface expansion.

**Depends on / blocked by.** None — the server-side signal already exists.

**Where to start.**
- Add new issue code in [`shared/src/types/validation.types.ts`](shared/src/types/validation.types.ts).
- Add new validation rule in [`server/src/domain/validation/rules.*.ts`](server/src/domain/validation/) that emits the code when the parse returned a bot-blocked error candidate.
- Add message copy in [`mobile/src/features/import/`](mobile/src/features/import/).

---

## Manual step-split UX for long-`HowToStep` sites

**What.** When a parsed candidate has a step with `text.length > 400` and `steps.length <= 2`, emit a soft FLAG signal. Mobile's `PreviewEditView` / `RecipeEditScreen` shows a "Split this step?" affordance that lets the user break one big paragraph into multiple steps manually.

**Why.** BigOven and TasteOfHome serve valid JSON-LD where the entire method is concatenated into one HowToStep. Users get a 1-step or 2-step recipe instead of properly enumerated steps. Auto-splitting has over-fragmentation risk (was the Tier 1B item dropped from the 2026-04-23 plan); manual split is safer and respects author intent.

**Pros.** Covers the long-step pattern without the AI-quality risk of auto-sentence-splitting. Keeps the user in control of step granularity.

**Cons.** Requires a mobile UI component + state handling for step-split actions. Non-trivial.

**Context.** Observed sites in PostHog `server_recipe_saved` events where `step_count <= 2` and `extraction_method = "json-ld"`:
- bigoven.com (13 ing, **1** step)
- tasteofhome.com (13 ing, **2** steps)
- eatingwell.com tzatziki (3 ing, **1** step)
- alaskafromscratch.com goat-cheese-burger (6 ing, **1** step)
- southernliving.com (6 ing, **2** steps)

5+ observations across 14 days.

**Depends on / blocked by.** None.

**Where to start.**
- Add a new parse signal (e.g. `stepLongPrimaryText: true`) in [`server/src/parsing/url/url-structured.adapter.ts`](server/src/parsing/url/url-structured.adapter.ts) when the JSON-LD HowToStep pattern fires.
- Add mobile affordance in [`mobile/src/features/import/PreviewEditView.tsx`](mobile/src/features/import/PreviewEditView.tsx) and [`mobile/src/screens/RecipeEditScreen.tsx`](mobile/src/screens/RecipeEditScreen.tsx).
- Optional: the split could use a simple UI ("Split on sentence boundaries" button that calls a client-side splitter) or free-form editing (add/remove step handles).

---

## Squarespace "combine:" paragraph-prefix extraction

**What.** Extend the DOM cascade to recognize Squarespace blog posts that use `<p>In a large bowl combine:</p>` followed by `<ul>` of ingredients, rather than `<h2>Ingredients</h2>` headings. Observed on livingtheeveryday.com.

**Why.** The 2026-04-23 heading-anchored strategy (Tier 2C) targets sites with explicit `<h2>Ingredients</h2>` / `<h2>Directions</h2>` markers. Squarespace's block editor output doesn't use those — it uses `<p class="" style="white-space:pre-wrap;">In a large bowl combine:</p>` followed by a styled `<ul>`. Different pattern, needs its own heuristic.

**Pros.** Unblocks the Squarespace long-tail. Squarespace is a common blog platform for hobbyist recipe sites.

**Cons.** Brittle — relies on the literal string "combine:" or "mix together:" which isn't universal. False-positive risk on lifestyle articles ("Now let's combine ideas about fitness").

**Context.** 1 observed site in 14-day PostHog traffic (livingtheeveryday.com homemade-granola-hippie-style). Low volume, which is why this was dropped from the 2026-04-23 scope.

**Depends on / blocked by.** None. Re-evaluate when a second Squarespace-pattern site appears in telemetry.

**Where to start.** New strategy slotted between heading-anchored and `<main>`/`<article>` fallback in [`extractDomBoundary`](server/src/parsing/url/url-dom.adapter.ts). Detect `<p>` elements whose trimmed text ends with a colon + a verb like "combine" / "mix" / "whisk" / "toss", followed immediately by a `<ul>` or `<ol>` sibling. Apply the same measurement-density + cooking-verb guard as heading-anchored.

---

## AI prompt tightening for time extraction

**What.** Fix the AI prompt so "ready in 30 minutes" doesn't populate all three fields (prep, cook, total) with 30 each. Observed on angiesrecipes.blogspot.com (30-30-30 result on 2026-04-23).

**Why.** The current prompt in [`url-ai.adapter.ts`](server/src/parsing/url/url-ai.adapter.ts) has a two-tier strategy but doesn't distinguish "source states only a total" vs "source states each field". AI sees "30 minutes" once and fills all three with 30, which is impossible math (prep + cook ≤ total).

**Pros.** Visible UX win — users see coherent time breakdowns. One-line prompt change.

**Cons.** Prompt tuning always has second-order effects. Need eval regression.

**Context.** The 2026-04-23 server-side gap-fill (derived = prep + cook) handles the inverse case (prep + cook stated, total missing). The reverse (only total stated) needs a prompt nudge.

**Depends on / blocked by.** None.

**Where to start.** Add to the PROMPT in [`url-ai.adapter.ts`](server/src/parsing/url/url-ai.adapter.ts): "If the source states only an aggregate time like 'ready in X minutes', populate `totalTime` only — leave prep and cook null unless they are stated separately." Re-run a subset of the eval suite.

---

## Preview title field: typewriter animation restarts on every keystroke

**What.** On the import preview screen (`PreviewEditView`), the recipe title field appears to re-run a typewriter / cascading-text animation on every character the user types. The text visually "restarts" mid-edit, forcing the displayed characters to repopulate after each keystroke. Observed 2026-04-23 evening while editing a brightfarms.com recipe title on iPhone.

**Why.** Interrupts editing. Makes the field feel laggy and unresponsive. If the user types fast, they may see incomplete text while the animation re-runs.

**Likely root cause.** The animation's `key` prop is probably bound to the text content itself (or a derived state like `parsedCandidate.title`). Every keystroke invalidates the key, re-mounting the animated component. Should be bound to a stable identifier (draft id or a "reveal-once" flag that sets to true after the first reveal).

**Context.** Only observed on the title field. Ingredient and step fields don't have the same issue (need to verify). The animation was added as a "reveal" effect when a parse completes and populates the preview.

**Depends on / blocked by.** None. Pure mobile fix.

**Where to start.** [`mobile/src/features/import/PreviewEditView.tsx`](mobile/src/features/import/PreviewEditView.tsx) — find the animated title component, change its `key` to something stable (draft id, or a useRef + useEffect that sets a "first reveal done" flag).

---

## Joy of Baking NSAppTransportSecurity mixed-content fix

**What.** Add `NSAllowsArbitraryLoadsInWebContent = true` (or a `joyofbaking.com` entry in `NSExceptionDomains`) to [`mobile/ios/Orzo/Info.plist`](mobile/ios/Orzo/Info.plist) so the in-app WKWebView can render HTTPS pages with HTTP sub-resources.

**Why.** `https://www.joyofbaking.com/ChocolateChunkCookies.html` loads fine in desktop browsers but fails in the iPhone in-app WebView with `NSURLErrorDomain -1022` because the page embeds YouTube/Facebook/Pinterest iframes over HTTP. iOS 13+ WebView blocks the whole page when HTTP content mixes into HTTPS.

**Pros.** Unblocks Joy of Baking. Our server-side parser already handles the URL (confirmed 2026-04-23 bulk sweep).

**Cons.** `NSAllowsArbitraryLoadsInWebContent` is broad. Prefer a targeted `NSExceptionDomains` entry for joyofbaking.com specifically.

**Context.** Discovered 2026-04-23 during iPhone testing. Requires a new TestFlight build (currently on Build 3).

**Depends on / blocked by.** A mobile-only session + TestFlight Build 4 archive.

**Where to start.** [`mobile/ios/Orzo/Info.plist`](mobile/ios/Orzo/Info.plist). Add:
```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSExceptionDomains</key>
  <dict>
    <key>joyofbaking.com</key>
    <dict>
      <key>NSIncludesSubdomains</key><true/>
      <key>NSExceptionAllowsInsecureHTTPLoads</key><true/>
    </dict>
  </dict>
</dict>
```
