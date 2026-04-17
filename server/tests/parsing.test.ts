import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalizeToCandidate,
  buildErrorCandidate,
  decodeHtmlEntities,
  type RawExtractionResult,
} from "../src/parsing/normalize.js";
import { extractStructuredData, extractMicrodata } from "../src/parsing/url/url-structured.adapter.js";
import { extractDomBoundary } from "../src/parsing/url/url-dom.adapter.js";
import { enrichFromDom } from "../src/parsing/url/url-dom-enrichment.js";
import { normalizeUrl } from "../src/parsing/url/url-fetch.service.js";
import * as urlAiAdapter from "../src/parsing/url/url-ai.adapter.js";
import {
  parseUrlFromHtml,
  parseUrlStructuredOnly,
} from "../src/parsing/url/url-parse.adapter.js";
import { validateRecipe } from "../src/domain/validation/validation.engine.js";
import type { SourcePage } from "@orzo/shared";

afterEach(() => {
  vi.restoreAllMocks();
});

const testPages: SourcePage[] = [
  {
    id: "p1",
    orderIndex: 0,
    sourceType: "image",
    retakeCount: 0,
    imageUri: "test.jpg",
    extractedText: null,
  },
];

describe("normalizeToCandidate", () => {
  it("normalizes a complete raw extraction", () => {
    const raw: RawExtractionResult = {
      title: "Chocolate Cake",
      ingredients: [
        { text: "2 cups flour", isHeader: false },
        { text: "1 cup sugar", isHeader: false },
      ],
      steps: [{ text: "Mix dry ingredients." }, { text: "Bake at 350F." }],
      description: "A rich chocolate cake.",
      signals: {
        structureSeparable: true,
        descriptionDetected: true,
      },
      ingredientSignals: [
        {
          index: 0,
          text: "2 cups flour",
          mergedWhenSeparable: false,
          missingName: false,
          missingQuantityOrUnit: false,
          minorOcrArtifact: false,
          majorOcrArtifact: false,
        },
      ],
      stepSignals: [],
    };

    const result = normalizeToCandidate(raw, "image", testPages);

    expect(result.title).toBe("Chocolate Cake");
    expect(result.ingredients).toHaveLength(2);
    expect(result.steps).toHaveLength(2);
    expect(result.description).toBe("A rich chocolate cake.");
    expect(result.parseSignals.structureSeparable).toBe(true);
    expect(result.parseSignals.descriptionDetected).toBe(true);
    expect(result.sourceType).toBe("image");
    expect(result.ingredients[0].id).toBeTruthy();
    expect(result.ingredients[0].orderIndex).toBe(0);
  });

  it("handles missing title by setting null and suspectedOmission", () => {
    const raw: RawExtractionResult = {
      ingredients: [{ text: "1 egg" }],
      steps: [{ text: "Cook." }],
    };
    const result = normalizeToCandidate(raw, "url", testPages);
    expect(result.title).toBeNull();
    expect(result.parseSignals.suspectedOmission).toBe(true);
  });

  it("handles missing ingredients array", () => {
    const raw: RawExtractionResult = {
      title: "Test",
      steps: [{ text: "Cook." }],
    };
    const result = normalizeToCandidate(raw, "image", testPages);
    expect(result.ingredients).toHaveLength(0);
    expect(result.parseSignals.suspectedOmission).toBe(true);
  });

  it("handles missing steps array", () => {
    const raw: RawExtractionResult = {
      title: "Test",
      ingredients: [{ text: "1 cup flour" }],
    };
    const result = normalizeToCandidate(raw, "image", testPages);
    expect(result.steps).toHaveLength(0);
    expect(result.parseSignals.suspectedOmission).toBe(true);
  });

  it("coerces non-string text fields to empty string", () => {
    const raw: RawExtractionResult = {
      title: "Test",
      ingredients: [{ text: undefined as unknown as string }],
      steps: [{ text: 42 as unknown as string }],
    };
    const result = normalizeToCandidate(raw, "image", testPages);
    expect(result.ingredients[0].text).toBe("");
    expect(result.steps[0].text).toBe("");
  });

  it("defaults all signal booleans to safe values", () => {
    const raw: RawExtractionResult = {
      title: "Test",
      ingredients: [{ text: "flour" }],
      steps: [{ text: "mix" }],
      signals: {},
    };
    const result = normalizeToCandidate(raw, "image", testPages);
    expect(result.parseSignals.structureSeparable).toBe(true);
    expect(result.parseSignals.lowConfidenceStructure).toBe(false);
    expect(result.parseSignals.poorImageQuality).toBe(false);
    expect(result.parseSignals.multiRecipeDetected).toBe(false);
    expect(result.parseSignals.confirmedOmission).toBe(false);
  });

  it("handles completely empty raw input", () => {
    const raw: RawExtractionResult = {};
    const result = normalizeToCandidate(raw, "image", testPages);
    expect(result.title).toBeNull();
    expect(result.ingredients).toHaveLength(0);
    expect(result.steps).toHaveLength(0);
    expect(result.parseSignals.suspectedOmission).toBe(true);
  });

  it("decodes HTML entities in title, description, ingredients, and steps (JSON-LD / scraped text)", () => {
    const raw: RawExtractionResult = {
      title: "Fish &amp; Chips",
      description: "Salt &amp; vinegar, 1/2&quot; thick",
      ingredients: [{ text: "Oil &amp; butter", isHeader: false }],
      steps: [{ text: "Mix A &amp; B." }],
      signals: { structureSeparable: true },
    };
    const result = normalizeToCandidate(raw, "url", testPages);
    expect(result.title).toBe("Fish & Chips");
    expect(result.description).toBe('Salt & vinegar, 1/2" thick');
    expect(result.ingredients[0].text).toBe("Oil & butter");
    expect(result.steps[0].text).toBe("Mix A & B.");
  });
});

describe("decodeHtmlEntities", () => {
  it("passes through plain text", () => {
    expect(decodeHtmlEntities("No entities here")).toBe("No entities here");
  });
});

describe("buildErrorCandidate", () => {
  it("produces a candidate that validates to BLOCK or RETAKE", () => {
    const errorCandidate = buildErrorCandidate("image", testPages);
    const result = validateRecipe(errorCandidate);

    expect(result.saveState).toBe("NO_SAVE");
    expect(
      result.hasBlockingIssues || result.requiresRetake,
    ).toBe(true);
  });

  it("sets poorImageQuality for image source type", () => {
    const result = buildErrorCandidate("image", testPages);
    expect(result.parseSignals.poorImageQuality).toBe(true);
  });

  it("does not set poorImageQuality for URL source type", () => {
    const result = buildErrorCandidate("url", testPages);
    expect(result.parseSignals.poorImageQuality).toBe(false);
  });
});

describe("extractStructuredData", () => {
  it("extracts recipe from JSON-LD", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@type": "Recipe",
        "name": "Pasta Carbonara",
        "recipeIngredient": ["200g spaghetti", "100g pancetta", "2 eggs"],
        "recipeInstructions": [
          {"@type": "HowToStep", "text": "Boil pasta."},
          {"@type": "HowToStep", "text": "Fry pancetta."}
        ]
      }
      </script>
      </head><body></body></html>`;

    const result = extractStructuredData(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Pasta Carbonara");
    expect(result!.ingredients).toHaveLength(3);
    expect(result!.steps).toHaveLength(2);
  });

  it("returns null for HTML without JSON-LD", () => {
    const html = "<html><body><p>Hello</p></body></html>";
    expect(extractStructuredData(html)).toBeNull();
  });

  it("returns null for non-Recipe JSON-LD", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {"@type": "Article", "name": "Test"}
      </script>
      </head><body></body></html>`;
    expect(extractStructuredData(html)).toBeNull();
  });

  it("handles @graph wrapper", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@graph": [
          {"@type": "WebPage", "name": "Page"},
          {
            "@type": "Recipe",
            "name": "Soup",
            "recipeIngredient": ["water", "salt"],
            "recipeInstructions": [{"text": "Boil water."}]
          }
        ]
      }
      </script>
      </head><body></body></html>`;

    const result = extractStructuredData(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Soup");
  });
});

describe("parseUrlFromHtml", () => {
  it("uses JSON-LD first when structured data passes the quality gate", async () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@type": "Recipe",
        "name": "Browser Pancakes",
        "recipeIngredient": ["2 cups flour", "1 cup milk"],
        "recipeInstructions": [{"text": "Mix the batter."}]
      }
      </script>
      </head><body></body></html>
    `;

    const result = await parseUrlFromHtml(
      "https://example.com/pancakes",
      html,
      [],
      "webview-html",
    );

    expect(result.title).toBe("Browser Pancakes");
    expect(result.ingredients).toHaveLength(2);
    expect(result.steps).toHaveLength(1);
    expect(result.extractionMethod).toBe("json-ld");
  });

  it("falls back to microdata when JSON-LD is absent", async () => {
    const html = `
      <html><body itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Microdata Soup</h1>
        <ul>
          <li itemprop="recipeIngredient">2 cups stock</li>
          <li itemprop="recipeIngredient">1 tsp salt</li>
        </ul>
        <div itemprop="recipeInstructions">
          <p itemprop="text">Simmer everything together.</p>
        </div>
      </body></html>
    `;

    const result = await parseUrlFromHtml(
      "https://example.com/soup",
      html,
      [],
      "webview-html",
    );

    expect(result.title).toBe("Microdata Soup");
    expect(result.extractionMethod).toBe("microdata");
  });

  it("uses DOM plus AI fallback when structured extraction fails", async () => {
    vi.spyOn(urlAiAdapter, "parseWithAI").mockResolvedValue({
      title: "DOM AI Chili",
      ingredients: [
        { text: "1 onion", isHeader: false },
        { text: "1 can beans", isHeader: false },
      ],
      steps: [{ text: "Cook until hot.", isHeader: false }],
      description: null,
      signals: { descriptionDetected: false },
      ingredientSignals: [],
      stepSignals: [],
    });

    const html = `
      <html><body>
        <main>
          <h1>DOM AI Chili</h1>
          <p>${"Intro text ".repeat(20)}</p>
          <h2>Ingredients</h2>
          <ul>
            <li>1 onion</li>
            <li>1 can beans</li>
          </ul>
          <h2>Instructions</h2>
          <p>Cook until hot.</p>
        </main>
      </body></html>
    `;

    const result = await parseUrlFromHtml(
      "https://example.com/chili",
      html,
      [],
      "webview-html",
    );

    expect(result.title).toBe("DOM AI Chili");
    expect(result.extractionMethod).toBe("dom-ai");
    expect(urlAiAdapter.parseWithAI).toHaveBeenCalledTimes(1);
  });
});

describe("parseUrlStructuredOnly (sync fast path)", () => {
  it("returns a JSON-LD candidate when structured data passes the quality gate", async () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@type": "Recipe",
        "name": "Fast Pancakes",
        "recipeIngredient": ["2 cups flour", "1 cup milk"],
        "recipeInstructions": [{"text": "Mix the batter."}]
      }
      </script>
      </head><body></body></html>
    `;

    const result = await parseUrlStructuredOnly(
      "https://example.com/pancakes",
      html,
      [],
      "webview-html",
    );

    expect(result).not.toBeNull();
    expect(result?.title).toBe("Fast Pancakes");
    expect(result?.extractionMethod).toBe("json-ld");
  });

  it("returns a Microdata candidate when only Microdata is present", async () => {
    const html = `
      <html><body itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Microdata Soup</h1>
        <ul>
          <li itemprop="recipeIngredient">2 cups stock</li>
          <li itemprop="recipeIngredient">1 tsp salt</li>
        </ul>
        <div itemprop="recipeInstructions">
          <p itemprop="text">Simmer everything together.</p>
        </div>
      </body></html>
    `;

    const result = await parseUrlStructuredOnly(
      "https://example.com/soup",
      html,
      [],
      "webview-html",
    );

    expect(result).not.toBeNull();
    expect(result?.extractionMethod).toBe("microdata");
  });

  it("returns null when neither JSON-LD nor Microdata passes the quality gate — caller should fall back to the full cascade", async () => {
    const html = `
      <html><body>
        <h1>A Recipe Somewhere</h1>
        <p>This page has prose but no structured markup.</p>
      </body></html>
    `;

    const result = await parseUrlStructuredOnly(
      "https://example.com/nothing",
      html,
      [],
      "webview-html",
    );

    expect(result).toBeNull();
  });

  it("returns null for empty HTML", async () => {
    const result = await parseUrlStructuredOnly(
      "https://example.com/empty",
      "",
      [],
      "webview-html",
    );
    expect(result).toBeNull();
  });

  it("never invokes the AI fallback (hot-path guarantee)", async () => {
    const aiSpy = vi.spyOn(urlAiAdapter, "parseWithAI");
    const html = `
      <html><body>
        <h1>Minimal Page</h1>
        <p>Not a recipe at all.</p>
      </body></html>
    `;

    const result = await parseUrlStructuredOnly(
      "https://example.com/minimal",
      html,
      [],
      "webview-html",
    );

    expect(result).toBeNull();
    expect(aiSpy).not.toHaveBeenCalled();
  });
});

describe("extractDomBoundary", () => {
  it("strips scripts, ads, and nav elements", () => {
    const html = `
      <html><body>
      <nav>Menu</nav>
      <script>alert('x')</script>
      <div class="ad-container">Ad here</div>
      <div class="recipe-card">
        <h2>My Recipe</h2>
        <p>${"Recipe content. ".repeat(20)}</p>
      </div>
      <footer>Footer</footer>
      </body></html>`;

    const result = extractDomBoundary(html);
    expect(result).not.toBeNull();
    expect(result).toContain("My Recipe");
    expect(result).not.toContain("Menu");
    expect(result).not.toContain("Footer");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("Ad here");
  });

  it("returns null for pages with no recipe content", () => {
    const html = "<html><body><p>Short</p></body></html>";
    expect(extractDomBoundary(html)).toBeNull();
  });

  it("preserves newlines between list items", () => {
    const html = `
      <html><body>
      <div class="recipe-card">
        <h2>Test Recipe</h2>
        <ul>
          <li>1 cup flour</li>
          <li>2 eggs</li>
          <li>1 cup milk</li>
        </ul>
        <p>${"Step content here. ".repeat(10)}</p>
      </div>
      </body></html>`;

    const result = extractDomBoundary(html);
    expect(result).not.toBeNull();
    expect(result).toContain("1 cup flour\n");
    expect(result).toContain("2 eggs\n");
  });

  it("picks the richest (longest) match when multiple selectors match", () => {
    const short = "Short summary.".repeat(8);
    const long = "Full recipe content with details. ".repeat(20);
    const html = `
      <html><body>
      <div class="recipe-card">${short}</div>
      <div class="recipe-content">${long}</div>
      </body></html>`;

    const result = extractDomBoundary(html);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(short.length);
  });

  it("strips noise elements (buttons, print links)", () => {
    const html = `
      <html><body>
      <div class="recipe-card">
        <h2>Cake Recipe</h2>
        <button>Print</button>
        <a class="jump-to-recipe">Jump to Recipe</a>
        <p>${"Delicious cake instructions. ".repeat(10)}</p>
      </div>
      </body></html>`;

    const result = extractDomBoundary(html);
    expect(result).not.toBeNull();
    expect(result).not.toContain("Print");
    expect(result).not.toContain("Jump to Recipe");
    expect(result).toContain("Cake Recipe");
  });
});

describe("extractStructuredData — HowToSection headers", () => {
  it("maps HowToSection.name as isHeader: true before sub-steps", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@type": "Recipe",
        "name": "Layer Cake",
        "recipeIngredient": ["flour", "sugar", "eggs"],
        "recipeInstructions": [
          {
            "@type": "HowToSection",
            "name": "For the cake:",
            "itemListElement": [
              {"@type": "HowToStep", "text": "Mix dry ingredients."},
              {"@type": "HowToStep", "text": "Bake at 350F."}
            ]
          },
          {
            "@type": "HowToSection",
            "name": "For the frosting:",
            "itemListElement": [
              {"@type": "HowToStep", "text": "Beat butter and sugar."}
            ]
          }
        ]
      }
      </script>
      </head><body></body></html>`;

    const result = extractStructuredData(html);
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(5);
    expect(result!.steps![0]).toEqual({ text: "For the cake:", isHeader: true });
    expect(result!.steps![1]).toEqual({ text: "Mix dry ingredients.", isHeader: false });
    expect(result!.steps![2]).toEqual({ text: "Bake at 350F.", isHeader: false });
    expect(result!.steps![3]).toEqual({ text: "For the frosting:", isHeader: true });
    expect(result!.steps![4]).toEqual({ text: "Beat butter and sugar.", isHeader: false });
  });

  it("does not insert empty header when HowToSection has no name", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@type": "Recipe",
        "name": "Simple Cake",
        "recipeIngredient": ["flour", "sugar"],
        "recipeInstructions": [
          {
            "@type": "HowToSection",
            "itemListElement": [
              {"@type": "HowToStep", "text": "Mix."},
              {"@type": "HowToStep", "text": "Bake."}
            ]
          }
        ]
      }
      </script>
      </head><body></body></html>`;

    const result = extractStructuredData(html);
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(2);
    expect(result!.steps![0]).toEqual({ text: "Mix.", isHeader: false });
    expect(result!.steps![1]).toEqual({ text: "Bake.", isHeader: false });
  });
});

describe("extractStructuredData — ingredient objects", () => {
  it("extracts ingredients encoded as { text: ... } objects", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@type": "Recipe",
        "name": "Soup",
        "recipeIngredient": [
          {"text": "1 cup water"},
          {"text": "1 tsp salt"},
          "2 carrots"
        ],
        "recipeInstructions": [{"text": "Boil everything."}]
      }
      </script>
      </head><body></body></html>`;

    const result = extractStructuredData(html);
    expect(result).not.toBeNull();
    expect(result!.ingredients).toHaveLength(3);
    expect(result!.ingredients![0].text).toBe("1 cup water");
    expect(result!.ingredients![2].text).toBe("2 carrots");
  });
});

describe("extractStructuredData — metadata", () => {
  it("extracts recipeYield, times, and image from JSON-LD", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@type": "Recipe",
        "name": "Pancakes",
        "recipeIngredient": ["flour", "milk"],
        "recipeInstructions": [{"text": "Mix and cook."}],
        "recipeYield": "4 servings",
        "prepTime": "PT10M",
        "cookTime": "PT20M",
        "totalTime": "PT30M",
        "image": "https://example.com/pancakes.jpg"
      }
      </script>
      </head><body></body></html>`;

    const result = extractStructuredData(html);
    expect(result).not.toBeNull();
    expect(result!.metadata).toBeDefined();
    expect(result!.metadata!.yield).toBe("4 servings");
    expect(result!.metadata!.prepTime).toBe("PT10M");
    expect(result!.metadata!.cookTime).toBe("PT20M");
    expect(result!.metadata!.totalTime).toBe("PT30M");
    expect(result!.metadata!.imageUrl).toBe("https://example.com/pancakes.jpg");
  });
});

describe("extractMicrodata", () => {
  it("extracts recipe from itemprop attributes", () => {
    const html = `
      <html><body>
      <div itemscope itemtype="http://schema.org/Recipe">
        <h1 itemprop="name">Tomato Soup</h1>
        <span itemprop="description">A warm bowl of soup.</span>
        <ul>
          <li itemprop="recipeIngredient">4 tomatoes</li>
          <li itemprop="recipeIngredient">1 onion</li>
          <li itemprop="recipeIngredient">salt</li>
        </ul>
        <div itemprop="recipeInstructions">
          <div itemprop="step">Chop tomatoes and onion.</div>
          <div itemprop="step">Simmer for 20 minutes.</div>
        </div>
      </div>
      </body></html>`;

    const result = extractMicrodata(html);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Tomato Soup");
    expect(result!.ingredients).toHaveLength(3);
    expect(result!.steps).toHaveLength(2);
    expect(result!.description).toBe("A warm bowl of soup.");
  });

  it("returns null when itemprop elements are insufficient", () => {
    const html = `
      <html><body>
      <h1 itemprop="name">Just a Title</h1>
      <li itemprop="recipeIngredient">flour</li>
      </body></html>`;

    expect(extractMicrodata(html)).toBeNull();
  });
});

describe("normalizeUrl", () => {
  it("strips fragment from URL", () => {
    expect(normalizeUrl("https://example.com/recipe#comments")).toBe(
      "https://example.com/recipe",
    );
  });

  it("removes /amp suffix", () => {
    expect(normalizeUrl("https://example.com/recipe/amp")).toBe(
      "https://example.com/recipe/",
    );
  });

  it("removes /amp/ suffix", () => {
    expect(normalizeUrl("https://example.com/recipe/amp/")).toBe(
      "https://example.com/recipe/",
    );
  });

  it("preserves valid paths without modification", () => {
    expect(normalizeUrl("https://example.com/recipes/pasta")).toBe(
      "https://example.com/recipes/pasta",
    );
  });

  it("returns raw string for invalid URLs", () => {
    expect(normalizeUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("smartTruncate", () => {
  const { smartTruncate } = urlAiAdapter;
  it("returns full text when under limit", () => {
    const text = "Short recipe text";
    expect(smartTruncate(text, 8000)).toBe(text);
  });

  it("biases window to include recipe section keywords", () => {
    const preamble = "A".repeat(5000);
    const recipe = "INGREDIENTS\n1 cup flour\n2 eggs\nSTEPS\nMix and bake.";
    const text = preamble + recipe;
    const result = smartTruncate(text, 2000);
    expect(result).toContain("INGREDIENTS");
    expect(result).toContain("1 cup flour");
  });

  it("falls back to slice(0, limit) when no keywords found", () => {
    const text = "X".repeat(10000);
    const result = smartTruncate(text, 5000);
    expect(result.length).toBe(5000);
    expect(result).toBe(text.slice(0, 5000));
  });
});

describe("enrichFromDom", () => {
  const baseStructured: RawExtractionResult = {
    title: "Test Recipe",
    ingredients: [{ text: "1 cup flour" }, { text: "2 eggs" }],
    steps: [{ text: "Mix." }],
    description: null,
    signals: { structureSeparable: true, descriptionDetected: false },
    ingredientSignals: [],
    stepSignals: [],
  };

  it("fills yield from DOM when JSON-LD has image but no servings", () => {
    const html = `
      <html>
      <head>
        <meta property="og:image" content="https://example.com/hero.jpg">
      </head>
      <body>
        <div class="wprm-recipe">
          <span class="wprm-recipe-servings">4</span>
        </div>
      </body>
      </html>
    `;
    const input: RawExtractionResult = {
      ...baseStructured,
      metadata: { imageUrl: "https://cdn.example.com/json-ld-image.jpg" },
    };
    const result = enrichFromDom(html, input);

    expect(result.metadata?.imageUrl).toBe(
      "https://cdn.example.com/json-ld-image.jpg",
    );
    expect(result.servings).toEqual({ min: 4, max: null });
  });

  it("is a no-op when JSON-LD already has both image and servings", () => {
    const html = `
      <html>
      <head>
        <meta property="og:image" content="https://example.com/og.jpg">
      </head>
      <body>
        <span class="wprm-recipe-servings">12</span>
      </body>
      </html>
    `;
    const input: RawExtractionResult = {
      ...baseStructured,
      metadata: { imageUrl: "https://cdn.example.com/original.jpg" },
      servings: { min: 6, max: null },
    };
    const result = enrichFromDom(html, input);

    expect(result.metadata?.imageUrl).toBe(
      "https://cdn.example.com/original.jpg",
    );
    expect(result.servings).toEqual({ min: 6, max: null });
  });

  it("fills both image and servings when JSON-LD has neither", () => {
    const html = `
      <html>
      <head>
        <meta property="og:image" content="https://example.com/og-hero.jpg">
      </head>
      <body>
        <div itemscope itemtype="http://schema.org/Recipe">
          <meta itemprop="recipeYield" content="Serves 6">
        </div>
      </body>
      </html>
    `;
    const result = enrichFromDom(html, baseStructured);

    expect(result.metadata?.imageUrl).toBe("https://example.com/og-hero.jpg");
    expect(result.servings).toEqual({ min: 6, max: null });
  });

  it("prefers twitter:image when og:image is absent", () => {
    const html = `
      <html><head>
        <meta name="twitter:image" content="https://example.com/twitter.jpg">
      </head><body></body></html>
    `;
    const result = enrichFromDom(html, baseStructured);
    expect(result.metadata?.imageUrl).toBe("https://example.com/twitter.jpg");
  });

  it("falls back to link[rel=image_src] when meta tags are missing", () => {
    const html = `
      <html><head>
        <link rel="image_src" href="https://example.com/link.jpg">
      </head><body></body></html>
    `;
    const result = enrichFromDom(html, baseStructured);
    expect(result.metadata?.imageUrl).toBe("https://example.com/link.jpg");
  });

  it("reads yield from Tasty Recipes plugin markup", () => {
    const html = `
      <html><body>
        <div class="tasty-recipes-yield-scale">
          <span class="tasty-recipes-yield">Serves 8</span>
        </div>
      </body></html>
    `;
    const result = enrichFromDom(html, baseStructured);
    expect(result.servings).toEqual({ min: 8, max: null });
  });

  it("extracts yield from text within recipe scope via regex", () => {
    const html = `
      <html><body>
        <div class="recipe-card">
          <h2>Pancakes</h2>
          <p>Serves 4 people</p>
        </div>
      </body></html>
    `;
    const result = enrichFromDom(html, baseStructured);
    expect(result.servings).toEqual({ min: 4, max: null });
  });

  it("captures a servings range like 6-8", () => {
    const html = `
      <html><body>
        <div class="recipe-card">
          <p>Makes 6-8 servings</p>
        </div>
      </body></html>
    `;
    const result = enrichFromDom(html, baseStructured);
    expect(result.servings).toEqual({ min: 6, max: 8 });
  });

  it("rejects non-person yields like '24 cookies'", () => {
    const html = `
      <html><body>
        <div class="recipe-card">
          <p>Makes 24 cookies</p>
        </div>
      </body></html>
    `;
    const result = enrichFromDom(html, baseStructured);
    expect(result.servings ?? null).toBeNull();
  });

  it("does not overwrite existing image even when og:image is present", () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://example.com/og.jpg">
      </head><body></body></html>
    `;
    const input: RawExtractionResult = {
      ...baseStructured,
      metadata: { imageUrl: "https://original.example.com/keep.jpg" },
    };
    const result = enrichFromDom(html, input);
    expect(result.metadata?.imageUrl).toBe(
      "https://original.example.com/keep.jpg",
    );
  });

  it("preserves existing yield metadata when filling servings", () => {
    const html = `
      <html><body>
        <span class="wprm-recipe-servings">5</span>
      </body></html>
    `;
    const input: RawExtractionResult = {
      ...baseStructured,
      metadata: { yield: "4 servings" },
    };
    const result = enrichFromDom(html, input);
    expect(result.metadata?.yield).toBe("4 servings");
    expect(result.servings).toEqual({ min: 5, max: null });
  });
});

describe("parseUrlFromHtml — DOM enrichment integration", () => {
  it("fills missing image and servings on a BBC Good Food-style page", async () => {
    const html = `
      <html>
      <head>
        <meta property="og:image" content="https://images.example.com/recipe-hero.jpg">
        <script type="application/ld+json">
        {
          "@type": "Recipe",
          "name": "Beef Wellington",
          "recipeIngredient": [
            "1 kg beef fillet",
            "500g puff pastry",
            "2 eggs"
          ],
          "recipeInstructions": [
            {"@type": "HowToStep", "text": "Sear the beef."},
            {"@type": "HowToStep", "text": "Wrap in pastry and bake."}
          ]
        }
        </script>
      </head>
      <body>
        <div class="recipe-card">
          <h1>Beef Wellington</h1>
          <p class="recipe-meta">Serves 6</p>
        </div>
      </body>
      </html>
    `;

    const result = await parseUrlFromHtml(
      "https://example.com/beef-wellington",
      html,
      [],
      "webview-html",
    );

    expect(result.extractionMethod).toBe("json-ld");
    expect(result.title).toBe("Beef Wellington");
    expect(result.metadata?.imageUrl).toBe(
      "https://images.example.com/recipe-hero.jpg",
    );
    expect(result.servings).toBe(6);
  });
});
