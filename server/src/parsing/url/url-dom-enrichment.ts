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
  const hasTotalTime =
    typeof result.metadata?.totalTime === "string" &&
    result.metadata.totalTime.length > 0;

  if (hasImage && hasServings && hasTotalTime) return result;

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

  if (!hasTotalTime) {
    const totalTimeIso = findTotalTime($);
    if (totalTimeIso) {
      enriched.metadata = {
        ...(enriched.metadata ?? {}),
        totalTime: totalTimeIso,
        totalTimeSource: "explicit",
      };
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

// Label that must precede the duration for us to treat it as the recipe's
// total time. Requires an explicit keyword to avoid misreading adjacent
// fields like "Cook time: 20 min" or "Total carbs: 30g" as the total.
// Tries the most specific phrasing first so "total time" doesn't just match
// "total" and then fail on a non-time window.
const TOTAL_TIME_LABEL =
  /\b(?:total\s*time|ready\s+in|total)\s*[:\-–—]?\s*/i;

// "1 hr 15 min", "35 mins", "2 hours", "1h 30m" — both parts optional but
// at least one must be present and positive.
const DURATION_PATTERN =
  /^\s*(?:(\d+)\s*(?:hours?|hrs?|h)\b)?\s*(?:(\d+)\s*(?:minutes?|mins?|m)\b)?/i;

function parseDurationToIso(text: string): string | null {
  const m = text.match(DURATION_PATTERN);
  if (!m) return null;
  const hours = m[1] ? parseInt(m[1], 10) : 0;
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  if (hours <= 0 && minutes <= 0) return null;
  let iso = "PT";
  if (hours > 0) iso += `${hours}H`;
  if (minutes > 0) iso += `${minutes}M`;
  return iso;
}

function parseTotalTimeFromText(text: string): string | null {
  // Retry label matches in sequence — guards against a leading false-match
  // like "Total fat: 20g" followed by "Total time: 35 min" in the same
  // scoped element.
  let remaining = text;
  while (remaining.length > 0) {
    const match = remaining.match(TOTAL_TIME_LABEL);
    if (!match) return null;
    const afterStart = (match.index ?? 0) + match[0].length;
    const window = remaining.slice(afterStart, afterStart + 40);
    const iso = parseDurationToIso(window);
    if (iso) return iso;
    remaining = remaining.slice(afterStart);
  }
  return null;
}

// Recipe-scope only, no full-body fallback. The word "total" appears too
// often in body copy (nutrition panels, comment threads, prose about
// "total cooking experience") to scan unbounded text safely. If the site
// doesn't have a recipe-scope element, the server-side gap-fill at save
// time covers the prep+cook case.
function findTotalTime($: cheerio.CheerioAPI): string | null {
  for (const sel of RECIPE_SCOPE_SELECTORS) {
    const matched = $(sel).first();
    if (matched.length > 0) {
      const text = matched.text().replace(/\s+/g, " ").trim();
      const iso = parseTotalTimeFromText(text);
      if (iso) return iso;
    }
  }
  return null;
}
