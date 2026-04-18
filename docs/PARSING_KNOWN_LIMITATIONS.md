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
