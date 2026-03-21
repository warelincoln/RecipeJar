import OpenAI from "openai";
import type { RawExtractionResult } from "../normalize.js";

const PROMPT = `You are a recipe extraction engine. Given text content from a recipe webpage, extract the recipe as structured JSON.

Rules:
- Extract the recipe title, ingredients, steps, and optional description.
- Each ingredient should be a separate entry. Preserve headers like "For the sauce:" with isHeader: true.
- Each step should be a separate entry.
- Preserve original wording exactly. Do not rewrite or standardize.
- Do not include non-recipe content (stories, tips, ads).

Return ONLY valid JSON:
{
  "title": string | null,
  "ingredients": [{ "text": string, "isHeader": boolean }],
  "steps": [{ "text": string }],
  "description": string | null,
  "signals": {
    "structureSeparable": boolean,
    "multiRecipeDetected": boolean,
    "suspectedOmission": boolean,
    "descriptionDetected": boolean
  },
  "ingredientSignals": [{ "index": number, "text": string, "mergedWhenSeparable": boolean, "missingName": boolean, "missingQuantityOrUnit": boolean, "minorOcrArtifact": boolean, "majorOcrArtifact": boolean }],
  "stepSignals": [{ "index": number, "text": string, "mergedWhenSeparable": boolean, "minorOcrArtifact": boolean, "majorOcrArtifact": boolean }]
}`;

export async function parseWithAI(
  filteredText: string,
): Promise<RawExtractionResult | null> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: `Extract the recipe from this content:\n\n${filteredText.slice(0, 8000)}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4096,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as RawExtractionResult;
  } catch {
    return null;
  }
}
