import * as cheerio from "cheerio";
import type { RawExtractionResult, RawIngredient } from "../normalize.js";
import { parseIngredientLine } from "../ingredient-parser.js";

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

/**
 * Extracts recipe data from Microdata (itemprop attributes).
 * Fallback when no JSON-LD is present. Returns a structured
 * RawExtractionResult or null if insufficient data found.
 */
export function extractMicrodata(
  html: string,
): RawExtractionResult | null {
  const $ = cheerio.load(html);

  const titleEl = $('[itemprop="name"]').first();
  const title = titleEl.length > 0 ? titleEl.text().trim() : null;

  const ingredientEls = $('[itemprop="recipeIngredient"], [itemprop="ingredients"]');
  const ingredients: RawIngredient[] = [];
  ingredientEls.each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 0) {
      const parsed = parseIngredientLine(text);
      ingredients.push({
        text,
        isHeader: false,
        amount: parsed.amount,
        amountMax: parsed.amountMax,
        unit: parsed.unit,
        name: parsed.name,
      });
    }
  });

  const instructionEls = $('[itemprop="recipeInstructions"]');
  const steps: { text: string; isHeader: boolean }[] = [];
  instructionEls.each((_, el) => {
    const howToSteps = $(el).find('[itemprop="step"], [itemprop="text"]');
    if (howToSteps.length > 0) {
      howToSteps.each((__, stepEl) => {
        const text = $(stepEl).text().trim();
        if (text.length > 0) steps.push({ text, isHeader: false });
      });
    } else {
      const text = $(el).text().trim();
      if (text.length > 0) {
        const lines = text.split(/\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
        for (const line of lines) {
          steps.push({ text: line, isHeader: false });
        }
      }
    }
  });

  if (!title || ingredients.length === 0 || steps.length === 0) {
    return null;
  }

  const descEl = $('[itemprop="description"]').first();
  const description = descEl.length > 0 ? descEl.text().trim() || null : null;

  const yieldEl = $('[itemprop="recipeYield"]').first();
  const yieldText = yieldEl.length > 0 ? yieldEl.text().trim() : undefined;
  const servings = parseYieldToServings(yieldText);

  return {
    title,
    ingredients,
    steps,
    description,
    servings,
    signals: {
      structureSeparable: true,
      descriptionDetected: description !== null,
    },
    ingredientSignals: [],
    stepSignals: [],
    metadata: yieldText ? { yield: yieldText } : undefined,
  };
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

  const ingredientTexts = extractStringArray(
    obj.recipeIngredient ?? obj.ingredients,
  );
  const steps = extractInstructions(obj.recipeInstructions);

  const metadata = extractMetadata(obj);
  const servings = parseYieldToServings(metadata?.yield);

  const ingredients: RawIngredient[] = ingredientTexts.map((text) => {
    const parsed = parseIngredientLine(text);
    return {
      text,
      isHeader: false,
      amount: parsed.amount,
      amountMax: parsed.amountMax,
      unit: parsed.unit,
      name: parsed.name,
    };
  });

  return {
    title,
    ingredients,
    steps,
    description,
    servings,
    signals: {
      structureSeparable: true,
      descriptionDetected: description !== null,
    },
    ingredientSignals: [],
    stepSignals: [],
    metadata,
  };
}

function extractMetadata(
  obj: Record<string, unknown>,
): {
  yield?: string;
  prepTime?: string;
  prepTimeSource?: "explicit" | "inferred";
  cookTime?: string;
  cookTimeSource?: "explicit" | "inferred";
  totalTime?: string;
  totalTimeSource?: "explicit" | "inferred";
  imageUrl?: string;
} | undefined {
  const meta: {
    yield?: string;
    prepTime?: string;
    prepTimeSource?: "explicit" | "inferred";
    cookTime?: string;
    cookTimeSource?: "explicit" | "inferred";
    totalTime?: string;
    totalTimeSource?: "explicit" | "inferred";
    imageUrl?: string;
  } = {};

  // Accept either `recipeYield` (canonical schema.org) or `yield` (shorter
  // alias used by some CMSes, e.g. pbs.org/food). Prefer recipeYield.
  const rawYield = obj.recipeYield ?? obj.yield;
  if (typeof rawYield === "string") meta.yield = rawYield;
  else if (typeof rawYield === "number") meta.yield = String(rawYield);
  else if (Array.isArray(rawYield) && typeof rawYield[0] === "string")
    meta.yield = rawYield[0];

  // JSON-LD / Microdata times are always "explicit" — they were authored
  // into the page's structured data, not estimated by us.
  if (typeof obj.prepTime === "string") {
    meta.prepTime = obj.prepTime;
    meta.prepTimeSource = "explicit";
  }
  if (typeof obj.cookTime === "string") {
    meta.cookTime = obj.cookTime;
    meta.cookTimeSource = "explicit";
  }
  if (typeof obj.totalTime === "string") {
    meta.totalTime = obj.totalTime;
    meta.totalTimeSource = "explicit";
  }

  if (typeof obj.image === "string") meta.imageUrl = obj.image;
  else if (Array.isArray(obj.image) && typeof obj.image[0] === "string")
    meta.imageUrl = obj.image[0];
  else if (typeof obj.image === "object" && obj.image !== null) {
    const imgObj = obj.image as Record<string, unknown>;
    if (typeof imgObj.url === "string") meta.imageUrl = imgObj.url;
  }

  return Object.keys(meta).length > 0 ? meta : undefined;
}

const PERSON_YIELD_KEYWORDS =
  /\b(serv(es?|ings?)|portions?|people|persons?|makes?|yields?)\b/i;

const NON_PERSON_YIELD =
  /\b(loaf|loaves|cookies?|cups?|pieces?|slices?|bars?|rolls?|muffins?|biscuits?|scones?|pancakes?|waffles?|dozen|batch(es)?)\b/i;

/**
 * Parse a recipeYield string into a numeric servings object.
 * Returns null if the yield is clearly non-person-based (e.g. "1 loaf", "24 cookies").
 * Accepts bare numbers, "serves 4", "4 portions", "Makes 8", etc.
 */
function parseYieldToServings(
  yieldStr: string | undefined,
): { min: number; max: number | null } | null {
  if (!yieldStr) return null;

  const trimmed = yieldStr.trim();

  // Try to extract range: "6-8", "6 - 8", "6 to 8"
  const rangeMatch = trimmed.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    if (min > 0 && max > min) return { min, max };
    if (min > 0) return { min, max: null };
  }

  const numMatch = trimmed.match(/(\d+)/);
  if (!numMatch) return null;

  const num = parseInt(numMatch[1], 10);
  if (num <= 0) return null;

  const textPart = trimmed.replace(/\d+/g, "").trim();

  if (textPart.length === 0) return { min: num, max: null };

  if (NON_PERSON_YIELD.test(trimmed)) return null;

  if (PERSON_YIELD_KEYWORDS.test(trimmed)) return { min: num, max: null };

  // Unknown text qualifier — assume person-based for typical recipe sites
  return { min: num, max: null };
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v === "string") return v.trim();
      if (typeof v === "object" && v !== null) {
        const obj = v as Record<string, unknown>;
        if (typeof obj.text === "string") return obj.text.trim();
        if (typeof obj.name === "string") return obj.name.trim();
      }
      return null;
    })
    .filter((v): v is string => v !== null && v.length > 0);
}

interface StepEntry {
  text: string;
  isHeader: boolean;
}

function extractInstructions(value: unknown): StepEntry[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string") {
      return value
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => ({ text: s, isHeader: false }));
    }
    return [];
  }

  const results: StepEntry[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed.length > 0) results.push({ text: trimmed, isHeader: false });
    } else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;

      if (obj["@type"] === "HowToSection") {
        if (typeof obj.name === "string" && obj.name.trim().length > 0) {
          results.push({ text: obj.name.trim(), isHeader: true });
        }
        if (Array.isArray(obj.itemListElement)) {
          results.push(...extractInstructions(obj.itemListElement));
        }
      } else if (typeof obj.text === "string") {
        const trimmed = obj.text.trim();
        if (trimmed.length > 0) results.push({ text: trimmed, isHeader: false });
      } else if (typeof obj.name === "string") {
        const trimmed = obj.name.trim();
        if (trimmed.length > 0) results.push({ text: trimmed, isHeader: false });
      }
    }
  }
  return results;
}
