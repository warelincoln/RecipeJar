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
  | "canonical-short-circuit"
  | "link-fallback"
  | "error";
export type UrlAcquisitionMethod =
  | "server-fetch"
  | "webview-html"
  | "server-fetch-fallback";

/** Hard cap on how many times the fallback cascade can recurse through
 *  parseUrlFromHtml. Set to 1 so Layer-1 canonical and Layer-2 scored
 *  link-fallback each get exactly one retry and no more — prevents
 *  A→B→A oscillation and runaway OpenAI spend on adversarial pages. */
const FALLBACK_MAX_DEPTH = 1;

/** Threshold below which a scored candidate link is too weak to follow. */
const LINK_FALLBACK_MIN_SCORE = 5;

/** "Too many similar candidates" detector — roundup posts ("30 best cookie
 *  recipes") produce many near-tied candidates. If at least this many fall
 *  within LINK_FALLBACK_AMBIGUITY_WINDOW of the top score, decline the
 *  fallback rather than silently pick one. */
const LINK_FALLBACK_AMBIGUITY_COUNT = 8;
const LINK_FALLBACK_AMBIGUITY_WINDOW = 2;

/**
 * Normalize a URL for equality comparison:
 *  - parse + re-serialize via URL constructor (drops default port, lowercases host)
 *  - strip trailing slash on pathname ("/recipe/foo" === "/recipe/foo/")
 *  - drop hash fragment (in-page anchors don't change the document)
 *  - keep search params as-is (different ?variant=1 is a different page)
 *
 * Returns null on malformed input so callers can bail out instead of following
 * garbage. Used by the Layer-1 canonical short-circuit to detect self-reference
 * loops ("<link rel=canonical href={self}>") and by `findCandidateRecipeLinks`
 * to de-duplicate + reject same-page anchors.
 */
function normalizeUrlForCompare(input: string): string | null {
  try {
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    let pathname = u.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    u.pathname = pathname;
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Layer-1 fallback: when all extraction tiers fail on the user-pasted URL,
 * check for `<link rel="canonical" href="...">`. If canonical exists and,
 * after normalization, differs from the current URL, the caller should
 * retry parse against the canonical URL directly — skip the scored
 * link-fallback entirely.
 *
 * Returns the canonical URL to follow, or null when:
 *  - no canonical declared
 *  - canonical resolves to the current URL (self-loop — would infinite-recurse)
 *  - canonical is malformed / non-http
 *
 * Self-reference check is CRITICAL. Many sites emit canonical="{self}" to
 * prevent SEO duplicate-content penalties on query-string variants; without
 * the guard we'd oscillate between `parseUrlFromHtml → canonical →
 * parseUrlFromHtml → …` until the depth cap catches it.
 */
export function canonicalShortCircuit(
  html: string,
  currentUrl: string,
): string | null {
  try {
    const $ = cheerio.load(html);
    const href = $('link[rel="canonical"]').first().attr("href");
    if (!href || typeof href !== "string") return null;

    // Resolve relative canonicals against the current URL.
    let resolved: string;
    try {
      resolved = new URL(href.trim(), currentUrl).toString();
    } catch {
      return null;
    }

    const normalizedResolved = normalizeUrlForCompare(resolved);
    const normalizedCurrent = normalizeUrlForCompare(currentUrl);
    if (!normalizedResolved || !normalizedCurrent) return null;
    if (normalizedResolved === normalizedCurrent) return null;

    return resolved;
  } catch {
    return null;
  }
}

/**
 * A scored recipe-link candidate produced by `findCandidateRecipeLinks`.
 * `url` is always an absolute, resolved URL; the caller must still SSRF-guard
 * it via the existing fetchUrl path before following.
 */
export interface CandidateRecipeLink {
  url: string;
  score: number;
}

// Location scoring tokens. Matched as whole tokens on the className via a
// regex walk from the anchor up to <body>. Kept broad enough to catch common
// CMS patterns (WordPress "entry-content", etc.) while narrow enough to avoid
// false positives on unrelated containers.
const ANCESTOR_POSITIVE = /^(?:article|main|entry-content|post-content)$/i;
const ANCESTOR_NEGATIVE = /^(?:nav|footer|aside|header)$/i;

// Anchor-text phrases that signal the author is pointing to a distinct recipe
// page. "Jump to recipe" often points to a same-page fragment and is filtered
// upstream via the self-fragment check; when it survives (cross-page jump)
// it's still usually a correct target so we keep the bonus.
const ANCHOR_TEXT_RECIPE_PHRASE =
  /\b(view|see|jump\s+to|get|read)\s+(the\s+)?(full\s+|complete\s+)?recipe\b/i;

// Path segment matches — anchored to slash boundaries so we catch
// /recipe/, /recipes/, /print-recipe/ without matching /therecipe/ or
// /description/.
const PATH_IS_RECIPE = /\/recipes?\//i;
const PATH_IS_PRINT_RECIPE = /\/print-recipe\//i;
const PATH_IS_AMP = /(^|\/)amp(\/|$)/i;
const PATH_IS_PDF = /\.pdf(\?|#|$)/i;

/**
 * Scan HTML for candidate recipe links and score each by how likely it is to
 * point at a real recipe page. Used by the Layer-2 fallback in
 * `parseUrlFromHtml` when the user-pasted URL had no extractable recipe but
 * the page might contain a link to one.
 *
 * Scoring rubric (see plan for full breakdown):
 *   +10  JSON-LD @graph Recipe node with `url` field
 *   +5   href path matches /recipe(s)?/
 *   +3   anchor text matches "view recipe" / "jump to recipe" / etc.
 *   +2   inside schema.org/Recipe itemscope
 *   +2   inside <article>/<main>/entry-content/post-content
 *   -5   inside <nav>/<footer>/<aside>/<header>
 *   -3   /print-recipe/ variant of the same page
 *   -3   AMP / PDF variant
 *   -2   cross-domain
 *   +1   same domain
 *
 * Filters out: self-fragments (#foo), javascript:/file:/mailto: schemes,
 * anchors resolving to `currentUrl` after normalization (self-loop),
 * unparseable hrefs.
 *
 * Returned array is sorted highest-score first and de-duplicated by
 * normalized URL. Caller applies the min-score + ambiguity-decline
 * thresholds and picks the top candidate.
 */
export function findCandidateRecipeLinks(
  html: string,
  baseUrl: string,
): CandidateRecipeLink[] {
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return [];
  }

  const baseHost = safeHost(baseUrl);
  const normalizedBase = normalizeUrlForCompare(baseUrl);
  const scoreByUrl = new Map<string, number>();

  // --- JSON-LD @graph Recipe.url collection ---
  // Parse every application/ld+json block, walk @graph and top-level arrays,
  // and collect any `url` field on a node whose @type is Recipe. Scored high
  // (+15) because the site author literally labelled it — has to be
  // unbeatable by a stacked anchor (path +5, text +3, article +2, same
  // domain +1, itemscope +2 → max 13 without a duplicate JSON-LD URL),
  // otherwise a compelling text anchor would outrank an explicit schema.org
  // declaration.
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    for (const url of collectJsonLdRecipeUrls(data)) {
      const absolute = safeAbsoluteUrl(url, baseUrl);
      if (!absolute) continue;
      const normalized = normalizeUrlForCompare(absolute);
      if (!normalized) continue;
      if (normalized === normalizedBase) continue;
      const prior = scoreByUrl.get(normalized) ?? 0;
      scoreByUrl.set(normalized, prior + 15);
    }
  });

  // --- Anchor scan ---
  $("a[href]").each((_, el) => {
    const $el = $(el);
    const hrefRaw = ($el.attr("href") || "").trim();
    if (!hrefRaw) return;
    if (/^(javascript|mailto|tel|file|data):/i.test(hrefRaw)) return;
    if (hrefRaw.startsWith("#")) return; // pure self-fragment

    const absolute = safeAbsoluteUrl(hrefRaw, baseUrl);
    if (!absolute) return;
    const normalized = normalizeUrlForCompare(absolute);
    if (!normalized) return;
    if (normalized === normalizedBase) return; // same-page link

    const absUrl = safeUrlParse(absolute);
    if (!absUrl) return;
    if (absUrl.protocol !== "http:" && absUrl.protocol !== "https:") return;

    // Hard-filter PDFs: we parse HTML, not PDF. A PDF-hrefed anchor can't
    // ever be followed successfully, so drop it before scoring (would
    // otherwise keep it in the candidate pool at a dampened score).
    const pathLower = absUrl.pathname.toLowerCase();
    if (PATH_IS_PDF.test(pathLower)) return;

    let score = 0;
    if (PATH_IS_RECIPE.test(pathLower)) score += 5;
    if (PATH_IS_PRINT_RECIPE.test(pathLower)) score -= 3;
    if (PATH_IS_AMP.test(pathLower)) score -= 3;

    const text = $el.text().trim();
    if (ANCHOR_TEXT_RECIPE_PHRASE.test(text)) score += 3;

    // Walk ancestors for positive/negative location signals. Cap at 8
    // hops to avoid pathological nesting.
    let ancestor: ReturnType<typeof $el.parent> = $el.parent();
    let hops = 0;
    let posHit = false;
    let negHit = false;
    let recipeItemscopeHit = false;
    while (ancestor.length > 0 && hops < 8) {
      const tag = (ancestor.prop("tagName") || "").toLowerCase();
      if (tag === "article" || tag === "main") posHit = true;
      if (
        tag === "nav" ||
        tag === "footer" ||
        tag === "aside" ||
        tag === "header"
      ) {
        negHit = true;
      }

      const cls = (ancestor.attr("class") || "") as string;
      if (cls.length > 0) {
        for (const token of cls.split(/\s+/)) {
          if (ANCESTOR_POSITIVE.test(token)) posHit = true;
          if (ANCESTOR_NEGATIVE.test(token)) negHit = true;
        }
      }

      const itemtype = (ancestor.attr("itemtype") || "") as string;
      if (/schema\.org\/Recipe/i.test(itemtype)) recipeItemscopeHit = true;

      ancestor = ancestor.parent();
      hops++;
    }
    if (recipeItemscopeHit) score += 2;
    if (posHit) score += 2;
    if (negHit) score -= 5;

    // Domain bonus / cross-domain penalty.
    const candidateHost = absUrl.hostname.toLowerCase();
    if (baseHost && candidateHost) {
      if (sameRegisteredDomain(baseHost, candidateHost)) score += 1;
      else score -= 2;
    }

    // Only record if there's any positive signal — score 0 or less via path
    // means nothing about it flagged as recipe-ish, drop it.
    if (score <= 0) return;

    const prior = scoreByUrl.get(normalized);
    if (prior == null || score > prior) {
      scoreByUrl.set(normalized, score);
    }
  });

  const result: CandidateRecipeLink[] = Array.from(scoreByUrl.entries()).map(
    ([url, score]) => ({ url, score }),
  );
  result.sort((a, b) => b.score - a.score);
  return result;
}

function collectJsonLdRecipeUrls(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdRecipeUrls(item, out);
    return out;
  }
  if (typeof node !== "object") return out;
  const obj = node as Record<string, unknown>;

  // Recurse into @graph wrappers (very common in WordPress / Yoast output).
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"] as unknown[]) {
      collectJsonLdRecipeUrls(item, out);
    }
  }

  const type = obj["@type"];
  const isRecipeType =
    type === "Recipe" ||
    (Array.isArray(type) && type.some((t) => t === "Recipe"));
  if (isRecipeType) {
    const url = obj["url"] ?? obj["mainEntityOfPage"];
    if (typeof url === "string") out.push(url);
    else if (url && typeof url === "object") {
      const nested = (url as Record<string, unknown>)["@id"];
      if (typeof nested === "string") out.push(nested);
    }
  }
  return out;
}

function safeHost(u: string): string | null {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function safeUrlParse(u: string): URL | null {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

function safeAbsoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/**
 * Compare two hostnames by their registered domain (eTLD+1).
 *   "www.bonappetit.com"        ~= "bonappetit.com"        → true
 *   "recipes.bonappetit.com"    ~= "www.bonappetit.com"    → true
 *   "cnn.com"                   ~= "bonappetit.com"        → false
 *
 * Cheap heuristic: last two labels for common single-level TLDs; last three
 * for known multi-level TLDs (co.uk, com.au, co.jp). Not a full Public
 * Suffix List — just good enough to not mis-score subdomains of the same
 * publisher as cross-domain.
 */
const MULTI_LEVEL_TLDS = new Set([
  "co.uk",
  "com.au",
  "co.jp",
  "co.nz",
  "com.br",
  "co.za",
]);

function sameRegisteredDomain(a: string, b: string): boolean {
  const ra = registeredDomain(a);
  const rb = registeredDomain(b);
  return ra.length > 0 && ra === rb;
}

function registeredDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length < 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (parts.length >= 3 && MULTI_LEVEL_TLDS.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

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
  _depth: number = 0,
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
      return buildErrorCandidate("url", sourcePages, "url_bot_blocked");
    }
    logExtraction("error", url, {
      acquisitionMethod,
      reason: err instanceof Error ? err.message : "fetch failed",
    });
    return buildErrorCandidate("url", sourcePages);
  }

  return parseUrlFromHtml(url, html, sourcePages, acquisitionMethod, _depth);
}

export async function parseUrlFromHtml(
  url: string,
  html: string,
  sourcePages: SourcePage[],
  acquisitionMethod: UrlAcquisitionMethod = "webview-html",
  _depth: number = 0,
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
    return buildErrorCandidate("url", sourcePages, "url_bot_blocked");
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

  // All extraction tiers failed on the user-pasted URL. Before giving up,
  // try the two-layer fallback: first a rel=canonical short-circuit, then
  // a scored scan for recipe links on the page. Both are recursive calls
  // to parseUrl() gated by FALLBACK_MAX_DEPTH so a page can't bounce us
  // around forever or back into itself.
  if (_depth < FALLBACK_MAX_DEPTH) {
    const fallback = await tryUrlFallback({
      url,
      html,
      sourcePages,
      acquisitionMethod,
      depth: _depth,
    });
    if (fallback) return fallback;
  }

  logExtraction("error", url, {
    acquisitionMethod,
    reason: "all_paths_failed",
  });
  return buildErrorCandidate("url", sourcePages);
}

/**
 * Two-layer post-cascade rescue for URL parses where JSON-LD, microdata,
 * and DOM-AI all failed. Runs inside `parseUrlFromHtml` when depth < MAX.
 *
 *   Layer 1 — canonical short-circuit. If the page declares a canonical URL
 *   that differs from the one we parsed, retry against the canonical directly.
 *   Handles "user pasted the share-tracking URL" (?utm_source=…) and similar
 *   cases where the canonical resolves to the actual recipe.
 *
 *   Layer 2 — scored link-fallback. Collect recipe-link candidates, apply the
 *   scoring rubric in `findCandidateRecipeLinks`, decline on weak or
 *   ambiguous results (roundup posts), otherwise parse the top candidate.
 *
 * Returns a candidate with `fallbackFromUrl = <original>` on success, or
 * null when neither layer rescues the parse. The caller falls through to
 * the generic error candidate. The returned candidate's sourcePages still
 * reflect the original draft row — the caller is responsible for persisting
 * `resolvedUrl` separately if it wants retries to skip discovery.
 */
async function tryUrlFallback(input: {
  url: string;
  html: string;
  sourcePages: SourcePage[];
  acquisitionMethod: UrlAcquisitionMethod;
  depth: number;
}): Promise<ParsedRecipeCandidate | null> {
  const { url, html, sourcePages, acquisitionMethod, depth } = input;

  // --- Layer 1: canonical short-circuit ---
  const canonical = canonicalShortCircuit(html, url);
  if (canonical) {
    logExtraction("canonical-short-circuit", url, {
      acquisitionMethod,
      resolvedUrl: canonical,
    });
    const retry = await parseUrl(
      canonical,
      sourcePages,
      "server-fetch-fallback",
      depth + 1,
    );
    if (retry.extractionMethod !== "error") {
      retry.fallbackFromUrl = url;
      retry.fallbackResolvedUrl = canonical;
      return retry;
    }
    // Canonical parse also failed — continue to Layer 2 rather than
    // give up; the canonical target itself may be a non-recipe page with
    // a recipe link we can score.
  }

  // --- Layer 2: scored link-fallback ---
  const candidates = findCandidateRecipeLinks(html, url);
  if (candidates.length === 0) return null;

  const top = candidates[0];
  if (top.score < LINK_FALLBACK_MIN_SCORE) {
    logExtraction("link-fallback", url, {
      acquisitionMethod,
      declined: true,
      reason: "below_min_score",
      topScore: top.score,
      candidateCount: candidates.length,
    });
    return null;
  }

  // Roundup-post detection: if a big cluster of candidates all score close
  // to the top, we can't confidently pick one — the page is probably a
  // listicle ("30 best cookie recipes") and silently grabbing any single
  // link would mislead the user.
  const clusterCount = candidates.filter(
    (c) => top.score - c.score <= LINK_FALLBACK_AMBIGUITY_WINDOW,
  ).length;
  if (clusterCount >= LINK_FALLBACK_AMBIGUITY_COUNT) {
    logExtraction("link-fallback", url, {
      acquisitionMethod,
      declined: true,
      reason: "ambiguous_roundup",
      topScore: top.score,
      candidateCount: candidates.length,
      clusterCount,
    });
    return null;
  }

  logExtraction("link-fallback", url, {
    acquisitionMethod,
    resolvedUrl: top.url,
    topScore: top.score,
    candidateCount: candidates.length,
    clusterCount,
  });

  const retry = await parseUrl(
    top.url,
    sourcePages,
    "server-fetch-fallback",
    depth + 1,
  );
  if (retry.extractionMethod === "error") return null;
  retry.fallbackFromUrl = url;
  retry.fallbackResolvedUrl = top.url;
  return retry;
}
