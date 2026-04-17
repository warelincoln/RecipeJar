/**
 * Pulls the hostname out of a URL and strips a leading `www.`, returning
 * null for anything that isn't a parseable URL. Used as the `domain`
 * property on PostHog import events so failures group cleanly by site.
 */
export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return null;
  }
}
