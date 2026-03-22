const BOT_UA =
  "Mozilla/5.0 (compatible; RecipeJar/1.0; +https://recipejar.app)";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_500;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

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
      redirect: "follow",
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetches a URL with:
 *  - URL normalization
 *  - 1 retry on transient errors (5xx, 429)
 *  - Browser UA fallback on 403
 *  - 5 MB response size guard
 *  - 15 s per-request timeout
 */
export async function fetchUrl(url: string): Promise<string> {
  const normalized = normalizeUrl(url);

  let response: Response;
  try {
    response = await attemptFetch(normalized, BOT_UA);
  } catch {
    await sleep(RETRY_DELAY_MS);
    response = await attemptFetch(normalized, BOT_UA);
  }

  if (isRetryable(response.status)) {
    await sleep(RETRY_DELAY_MS);
    response = await attemptFetch(normalized, BOT_UA);
  }

  if (response.status === 403) {
    response = await attemptFetch(normalized, BROWSER_UA);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large: ${contentLength} bytes`);
  }

  return await response.text();
}
