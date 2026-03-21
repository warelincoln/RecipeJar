import * as cheerio from "cheerio";
import type { RawExtractionResult } from "../normalize.js";

/**
 * Extracts recipe data from JSON-LD and schema.org markup.
 * Returns null if no valid structured recipe data is found.
 */
export function extractStructuredData(
  html: string,
): RawExtractionResult | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');

  for (let i = 0; i < scripts.length; i++) {
    const text = $(scripts[i]).html();
    if (!text) continue;

    try {
      const data = JSON.parse(text);
      const recipe = findRecipeInLdJson(data);
      if (recipe) return recipe;
    } catch {
      continue;
    }
  }

  return null;
}

function findRecipeInLdJson(data: unknown): RawExtractionResult | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const result = findRecipeInLdJson(item);
      if (result) return result;
    }
    return null;
  }

  if (typeof data !== "object" || data === null) return null;

  const obj = data as Record<string, unknown>;

  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    return findRecipeInLdJson(obj["@graph"]);
  }

  const type = obj["@type"];
  const isRecipe =
    type === "Recipe" ||
    (Array.isArray(type) && type.includes("Recipe"));

  if (!isRecipe) return null;

  const title = typeof obj.name === "string" ? obj.name : null;
  const description =
    typeof obj.description === "string" ? obj.description : null;

  const ingredients = extractStringArray(
    obj.recipeIngredient ?? obj.ingredients,
  );
  const steps = extractInstructions(obj.recipeInstructions);

  if (!title || ingredients.length === 0 || steps.length === 0) {
    return null;
  }

  return {
    title,
    ingredients: ingredients.map((text) => ({ text, isHeader: false })),
    steps: steps.map((text) => ({ text })),
    description,
    signals: {
      structureSeparable: true,
      descriptionDetected: description !== null,
    },
    ingredientSignals: [],
    stepSignals: [],
  };
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : null))
    .filter((v): v is string => v !== null && v.length > 0);
}

function extractInstructions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string") {
      return value
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    return [];
  }

  const results: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      results.push(item.trim());
    } else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      if (typeof obj.text === "string") {
        results.push(obj.text.trim());
      } else if (typeof obj.name === "string") {
        results.push(obj.name.trim());
      }
      if (obj["@type"] === "HowToSection" && Array.isArray(obj.itemListElement)) {
        results.push(...extractInstructions(obj.itemListElement));
      }
    }
  }
  return results.filter((s) => s.length > 0);
}
