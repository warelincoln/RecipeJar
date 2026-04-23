import * as cheerio from "cheerio";
import type { SourcePage, ParsedRecipeCandidate } from "@orzo/shared";
import { fetchUrl, detectBotBlock, BotBlockError } from "./url-fetch.service.js";
import { extractStructuredData, extractMicrodata } from "./url-structured.adapter.js";
import { extractDomBoundary } from "./url-dom.adapter.js";
import { enrichFromDom } from "./url-dom-enrichment.js";
import { parseWithAI } from "./url-ai.adapter.js";
import {
  normalizeToCandidate,
  buildErrorCandidate,
  type RawExtractionResult,
} from "../normalize.js";

const RESCUE_BODY_MAX_CHARS = 20_000;

/**
 * Strip scripts/styles/navigation and return body text. Used as a
 * last-resort AI context when extractDomBoundary returned null but we
 * know there's a recipe on the page (microdata ingredients were found).
 * Capped at 20 KB to bound AI token cost.
 */
function extractBodyTextForRescue(html: string): string | null {
  try {
    const $ = cheerio.load(html);
    $("script, style, nav, footer, header, aside, iframe, noscript").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    if (text.length < 200) return null;
    if (text.length > RESCUE_BODY_MAX_CHARS) {
      return text.slice(0, RESCUE_BODY_MAX_CHARS);
    }
    return text;
  } catch {
    return null;
  }
}

/**
 * When the HTML came from an in-app WebView capture and the enrichment
 * step couldn't find a hero image, the capture probably stripped the
 * meta tags or fired before a JS-injected JSON-LD arrived. Server-fetch
 * the URL once, reuse `enrichFromDom` to pull `og:image` / `twitter:image`
 * / `link[itemprop=image]` from the fresh HTML, and graft the result.
 *
 * Observed 2026-04-23: jamieoliver.com and abouteating.com returned
 * clean recipes via webview-html extraction but with `imageUrl: null`,
 * while a server fetch of the same URL produced a valid og:image.
 */
async function ensureImageFromFreshFetch(
  result: RawExtractionResult,
  url: string,
  acquisitionMethod: UrlAcquisitionMethod,
): Promise<RawExtractionResult> {
  const hasImage =
    typeof result.metadata?.imageUrl === "string" &&
    result.metadata.imageUrl.length > 0;
  if (hasImage) return result;
  if (acquisitionMethod !== "webview-html") return result;
  try {
    const freshHtml = await fetchUrl(url);
    const reEnriched = enrichFromDom(freshHtml, result, url);
    const freshImageFound =
      typeof reEnriched.metadata?.imageUrl === "string" &&
      reEnriched.metadata.imageUrl.length > 0;
    if (freshImageFound) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event: "image_fallback_fresh_fetch",
          url,
          recovered: true,
        }),
      );
      return reEnriched;
    }
  } catch {
    // fall through; leave result unchanged
  }
  return result;
}

type ExtractionMethod =
  | "json-ld"
  | "microdata"
  | "microdata-partial-merged"
  | "dom-ai"
  | "heading-anchor"
  | "bot-blocked"
  | "error";
export type UrlAcquisitionMethod =
  | "server-fetch"
  | "webview-html"
  | "server-fetch-fallback";

/**
 * Quality gate: structured data must meet minimum thresholds
 * to be accepted without falling through to the AI path.
 */
function passesQualityGate(result: RawExtractionResult): boolean {
  const ingredientCount = result.ingredients?.length ?? 0;
  const stepCount = result.steps?.length ?? 0;
  const titleLength = (result.title ?? "").length;
  return ingredientCount >= 2 && stepCount >= 1 && titleLength > 2;
}

function logExtraction(
  method: ExtractionMethod,
  url: string,
  extra?: Record<string, unknown>,
) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "url_extraction",
      method,
      url,
      ...extra,
    }),
  );
}

/**
 * Fast-path extraction: JSON-LD + Microdata only, with DOM enrichment.
 * Returns null if neither tier passes the quality gate (caller should then
 * decide whether to fall back to the full AI cascade in `parseUrlFromHtml`).
 *
 * Cheap (~50-200ms) — never calls OpenAI, never fetches. Used by the
 * synchronous fast path in `POST /drafts/:id/parse` so the HTTP response
 * can carry the parsed candidate inline when structured data succeeds.
 */
export async function parseUrlStructuredOnly(
  url: string,
  html: string,
  sourcePages: SourcePage[],
  acquisitionMethod: UrlAcquisitionMethod = "webview-html",
): Promise<ParsedRecipeCandidate | null> {
  if (!html.trim()) return null;

  const structured = extractStructuredData(html);
  if (structured && passesQualityGate(structured)) {
    const enriched = enrichFromDom(html, structured, url);
    // Also run the image-fallback here: jamieoliver.com hits this fast
    // path (JSON-LD passes quality gate) but the iPhone WebView capture
    // sometimes strips the image fields from the JSON-LD. If webview-
    // captured and we still don't have an image, fetch fresh HTML and
    // retry image enrichment. (Same behavior parseUrlFromHtml already had.)
    const final = await ensureImageFromFreshFetch(enriched, url, acquisitionMethod);
    logExtraction("json-ld", url, {
      acquisitionMethod,
      ingredients: final.ingredients?.length,
      steps: final.steps?.length,
      enrichedImage:
        !structured.metadata?.imageUrl && !!final.metadata?.imageUrl,
      enrichedServings: !structured.servings && !!final.servings,
      enrichedTotalTime:
        !structured.metadata?.totalTime && !!final.metadata?.totalTime,
      fastPath: true,
    });
    const candidate = normalizeToCandidate(final, "url", sourcePages);
    candidate.extractionMethod = "json-ld";
    return candidate;
  }

  const microdata = extractMicrodata(html);
  if (microdata && passesQualityGate(microdata)) {
    const enriched = enrichFromDom(html, microdata, url);
    const final = await ensureImageFromFreshFetch(enriched, url, acquisitionMethod);
    logExtraction("microdata", url, {
      acquisitionMethod,
      ingredients: final.ingredients?.length,
      steps: final.steps?.length,
      enrichedImage:
        !microdata.metadata?.imageUrl && !!final.metadata?.imageUrl,
      enrichedServings: !microdata.servings && !!final.servings,
      enrichedTotalTime:
        !microdata.metadata?.totalTime && !!final.metadata?.totalTime,
      fastPath: true,
    });
    const candidate = normalizeToCandidate(final, "url", sourcePages);
    candidate.extractionMethod = "microdata";
    return candidate;
  }

  return null;
}

/**
 * URL extraction cascade:
 * 1. JSON-LD structured data (quality-gated)
 * 2. Microdata (itemprop attributes, quality-gated) — added later
 * 3. DOM boundary extraction → AI fallback
 * 4. Error candidate
 */
export async function parseUrl(
  url: string,
  sourcePages: SourcePage[],
  acquisitionMethod: UrlAcquisitionMethod = "server-fetch",
): Promise<ParsedRecipeCandidate> {
  let html: string;
  try {
    html = await fetchUrl(url);
  } catch (err) {
    if (err instanceof BotBlockError) {
      logExtraction("bot-blocked", url, {
        acquisitionMethod,
        label: err.label,
        source: "fetch",
      });
    } else {
      logExtraction("error", url, {
        acquisitionMethod,
        reason: err instanceof Error ? err.message : "fetch failed",
      });
    }
    return buildErrorCandidate("url", sourcePages);
  }

  return parseUrlFromHtml(url, html, sourcePages, acquisitionMethod);
}

export async function parseUrlFromHtml(
  url: string,
  html: string,
  sourcePages: SourcePage[],
  acquisitionMethod: UrlAcquisitionMethod = "webview-html",
): Promise<ParsedRecipeCandidate> {
  if (!html.trim()) {
    logExtraction("error", url, {
      acquisitionMethod,
      reason: "empty_html",
    });
    return buildErrorCandidate("url", sourcePages);
  }

  // Catch iPhone WebView captures that are themselves an interstitial — the
  // user tapped Save while looking at the bot-challenge page. `fetchUrl`
  // already catches server-fetched interstitials one layer up.
  const webviewBotLabel = detectBotBlock(html);
  if (webviewBotLabel) {
    logExtraction("bot-blocked", url, {
      acquisitionMethod,
      label: webviewBotLabel,
      source: "webview_html",
    });
    return buildErrorCandidate("url", sourcePages);
  }

  const structured = extractStructuredData(html);
  let fallbackTitle: string | null = null;
  let fallbackMetadata: RawExtractionResult["metadata"] | undefined;
  let fallbackServings: RawExtractionResult["servings"] | undefined;
  // Captured from rejected microdata (ingredients-only pages like
  // notquitenigella.com 2010). When AI later fills steps via the DOM-AI
  // tier, we replace the AI's re-extracted ingredients with these —
  // microdata markers come from the site author and are higher-fidelity
  // than an AI regex pass.
  let fallbackIngredients: RawExtractionResult["ingredients"] | undefined;

  if (structured && passesQualityGate(structured)) {
    const enriched = enrichFromDom(html, structured, url);
    const final = await ensureImageFromFreshFetch(enriched, url, acquisitionMethod);
    logExtraction("json-ld", url, {
      acquisitionMethod,
      ingredients: final.ingredients?.length,
      steps: final.steps?.length,
      enrichedImage:
        !structured.metadata?.imageUrl && !!final.metadata?.imageUrl,
      enrichedServings: !structured.servings && !!final.servings,
      enrichedTotalTime:
        !structured.metadata?.totalTime && !!final.metadata?.totalTime,
    });
    const candidate = normalizeToCandidate(final, "url", sourcePages);
    candidate.extractionMethod = "json-ld";
    return candidate;
  }
  if (structured) {
    if (typeof structured.title === "string" && structured.title.length > 0) {
      fallbackTitle = structured.title;
    }
    if (structured.metadata) {
      fallbackMetadata = structured.metadata;
    }
    if (structured.servings) {
      fallbackServings = structured.servings;
    }
    logExtraction("json-ld", url, {
      acquisitionMethod,
      rejected: true,
      reason: "quality_gate_failed",
      ingredients: structured.ingredients?.length,
      steps: structured.steps?.length,
      titleLength: (structured.title ?? "").length,
      savedFallbackTitle: !!fallbackTitle,
    });
  }

  const microdata = extractMicrodata(html);
  if (microdata && passesQualityGate(microdata)) {
    const enriched = enrichFromDom(html, microdata, url);
    const final = await ensureImageFromFreshFetch(enriched, url, acquisitionMethod);
    logExtraction("microdata", url, {
      acquisitionMethod,
      ingredients: final.ingredients?.length,
      steps: final.steps?.length,
      enrichedImage:
        !microdata.metadata?.imageUrl && !!final.metadata?.imageUrl,
      enrichedServings: !microdata.servings && !!final.servings,
      enrichedTotalTime:
        !microdata.metadata?.totalTime && !!final.metadata?.totalTime,
    });
    const candidate = normalizeToCandidate(final, "url", sourcePages);
    candidate.extractionMethod = "microdata";
    return candidate;
  }
  if (microdata) {
    // Microdata returned but failed the quality gate (typically:
    // ingredients-only, no recipeInstructions microdata). Capture what
    // we have so the DOM-AI tier below can reuse it.
    if (microdata.ingredients && microdata.ingredients.length >= 2) {
      fallbackIngredients = microdata.ingredients;
    }
    if (!fallbackTitle && typeof microdata.title === "string" && microdata.title.length > 0) {
      fallbackTitle = microdata.title;
    }
    if (!fallbackMetadata && microdata.metadata) {
      fallbackMetadata = microdata.metadata;
    }
    if (!fallbackServings && microdata.servings) {
      fallbackServings = microdata.servings;
    }
    logExtraction("microdata", url, {
      acquisitionMethod,
      rejected: true,
      reason: "quality_gate_failed",
      ingredients: microdata.ingredients?.length,
      steps: microdata.steps?.length,
      savedFallbackIngredients: !!fallbackIngredients,
    });
  }

  let boundaryText = extractDomBoundary(html);

  // Microdata-ingredients rescue: when a page has itemprop="recipeIngredient"
  // but no itemprop="recipeInstructions" AND none of our structural-boundary
  // heuristics find a recipe region (no recipe-class wrapper, no itemprop
  // fallback because only ingredients are tagged, no heading-anchored match
  // because the page uses inline <strong>Beef layer</strong> instead of
  // proper Directions headings) — extractDomBoundary returns null, AI never
  // runs, and we lose a recipe whose ingredients we already have in hand.
  //
  // Observed on notquitenigella.com 2010 blog posts. Fall back to the full
  // body text so AI can find the steps; the fallbackIngredients merge
  // below still replaces AI's re-extraction with the higher-fidelity
  // microdata ingredients.
  if (
    !boundaryText &&
    fallbackIngredients &&
    fallbackIngredients.length >= 2
  ) {
    boundaryText = extractBodyTextForRescue(html);
    if (boundaryText) {
      logExtraction("microdata-partial-merged", url, {
        acquisitionMethod,
        reason: "boundary_null_body_rescue",
        fallbackIngredientCount: fallbackIngredients.length,
      });
    }
  }

  if (boundaryText) {
    const aiResult = await parseWithAI(boundaryText, url);
    if (aiResult) {
      if (!aiResult.title && fallbackTitle) {
        aiResult.title = fallbackTitle;
      }
      if (!aiResult.metadata && fallbackMetadata) {
        aiResult.metadata = fallbackMetadata;
      }
      if (!aiResult.servings && fallbackServings) {
        aiResult.servings = fallbackServings;
      }
      // Microdata ingredients (when present) override AI re-extraction.
      // Site authors control the itemprop markers; AI is a regex pass.
      // Only fires when the DOM-AI tier runs — happy-path microdata with
      // both ingredients + steps has already returned above.
      const usedMicrodataIngredients =
        !!fallbackIngredients && fallbackIngredients.length >= 2;
      if (usedMicrodataIngredients) {
        aiResult.ingredients = fallbackIngredients!;
      }
      const enriched = enrichFromDom(html, aiResult, url);
      const final = await ensureImageFromFreshFetch(enriched, url, acquisitionMethod);
      logExtraction("dom-ai", url, {
        acquisitionMethod,
        ingredients: final.ingredients?.length,
        steps: final.steps?.length,
        titleFromFallback: !!(fallbackTitle && final.title === fallbackTitle),
        enrichedImage:
          !aiResult.metadata?.imageUrl && !!final.metadata?.imageUrl,
        enrichedServings: !aiResult.servings && !!final.servings,
        enrichedTotalTime:
          !aiResult.metadata?.totalTime && !!final.metadata?.totalTime,
        usedMicrodataIngredients,
      });
      if (usedMicrodataIngredients) {
        logExtraction("microdata-partial-merged", url, {
          acquisitionMethod,
          ingredientCount: fallbackIngredients!.length,
          stepCount: aiResult.steps?.length ?? 0,
        });
      }
      const candidate = normalizeToCandidate(final, "url", sourcePages);
      candidate.extractionMethod = "dom-ai";
      return candidate;
    }
  }

  logExtraction("error", url, {
    acquisitionMethod,
    reason: "all_paths_failed",
  });
  return buildErrorCandidate("url", sourcePages);
}
