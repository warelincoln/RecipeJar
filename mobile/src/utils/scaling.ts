import type { RecipeIngredientEntry } from "@orzo/shared";

const FRACTION_TABLE: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [0.333, "⅓"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [0.667, "⅔"],
  [0.75, "¾"],
  [0.875, "⅞"],
];

export function scaleAmount(amount: number, factor: number): number {
  return amount * factor;
}

/**
 * Round a fractional part to the nearest 1/8 and return the
 * unicode fraction character (or empty string for 0).
 */
function nearestFraction(frac: number): string {
  if (frac < 0.0625) return "";

  let best = FRACTION_TABLE[0];
  let bestDist = Math.abs(frac - best[0]);
  for (let i = 1; i < FRACTION_TABLE.length; i++) {
    const dist = Math.abs(frac - FRACTION_TABLE[i][0]);
    if (dist < bestDist) {
      best = FRACTION_TABLE[i];
      bestDist = dist;
    }
  }
  return best[1];
}

/**
 * Format a numeric value as a mixed number using unicode fractions.
 *
 * Examples:
 *  0.5   → "½"
 *  1.0   → "1"
 *  1.75  → "1 ¾"
 *  3.333 → "3 ⅓"
 */
export function formatAmount(value: number): string {
  if (value <= 0) return "0";

  const whole = Math.floor(value);
  const frac = value - whole;
  const fracStr = nearestFraction(frac);

  if (whole === 0 && fracStr) return fracStr;
  if (!fracStr) return String(whole + (frac >= 0.9375 ? 1 : 0));
  return `${whole} ${fracStr}`;
}

/**
 * Scale an ingredient and return a display string.
 *
 * - Headers → text verbatim
 * - Non-scalable or missing amount → raw/text verbatim
 * - Scalable → "{scaled amount} {unit} {name}" or "{min}-{max} {unit} {name}"
 */
export function scaleIngredient(
  ingredient: RecipeIngredientEntry,
  factor: number,
): string {
  if (ingredient.isHeader) return ingredient.text;
  if (!ingredient.isScalable || ingredient.amount == null) {
    return ingredient.raw ?? ingredient.text;
  }

  const scaledMin = scaleAmount(ingredient.amount, factor);
  const formattedMin = formatAmount(scaledMin);

  let amountStr: string;
  if (ingredient.amountMax != null) {
    const scaledMax = scaleAmount(ingredient.amountMax, factor);
    const formattedMax = formatAmount(scaledMax);
    amountStr = `${formattedMin}–${formattedMax}`;
  } else {
    amountStr = formattedMin;
  }

  const parts = [amountStr];
  if (ingredient.unit) parts.push(ingredient.unit);
  if (ingredient.name) parts.push(ingredient.name);

  return parts.join(" ");
}
