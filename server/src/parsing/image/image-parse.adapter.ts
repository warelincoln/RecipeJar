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
- Extract every ingredient line as a separate entry. Preserve ingredient headers like "For the sauce:" with isHeader: true.
- Extract every step/instruction as a separate entry. Preserve inline step notes.
- Mark sub-recipe section headers in steps (e.g. "To make the boba pearls:", "For the frosting:") with isHeader: true. These are not actual instructions.
- Strip original step numbers from the beginning of extracted step text. The app adds its own numbering.
- Preserve original wording. Only fix obvious OCR errors.
- Do NOT rewrite, standardize units, or infer missing values.
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
  "ingredients": [{ "text": string, "isHeader": boolean }],
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

const SIMPLIFIED_PROMPT = `Extract the recipe from these images as JSON with fields: title (string|null), ingredients (array of {text, isHeader}), steps (array of {text, isHeader}), description (string|null). Mark sub-recipe section headers (e.g. "To make the sauce:") with isHeader: true. Strip original step numbers from text. Preserve original wording. Return ONLY valid JSON.`;

export async function parseImages(
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<ParsedRecipeCandidate> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
