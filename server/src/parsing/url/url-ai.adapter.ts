import OpenAI from "openai";
import type { RawExtractionResult } from "../normalize.js";

const PROMPT = `You are a recipe extraction engine. Given text content from a recipe webpage, extract the recipe as structured JSON.

Rules:
- Extract the recipe title, ingredients, steps, and optional description.
- Each ingredient should be a separate entry. Preserve headers like "For the sauce:" with isHeader: true.
- Each step should be a separate entry. Mark sub-recipe section headers (e.g. "To make the sauce:", "For the frosting:") with isHeader: true.
- Strip original step numbers from the beginning of step text. The app adds its own numbering.
- Preserve original wording exactly. Do not rewrite or standardize.
- Do not include non-recipe content (stories, tips, ads).

Return ONLY valid JSON:
{
  "title": string | null,
  "ingredients": [{ "text": string, "isHeader": boolean }],
  "steps": [{ "text": string, "isHeader": boolean }],
  "description": string | null,
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
