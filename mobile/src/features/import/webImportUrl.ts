/** Default search engine for in-app browser. */
export const NEUTRAL_SEARCH_TEMPLATE = "https://www.google.com/search?q=";

export function buildSearchUrl(query: string): string {
  return `${NEUTRAL_SEARCH_TEMPLATE}${encodeURIComponent(query.trim())}`;
}

/** Case-insensitive http(s) prefix (iOS sometimes reports odd casing). */
export function looksLikeHttpUrl(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t.startsWith("http://") || t.startsWith("https://");
}

export function stripUrlCredentials(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.username || u.password) {
      u.username = "";
      u.password = "";
      return u.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}

function isDuckDuckGoHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "duckduckgo.com" ||
    h.endsWith(".duckduckgo.com") ||
    h.startsWith("duckduckgo.")
  );
}

function isBingSearchHostPath(host: string, path: string): boolean {
  const h = host.toLowerCase();
  const p = path.toLowerCase();
  return (h === "bing.com" || h.endsWith(".bing.com")) && p.includes("/search");
}

function isYahooSearchHost(host: string, path: string): boolean {
  const h = host.toLowerCase();
  const p = path.toLowerCase();
  return (
    h.includes("search.yahoo.") ||
    ((h === "yahoo.com" || h.endsWith(".yahoo.com")) && p.startsWith("/search"))
  );
}

/** True if URL is not suitable for Save → ImportFlow (search hub, about, etc.). */
export function isNonRecipePageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    if (u.href.startsWith("about:") || host === "" || path === "/blank") return true;
    // DuckDuckGo (all regions / subdomains) is search-only for our purposes.
    if (isDuckDuckGoHost(host)) return true;
    const isGoogleSearch =
      (host === "google.com" || host.endsWith(".google.com")) &&
      path.startsWith("/search");
    if (isGoogleSearch) return true;
    if (isBingSearchHostPath(host, path)) return true;
    if (isYahooSearchHost(host, path)) return true;
    return false;
  } catch {
    // Malformed URL — do not offer Save (avoids false positives from bad WebView strings).
    return true;
  }
}

export function isDirectHttpUrl(input: string): boolean {
  const t = input.trim().toLowerCase();
  return t.startsWith("http://") || t.startsWith("https://");
}

export function looksLikeUrlOrSearch(input: string): boolean {
  const t = input.trim();
  if (t.length === 0) return false;
  if (isDirectHttpUrl(t)) return true;
  if (t.includes(".") && !t.includes(" ")) return true;
  return true;
}

export function resolveOmnibarInput(input: string): string {
  const t = input.trim();
  if (isDirectHttpUrl(t)) return t;
  return buildSearchUrl(t);
}

export function parseClipboardForHttpsUrl(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol === "https:" || u.protocol === "http:") {
      return stripUrlCredentials(u.toString());
    }
  } catch {
    /* ignore */
  }
  const m = trimmed.match(/https?:\/\/[^\s]+/i);
  if (m) {
    try {
      const u = new URL(m[0]);
      return stripUrlCredentials(u.toString());
    } catch {
      return null;
    }
  }
  return null;
}
