# TODOS

Open work items captured during review + planning sessions. Each entry has enough context to pick up 3 months later without re-reading the source commit.

For implementation plans, see [`.claude/plans/`](/Users/lincolnware/.claude/plans/). For shipped history, see [CHANGELOG.md](CHANGELOG.md).

---

## Manual step-split UX for long-`HowToStep` sites (mobile UI only)

**What.** Build the mobile affordance that consumes the **`parseSignals.stepLongPrimaryText`** flag (shipped 2026-04-23 late — server-side emission verified live on bigoven.com draft `fa2c3636-a5cb-4441-81f2-c849a66b5f7e`). When a parsed candidate has the flag set, `PreviewEditView` / `RecipeEditScreen` should show a "Split this step?" affordance that lets the user break one big paragraph into multiple steps manually.

**Why.** BigOven and TasteOfHome serve valid JSON-LD where the entire method is concatenated into one `HowToStep`. Users get a 1-step or 2-step recipe instead of properly enumerated steps. Auto-splitting has over-fragmentation risk (the Tier 1B item dropped from the 2026-04-23 plan); manual split is safer and respects author intent.

**Pros.** Covers the long-step pattern without the AI-quality risk of auto-sentence-splitting. Keeps the user in control of step granularity. Server half is already in place — this TODO is purely the UI affordance.

**Cons.** Requires a mobile UI component + state handling for step-split actions. Non-trivial.

**Context.** Observed sites in PostHog `server_recipe_saved` events where `step_count <= 2` and `extraction_method = "json-ld"`:
- bigoven.com (13 ing, **1** step) — confirmed the server flag fires here, 2026-04-23 late
- tasteofhome.com (13 ing, **2** steps)
- eatingwell.com tzatziki (3 ing, **1** step)
- alaskafromscratch.com goat-cheese-burger (6 ing, **1** step)
- southernliving.com (6 ing, **2** steps)

5+ observations across 14 days.

**Depends on / blocked by.** Nothing. Server emission shipped; consumer UI is free to land any time.

**Where to start.**
- Read `candidate.parseSignals.stepLongPrimaryText` in [`mobile/src/features/import/PreviewEditView.tsx`](mobile/src/features/import/PreviewEditView.tsx) and [`mobile/src/screens/RecipeEditScreen.tsx`](mobile/src/screens/RecipeEditScreen.tsx) and render a "Split this step?" affordance below the flagged step.
- Options for the split mechanism: (a) a simple UI ("Split on sentence boundaries" button that calls a client-side splitter), (b) free-form editing (add/remove step handles).
- Server-side helper function already factored: [`computeStepLongPrimaryText`](server/src/parsing/url/url-structured.adapter.ts) — boundary is `>2` non-header steps OR any non-header step `text.length > 400` (strict `>`, so a 400-char step does NOT fire).

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
