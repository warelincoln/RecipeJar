/**
 * Convert an ISO 8601 duration string to an integer number of minutes.
 *
 * Handles the subset of ISO 8601 durations that appear in recipe schemas:
 * Schema.org / JSON-LD uses "PT1H30M", "PT15M", etc. Days and weeks are not
 * expected in this domain, so we only parse H / M / S (seconds are rounded
 * to the nearest minute).
 *
 * Returns null for:
 *   - undefined / null inputs
 *   - empty strings
 *   - strings that don't match the expected shape
 *   - strings that parse to 0 or negative minutes (treat as "not stated")
 *
 * Examples:
 *   isoDurationToMinutes("PT15M")    === 15
 *   isoDurationToMinutes("PT1H30M")  === 90
 *   isoDurationToMinutes("PT2H")     === 120
 *   isoDurationToMinutes("PT45S")    === 1   (rounded)
 *   isoDurationToMinutes("PT30S")    === 1   (rounded up from 0.5)
 *   isoDurationToMinutes("PT29S")    === 0 -> null (sub-minute, treat as absent)
 *   isoDurationToMinutes("")         === null
 *   isoDurationToMinutes(undefined)  === null
 *   isoDurationToMinutes("garbage")  === null
 *   isoDurationToMinutes("PT")       === null
 */
export function isoDurationToMinutes(
  iso: string | null | undefined,
): number | null {
  if (iso == null) return null;
  if (typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (trimmed.length === 0) return null;

  // PnYnMnDTnHnMnS — for recipes we only expect the time component,
  // but tolerate a leading "P" with optional date-part prefixes we ignore.
  const match = trimmed.match(
    /^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );
  if (!match) return null;

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const seconds = match[3] ? Number(match[3]) : 0;

  // Must have at least one component present
  if (match[1] == null && match[2] == null && match[3] == null) return null;

  const total = hours * 60 + minutes + Math.round(seconds / 60);
  return total > 0 ? total : null;
}
