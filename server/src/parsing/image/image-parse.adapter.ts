import OpenAI from "openai";
import type { SourcePage, ParsedRecipeCandidate } from "@recipejar/shared";
import {
  normalizeToCandidate,
  buildErrorCandidate,
  type RawExtractionResult,
} from "../normalize.js";

const SYSTEM_PROMPT = `You are a recipe extraction engine. Given one or more images of cookbook pages, extract the recipe content as structured JSON.

Rules:
- Extract the recipe title exactly as written.
- Extract the number of servings the recipe makes. If a range is given (e.g. "serves 6-8"), return min and max. If a single number (e.g. "serves 4"), return min only. If not visible, set servings to null.
- Extract every ingredient line as a separate entry. Preserve ingredient headers like "For the sauce:" with isHeader: true.
- For each non-header ingredient, decompose into structured fields: amount (numeric, e.g. 1.5), amountMax (numeric, only for ranges like "1-2"), unit (e.g. "cup", "tbsp", "oz"), and name (the ingredient itself, e.g. "all-purpose flour"). Keep the full original text in the "text" field.
- If an ingredient has no measurable amount (e.g. "salt and pepper to taste", "oil for frying"), set amount, amountMax, and unit to null.
- Extract every step/instruction as a separate entry. Preserve inline step notes.
- Mark sub-recipe section headers in steps (e.g. "To make the boba pearls:", "For the frosting:") with isHeader: true. These are not actual instructions.
- Strip original step numbers from the beginning of extracted step text. The app adds its own numbering.
- Preserve original wording. Only fix obvious OCR errors.
- Pay close attention to fractions in quantities (e.g. ⅓, ¼, ⅔, ¾). Distinguish carefully between visually similar fractions like ⅓ vs ½. When uncertain, zoom in mentally and prefer the fraction that matches the surrounding characters' style.
- Convert fractions to decimals in the amount field (e.g. ½ → 0.5, ⅓ → 0.333, ¼ → 0.25). Keep the original text with fractions in the "text" field.
- Do NOT rewrite, standardize units, or infer missing values in the "text" field.
- Do NOT include stories, ads, or non-recipe content.
- Cross-references like "See page 28" should be preserved as-is.
- If you detect a description paragraph before the recipe, include it separately.
- If multiple distinct recipes are visible, extract only the most prominent or primary recipe. Do not merge content from adjacent recipes.

For each ingredient, report signal hints:
- mergedWhenSeparable: true if the line contains multiple ingredients that should be separate entries
- missingName: true if quantity exists but no ingredient name
- missingQuantityOrUnit: true if the ingredient lacks a numeric quantity or unit
- minorOcrArtifact: true if there's a small OCR error that doesn't change meaning
- majorOcrArtifact: true if there's a significant OCR error that affects meaning

For each step, report signal hints:
- mergedWhenSeparable: true if the text contains multiple steps that should be separate
- minorOcrArtifact / majorOcrArtifact: same as ingredients

Also report top-level signal hints:
- structureSeparable: false if you cannot distinguish ingredients from steps
- lowConfidenceStructure: true if you're uncertain about the extraction structure
- poorImageQuality: true if image quality significantly hampers reading
- multiRecipeDetected: true if multiple distinct recipes are visible
- confirmedOmission: true if you can see content was cut off by image framing
- suspectedOmission: true if ingredient/step lists seem incomplete
- descriptionDetected: true if a description paragraph was found

Return ONLY valid JSON matching this schema:
{
  "title": string | null,
  "servings": { "min": number, "max": number | null } | null,
  "ingredients": [{ "text": string, "isHeader": boolean, "amount": number | null, "amountMax": number | null, "unit": string | null, "name": string | null }],
  "steps": [{ "text": string, "isHeader": boolean }],
  "description": string | null,
  "signals": {
    "structureSeparable": boolean,
    "lowConfidenceStructure": boolean,
    "poorImageQuality": boolean,
    "multiRecipeDetected": boolean,
    "confirmedOmission": boolean,
    "suspectedOmission": boolean,
    "descriptionDetected": boolean
  },
  "ingredientSignals": [{ "index": number, "text": string, "mergedWhenSeparable": boolean, "missingName": boolean, "missingQuantityOrUnit": boolean, "minorOcrArtifact": boolean, "majorOcrArtifact": boolean }],
  "stepSignals": [{ "index": number, "text": string, "mergedWhenSeparable": boolean, "minorOcrArtifact": boolean, "majorOcrArtifact": boolean }]
}`;

const SIMPLIFIED_PROMPT = `Extract the recipe from these images as JSON with fields: title (string|null), servings ({min: number, max: number|null}|null), ingredients (array of {text, isHeader, amount: number|null, amountMax: number|null, unit: string|null, name: string|null}), steps (array of {text, isHeader}), description (string|null). For each ingredient, "text" is the full original line; amount/unit/name decompose it for scaling. Convert fractions to decimals in amount. Mark sub-recipe section headers (e.g. "To make the sauce:") with isHeader: true. Strip original step numbers from text. Preserve original wording. Return ONLY valid JSON.`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
});

export async function parseImages(
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<ParsedRecipeCandidate> {

  const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
    imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "high" as const },
    }));

  try {
    const raw = await callVisionApi(openai, SYSTEM_PROMPT, imageContent);
    if (raw) {
      return normalizeToCandidate(raw, "image", sourcePages);
    }
    console.error("[image-parse] Primary prompt returned null result");
  } catch (err) {
    console.error("[image-parse] Primary prompt failed:", (err as Error).message);
  }

  try {
    const raw = await callVisionApi(openai, SIMPLIFIED_PROMPT, imageContent);
    if (raw) {
      return normalizeToCandidate(raw, "image", sourcePages);
    }
    console.error("[image-parse] Simplified prompt returned null result");
  } catch (err) {
    console.error("[image-parse] Simplified prompt failed:", (err as Error).message);
  }

  console.error("[image-parse] Both attempts failed, returning error candidate. Image URLs:", imageUrls);

  return buildErrorCandidate("image", sourcePages);
}

async function callVisionApi(
  openai: OpenAI,
  systemPrompt: string,
  imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[],
): Promise<RawExtractionResult | null> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the recipe from these images:" },
          ...imageContent,
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return null;

  return safeParseJson(content);
}

function safeParseJson(text: string): RawExtractionResult | null {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as RawExtractionResult;
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as RawExtractionResult;
      } catch {
        return null;
      }
    }
    return null;
  }
}
