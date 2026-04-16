/**
 * Format a duration in minutes as a short human-readable string.
 *
 *   15   -> "15m"
 *   60   -> "1h"
 *   90   -> "1h 30m"
 *   120  -> "2h"
 *   0    -> null  (treat zero as "not stated")
 *   null -> null
 *
 * Null input or non-positive values return null so callers can `?? ""` or
 * skip rendering entirely.
 */
export function formatMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null) return null;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const remMinutes = whole % 60;
  if (hours === 0) return `${remMinutes}m`;
  if (remMinutes === 0) return `${hours}h`;
  return `${hours}h ${remMinutes}m`;
}

/**
 * True if any of prep / cook / total has a renderable value.
 * Callers use this to decide whether to render the time chip row at all.
 */
export function hasAnyTime(
  prepTimeMinutes: number | null | undefined,
  cookTimeMinutes: number | null | undefined,
  totalTimeMinutes: number | null | undefined,
): boolean {
  return (
    formatMinutes(prepTimeMinutes) !== null ||
    formatMinutes(cookTimeMinutes) !== null ||
    formatMinutes(totalTimeMinutes) !== null
  );
}

/**
 * Convert an ISO 8601 duration string (e.g. "PT1H30M") to integer minutes.
 * Returns null for null/undefined, empty strings, malformed input, or
 * durations that round to zero (e.g. "PT15S"). Mirrors the server-side
 * `isoDurationToMinutes` — used on the preview screen to read parsed
 * metadata times (which come from JSON-LD/Microdata/AI in ISO form).
 */
export function isoDurationToMinutes(
  iso: string | null | undefined,
): number | null {
  if (iso == null) return null;
  if (typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (trimmed.length === 0) return null;
  const match = trimmed.match(
    /^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const seconds = match[3] ? Number(match[3]) : 0;
  if (match[1] == null && match[2] == null && match[3] == null) return null;
  const total = hours * 60 + minutes + Math.round(seconds / 60);
  return total > 0 ? total : null;
}
