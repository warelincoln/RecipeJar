import type { SourcePage, ParsedRecipeCandidate } from "@orzo/shared";
import { fetchUrl } from "./url-fetch.service.js";
import { extractStructuredData, extractMicrodata } from "./url-structured.adapter.js";
import { extractDomBoundary } from "./url-dom.adapter.js";
import { enrichFromDom } from "./url-dom-enrichment.js";
import { parseWithAI } from "./url-ai.adapter.js";
import {
  normalizeToCandidate,
  buildErrorCandidate,
  type RawExtractionResult,
} from "../normalize.js";

type ExtractionMethod = "json-ld" | "microdata" | "dom-ai" | "error";
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
    const enriched = enrichFromDom(html, structured);
    logExtraction("json-ld", url, {
      acquisitionMethod,
      ingredients: enriched.ingredients?.length,
      steps: enriched.steps?.length,
      enrichedImage:
        !structured.metadata?.imageUrl && !!enriched.metadata?.imageUrl,
      enrichedServings: !structured.servings && !!enriched.servings,
      enrichedTotalTime:
        !structured.metadata?.totalTime && !!enriched.metadata?.totalTime,
      fastPath: true,
    });
    const candidate = normalizeToCandidate(enriched, "url", sourcePages);
    candidate.extractionMethod = "json-ld";
    return candidate;
  }

  const microdata = extractMicrodata(html);
  if (microdata && passesQualityGate(microdata)) {
    const enriched = enrichFromDom(html, microdata);
    logExtraction("microdata", url, {
      acquisitionMethod,
      ingredients: enriched.ingredients?.length,
      steps: enriched.steps?.length,
      enrichedImage:
        !microdata.metadata?.imageUrl && !!enriched.metadata?.imageUrl,
      enrichedServings: !microdata.servings && !!enriched.servings,
      enrichedTotalTime:
        !microdata.metadata?.totalTime && !!enriched.metadata?.totalTime,
      fastPath: true,
    });
    const candidate = normalizeToCandidate(enriched, "url", sourcePages);
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
    logExtraction("error", url, {
      acquisitionMethod,
      reason: err instanceof Error ? err.message : "fetch failed",
    });
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

  const structured = extractStructuredData(html);
  let fallbackTitle: string | null = null;
  let fallbackMetadata: RawExtractionResult["metadata"] | undefined;
  let fallbackServings: RawExtractionResult["servings"] | undefined;

  if (structured && passesQualityGate(structured)) {
    const enriched = enrichFromDom(html, structured);
    logExtraction("json-ld", url, {
      acquisitionMethod,
      ingredients: enriched.ingredients?.length,
      steps: enriched.steps?.length,
      enrichedImage:
        !structured.metadata?.imageUrl && !!enriched.metadata?.imageUrl,
      enrichedServings: !structured.servings && !!enriched.servings,
      enrichedTotalTime:
        !structured.metadata?.totalTime && !!enriched.metadata?.totalTime,
    });
    const candidate = normalizeToCandidate(enriched, "url", sourcePages);
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
    const enriched = enrichFromDom(html, microdata);
    logExtraction("microdata", url, {
      acquisitionMethod,
      ingredients: enriched.ingredients?.length,
      steps: enriched.steps?.length,
      enrichedImage:
        !microdata.metadata?.imageUrl && !!enriched.metadata?.imageUrl,
      enrichedServings: !microdata.servings && !!enriched.servings,
      enrichedTotalTime:
        !microdata.metadata?.totalTime && !!enriched.metadata?.totalTime,
    });
    const candidate = normalizeToCandidate(enriched, "url", sourcePages);
    candidate.extractionMethod = "microdata";
    return candidate;
  }

  const boundaryText = extractDomBoundary(html);

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
      const enriched = enrichFromDom(html, aiResult);
      logExtraction("dom-ai", url, {
        acquisitionMethod,
        ingredients: enriched.ingredients?.length,
        steps: enriched.steps?.length,
        titleFromFallback: !!(fallbackTitle && enriched.title === fallbackTitle),
        enrichedImage:
          !aiResult.metadata?.imageUrl && !!enriched.metadata?.imageUrl,
        enrichedServings: !aiResult.servings && !!enriched.servings,
        enrichedTotalTime:
          !aiResult.metadata?.totalTime && !!enriched.metadata?.totalTime,
      });
      const candidate = normalizeToCandidate(enriched, "url", sourcePages);
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
