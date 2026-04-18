import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { parseUrlFromHtml } from "../src/parsing/url/url-parse.adapter.js";
import {
  extractStructuredData,
} from "../src/parsing/url/url-structured.adapter.js";
import { extractDomBoundary } from "../src/parsing/url/url-dom.adapter.js";
import * as urlAiAdapter from "../src/parsing/url/url-ai.adapter.js";

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
