import { describe, it, expect } from "vitest";
import {
  normalizeToCandidate,
  buildErrorCandidate,
  type RawExtractionResult,
} from "../src/parsing/normalize.js";
import { extractStructuredData } from "../src/parsing/url/url-structured.adapter.js";
import { extractDomBoundary } from "../src/parsing/url/url-dom.adapter.js";
import { validateRecipe } from "../src/domain/validation/validation.engine.js";
import type { SourcePage } from "@recipejar/shared";

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
});
