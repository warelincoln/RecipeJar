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
Split-call architecture shipped 2026-04-19 (see CHANGELOG entry).

## Residual ~10% fraction misread rate on specific cookbook fonts

**Failure mode**: gpt-5.4 Vision at `detail:"high"`, 3072px, `temperature: 0`
occasionally locks onto a wrong reading for a visually-similar fraction glyph
(common flips: ⅔ ↔ ½, ⅓ ↔ ¼, 1 3/4 ↔ 1 1/4) — and because temperature is 0,
it gives the *same wrong answer every run on the same image*. This is not
random variance. Specific cookbook fonts, lighting, or column layouts cause
the model to commit to a specific mis-read the way a human might read
"il" as "ll" at a glance.

**Why we can't fix this with prompt tuning**: the INGREDIENTS_PROMPT
already tells the model to pay close attention to fractions and prefer the
fraction matching surrounding character style. gpt-5.4 is the model we use
because it's the most fraction-accurate option available. The monolithic
architecture had the same underlying rate — we just didn't instrument it
to see.

**Mitigation shipped**: fraction-verification UX in `PreviewEditView` +
`mobile/src/utils/fractions.ts` + `mobile/src/utils/fractionTip.ts`.
Ingredients with non-integer `amount` values render with a subtle peach
tint (`LIGHT_PEACH`). One-time banner on first fraction-containing parse:
"Double-check fractions before cooking — AI isn't always perfect on ½ vs
⅓." Dismissal persists under AsyncStorage key
`fraction_verification_tip_seen_v1`.

**User experience today**: user sees the tint on every fractional
ingredient, can tap to edit any misread. Trained pattern from every mature
OCR product (Adobe Scan, Apple Notes, Google Lens, iOS Live Text).

**Future architectural unlocks**: hybrid OCR + low-detail-image
verification pass (send ingredients to gpt-4o-mini with explicit
"verify these against the image" instruction) — would catch most residual
misreads at ~3s added latency. Not yet scoped.

## Step count variance ±2-3 from source count on dense multi-action recipes

**Failure mode**: Call B (gpt-4o, concision rewrite) occasionally splits
one numbered step into multiple output steps when the source paragraph
contains multiple distinct sub-actions (e.g. a single step saying
"Preheat oven, brown butter, whisk dry ingredients, then fold in wet"
might be split into 4 output steps). Less often: merges two short
adjacent steps.

**Why we can't force exact match**: cookbook formatting is inconsistent.
Some cookbooks number every sub-action as its own step; others lump 3-5
sub-actions into one numbered paragraph. The LLM's interpretation is often
defensible even when it differs from the user's count of "numbered
items on the page."

**Mitigation**: eval suite tolerates step count variance (warns at diff > 3
but doesn't fail). In production, the user sees numbered steps they can
freely edit, merge, or split from the preview screen. No data loss.

## Supabase Storage download hang

**Fingerprint**: a single occurrence observed 2026-04-19 on a prod import
where `supabase.download` span ran for 60s (full XState timeout) before
returning. Second import 1 minute later worked in 15s. Transient, not
reproducible.

**Failure mode**: server has no per-download timeout on
`supabase.storage.from(...).download()` in
`server/src/api/drafts.routes.ts`. If Supabase Storage hangs, the parse
background job hangs for the full mobile 60s XState timeout before mobile
surfaces "couldn't read the picture."

**Mitigation queued (not shipped)**: wrap the download call in a 15-20s
`Promise.race` with a clear timeout error. Surfaces failure fast, lets
mobile retry. Small server PR, ~30 min of work. Tracked as a follow-up
from the 2026-04-19 cycle.

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
