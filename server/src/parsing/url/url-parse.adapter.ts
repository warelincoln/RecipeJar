import type { SourcePage, ParsedRecipeCandidate } from "@recipejar/shared";
import { fetchUrl } from "./url-fetch.service.js";
import { extractStructuredData, extractMicrodata } from "./url-structured.adapter.js";
import { extractDomBoundary } from "./url-dom.adapter.js";
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
    logExtraction("json-ld", url, {
      acquisitionMethod,
      ingredients: structured.ingredients?.length,
      steps: structured.steps?.length,
    });
    const candidate = normalizeToCandidate(structured, "url", sourcePages);
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
    logExtraction("microdata", url, {
      acquisitionMethod,
      ingredients: microdata.ingredients?.length,
      steps: microdata.steps?.length,
    });
    const candidate = normalizeToCandidate(microdata, "url", sourcePages);
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
      logExtraction("dom-ai", url, {
        acquisitionMethod,
        ingredients: aiResult.ingredients?.length,
        steps: aiResult.steps?.length,
        titleFromFallback: !!(fallbackTitle && aiResult.title === fallbackTitle),
      });
      const candidate = normalizeToCandidate(aiResult, "url", sourcePages);
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
