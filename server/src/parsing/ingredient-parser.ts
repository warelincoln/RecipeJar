/**
 * Deterministic ingredient line parser.
 *
 * Takes a free-text ingredient string (e.g. "1 1/2 cups all-purpose flour")
 * and decomposes it into structured fields for scaling.
 *
 * Used by:
 *  1. URL structured adapter (JSON-LD / microdata ingredient text)
 *  2. PUT /recipes/:id (Rule A — re-parse on saved recipe edit)
 */

export interface ParsedIngredientLine {
  amount: number | null;
  amountMax: number | null;
  unit: string | null;
  name: string;
  isScalable: boolean;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

const UNIT_CANONICAL: Record<string, string> = {
  cup: "cup",
  cups: "cup",
  c: "cup",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  tbs: "tbsp",
  tbl: "tbsp",
  T: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  t: "tsp",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  lbs: "lb",
  gram: "g",
  grams: "g",
  g: "g",
  kilogram: "kg",
  kilograms: "kg",
  kg: "kg",
  milliliter: "ml",
  milliliters: "ml",
  ml: "ml",
  mL: "ml",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
  l: "L",
  L: "L",
  pinch: "pinch",
  pinches: "pinch",
  dash: "dash",
  dashes: "dash",
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  stick: "stick",
  sticks: "stick",
  bunch: "bunch",
  bunches: "bunch",
  sprig: "sprig",
  sprigs: "sprig",
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
  head: "head",
  heads: "head",
  stalk: "stalk",
  stalks: "stalk",
  package: "package",
  packages: "package",
  pkg: "package",
  jar: "jar",
  jars: "jar",
  bottle: "bottle",
  bottles: "bottle",
  bag: "bag",
  bags: "bag",
  box: "box",
  boxes: "box",
  handful: "handful",
  handfuls: "handful",
  quart: "quart",
  quarts: "quart",
  qt: "quart",
  pint: "pint",
  pints: "pint",
  pt: "pint",
  "fl oz": "fl oz",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  gallon: "gallon",
  gallons: "gallon",
  gal: "gallon",
  drop: "drop",
  drops: "drop",
  leaf: "leaf",
  leaves: "leaf",
  ear: "ear",
  ears: "ear",
  strip: "strip",
  strips: "strip",
  sheet: "sheet",
  sheets: "sheet",
  scoop: "scoop",
  scoops: "scoop",
};

const NON_SCALABLE_PATTERNS = [
  /\bto taste\b/i,
  /\bfor (frying|garnish|greasing|serving|dusting|dipping|drizzling|brushing|coating|rolling)\b/i,
  /\bas needed\b/i,
  /\boptional\b/i,
  /\ba (generous |small )?handful\b/i,
];

const UNICODE_FRAC_PATTERN = new RegExp(
  `[${Object.keys(UNICODE_FRACTIONS).join("")}]`,
);

/**
 * Parse a numeric amount from the start of a string.
 * Handles: integers, decimals, slash fractions, unicode fractions, mixed numbers.
 * Returns [parsedValue, remainingString] or null if no number found.
 */
function parseAmount(s: string): [number, string] | null {
  let str = s.trimStart();
  if (str.length === 0) return null;

  // Try unicode fraction at the very start (e.g. "½ cup")
  const firstChar = str[0];
  if (UNICODE_FRACTIONS[firstChar] !== undefined) {
    return [UNICODE_FRACTIONS[firstChar], str.slice(1).trimStart()];
  }

  // Try number (integer or decimal) optionally followed by unicode fraction or slash fraction
  const numMatch = str.match(
    /^(\d+(?:\.\d+)?)\s*/,
  );
  if (!numMatch) return null;

  const wholeOrDecimal = parseFloat(numMatch[1]);
  let rest = str.slice(numMatch[0].length);

  // Check for unicode fraction after the whole number (e.g. "1½")
  if (rest.length > 0 && UNICODE_FRACTIONS[rest[0]] !== undefined) {
    const frac = UNICODE_FRACTIONS[rest[0]];
    return [wholeOrDecimal + frac, rest.slice(1).trimStart()];
  }

  // Bare slash fraction with no leading whole number: input was "N/M ..." —
  // the first numMatch consumed the numerator, so rest starts with "/M".
  // Without this branch the function would return [N, "/M ..."], leaving
  // "/M" in the downstream name/unit fields, which produces the "1 /2 cup
  // flour" rendering bug when the ingredient is re-parsed on recipe edit
  // (see /recipes/:id PUT → recipes.repository.ts → parseIngredientLine).
  // Gated on integer + no decimal so we don't convert "1.5/2" (which
  // parseFloat would happily eat as 1.5) into a fraction — that's a
  // weird input and treating the "1.5" as whole is less surprising.
  const nakedSlashMatch = rest.match(/^\/\s*(\d+)\s*/);
  if (
    nakedSlashMatch &&
    Number.isInteger(wholeOrDecimal) &&
    numMatch[1].indexOf(".") === -1
  ) {
    const den = parseInt(nakedSlashMatch[1], 10);
    if (den !== 0) {
      return [
        wholeOrDecimal / den,
        rest.slice(nakedSlashMatch[0].length).trimStart(),
      ];
    }
  }

  // Check for slash fraction after a space or directly (e.g. "1 1/2" or "1/2")
  const slashMatch = rest.match(/^(\d+)\s*\/\s*(\d+)\s*/);
  if (slashMatch) {
    const num = parseInt(slashMatch[1], 10);
    const den = parseInt(slashMatch[2], 10);
    if (den !== 0) {
      // If wholeOrDecimal is an integer and the fraction numerator < denominator,
      // this is a mixed number like "1 1/2"
      if (
        Number.isInteger(wholeOrDecimal) &&
        numMatch[1].indexOf(".") === -1 &&
        num < den
      ) {
        return [
          wholeOrDecimal + num / den,
          rest.slice(slashMatch[0].length).trimStart(),
        ];
      }
      // Otherwise the whole match was a fraction like "1/2"
      // Re-parse: the initial number IS the numerator
      const fractionMatch = str.match(/^(\d+)\s*\/\s*(\d+)\s*/);
      if (fractionMatch) {
        const n = parseInt(fractionMatch[1], 10);
        const d = parseInt(fractionMatch[2], 10);
        if (d !== 0) {
          return [n / d, str.slice(fractionMatch[0].length).trimStart()];
        }
      }
    }
  }

  return [wholeOrDecimal, rest];
}

/**
 * Try to parse a range like "1-2", "1 - 2", "1 to 2" from the start of a string.
 * Returns [min, max, remainingString] or null.
 */
function parseRange(
  s: string,
): [number, number, string] | null {
  const first = parseAmount(s);
  if (!first) return null;

  const [minVal, afterFirst] = first;

  // Check for range separator: "-", "–", "—", " to "
  const rangeMatch = afterFirst.match(/^(?:\s*[-–—]\s*|\s+to\s+)/i);
  if (!rangeMatch) return null;

  const afterSep = afterFirst.slice(rangeMatch[0].length);
  const second = parseAmount(afterSep);
  if (!second) return null;

  const [maxVal, rest] = second;
  if (maxVal <= minVal) return null;

  return [minVal, maxVal, rest];
}

function lookupUnit(word: string): string | null {
  // Period-stripped for abbreviations like "oz." or "tsp."
  const cleaned = word.replace(/\.$/, "");
  return UNIT_CANONICAL[cleaned] ?? UNIT_CANONICAL[cleaned.toLowerCase()] ?? null;
}

/**
 * Try to extract a unit from the start of a string.
 * Also handles "fl oz" (two-word unit).
 */
function parseUnit(s: string): [string, string] | null {
  const str = s.trimStart();
  if (str.length === 0) return null;

  // Two-word units first
  const twoWordMatch = str.match(/^(fl(?:uid)?\s+oz(?:\.)?|fluid\s+ounces?)\b\s*/i);
  if (twoWordMatch) {
    return ["fl oz", str.slice(twoWordMatch[0].length)];
  }

  const wordMatch = str.match(/^([a-zA-Z]+\.?)\s*/);
  if (!wordMatch) return null;

  const canonical = lookupUnit(wordMatch[1]);
  if (!canonical) return null;

  return [canonical, str.slice(wordMatch[0].length)];
}

/**
 * Parse an ingredient text line into structured fields.
 */
export function parseIngredientLine(text: string): ParsedIngredientLine {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { amount: null, amountMax: null, unit: null, name: "", isScalable: false };
  }

  // Check for non-scalable patterns
  for (const pattern of NON_SCALABLE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { amount: null, amountMax: null, unit: null, name: trimmed, isScalable: false };
    }
  }

  // Try range first, then single amount
  let amount: number | null = null;
  let amountMax: number | null = null;
  let afterAmount = trimmed;

  const rangeResult = parseRange(trimmed);
  if (rangeResult) {
    [amount, amountMax, afterAmount] = rangeResult;
  } else {
    const amountResult = parseAmount(trimmed);
    if (amountResult) {
      [amount, afterAmount] = amountResult;
    }
  }

  if (amount === null) {
    return { amount: null, amountMax: null, unit: null, name: trimmed, isScalable: false };
  }

  // Try to parse a unit
  let unit: string | null = null;

  // Handle parenthetical compound amounts like "2 (14 oz) cans tomatoes"
  const parenMatch = afterAmount.match(/^\(([^)]+)\)\s*/);
  if (parenMatch) {
    const parenContent = parenMatch[1];
    const afterParen = afterAmount.slice(parenMatch[0].length);

    // Try to parse a unit after the parenthetical (e.g. "cans")
    const unitAfterParen = parseUnit(afterParen);
    if (unitAfterParen) {
      const [parsedUnit, rest] = unitAfterParen;
      const name = `(${parenContent}) ${rest}`.trim();
      return {
        amount,
        amountMax,
        unit: parsedUnit,
        name: name || trimmed,
        isScalable: true,
      };
    }

    // No unit after paren — the paren is just part of the name
    const unitResult = parseUnit(afterAmount.slice(parenMatch[0].length));
    if (!unitResult) {
      const name = afterAmount.trim();
      return {
        amount,
        amountMax,
        unit: null,
        name: name || trimmed,
        isScalable: true,
      };
    }
  }

  const unitResult = parseUnit(afterAmount);
  if (unitResult) {
    const [parsedUnit, rest] = unitResult;
    unit = parsedUnit;
    afterAmount = rest;
  }

  // Check if after removing "of" we can get a cleaner name
  const ofMatch = afterAmount.match(/^of\s+/i);
  if (ofMatch) {
    afterAmount = afterAmount.slice(ofMatch[0].length);
  }

  const name = afterAmount.trim();

  return {
    amount,
    amountMax,
    unit,
    name: name || trimmed,
    isScalable: true,
  };
}
