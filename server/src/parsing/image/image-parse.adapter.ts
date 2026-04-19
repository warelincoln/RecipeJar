import OpenAI from "openai";
import type { SourcePage, ParsedRecipeCandidate } from "@orzo/shared";
import {
  normalizeToCandidate,
  buildErrorCandidate,
  type RawExtractionResult,
} from "../normalize.js";
import { INGREDIENTS_PROMPT, STEPS_PROMPT } from "./prompts.js";
import { ingredientsSchema, stepsSchema } from "./schemas.js";

/*
 * IMAGE PARSE — SPLIT-CALL ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────
 *
 *                parseImages(imageUrls, sourcePages)
 *                              │
 *         base64-encoded URLs → imageContent[] (built once)
 *                              │
 *                ┌─────────────┴─────────────┐
 *                ▼                           ▼
 *        callIngredients              callSteps
 *          gpt-5.4                      gpt-4o
 *          detail:high                  detail:high
 *          max_tokens:1500              max_tokens:1200
 *          strict ingredientsSchema     strict stepsSchema
 *          owns: title, servings,       owns: steps, description,
 *            ingredients[], metadata,     stepSignals[],
 *            parseSignals.* (minus         parseSignals.descriptionDetected
 *            descriptionDetected),
 *            ingredientSignals
 *                │                           │
 *                │  Promise.allSettled       │
 *                └─────────────┬─────────────┘
 *                              ▼
 *                        merge + normalize
 *                              │
 *              ┌───────────────┼───────────────┐
 *              ▼               ▼               ▼
 *         A rejected      A ok, B rejected   both ok
 *         (or 0 ings)     partial recipe:    full recipe
 *              │          extractionError:
 *              ▼          "steps_failed"
 *      buildErrorCandidate       │
 *      (existing retake UI)      ▼
 *                         merged candidate with
 *                         empty steps + flag
 *                         (validation engine
 *                          emits STEPS_EXTRACTION_FAILED
 *                          at FLAG severity → warning
 *                          banner in PreviewEditView)
 *
 * WHY SPLIT:
 *   - Output token generation dominated latency in the monolithic call.
 *     Verbose cookbook pages produced 2-3K output tokens at ~50 tok/s,
 *     giving 30-60s on steps prose alone. Splitting lets us (a) run both
 *     calls in parallel so total = max(A, B) not A+B, and (b) swap the
 *     steps call to a faster model + concision prompt without risking
 *     fraction fidelity, which is the hard quality bar.
 *
 * WHY extractionError INSTEAD OF THROWING ON B FAILURE:
 *   - If A produced ingredients, we have a real partial recipe. Forcing
 *     the user to retake just to get steps is worse UX than showing the
 *     extracted ingredients with a "steps couldn't be read — edit manually
 *     or retake" banner. The adapter sets the flag; rules.steps.ts emits
 *     the FLAG; the existing warning-banner UI renders it.
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
});

type ImageContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

export async function parseImages(
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<ParsedRecipeCandidate> {
  // Build the imageContent array ONCE and share it across both calls.
  // Avoids duplicating N object allocations per parse for multi-page imports.
  const imageContent: ImageContentPart[] = imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));

  // allSettled so one leg's rejection doesn't cancel the other. We decide
  // total vs partial failure based on which legs settled which way.
  const [ingredientsResult, stepsResult] = await Promise.allSettled([
    callIngredients(imageContent),
    callSteps(imageContent),
  ]);

  // Call A (ingredients) is the hard floor. No recipe without ingredients.
  if (ingredientsResult.status === "rejected") {
    console.error(
      "[image-parse] Call A (ingredients) failed:",
      formatError(ingredientsResult.reason),
    );
    return buildErrorCandidate("image", sourcePages);
  }

  // Semantic gate: strict JSON schema guarantees structure, not correctness.
  // An empty ingredients array means the model produced valid JSON but the
  // recipe is useless. Mirror the URL path's isValidAIResponse check.
  if (ingredientsResult.value.ingredients.length === 0) {
    console.error("[image-parse] Call A returned zero ingredients");
    return buildErrorCandidate("image", sourcePages);
  }

  // Call B (steps) failed but Call A succeeded → partial success.
  // Surface title + ingredients with an extractionError flag that
  // rules.steps.ts will convert into a user-visible FLAG warning.
  if (stepsResult.status === "rejected") {
    console.error(
      "[image-parse] Call B (steps) failed, surfacing partial candidate:",
      formatError(stepsResult.reason),
    );
    const merged = mergeRaw(ingredientsResult.value, null);
    const candidate = normalizeToCandidate(merged, "image", sourcePages);
    return { ...candidate, extractionError: "steps_failed" };
  }

  // Happy path.
  const merged = mergeRaw(ingredientsResult.value, stepsResult.value);
  return normalizeToCandidate(merged, "image", sourcePages);
}

/** Result shape from Call A (ingredients). Mirrors the ingredientsSchema keys. */
interface IngredientsResult {
  title: string | null;
  servings: { min: number; max: number | null } | null;
  ingredients: NonNullable<RawExtractionResult["ingredients"]>;
  metadata: NonNullable<RawExtractionResult["metadata"]>;
  signals: {
    structureSeparable: boolean;
    lowConfidenceStructure: boolean;
    poorImageQuality: boolean;
    multiRecipeDetected: boolean;
    confirmedOmission: boolean;
    suspectedOmission: boolean;
  };
  ingredientSignals: NonNullable<RawExtractionResult["ingredientSignals"]>;
}

/** Result shape from Call B (steps). Mirrors the stepsSchema keys. */
interface StepsResult {
  steps: NonNullable<RawExtractionResult["steps"]>;
  description: string | null;
  descriptionDetected: boolean;
  stepSignals: NonNullable<RawExtractionResult["stepSignals"]>;
}

async function callIngredients(
  imageContent: ImageContentPart[],
): Promise<IngredientsResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    messages: [
      { role: "system", content: INGREDIENTS_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the recipe's ingredients, title, servings, metadata, and page-level signals from these images:",
          },
          ...imageContent,
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: ingredientsSchema,
    },
    max_completion_tokens: 1500,
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Call A returned empty content");
  }
  return JSON.parse(content) as IngredientsResult;
}

async function callSteps(
  imageContent: ImageContentPart[],
): Promise<StepsResult> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: STEPS_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the recipe's step instructions and description from these images:",
          },
          ...imageContent,
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: stepsSchema,
    },
    max_completion_tokens: 1200,
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Call B returned empty content");
  }
  return JSON.parse(content) as StepsResult;
}

/**
 * Combine Call A + Call B into a single RawExtractionResult that
 * normalizeToCandidate can process. Call B nullable so we can also build
 * a partial result for the Call-B-failed path.
 */
function mergeRaw(
  a: IngredientsResult,
  b: StepsResult | null,
): RawExtractionResult {
  return {
    // Call A owns these
    title: a.title,
    servings: a.servings,
    ingredients: a.ingredients,
    metadata: a.metadata,
    ingredientSignals: a.ingredientSignals,
    // Call B owns these; defaults when B failed so normalize still sees valid shape
    steps: b?.steps ?? [],
    description: b?.description ?? null,
    stepSignals: b?.stepSignals ?? [],
    // signals is mostly A's, but descriptionDetected is B's
    signals: {
      ...a.signals,
      descriptionDetected: b?.descriptionDetected ?? false,
    },
  };
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}
