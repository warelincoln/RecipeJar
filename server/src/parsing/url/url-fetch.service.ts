import { assertUrlSafeForSsrf } from "./url-ssrf-guard.js";

/**
 * Thrown by `fetchUrl` when the response body looks like a bot-challenge
 * or access-denied interstitial rather than a real page. Caught by the
 * parse cascade and translated into a clean error candidate; also fired
 * from `parseUrlFromHtml` when the iPhone WebView captured and submitted
 * an interstitial as its "page".
 */
export class BotBlockError extends Error {
  readonly label: string;
  constructor(label: string, message?: string) {
    super(message ?? `bot-block detected: ${label}`);
    this.name = "BotBlockError";
    this.label = label;
  }
}

/**
 * Inspect an HTML response body for known interstitial patterns. Cheap
 * regex check that runs before any cheerio parse. Returns a short label
 * identifying the interstitial family, or null for real content.
 *
 * Detection targets observed in prod (PostHog 2026-04-23):
 * - cooks.com returns `<title>Are you Human? | Cooks.com</title>` + a
 *   single link back to the recipe; no recipe markup present.
 * - Cloudflare "Just a moment..." challenge pages.
 * - Generic "Access Denied" / "Access Restricted" short bodies.
 */
export function detectBotBlock(html: string): string | null {
  if (typeof html !== "string" || html.length < 100) return null;
  if (/<title[^>]*>[^<]*Are you Human\??[^<]*<\/title>/i.test(html)) {
    return "bot_interstitial_are_you_human";
  }
  if (
    /<title[^>]*>[^<]*Just a moment[^<]*<\/title>/i.test(html) &&
    /(cf-mitigated|challenge-form|__cf_chl_jschl_tk__|cf-browser-verification)/i.test(html)
  ) {
    return "cloudflare_challenge";
  }
  if (
    /<title[^>]*>[^<]*Access (?:Denied|Restricted)[^<]*<\/title>/i.test(html) &&
    html.length < 4000
  ) {
    return "access_denied";
  }
  return null;
}

const BOT_UA =
  "Mozilla/5.0 (compatible; Orzo/1.0; +https://getorzo.com)";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_500;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_REDIRECTS = 10;

/**
 * Normalizes a URL before fetching:
 *  - strips #fragment
 *  - removes /amp or /amp/ suffixes
 *  - collapses double slashes in the path
 */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.pathname = url.pathname
      .replace(/\/amp\/?$/i, "/")
      .replace(/\/{2,}/g, "/");
    return url.toString();
  } catch {
    return raw;
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

async function attemptFetch(
  url: string,
  userAgent: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetches a URL with:
 *  - SSRF checks on every redirect hop (manual redirects, max 10)
 *  - URL normalization per hop
 *  - 1 retry on transient errors (5xx, 429)
 *  - Browser UA fallback on 403
 *  - 5 MB response size guard
 *  - 15 s per-request timeout
 */
export async function fetchUrl(url: string): Promise<string> {
  let currentUrl = normalizeUrl(url);
  let redirectCount = 0;
  const assertMemo = new Map<string, Promise<void>>();

  function ensureSsrfAssert(urlStr: string): Promise<void> {
    let p = assertMemo.get(urlStr);
    if (!p) {
      p = assertUrlSafeForSsrf(urlStr);
      assertMemo.set(urlStr, p);
    }
    return p;
  }

  while (true) {
    await ensureSsrfAssert(currentUrl);

    let response: Response;
    try {
      response = await attemptFetch(currentUrl, BOT_UA);
    } catch {
      await sleep(RETRY_DELAY_MS);
      response = await attemptFetch(currentUrl, BOT_UA);
    }

    if (isRetryable(response.status)) {
      await sleep(RETRY_DELAY_MS);
      response = await attemptFetch(currentUrl, BOT_UA);
    }

    if (response.status === 403) {
      response = await attemptFetch(currentUrl, BROWSER_UA);
    }

    if (response.status >= 300 && response.status < 400) {
      await cancelResponseBody(response);

      if (response.status === 304) {
        throw new Error("Unexpected 304 Not Modified");
      }

      const rawLoc = response.headers.get("location");
      if (!rawLoc?.trim()) {
        throw new Error("Redirect response missing Location");
      }

      if (redirectCount >= MAX_REDIRECTS) {
        throw new Error("Too many redirects");
      }

      currentUrl = normalizeUrl(new URL(rawLoc.trim(), currentUrl).href);
      redirectCount++;
      continue;
    }

    if (!response.ok) {
      await cancelResponseBody(response);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
      await cancelResponseBody(response);
      throw new Error(`Response too large: ${contentLength} bytes`);
    }

    const body = await response.text();
    const botLabel = detectBotBlock(body);
    if (botLabel) {
      throw new BotBlockError(botLabel);
    }
    return body;
  }
}
