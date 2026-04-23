import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

/**
 * Extracts recipe boundary content from HTML using DOM heuristics.
 * Strips non-recipe content (ads, stories, navs, footers).
 * Returns the filtered text content, or null if insufficient content found.
 */
// Class tokens that mark an element as recipe/post content. If an element's
// class list contains any of these AS WHOLE TOKENS, we won't strip it — even
// if it also has a token like "sidebar" that would normally match a junk
// selector.
// Found the hard way: chefmichaelsmith.com wraps the recipe in a div with
// `has-sidebar` + `no-review` + `no-related` + `recipe` + `hentry`. Our
// `[class*="sidebar"]` strip was eating the entire recipe container.
// Must be whole-token (space-bounded) match — otherwise UI controls like
// `jump-to-recipe` or `save-recipe` would be protected and leak into output.
const PROTECT_CLASS_PATTERN =
  /(^|\s)(recipe|hentry|post-content|entry-content|main-content|article-body|content-body)(\s|$)/i;

function stripWithProtection(
  $: cheerio.CheerioAPI,
  selector: string,
): void {
  $(selector).each((_, el) => {
    const cls = ($(el).attr("class") || "") as string;
    if (PROTECT_CLASS_PATTERN.test(cls)) return;
    $(el).remove();
  });
}

export function extractDomBoundary(html: string): string | null {
  const $ = cheerio.load(html);

  // Tag-based strips are always safe — <nav>/<footer>/<aside> aren't recipe
  // content even when the surrounding div has a "recipe" class.
  $("script, style, nav, footer, header, aside, iframe, noscript").remove();

  // Class-based strips use substring match (`[class*="sidebar"]`), which is
  // prone to false positives on CSS framework state tokens like `has-sidebar`
  // or `no-review`. Run these through a protection check so we don't delete
  // recipe containers that happen to carry state classes.
  for (const sel of [
    '[class*="ad-"]',
    '[class*="advertisement"]',
    '[id*="ad-"]',
    '[class*="sidebar"]',
    '[class*="comment"]',
    '[class*="social"]',
    '[class*="share"]',
    '[class*="related"]',
    // Narrow print-control match: `[class*="print"]` over-matches Tailwind
    // `print:*` variants and layout wrappers like `.article-print` on pbs.org,
    // which wrap the recipe itself. Keep specific button/link patterns only.
    '[class*="print-button"]',
    '[class*="print-recipe"]',
    '[class*="print-btn"]',
    '[class*="btn-print"]',
    '[class*="jump-to"]',
    '[class*="save-recipe"]',
    '[class*="rating"]',
    '[class*="review"]',
  ]) {
    stripWithProtection($, sel);
  }
  // <button> is always safe to strip — it's a control, not content.
  $("button").remove();

  const recipeSelectors = [
    '[itemtype*="schema.org/Recipe"]',
    '[class*="recipe-card"]',
    '[class*="recipe-content"]',
    '[class*="recipe-body"]',
    '[class*="wprm-recipe"]',
    '[class*="wprm-recipe-container"]',
    '[class*="tasty-recipe"]',
    '[class*="easyrecipe"]',
    '[class*="jetpack-recipe"]',
    '[class*="mv-recipe"]',
    '[class*="yummly"]',
    '[class*="zip-recipe"]',
    '[class*="meal-planner-pro"]',
    '[class*="cooked-recipe"]',
    // hRecipe microformat (pre-schema.org; still used by joyofbaking.com desktop)
    '[class*="hrecipe"]',
    ".recipe",
    "#recipe",
    "#recipeBody",
    "article#recipeBody",
    '[data-recipe]',
  ];

  let richest = "";
  let recipeMetaSnippet = "";

  const SERVING_COUNT_RE = /serves?\s*:?\s*\d/i;

  for (const selector of recipeSelectors) {
    const matches = $(selector);
    matches.each((_, el) => {
      const text = extractStructuredText($, $(el));
      if (text.length > richest.length) {
        richest = text;
      } else if (
        !recipeMetaSnippet &&
        text.length < 200 &&
        SERVING_COUNT_RE.test(text)
      ) {
        recipeMetaSnippet = text;
      }
    });
  }
  if (richest.length > 100) {
    if (!recipeMetaSnippet && !SERVING_COUNT_RE.test(richest)) {
      const metaSelectors = [
        '[class*="recipe-info"]',
        '[class*="recipe-meta"]',
        '[class*="recipe-detail"]',
        '[class*="recipe-header"]',
        '[class*="recipe-yield"]',
        '[class*="recipe-serving"]',
      ];
      for (const sel of metaSelectors) {
        if (recipeMetaSnippet) break;
        $(sel).each((_, el) => {
          if (recipeMetaSnippet) return;
          const text = extractStructuredText($, $(el));
          if (text.length < 200 && SERVING_COUNT_RE.test(text)) {
            recipeMetaSnippet = text;
          }
        });
      }
    }
    if (recipeMetaSnippet && !SERVING_COUNT_RE.test(richest)) {
      richest = recipeMetaSnippet + "\n\n" + richest;
    }
    return cleanText(richest);
  }

  const itempropIngredients = $('[itemprop="recipeIngredient"], [itemprop="ingredients"]');
  const itempropInstructions = $('[itemprop="recipeInstructions"]');

  if (itempropIngredients.length > 0 && itempropInstructions.length > 0) {
    const title = $('[itemprop="name"]').first().text().trim();
    const ingredients = itempropIngredients
      .map((_, el) => $(el).text().trim())
      .get()
      .join("\n");
    const instructions = itempropInstructions
      .map((_, el) => $(el).text().trim())
      .get()
      .join("\n");

    const combined = [title, "Ingredients:", ingredients, "Instructions:", instructions]
      .filter(Boolean)
      .join("\n\n");

    if (combined.length > 100) {
      return cleanText(combined);
    }
  }

  const headingAnchored = extractHeadingAnchored($);
  if (headingAnchored && headingAnchored.length > 100) {
    return cleanText(headingAnchored);
  }

  const mainContent =
    extractStructuredText($, $("main")) ||
    extractStructuredText($, $("article")) ||
    extractStructuredText($, $('[role="main"]'));

  if (mainContent.length > 100) {
    return cleanText(mainContent);
  }

  // Last-resort body fallback for flat-layout sites (e.g. m.joyofbaking.com)
  // that have no recipe wrapper, no <main>, and no <article>, but do contain
  // recipe content at body level with section headings. Only kick in when
  // the body text has strong recipe markers — otherwise we'd feed arbitrary
  // blog-post prose to the AI.
  const bodyText = extractStructuredText($, $("body"));
  if (bodyText.length > 100 && hasRecipeKeywords(bodyText)) {
    return cleanText(bodyText);
  }

  return null;
}

// Exported so the heading-anchored DOM strategy (extractHeadingAnchored)
// can reuse the same text patterns. Keeping one source of truth for what
// counts as a recipe signal means the body-fallback keyword gate and the
// heading-anchor guard move in lockstep if we ever tune them.
export const INGREDIENT_MARKER = /\b(ingredients?)\s*:?/i;
export const INSTRUCTION_MARKER = /\b(instructions?|directions?|method|preparation|steps)\s*:?/i;

// Measurement patterns like "1 cup", "1/2 tbsp", "100 g". Several of these
// within the body is a strong recipe signal even when the page has no
// "Ingredients:" header — e.g. Blogger posts that lay out ingredients as a
// plain <ul> of measured items followed by an <ol> of steps.
export const MEASUREMENT_PATTERN =
  /\b\d+\s*(?:\/\s*\d+)?\s*(?:cups?|tbsps?|tablespoons?|tsps?|teaspoons?|ounces?|oz|pounds?|lbs?|grams?|g|kg|kilograms?|ml|milliliters?|l(?:itres?|iters?)?|quarts?|qt|pints?|pt)\b/gi;

export const COOKING_VERB_PATTERN =
  /\b(heat|cook|bake|simmer|boil|stir|whisk|fry|roast|saut[eé]|mix|combine|add|pour|preheat|melt|season|sprinkle|drizzle|serve|garnish|marinate|chop|slice|dice|mince|blend|fold)\b/i;

function hasRecipeKeywords(text: string): boolean {
  if (INGREDIENT_MARKER.test(text) && INSTRUCTION_MARKER.test(text)) return true;
  // Fallback for pages that lack explicit section headers (unstyled blog
  // posts, some international blogs): require a density of measurement
  // patterns plus at least one cooking verb. Three+ measurements caught
  // a chance encounter with e.g. "1 cup of coffee" in an article.
  const measurements = text.match(MEASUREMENT_PATTERN);
  if (
    measurements &&
    measurements.length >= 3 &&
    COOKING_VERB_PATTERN.test(text)
  ) {
    return true;
  }
  return false;
}

/**
 * Heading-anchored extraction strategy (Tier 2C, 2026-04-23).
 *
 * Targets WordPress / Squarespace / custom-CMS recipe pages that lack
 * JSON-LD, Microdata, and recipe-class wrappers but use `<h2>Ingredients</h2>`
 * + `<h2>Directions</h2>` (or similar) as the only structural signal.
 * Observed on brightfarms.com, livingtheeveryday.com.
 *
 * Algorithm:
 *   1. Walk `<h1>-<h4>` in document order.
 *   2. First heading whose text matches INGREDIENT_MARKER becomes the
 *      ingredient anchor; first matching INSTRUCTION_MARKER becomes the
 *      direction anchor. Both must exist.
 *   3. For each anchor, capture following siblings until a heading of
 *      the same or higher rank. Preserves sub-headings
 *      (`<h3>For the sauce</h3>`) as inline labels.
 *   4. Guard against false positives: the ingredient block must have
 *      either 3+ measurement patterns OR 5+ `<li>` elements. The
 *      direction block must contain at least one cooking verb. If
 *      either guard fails, return null and fall through the cascade.
 *
 * Returns the formatted boundary text (`title\n\nIngredients:\n{ing}\n\nInstructions:\n{steps}`)
 * or null when no valid anchors are found.
 */
function extractHeadingAnchored($: cheerio.CheerioAPI): string | null {
  let ingHeading: cheerio.Cheerio<AnyNode> | undefined;
  let stepHeading: cheerio.Cheerio<AnyNode> | undefined;
  // h1-h6 (not just h1-h4) — observed brightfarms.com uses <h5> for both
  // Ingredients and Recipe Preparation inside a post template.
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const text = $(el).text().trim();
    if (!text) return;
    if (!ingHeading && INGREDIENT_MARKER.test(text)) {
      ingHeading = $(el);
    }
    if (!stepHeading && INSTRUCTION_MARKER.test(text)) {
      stepHeading = $(el);
    }
  });
  if (!ingHeading || !stepHeading) return null;

  const ingBlock = collectSectionSiblings($, ingHeading);
  const stepBlock = collectSectionSiblings($, stepHeading);
  if (ingBlock.length === 0 || stepBlock.length === 0) return null;

  const ingText = ingBlock
    .map((_, el) => extractStructuredText($, $(el)))
    .get()
    .filter((s) => s.length > 0)
    .join("\n");
  const stepText = stepBlock
    .map((_, el) => extractStructuredText($, $(el)))
    .get()
    .filter((s) => s.length > 0)
    .join("\n");

  // False-positive guard: ingredient block must have real recipe signals.
  const measurementMatches = ingText.match(MEASUREMENT_PATTERN);
  const measurementOk =
    measurementMatches !== null && measurementMatches.length >= 3;
  const listItemCount = ingBlock.find("li").length;
  const listItemOk = listItemCount >= 5;
  if (!measurementOk && !listItemOk) return null;

  // Steps must read like steps.
  if (!COOKING_VERB_PATTERN.test(stepText)) return null;

  const title = findRecipeTitle($, ingHeading);
  const parts: string[] = [];
  if (title) parts.push(title);
  parts.push("Ingredients:", ingText, "Instructions:", stepText);
  return parts.join("\n\n");
}

/**
 * Find the most plausible recipe title: the nearest preceding h1-h4
 * before the ingredient heading, in document order. Falls back to the
 * page's first h1 if nothing earlier is found.
 *
 * Observed 2026-04-23: brightfarms.com has `<h1>BrightFarms Recipes</h1>`
 * as the site header and `<h3>LGBTQ+ Pride Salad</h3>` as the real
 * recipe title inside a sibling div; taking just `$("h1").first()`
 * produced "BrightFarms Recipes" as the recipe title. Walking back
 * from the ingredient heading and picking the closest h1-h4 picks
 * the h3 correctly.
 */
function findRecipeTitle(
  $: cheerio.CheerioAPI,
  ingredientHeading: cheerio.Cheerio<AnyNode>,
): string {
  // Mark the ingredient heading with a unique attribute so we can locate
  // it inside a combined selector that preserves document order.
  ingredientHeading.attr("data-orzo-ing-marker", "1");
  let lastBefore = "";
  try {
    $("h1, h2, h3, h4, [data-orzo-ing-marker]").each((_, el) => {
      if ($(el).attr("data-orzo-ing-marker") === "1") {
        return false; // stop iteration — we've hit the ingredient heading
      }
      const text = $(el).text().trim();
      if (text.length > 0 && text.length <= 200) {
        lastBefore = text;
      }
      return undefined;
    });
  } finally {
    ingredientHeading.removeAttr("data-orzo-ing-marker");
  }
  return lastBefore || $("h1").first().text().trim();
}

function collectSectionSiblings(
  $: cheerio.CheerioAPI,
  heading: cheerio.Cheerio<AnyNode>,
): cheerio.Cheerio<AnyNode> {
  const tagName = (heading[0] as { tagName?: string }).tagName?.toLowerCase() ?? "";
  const levelMatch = /^h([1-6])$/.exec(tagName);
  const ourLevel = levelMatch ? parseInt(levelMatch[1], 10) : 7;
  const collected: AnyNode[] = [];
  let next = heading.next();
  while (next.length > 0) {
    const nextTag = (next[0] as { tagName?: string }).tagName?.toLowerCase() ?? "";
    const nextLevelMatch = /^h([1-6])$/.exec(nextTag);
    if (nextLevelMatch) {
      const nextLevel = parseInt(nextLevelMatch[1], 10);
      if (nextLevel <= ourLevel) break;
    }
    collected.push(next[0]);
    next = next.next();
  }
  return $(collected);
}

/**
 * Extracts text from a Cheerio element while preserving structure:
 * inserts newlines between block-level elements so the AI can
 * distinguish separate ingredients and steps.
 */
function extractStructuredText(
  $: cheerio.CheerioAPI,
  el: cheerio.Cheerio<AnyNode>,
): string {
  if (el.length === 0) return "";
  const clone = el.clone();
  const inner = cheerio.load(clone.html() ?? "");
  inner("li, p, br, h1, h2, h3, h4, h5, h6").after("\n");
  return inner.root().text().trim();
}

function cleanText(text: string): string {
  return text
    .replace(/[^\S\n]+/g, " ")   // collapse non-newline whitespace to single space
    .replace(/\n{3,}/g, "\n\n")  // cap consecutive newlines at 2
    .trim()
    .slice(0, 12_000);
}
