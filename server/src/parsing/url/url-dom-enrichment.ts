import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { RawExtractionResult } from "../normalize.js";

/**
 * Top-up missing fields on a structured-data extraction by pulling from
 * DOM fallbacks. Many sites publish valid JSON-LD Recipe markup that
 * omits `image` or `recipeYield` — the values are present on the page,
 * just in meta tags or plugin-specific selectors. This fills those gaps
 * without overwriting anything the structured data already provided.
 */
export function enrichFromDom(
  html: string,
  result: RawExtractionResult,
): RawExtractionResult {
  const hasImage =
    typeof result.metadata?.imageUrl === "string" &&
    result.metadata.imageUrl.length > 0;
  const hasServings =
    !!result.servings &&
    typeof result.servings.min === "number" &&
    result.servings.min > 0;

  if (hasImage && hasServings) return result;

  const $ = cheerio.load(html);

  const enriched: RawExtractionResult = { ...result };

  if (!hasImage) {
    const imageUrl = findImageUrl($);
    if (imageUrl) {
      enriched.metadata = { ...(enriched.metadata ?? {}), imageUrl };
    }
  }

  if (!hasServings) {
    const servingsFromDom = findServings($);
    if (servingsFromDom) {
      enriched.servings = servingsFromDom.servings;
      if (servingsFromDom.yieldText) {
        const existingMeta = enriched.metadata ?? {};
        if (!existingMeta.yield) {
          enriched.metadata = {
            ...existingMeta,
            yield: servingsFromDom.yieldText,
          };
        }
      }
    }
  }

  return enriched;
}

function findImageUrl($: cheerio.CheerioAPI): string | null {
  const candidates = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
  ];
  for (const c of candidates) {
    if (typeof c === "string") {
      const trimmed = c.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

interface ServingsResult {
  servings: { min: number; max: number | null };
  yieldText?: string;
}

function findServings($: cheerio.CheerioAPI): ServingsResult | null {
  const itempropYield = $('[itemprop="recipeYield"]').first();
  if (itempropYield.length > 0) {
    const text = readText(itempropYield);
    const parsed = parseYieldText(text);
    if (parsed) return { servings: parsed, yieldText: text };
  }

  const wprm = $(".wprm-recipe-servings").first();
  if (wprm.length > 0) {
    const text = readText(wprm);
    const parsed = parseYieldText(text);
    if (parsed) return { servings: parsed, yieldText: text };
  }

  const tasty = $(
    ".tasty-recipes-yield-scale .tasty-recipes-yield, .tasty-recipes-yield",
  ).first();
  if (tasty.length > 0) {
    const text = readText(tasty);
    const parsed = parseYieldText(text);
    if (parsed) return { servings: parsed, yieldText: text };
  }

  const scoped = collectRecipeScopeText($);
  if (scoped) {
    const parsed = parseYieldText(scoped);
    if (parsed) return { servings: parsed };
  }

  return null;
}

const RECIPE_SCOPE_SELECTORS = [
  '[itemtype*="schema.org/Recipe"]',
  '[class*="recipe-card"]',
  '[class*="recipe-content"]',
  '[class*="recipe-body"]',
  '[class*="recipe-header"]',
  '[class*="recipe-meta"]',
  '[class*="recipe-info"]',
  '[class*="recipe-detail"]',
  '[class*="recipe-yield"]',
  '[class*="recipe-serving"]',
  '[class*="wprm-recipe"]',
  '[class*="tasty-recipe"]',
  ".recipe",
  "#recipe",
  "[data-recipe]",
];

function collectRecipeScopeText($: cheerio.CheerioAPI): string | null {
  for (const sel of RECIPE_SCOPE_SELECTORS) {
    const matched = $(sel).first();
    if (matched.length > 0) {
      const text = matched.text().replace(/\s+/g, " ").trim();
      if (text.length > 0) return text;
    }
  }
  return null;
}

function readText(el: cheerio.Cheerio<AnyNode>): string {
  const content = el.attr("content");
  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }
  return el.text().replace(/\s+/g, " ").trim();
}

const YIELD_PATTERNS: RegExp[] = [
  /serves?\s*:?\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?/i,
  /makes?\s*:?\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?/i,
  /yields?\s*:?\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?/i,
  /(\d+)(?:\s*[-–—to]+\s*(\d+))?\s*servings?/i,
  /(\d+)(?:\s*[-–—to]+\s*(\d+))?\s*portions?/i,
  /(\d+)(?:\s*[-–—to]+\s*(\d+))?\s*people/i,
];

const NON_PERSON_YIELD =
  /\b(loaf|loaves|cookies?|cups?|pieces?|slices?|bars?|rolls?|muffins?|biscuits?|scones?|pancakes?|waffles?|dozen|batch(es)?)\b/i;

function parseYieldText(
  raw: string,
): { min: number; max: number | null } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  for (const pattern of YIELD_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    const min = parseInt(match[1], 10);
    if (!(min > 0)) continue;

    // Only look at text immediately after the matched number to disambiguate
    // person vs non-person yield (e.g. "Makes 24 cookies" → reject). Text
    // before the number can be recipe-title noise like "Pancakes".
    const afterStart = (match.index ?? 0) + match[0].length;
    const afterWindow = trimmed.slice(afterStart, afterStart + 30);
    if (NON_PERSON_YIELD.test(afterWindow)) continue;

    const maxRaw = match[2];
    const max = maxRaw ? parseInt(maxRaw, 10) : NaN;
    if (Number.isFinite(max) && max > min) {
      return { min, max };
    }
    return { min, max: null };
  }

  const bareNumber = trimmed.match(/^\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?\s*$/);
  if (bareNumber) {
    const min = parseInt(bareNumber[1], 10);
    if (min > 0) {
      const maxRaw = bareNumber[2];
      const max = maxRaw ? parseInt(maxRaw, 10) : NaN;
      if (Number.isFinite(max) && max > min) {
        return { min, max };
      }
      return { min, max: null };
    }
  }

  return null;
}
