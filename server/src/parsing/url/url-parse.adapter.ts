import type { SourcePage, ParsedRecipeCandidate } from "@recipejar/shared";
import { fetchUrl } from "./url-fetch.service.js";
import { extractStructuredData } from "./url-structured.adapter.js";
import { extractDomBoundary } from "./url-dom.adapter.js";
import { parseWithAI } from "./url-ai.adapter.js";
import { normalizeToCandidate, buildErrorCandidate } from "../normalize.js";

/**
 * URL extraction cascade:
 * 1. Structured data (JSON-LD / schema.org) — short-circuits if found
 * 2. DOM boundary extraction — strips non-recipe content
 * 3. AI fallback — only receives boundary-filtered content, never raw HTML
 */
export async function parseUrl(
  url: string,
  sourcePages: SourcePage[],
): Promise<ParsedRecipeCandidate> {
  let html: string;
  try {
    html = await fetchUrl(url);
  } catch {
    return buildErrorCandidate("url", sourcePages);
  }

  const structured = extractStructuredData(html);
  if (structured) {
    return normalizeToCandidate(structured, "url", sourcePages);
  }

  const boundaryText = extractDomBoundary(html);

  if (boundaryText) {
    const aiResult = await parseWithAI(boundaryText);
    if (aiResult) {
      return normalizeToCandidate(aiResult, "url", sourcePages);
    }
  }

  return buildErrorCandidate("url", sourcePages);
}
