import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

/**
 * Extracts recipe boundary content from HTML using DOM heuristics.
 * Strips non-recipe content (ads, stories, navs, footers).
 * Returns the filtered text content, or null if insufficient content found.
 */
export function extractDomBoundary(html: string): string | null {
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header, aside, iframe, noscript").remove();
  $('[class*="ad-"], [class*="advertisement"], [id*="ad-"], [class*="sidebar"]').remove();
  $('[class*="comment"], [class*="social"], [class*="share"], [class*="related"]').remove();
  $('[class*="print"], [class*="jump-to"], [class*="save-recipe"], button, [class*="rating"], [class*="review"]').remove();

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
    ".recipe",
    "#recipe",
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

  const mainContent =
    extractStructuredText($, $("main")) ||
    extractStructuredText($, $("article")) ||
    extractStructuredText($, $('[role="main"]'));

  if (mainContent.length > 100) {
    return cleanText(mainContent);
  }

  return null;
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
