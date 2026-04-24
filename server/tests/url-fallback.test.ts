import { describe, it, expect, vi, afterEach } from "vitest";
import {
  canonicalShortCircuit,
  findCandidateRecipeLinks,
  parseUrlFromHtml,
} from "../src/parsing/url/url-parse.adapter.js";
import * as urlFetchService from "../src/parsing/url/url-fetch.service.js";
import * as urlAiAdapter from "../src/parsing/url/url-ai.adapter.js";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * The fallback cascade is the two-layer post-cascade rescue in
 * `parseUrlFromHtml`. Tests below cover the two helpers in isolation and
 * the wiring inside `parseUrlFromHtml` with `fetchUrl` mocked so we can
 * drive the recursive retry without hitting the network.
 */

describe("canonicalShortCircuit", () => {
  it("returns the canonical URL when it differs from the current URL", () => {
    const html = `
      <html><head>
        <link rel="canonical" href="https://example.com/recipes/real-page">
      </head><body></body></html>`;
    const out = canonicalShortCircuit(html, "https://example.com/article");
    expect(out).toBe("https://example.com/recipes/real-page");
  });

  it("resolves relative canonical hrefs against the current URL", () => {
    const html = `
      <html><head>
        <link rel="canonical" href="/recipes/real-page">
      </head><body></body></html>`;
    const out = canonicalShortCircuit(html, "https://example.com/article");
    expect(out).toBe("https://example.com/recipes/real-page");
  });

  it("returns null when no canonical is declared", () => {
    const html = "<html><head><title>X</title></head><body></body></html>";
    expect(canonicalShortCircuit(html, "https://example.com/")).toBeNull();
  });

  it("returns null on self-canonical (prevents infinite recursion)", () => {
    const html = `
      <html><head>
        <link rel="canonical" href="https://example.com/article">
      </head><body></body></html>`;
    expect(
      canonicalShortCircuit(html, "https://example.com/article"),
    ).toBeNull();
  });

  it("treats trailing-slash differences as the same URL (self-loop)", () => {
    const html = `
      <html><head>
        <link rel="canonical" href="https://example.com/article/">
      </head><body></body></html>`;
    expect(
      canonicalShortCircuit(html, "https://example.com/article"),
    ).toBeNull();
  });

  it("returns null on a non-http canonical (javascript:, data:)", () => {
    const html = `
      <html><head>
        <link rel="canonical" href="javascript:void(0)">
      </head><body></body></html>`;
    expect(canonicalShortCircuit(html, "https://example.com/")).toBeNull();
  });

  it("returns null on malformed canonical href", () => {
    const html = `
      <html><head>
        <link rel="canonical" href="https://">
      </head><body></body></html>`;
    expect(canonicalShortCircuit(html, "https://example.com/")).toBeNull();
  });
});

describe("findCandidateRecipeLinks", () => {
  const BASE = "https://example.com/article";

  it("ranks /recipe/ anchor above a nav link", () => {
    const html = `<html><body>
      <nav><a href="https://example.com/recipes/foo">Navigation Recipes</a></nav>
      <article>
        <a href="https://example.com/recipes/bar">the recipe we actually linked</a>
      </article>
    </body></html>`;
    const result = findCandidateRecipeLinks(html, BASE);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].url).toContain("/recipes/bar");
  });

  it("scores JSON-LD @graph Recipe.url higher than text-only matches", () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"Recipe","url":"https://example.com/recipes/jsonld-one"}
      ]}
      </script>
    </head><body>
      <article><a href="https://example.com/recipes/text-one">View recipe</a></article>
    </body></html>`;
    const result = findCandidateRecipeLinks(html, BASE);
    expect(result[0].url).toContain("/recipes/jsonld-one");
    expect(result[0].score).toBeGreaterThanOrEqual(10);
  });

  it("resolves relative hrefs against the base URL", () => {
    const html = `<html><body>
      <article><a href="/recipes/relative">Recipe</a></article>
    </body></html>`;
    const result = findCandidateRecipeLinks(html, BASE);
    expect(result.some((c) => c.url === "https://example.com/recipes/relative")).toBe(true);
  });

  it("rejects self-fragment anchors (#recipe)", () => {
    const html = `<html><body>
      <article><a href="#recipe">Jump to recipe</a></article>
    </body></html>`;
    const result = findCandidateRecipeLinks(html, BASE);
    expect(result).toEqual([]);
  });

  it("rejects anchors resolving to the current URL (same-page)", () => {
    const html = `<html><body>
      <article>
        <a href="https://example.com/article?ref=print">Print this article</a>
        <a href="https://example.com/article#comments">Comments</a>
      </article>
    </body></html>`;
    const result = findCandidateRecipeLinks(html, BASE);
    // Query strings differ so the first link survives normalization (different
    // page per our rule), but the fragment-only link is filtered.
    expect(result.every((c) => !c.url.endsWith("#comments"))).toBe(true);
  });

  it("rejects javascript:, mailto:, and tel: schemes", () => {
    const html = `<html><body>
      <article>
        <a href="javascript:void(0)">Share</a>
        <a href="mailto:chef@example.com">Email</a>
        <a href="tel:+15551234567">Call</a>
      </article>
    </body></html>`;
    expect(findCandidateRecipeLinks(html, BASE)).toEqual([]);
  });

  it("penalizes print-recipe and AMP variants", () => {
    const html = `<html><body>
      <article>
        <a href="https://example.com/recipes/main">Recipe</a>
        <a href="https://example.com/print-recipe/main">Print recipe</a>
        <a href="https://example.com/amp/recipes/main">AMP</a>
      </article>
    </body></html>`;
    const result = findCandidateRecipeLinks(html, BASE);
    const main = result.find((c) => c.url.endsWith("/recipes/main"));
    const print = result.find((c) => c.url.includes("/print-recipe/"));
    const amp = result.find((c) => c.url.includes("/amp/"));
    expect(main).toBeDefined();
    if (print) expect(main!.score).toBeGreaterThan(print.score);
    if (amp) expect(main!.score).toBeGreaterThan(amp.score);
  });

  it("filters PDF links entirely (can't parse)", () => {
    // PDFs are hard-filtered — there's no point scoring a link we can't
    // follow. This guards the fallback from picking a PDF as "top candidate"
    // on pages where the only recipe-ish anchor points at a print-friendly
    // PDF export.
    const html = `<html><body>
      <article>
        <a href="https://example.com/recipes/main.pdf">Download recipe PDF</a>
      </article>
    </body></html>`;
    expect(findCandidateRecipeLinks(html, BASE)).toEqual([]);
  });

  it("penalizes cross-domain links and rewards same-domain", () => {
    const html = `<html><body>
      <article>
        <a href="https://example.com/recipes/same">Same domain</a>
        <a href="https://other.com/recipes/cross">Cross domain</a>
      </article>
    </body></html>`;
    const result = findCandidateRecipeLinks(html, BASE);
    const same = result.find((c) => c.url.includes("example.com"));
    const cross = result.find((c) => c.url.includes("other.com"));
    expect(same).toBeDefined();
    expect(cross).toBeDefined();
    expect(same!.score).toBeGreaterThan(cross!.score);
  });

  it("treats www and subdomain of the same registered domain as same-domain", () => {
    const base = "https://www.bonappetit.com/article";
    const html = `<html><body>
      <article>
        <a href="https://recipes.bonappetit.com/recipes/foo">Sub-domain recipe</a>
      </article>
    </body></html>`;
    const result = findCandidateRecipeLinks(html, base);
    expect(result.length).toBeGreaterThan(0);
    // Should NOT be penalized as cross-domain (score would be < 5 if -2 hit)
    expect(result[0].score).toBeGreaterThanOrEqual(6);
  });

  it("sorts highest-score first", () => {
    const html = `<html><body>
      <nav><a href="https://example.com/recipes/nav-link">nav</a></nav>
      <article>
        <a href="https://example.com/recipes/article-link">View recipe</a>
      </article>
    </body></html>`;
    const result = findCandidateRecipeLinks(html, BASE);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it("returns [] on unparseable HTML", () => {
    // cheerio is lenient; even binary garbage rarely throws. Verify that
    // an empty string returns [] without crashing.
    expect(findCandidateRecipeLinks("", BASE)).toEqual([]);
  });
});

describe("parseUrlFromHtml — fallback cascade wiring", () => {
  const ARTICLE_URL = "https://example.com/article";
  const RECIPE_JSONLD = `
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Recipe",
     "name":"Fallback Target Recipe",
     "recipeIngredient":["1 cup flour","2 eggs","1/2 cup milk"],
     "recipeInstructions":[
       {"@type":"HowToStep","text":"Mix."},
       {"@type":"HowToStep","text":"Bake."}
     ]}
    </script>`;

  it("Layer 1 (canonical) rescues a non-recipe page", async () => {
    // Article page has no recipe content, but declares a canonical URL.
    // The recursive fetch returns the canonical target's HTML with JSON-LD.
    const articleHtml = `<html><head>
      <link rel="canonical" href="https://example.com/recipes/target">
    </head><body><p>Just an article summary with no structured data.</p></body></html>`;
    const targetHtml = `<html><head>
      <title>Target</title>
    </head><body>${RECIPE_JSONLD}</body></html>`;

    vi.spyOn(urlFetchService, "fetchUrl").mockResolvedValue(targetHtml);

    const result = await parseUrlFromHtml(
      ARTICLE_URL,
      articleHtml,
      [],
      "webview-html",
    );

    expect(result.extractionMethod).toBe("json-ld");
    expect(result.title).toBe("Fallback Target Recipe");
    expect(result.fallbackFromUrl).toBe(ARTICLE_URL);
    expect(result.fallbackResolvedUrl).toBe("https://example.com/recipes/target");
  });

  it("Layer 2 (scored link-fallback) rescues when canonical is absent", async () => {
    const articleHtml = `<html><body>
      <article>
        <p>Here's a great roundup intro.</p>
        <a href="https://example.com/recipes/chosen-one">View recipe</a>
      </article>
    </body></html>`;
    const targetHtml = `<html><body>${RECIPE_JSONLD}</body></html>`;
    vi.spyOn(urlFetchService, "fetchUrl").mockResolvedValue(targetHtml);

    const result = await parseUrlFromHtml(
      ARTICLE_URL,
      articleHtml,
      [],
      "webview-html",
    );

    expect(result.extractionMethod).toBe("json-ld");
    expect(result.fallbackFromUrl).toBe(ARTICLE_URL);
    expect(result.fallbackResolvedUrl).toBe(
      "https://example.com/recipes/chosen-one",
    );
  });

  it("declines fallback when the page is an ambiguous roundup (≥8 close candidates)", async () => {
    // Build a roundup post with 10 equal-weight recipe anchors. Top score
    // and runner-up tie, so all 10 are within the 2-point ambiguity window.
    const anchors = Array.from(
      { length: 10 },
      (_, i) =>
        `<a href="https://example.com/recipes/item-${i}">View recipe ${i}</a>`,
    ).join("\n");
    const roundupHtml = `<html><body>
      <article>
        <h1>30 Best Cookie Recipes</h1>
        ${anchors}
      </article>
    </body></html>`;
    // Mock the AI tier to return null (no extractable recipe body) so we
    // flow through to the fallback cascade. Without this the DOM-AI
    // boundary extraction would try OpenAI and fail on missing API key.
    vi.spyOn(urlAiAdapter, "parseWithAI").mockResolvedValue(null);
    const fetchSpy = vi.spyOn(urlFetchService, "fetchUrl");

    const result = await parseUrlFromHtml(
      ARTICLE_URL,
      roundupHtml,
      [],
      "webview-html",
    );

    expect(result.extractionMethod).toBe("error");
    expect(fetchSpy).not.toHaveBeenCalled(); // fallback declined, no retry
    expect(result.fallbackFromUrl).toBeUndefined();
  });

  it("declines fallback when top candidate scores below the min threshold", async () => {
    // Only a weak nav link — not a plausible recipe target. Score should
    // fall below the min-score threshold after the nav penalty.
    const html = `<html><body>
      <nav>
        <a href="https://example.com/archives/old-post">old-post</a>
      </nav>
    </body></html>`;
    const fetchSpy = vi.spyOn(urlFetchService, "fetchUrl");

    const result = await parseUrlFromHtml(
      ARTICLE_URL,
      html,
      [],
      "webview-html",
    );

    expect(result.extractionMethod).toBe("error");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("depth-caps so recursive fallback can't re-enter", async () => {
    // Article → canonical → canonical (target) where the canonical target
    // ALSO has a canonical pointing back. Without the depth cap this
    // oscillates. With it, the second canonical is skipped and we fall
    // through to error.
    const articleHtml = `<html><head>
      <link rel="canonical" href="https://example.com/page-b">
    </head><body><p>No recipe here.</p></body></html>`;
    const pageBHtml = `<html><head>
      <link rel="canonical" href="https://example.com/page-c">
    </head><body><p>Also no recipe.</p></body></html>`;

    vi.spyOn(urlFetchService, "fetchUrl").mockResolvedValue(pageBHtml);

    const result = await parseUrlFromHtml(
      ARTICLE_URL,
      articleHtml,
      [],
      "webview-html",
    );

    // Canonical fired once on the article, pulled in page-b, page-b failed
    // too but depth cap prevents page-b from doing its OWN canonical retry.
    // Final result: error, with no fallback fields set.
    expect(result.extractionMethod).toBe("error");
    expect(result.fallbackFromUrl).toBeUndefined();
  });

  it("regression: JSON-LD happy-path still takes fast path (no fallback)", async () => {
    // Critical regression: URLs that parse cleanly via JSON-LD must NOT
    // enter the fallback cascade. This guards task 4 from breaking the
    // "existing sites continue to work" invariant.
    // Use server-fetch so we don't fire ensureImageFromFreshFetch — that's
    // a separate code path unrelated to the fallback and already covered
    // by parsing-domain-fixtures.test.ts.
    const html = `<html><body>${RECIPE_JSONLD}</body></html>`;
    const fetchSpy = vi.spyOn(urlFetchService, "fetchUrl");

    const result = await parseUrlFromHtml(
      "https://example.com/recipe",
      html,
      [],
      "server-fetch",
    );

    expect(result.extractionMethod).toBe("json-ld");
    expect(result.title).toBe("Fallback Target Recipe");
    expect(result.fallbackFromUrl).toBeUndefined();
    expect(result.fallbackResolvedUrl).toBeUndefined();
    // Crucially: no fallback retry fired.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves the original error candidate when the fallback retry also fails", async () => {
    // Article page has a plausible recipe link, but the fetched target
    // page contains no extractable recipe. Overall result should stay an
    // error candidate (no partial/garbage candidate sneaking through).
    const articleHtml = `<html><body>
      <article>
        <a href="https://example.com/recipes/broken-target">View recipe</a>
      </article>
    </body></html>`;
    const brokenHtml = `<html><body><p>Nothing here.</p></body></html>`;
    vi.spyOn(urlFetchService, "fetchUrl").mockResolvedValue(brokenHtml);

    const result = await parseUrlFromHtml(
      ARTICLE_URL,
      articleHtml,
      [],
      "webview-html",
    );

    expect(result.extractionMethod).toBe("error");
    expect(result.fallbackFromUrl).toBeUndefined();
    expect(result.fallbackResolvedUrl).toBeUndefined();
  });
});
