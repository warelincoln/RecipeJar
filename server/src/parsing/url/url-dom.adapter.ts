import * as cheerio from "cheerio";

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

  const recipeSelectors = [
    '[itemtype*="schema.org/Recipe"]',
    '[class*="recipe-card"]',
    '[class*="recipe-content"]',
    '[class*="recipe-body"]',
    '[class*="wprm-recipe"]',
    '[class*="tasty-recipe"]',
    '[class*="easyrecipe"]',
    '[class*="jetpack-recipe"]',
    ".recipe",
    "#recipe",
    '[data-recipe]',
  ];

  for (const selector of recipeSelectors) {
    const el = $(selector);
    if (el.length > 0) {
      const text = el.first().text().trim();
      if (text.length > 100) {
        return cleanText(text);
      }
    }
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
    $("main").text().trim() ||
    $("article").text().trim() ||
    $('[role="main"]').text().trim();

  if (mainContent.length > 100) {
    return cleanText(mainContent);
  }

  return null;
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 10000);
}
