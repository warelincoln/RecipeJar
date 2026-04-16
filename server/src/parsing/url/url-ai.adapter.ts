import OpenAI from "openai";
import type { RawExtractionResult } from "../normalize.js";

const PROMPT = `You are a recipe extraction engine. Given text content from a recipe webpage, extract the recipe as structured JSON.

Rules:
- Extract the recipe title, ingredients, steps, and optional description.
- Extract the number of servings the recipe makes. If a range is given (e.g. "serves 6-8"), return min and max. If a single number (e.g. "serves 4"), return min only. If not found, set servings to null.
- Each ingredient should be a separate entry. Preserve headers like "For the sauce:" with isHeader: true.
- For each non-header ingredient, decompose into structured fields: amount (numeric, e.g. 1.5), amountMax (numeric, only for ranges like "1-2"), unit (e.g. "cup", "tbsp", "oz"), and name (the ingredient itself). Keep the full original text in the "text" field.
- If an ingredient has no measurable amount (e.g. "salt to taste"), set amount, amountMax, and unit to null.
- Convert fractions to decimals in the amount field (e.g. ½ → 0.5, ¼ → 0.25).
- Each step should be a separate entry. Mark sub-recipe section headers (e.g. "To make the sauce:", "For the frosting:") with isHeader: true.
- Strip original step numbers from the beginning of step text. The app adds its own numbering.
- Preserve original wording exactly in the "text" field. Do not rewrite or standardize.
- Do not include non-recipe content (stories, tips, ads).
- Extract prep time, cook time, and total time with a two-tier strategy:
  1. If a time is EXPLICITLY stated in the content (e.g. "Prep time: 15 minutes"), return it with source "explicit".
  2. If a time is NOT explicitly stated, you MAY estimate it from recipe content — number of ingredients, cooking methods (simmering, baking, roasting), and any durations inside steps ("simmer 20 minutes"). If you estimate, return it with source "inferred". If you cannot reasonably estimate, return null and omit the source.
  3. Users see a review banner for inferred times and will correct or accept them — be honest about which is which.
  Use ISO 8601 duration strings ("PT15M", "PT1H30M", "PT2H").

Return ONLY valid JSON:
{
  "title": string | null,
  "servings": { "min": number, "max": number | null } | null,
  "ingredients": [{ "text": string, "isHeader": boolean, "amount": number | null, "amountMax": number | null, "unit": string | null, "name": string | null }],
  "steps": [{ "text": string, "isHeader": boolean }],
  "description": string | null,
  "metadata": {
    "prepTime": string | null,
    "prepTimeSource": "explicit" | "inferred" | null,
    "cookTime": string | null,
    "cookTimeSource": "explicit" | "inferred" | null,
    "totalTime": string | null,
    "totalTimeSource": "explicit" | "inferred" | null
  },
  "signals": {
    "descriptionDetected": boolean
  }
}`;

const RETRY_DELAY_MS = 2_000;

const SECTION_KEYWORDS = [
  "ingredients",
  "directions",
  "instructions",
  "steps",
  "method",
  "preparation",
  "serves",
  "servings",
];

/**
 * Smart truncation: instead of a blind slice, try to include
 * the recipe-relevant sections (ingredients / steps).
 */
export function smartTruncate(text: string, limit = 8000): string {
  if (text.length <= limit) return text;

  const lower = text.toLowerCase();
  let earliest = -1;
  for (const kw of SECTION_KEYWORDS) {
    const idx = lower.indexOf(kw);
    if (idx !== -1 && (earliest === -1 || idx < earliest)) {
      earliest = idx;
    }
  }

  if (earliest === -1) return text.slice(0, limit);

  const start = Math.max(0, earliest - 500);
  return text.slice(start, start + limit);
}

function isTransient(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const status = (err as Record<string, unknown>).status;
  if (typeof status === "number") {
    return status === 429 || (status >= 500 && status <= 599);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractDomain(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isValidAIResponse(parsed: unknown): parsed is RawExtractionResult {
  if (typeof parsed !== "object" || parsed === null) return false;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.ingredients) || obj.ingredients.length === 0) return false;
  if (!Array.isArray(obj.steps) || obj.steps.length === 0) return false;
  return true;
}

export async function parseWithAI(
  filteredText: string,
  sourceUrl?: string,
): Promise<RawExtractionResult | null> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const truncated = smartTruncate(filteredText);
  const domain = extractDomain(sourceUrl);
  const domainNote = domain ? ` (from ${domain})` : "";

  const attempt = async (): Promise<RawExtractionResult | null> => {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: `Extract the recipe${domainNote} from this content:\n\n${truncated}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
      temperature: 0.1,
    });

    const choice = response.choices[0];
    const content = choice?.message?.content;
    if (!content) {
      console.error(JSON.stringify({
        event: "ai_parse_empty_response",
        url: sourceUrl,
        finishReason: choice?.finish_reason,
      }));
      return null;
    }

    const parsed = JSON.parse(content);
    if (!isValidAIResponse(parsed)) {
      console.error(JSON.stringify({
        event: "ai_parse_validation_failed",
        url: sourceUrl,
        hasTitle: typeof (parsed as Record<string, unknown>)?.title === "string",
        ingredientCount: Array.isArray((parsed as Record<string, unknown>)?.ingredients) ? ((parsed as Record<string, unknown>).ingredients as unknown[]).length : 0,
        stepCount: Array.isArray((parsed as Record<string, unknown>)?.steps) ? ((parsed as Record<string, unknown>).steps as unknown[]).length : 0,
      }));
      return null;
    }
    return parsed;
  };

  try {
    return await attempt();
  } catch (err) {
    const errInfo = err instanceof Error ? { message: err.message, name: err.name } : {};
    const status = typeof err === "object" && err !== null ? (err as Record<string, unknown>).status : undefined;
    console.error(JSON.stringify({
      event: "ai_parse_error",
      url: sourceUrl,
      status,
      ...errInfo,
    }));
    if (isTransient(err)) {
      await sleep(RETRY_DELAY_MS);
      try {
        return await attempt();
      } catch (retryErr) {
        const retryInfo = retryErr instanceof Error ? { message: retryErr.message, name: retryErr.name } : {};
        console.error(JSON.stringify({ event: "ai_parse_retry_error", url: sourceUrl, ...retryInfo }));
        return null;
      }
    }
    return null;
  }
}
