import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parseUrlFromHtml } from "../src/parsing/url/url-parse.adapter.js";
import {
  extractStructuredData,
  extractMicrodata,
} from "../src/parsing/url/url-structured.adapter.js";
import { extractDomBoundary } from "../src/parsing/url/url-dom.adapter.js";
import { detectBotBlock } from "../src/parsing/url/url-fetch.service.js";
import { _testResolveImageUrl } from "../src/parsing/url/url-dom-enrichment.js";
import * as urlAiAdapter from "../src/parsing/url/url-ai.adapter.js";
import * as urlFetchService from "../src/parsing/url/url-fetch.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

function load(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

describe("pbs.org recipe fixtures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extractDomBoundary finds the #recipeBody article with ingredients and instructions", () => {
    const html = load("pbs-beet.html");
    const boundary = extractDomBoundary(html);
    expect(boundary).not.toBeNull();
    expect(boundary!.length).toBeGreaterThan(500);
    expect(boundary).toMatch(/Ingredients/i);
    expect(boundary).toMatch(/Instructions/i);
    // Content signals from the actual recipe body
    expect(boundary).toContain("beets");
    expect(boundary).toContain("Preheat the oven");
  });

  it("extractStructuredData accepts the `yield` alias used by pbs.org (not `recipeYield`)", () => {
    const html = load("pbs-beet.html");
    const result = extractStructuredData(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Roasted Beet and Peach Salad");
    expect(result!.metadata?.yield).toBe("6");
    // pbs.org JSON-LD lacks recipeInstructions, so steps is empty —
    // cascade falls through to DOM-AI.
    expect(result!.steps).toHaveLength(0);
    expect(result!.ingredients!.length).toBeGreaterThanOrEqual(5);
  });

  it("parseUrlFromHtml produces a dom-ai candidate for the roasted beet salad page", async () => {
    const aiSpy = vi
      .spyOn(urlAiAdapter, "parseWithAI")
      .mockResolvedValue({
        title: "Roasted Beet and Peach Salad",
        ingredients: [
          { text: "10-12 small yellow and red beets", isHeader: false },
          { text: "1/3 cup extra-virgin oil", isHeader: false },
          { text: "4 ounces slightly aged goat cheese", isHeader: false },
        ],
        steps: [
          { text: "Preheat the oven to 400 degrees F.", isHeader: false },
          { text: "Roast the beets until tender.", isHeader: false },
        ],
        description: null,
        signals: { descriptionDetected: false },
        ingredientSignals: [],
        stepSignals: [],
      });

    const html = load("pbs-beet.html");
    const result = await parseUrlFromHtml(
      "https://www.pbs.org/food/recipes/roasted-beet-and-peach-salad",
      html,
      [],
      "server-fetch",
    );

    expect(aiSpy).toHaveBeenCalledTimes(1);
    expect(result.extractionMethod).toBe("dom-ai");
    expect(result.title).toBe("Roasted Beet and Peach Salad");
    expect(result.ingredients.length).toBeGreaterThanOrEqual(2);
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
  });

  it("parseUrlFromHtml produces a dom-ai candidate for the smoked salmon canapes page", async () => {
    vi.spyOn(urlAiAdapter, "parseWithAI").mockResolvedValue({
      title: "Smoked Salmon and Guacamole Canapes",
      ingredients: [
        { text: "5 slices brown bread", isHeader: false },
        { text: "2 tbsp olive oil", isHeader: false },
        { text: "1 large avocado", isHeader: false },
      ],
      steps: [
        { text: "Stamp out rounds from each slice of bread.", isHeader: false },
        { text: "Toast the rounds in oil and butter.", isHeader: false },
      ],
      description: null,
      signals: { descriptionDetected: false },
      ingredientSignals: [],
      stepSignals: [],
    });

    const html = load("pbs-canapes.html");
    const result = await parseUrlFromHtml(
      "https://www.pbs.org/food/recipes/smoked-salmon-and-guacamole-canapes",
      html,
      [],
      "server-fetch",
    );

    expect(result.extractionMethod).toBe("dom-ai");
    expect(result.title).toBe("Smoked Salmon and Guacamole Canapes");
    expect(result.ingredients.length).toBeGreaterThanOrEqual(2);
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
  });
});

describe("m.joyofbaking.com recipe fixtures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extractDomBoundary falls back to body text when there is no recipe wrapper or <main>", () => {
    const html = load("joyofbaking-mobile-macarons.html");
    const boundary = extractDomBoundary(html);
    expect(boundary).not.toBeNull();
    expect(boundary!.length).toBeGreaterThan(1000);
    // The body-text fallback kicks in because the heading markers are present.
    expect(boundary).toMatch(/Ingredients:/i);
    expect(boundary).toMatch(/Instructions:/i);
    expect(boundary).toContain("Raspberry Macarons");
  });

  it("parseUrlFromHtml produces a dom-ai candidate for the raspberry macarons page", async () => {
    vi.spyOn(urlAiAdapter, "parseWithAI").mockResolvedValue({
      title: "Raspberry Macarons",
      ingredients: [
        { text: "1 cup ground blanched almonds", isHeader: false },
        { text: "3 extra-large egg whites", isHeader: false },
        { text: "1/3 cup cream cheese", isHeader: false },
      ],
      steps: [
        { text: "Sift the dry ingredients together.", isHeader: false },
        { text: "Whip the egg whites to stiff peaks.", isHeader: false },
      ],
      description: null,
      signals: { descriptionDetected: false },
      ingredientSignals: [],
      stepSignals: [],
    });

    const html = load("joyofbaking-mobile-macarons.html");
    const result = await parseUrlFromHtml(
      "https://m.joyofbaking.com/frenchmacarons/RaspberryMacaronsRecipe.html",
      html,
      [],
      "server-fetch",
    );

    expect(result.extractionMethod).toBe("dom-ai");
    expect(result.title).toBe("Raspberry Macarons");
    expect(result.ingredients.length).toBeGreaterThanOrEqual(2);
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
  });
});

describe("gourmetmagazine.net (paywalled, known limitation)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has no JSON-LD Recipe (Article-only) and no extractable recipe content", () => {
    const html = load("gourmetmagazine-split-pea.html");
    expect(extractStructuredData(html)).toBeNull();
    // The article body exists but contains no ingredient/instruction markers —
    // the recipe itself sits behind a Ghost CMS subscribe gate.
    expect(extractDomBoundary(html)).toBeNull();
  });

  it("parseUrlFromHtml returns an error candidate for paywalled Ghost-CMS pages", async () => {
    const aiSpy = vi.spyOn(urlAiAdapter, "parseWithAI");

    const html = load("gourmetmagazine-split-pea.html");
    const result = await parseUrlFromHtml(
      "https://gourmetmagazine.net/split-pea-soup-a-recipe/",
      html,
      [],
      "server-fetch",
    );

    expect(result.extractionMethod).toBe("error");
    expect(result.title).toBeNull();
    expect(result.ingredients).toEqual([]);
    expect(result.steps).toEqual([]);
    // AI should not be called at all — DOM boundary returned null, so we
    // short-circuited before the expensive OpenAI path.
    expect(aiSpy).not.toHaveBeenCalled();
  });
});

describe("chefmichaelsmith.com — strip protection regression", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The recipe container div carries both state classes (has-sidebar, no-review,
  // no-related) AND the content marker `recipe`. The original substring strip
  // matched `[class*="sidebar"]` against `has-sidebar` and deleted the recipe
  // body. Protection must keep content-marked elements even when they carry
  // junk-style state classes.
  it("extractDomBoundary keeps the .recipe container despite has-sidebar / no-review state classes", () => {
    const html = load("chefmichaelsmith-chicken-stew.html");
    const boundary = extractDomBoundary(html);
    expect(boundary).not.toBeNull();
    expect(boundary!.length).toBeGreaterThan(500);
    expect(boundary).toContain("Classic Chicken Stew");
  });
});

describe("angiesrecipes.blogspot.com — measurement-density fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Blogger template with no schema.org markup, no <main>/<article>, no recipe
  // class wrappers, and no literal "Ingredients:" / "Instructions:" headers.
  // The recipe is a bare <ul> of measured items followed by an <ol> of steps.
  // hasRecipeKeywords must accept this via the measurement + cooking-verb signal.
  it("extractDomBoundary falls through to body and accepts a recipe without explicit section headers", () => {
    const html = load("angiesrecipes-paprika-chicken.html");
    const boundary = extractDomBoundary(html);
    expect(boundary).not.toBeNull();
    expect(boundary!.length).toBeGreaterThan(500);
    expect(boundary).toContain("Paprika Chicken");
    // The measurement / verb signals the fallback relies on.
    expect(boundary).toMatch(/\b\d+\s*tbsp\b/i);
    expect(boundary).toMatch(/\b(heat|simmer|fry)\b/i);
  });
});

describe("www.joyofbaking.com — hRecipe microformat support", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Desktop joyofbaking.com uses the hRecipe microformat (pre-schema.org):
  // `<div class="hrecipe">` wrapping `<.fn>` and `<.ingredient>` elements,
  // with unlabeled free-text instructions. Without an `[class*="hrecipe"]`
  // selector the DOM boundary used to fall through to a body-fallback that
  // failed because the page has no "Instructions:" header.
  it("extractDomBoundary picks up the .hrecipe wrapper on desktop joyofbaking.com", () => {
    const html = load("joyofbaking-desktop-chocolate-chunk.html");
    const boundary = extractDomBoundary(html);
    expect(boundary).not.toBeNull();
    expect(boundary!.length).toBeGreaterThan(500);
    expect(boundary).toContain("Chocolate Chunk Cookies");
  });
});

describe("notquitenigella.com 2010 — microdata partial match", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The 2010-era post uses <li itemprop="recipeIngredient"> tags but leaves
  // directions as bare <p><strong>Beef layer</strong></p> subsections with
  // no recipeInstructions itemprop. Pre-2026-04-23 the microdata extractor
  // required both fields and returned null; post-fix it returns partial.
  it("extractMicrodata returns a partial result with ingredients and steps=[]", () => {
    const html = load("notquitenigella-2010-microdata-partial.html");
    const result = extractMicrodata(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Trailer Park Shepherd's Pie");
    expect(result!.ingredients!.length).toBeGreaterThanOrEqual(10);
    // No recipeInstructions microdata → steps intentionally empty so the
    // cascade falls through to DOM-AI.
    expect(result!.steps).toHaveLength(0);
  });

  it("parseUrlFromHtml preserves microdata ingredients and uses AI-extracted steps", async () => {
    // AI mock returns different ingredient shapes than the microdata. The
    // merge rule in parseUrlFromHtml should prefer the microdata items.
    vi.spyOn(urlAiAdapter, "parseWithAI").mockResolvedValue({
      title: "Trailer Park Shepherd's Pie",
      ingredients: [
        // AI-extracted (lower-fidelity) — should be replaced by microdata.
        { text: "onion", isHeader: false },
        { text: "beef", isHeader: false },
        { text: "potatoes", isHeader: false },
      ],
      steps: [
        { text: "Brown the beef with the onion.", isHeader: false },
        { text: "Mash the potatoes with milk and sour cream.", isHeader: false },
        { text: "Assemble and bake at 400F for 25 minutes.", isHeader: false },
      ],
      description: null,
      signals: { descriptionDetected: false },
      ingredientSignals: [],
      stepSignals: [],
    });

    const html = load("notquitenigella-2010-microdata-partial.html");
    const result = await parseUrlFromHtml(
      "https://www.notquitenigella.com/2010/12/02/trailer-park-shepherds-pie",
      html,
      [],
      "server-fetch",
    );

    expect(result.extractionMethod).toBe("dom-ai");
    expect(result.title).toBe("Trailer Park Shepherd's Pie");
    // Microdata ingredients (17) should win over the 3-item AI extraction.
    expect(result.ingredients.length).toBeGreaterThanOrEqual(10);
    // AI steps survive because microdata has none.
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
    // Spot-check an ingredient string that's only in the microdata.
    const joined = result.ingredients.map((i) => i.text).join("\n");
    expect(joined).toContain("beef mince");
  });

  it("parseUrlFromHtml returns an error candidate when AI also fails to extract steps", async () => {
    vi.spyOn(urlAiAdapter, "parseWithAI").mockResolvedValue(null);

    const html = load("notquitenigella-2010-microdata-partial.html");
    const result = await parseUrlFromHtml(
      "https://www.notquitenigella.com/2010/12/02/trailer-park-shepherds-pie",
      html,
      [],
      "server-fetch",
    );

    expect(result.extractionMethod).toBe("error");
    expect(result.ingredients).toEqual([]);
    expect(result.steps).toEqual([]);
  });
});

describe("cooks.com — bot-block interstitial detection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detectBotBlock identifies the 'Are you Human?' title", () => {
    const html = load("cooks-interstitial.html");
    expect(detectBotBlock(html)).toBe("bot_interstitial_are_you_human");
  });

  it("detectBotBlock returns null on real recipe fixtures (no false positives)", () => {
    for (const fixture of [
      "pbs-beet.html",
      "pbs-canapes.html",
      "joyofbaking-mobile-macarons.html",
      "angiesrecipes-paprika-chicken.html",
      "chefmichaelsmith-chicken-stew.html",
      "joyofbaking-desktop-chocolate-chunk.html",
      "notquitenigella-2010-microdata-partial.html",
      "brightfarms-headings.html",
      "gourmetmagazine-split-pea.html",
    ]) {
      expect(detectBotBlock(load(fixture))).toBeNull();
    }
  });

  it("detectBotBlock returns null on short or empty HTML", () => {
    expect(detectBotBlock("")).toBeNull();
    expect(detectBotBlock("<html><body>hi</body></html>")).toBeNull();
  });

  it("parseUrlFromHtml returns an error candidate when the webview submitted an interstitial", async () => {
    // No AI mock needed — bot-block detection short-circuits before the
    // cascade runs, so parseWithAI is never called.
    const aiSpy = vi.spyOn(urlAiAdapter, "parseWithAI");
    const html = load("cooks-interstitial.html");
    const result = await parseUrlFromHtml(
      "https://www.cooks.com/recipe/uq4665nf/road-kill-stew.html",
      html,
      [],
      "webview-html",
    );
    expect(result.extractionMethod).toBe("error");
    expect(result.ingredients).toEqual([]);
    expect(result.steps).toEqual([]);
    expect(aiSpy).not.toHaveBeenCalled();
  });
});

describe("brightfarms.com — heading-anchored DOM extraction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extractDomBoundary finds a recipe via <h5>Ingredients</h5> + <h5>Recipe Preparation</h5>", () => {
    const html = load("brightfarms-headings.html");
    const boundary = extractDomBoundary(html);
    expect(boundary).not.toBeNull();
    expect(boundary!.length).toBeGreaterThan(500);
    expect(boundary).toMatch(/Ingredients:/i);
    expect(boundary).toMatch(/Instructions:/i);
    expect(boundary).toContain("garbanzo beans");
    expect(boundary).toContain("Preheat oven");
  });

  it("extractStructuredData returns null (no JSON-LD Recipe on brightfarms)", () => {
    const html = load("brightfarms-headings.html");
    expect(extractStructuredData(html)).toBeNull();
  });

  it("falls through when one of the two required anchors is missing", () => {
    // Only an Ingredients heading, no directions heading anywhere. Also
    // deliberately no cooking verbs or measurement density outside the
    // ingredient list, so the generic body-keyword fallback doesn't also
    // catch it — we want to verify heading-anchored itself returns null.
    const halfHtml = `<!DOCTYPE html><html><body>
      <h1>Glossary Page</h1>
      <h2>Ingredients</h2>
      <p>This page is a glossary. Check back later.</p>
    </body></html>`;
    const boundary = extractDomBoundary(halfHtml);
    expect(boundary).toBeNull();
  });
});

describe("url-dom-enrichment — image URL discovery + resolution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolveImageUrl passes absolute http(s) URLs through unchanged", () => {
    expect(
      _testResolveImageUrl("https://cdn.example.com/hero.jpg", "https://example.com/page"),
    ).toBe("https://cdn.example.com/hero.jpg");
  });

  it("resolveImageUrl prepends scheme for protocol-relative URLs", () => {
    expect(
      _testResolveImageUrl("//cdn.example.com/hero.jpg", "https://example.com/page"),
    ).toBe("https://cdn.example.com/hero.jpg");
  });

  it("resolveImageUrl rebases site-relative URLs against the source origin", () => {
    expect(
      _testResolveImageUrl("/uploads/cocktail/149/bdsm.jpg", "https://us.inshaker.com/cocktails/149-bdsm"),
    ).toBe("https://us.inshaker.com/uploads/cocktail/149/bdsm.jpg");
  });

  it("resolveImageUrl falls back gracefully when the base URL is malformed", () => {
    // Returns the raw string unchanged rather than throwing.
    expect(_testResolveImageUrl("/uploads/x.jpg", "not a valid url")).toBe(
      "/uploads/x.jpg",
    );
  });

  it("findImageUrl discovers <link itemprop='image'> (notquitenigella-style)", async () => {
    // Synthetic page with only the itemprop image link — no og:image.
    const html = `<!DOCTYPE html><html><head>
      <link itemprop="image" href="https://images.example.com/recipe-ll.jpg">
    </head><body>
      <h1>Test Recipe</h1>
      <h2>Ingredients</h2>
      <ul>
        <li>1 cup flour</li>
        <li>1/2 cup sugar</li>
        <li>2 eggs</li>
        <li>1 tsp vanilla</li>
        <li>1/4 cup milk</li>
      </ul>
      <h2>Directions</h2>
      <ol><li>Mix, bake, serve.</li></ol>
    </body></html>`;
    vi.spyOn(urlAiAdapter, "parseWithAI").mockResolvedValue({
      title: "Test Recipe",
      ingredients: [
        { text: "1 cup flour", isHeader: false },
        { text: "1/2 cup sugar", isHeader: false },
      ],
      steps: [{ text: "Mix, bake, serve.", isHeader: false }],
      description: null,
      signals: { descriptionDetected: false },
      ingredientSignals: [],
      stepSignals: [],
    });
    const result = await parseUrlFromHtml(
      "https://example.com/recipe",
      html,
      [],
      "server-fetch",
    );
    expect(result.metadata?.imageUrl).toBe(
      "https://images.example.com/recipe-ll.jpg",
    );
  });

  it("parseUrlFromHtml rebases a relative og:image against the source URL (inshaker-style)", async () => {
    // JSON-LD with a site-relative image. The resolver should rebase it
    // to an absolute URL using the source page URL.
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:image" content="/uploads/cocktail/149/drink.jpg">
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "@type":"Recipe",
        "name":"Test Cocktail",
        "image":"/uploads/cocktail/149/drink.jpg",
        "recipeIngredient":["1 oz dark rum","1/2 oz lime juice","1/2 oz simple syrup"],
        "recipeInstructions":[{"@type":"HowToStep","text":"Shake with ice."},{"@type":"HowToStep","text":"Strain into a coupe."}]
      }</script>
    </head><body></body></html>`;
    const result = await parseUrlFromHtml(
      "https://us.inshaker.com/cocktails/149-test",
      html,
      [],
      "server-fetch",
    );
    expect(result.extractionMethod).toBe("json-ld");
    expect(result.metadata?.imageUrl).toBe(
      "https://us.inshaker.com/uploads/cocktail/149/drink.jpg",
    );
  });

  it("ensureImageFromFreshFetch recovers an image when webview HTML is missing meta tags", async () => {
    // Webview HTML has all the recipe content but no og:image.
    const webviewHtml = `<!DOCTYPE html><html><head>
      <title>Test Recipe</title>
    </head><body>
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "@type":"Recipe",
        "name":"Test Recipe",
        "recipeIngredient":["1 cup flour","1/2 cup sugar","2 eggs"],
        "recipeInstructions":[{"@type":"HowToStep","text":"Mix."},{"@type":"HowToStep","text":"Bake."}]
      }</script>
    </body></html>`;
    // Fresh server-fetch returns an HTML with og:image.
    const freshHtml = `<!DOCTYPE html><html><head>
      <meta property="og:image" content="https://cdn.example.com/recipe-hero.jpg">
      <title>Test Recipe</title>
    </head><body></body></html>`;
    vi.spyOn(urlFetchService, "fetchUrl").mockResolvedValue(freshHtml);

    const result = await parseUrlFromHtml(
      "https://example.com/recipe",
      webviewHtml,
      [],
      "webview-html",
    );

    expect(result.extractionMethod).toBe("json-ld");
    expect(result.metadata?.imageUrl).toBe(
      "https://cdn.example.com/recipe-hero.jpg",
    );
  });

  it("ensureImageFromFreshFetch does not fire on server-fetch acquisition method", async () => {
    const html = `<!DOCTYPE html><html><head>
      <title>Test Recipe</title>
    </head><body>
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "@type":"Recipe",
        "name":"Test Recipe",
        "recipeIngredient":["1 cup flour","1/2 cup sugar","2 eggs"],
        "recipeInstructions":[{"@type":"HowToStep","text":"Mix."},{"@type":"HowToStep","text":"Bake."}]
      }</script>
    </body></html>`;
    // Spy on fetchUrl — it should not be called when acquisitionMethod !== "webview-html".
    const fetchSpy = vi.spyOn(urlFetchService, "fetchUrl");

    const result = await parseUrlFromHtml(
      "https://example.com/recipe",
      html,
      [],
      "server-fetch",
    );

    expect(result.extractionMethod).toBe("json-ld");
    // No image present, and we didn't even attempt a fresh fetch.
    expect(result.metadata?.imageUrl).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ensureImageFromFreshFetch preserves the candidate when the fresh fetch throws", async () => {
    const webviewHtml = `<!DOCTYPE html><html><head>
      <title>Test Recipe</title>
    </head><body>
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "@type":"Recipe",
        "name":"Test Recipe",
        "recipeIngredient":["1 cup flour","1/2 cup sugar","2 eggs"],
        "recipeInstructions":[{"@type":"HowToStep","text":"Mix."},{"@type":"HowToStep","text":"Bake."}]
      }</script>
    </body></html>`;
    vi.spyOn(urlFetchService, "fetchUrl").mockRejectedValue(new Error("network"));

    const result = await parseUrlFromHtml(
      "https://example.com/recipe",
      webviewHtml,
      [],
      "webview-html",
    );

    // Recipe extraction still succeeds — image stays missing.
    expect(result.extractionMethod).toBe("json-ld");
    expect(result.title).toBe("Test Recipe");
    expect(result.metadata?.imageUrl).toBeUndefined();
  });
});
