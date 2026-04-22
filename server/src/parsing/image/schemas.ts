/**
 * OpenAI strict `response_format` JSON schema for the single-pass image
 * parse. See ./prompts.ts for the history of the split-call architecture
 * this replaced on 2026-04-21.
 *
 * Strict mode has three hard rules:
 *   1. Every key under `properties` must appear in `required` — use
 *      `type: ["X", "null"]` unions to make a field effectively optional
 *      (the model still has to emit the key, just with a null value).
 *   2. `additionalProperties: false` on every object.
 *   3. No `$ref`, no `anyOf`/`oneOf` at top level, no `pattern` on strings.
 *
 * Shape is kept in lockstep with RawExtractionResult in
 * ../../parsing/normalize.ts. If you add/remove a field there, mirror it
 * here or normalizeToCandidate will silently drop data.
 */

const RECIPE_SCHEMA_OBJECT = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: ["string", "null"] },
    servings: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        min: { type: "number" },
        max: { type: ["number", "null"] },
      },
      required: ["min", "max"],
    },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          isHeader: { type: "boolean" },
          amount: { type: ["number", "null"] },
          amountMax: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          name: { type: ["string", "null"] },
        },
        required: ["text", "isHeader", "amount", "amountMax", "unit", "name"],
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          isHeader: { type: "boolean" },
        },
        required: ["text", "isHeader"],
      },
    },
    description: { type: ["string", "null"] },
    metadata: {
      type: "object",
      additionalProperties: false,
      properties: {
        prepTime: { type: ["string", "null"] },
        prepTimeSource: {
          type: ["string", "null"],
          enum: ["explicit", "inferred", null],
        },
        cookTime: { type: ["string", "null"] },
        cookTimeSource: {
          type: ["string", "null"],
          enum: ["explicit", "inferred", null],
        },
        totalTime: { type: ["string", "null"] },
        totalTimeSource: {
          type: ["string", "null"],
          enum: ["explicit", "inferred", null],
        },
      },
      required: [
        "prepTime",
        "prepTimeSource",
        "cookTime",
        "cookTimeSource",
        "totalTime",
        "totalTimeSource",
      ],
    },
    signals: {
      type: "object",
      additionalProperties: false,
      properties: {
        structureSeparable: { type: "boolean" },
        lowConfidenceStructure: { type: "boolean" },
        poorImageQuality: { type: "boolean" },
        multiRecipeDetected: { type: "boolean" },
        confirmedOmission: { type: "boolean" },
        suspectedOmission: { type: "boolean" },
        descriptionDetected: { type: "boolean" },
      },
      required: [
        "structureSeparable",
        "lowConfidenceStructure",
        "poorImageQuality",
        "multiRecipeDetected",
        "confirmedOmission",
        "suspectedOmission",
        "descriptionDetected",
      ],
    },
    ingredientSignals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "number" },
          text: { type: "string" },
          mergedWhenSeparable: { type: "boolean" },
          missingName: { type: "boolean" },
          missingQuantityOrUnit: { type: "boolean" },
          minorOcrArtifact: { type: "boolean" },
          majorOcrArtifact: { type: "boolean" },
        },
        required: [
          "index",
          "text",
          "mergedWhenSeparable",
          "missingName",
          "missingQuantityOrUnit",
          "minorOcrArtifact",
          "majorOcrArtifact",
        ],
      },
    },
    stepSignals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "number" },
          text: { type: "string" },
          mergedWhenSeparable: { type: "boolean" },
          minorOcrArtifact: { type: "boolean" },
          majorOcrArtifact: { type: "boolean" },
        },
        required: [
          "index",
          "text",
          "mergedWhenSeparable",
          "minorOcrArtifact",
          "majorOcrArtifact",
        ],
      },
    },
  },
  required: [
    "title",
    "servings",
    "ingredients",
    "steps",
    "description",
    "metadata",
    "signals",
    "ingredientSignals",
    "stepSignals",
  ],
} as const;

/** OpenAI strict-mode response_format wrapper. */
export const recipeSchema = {
  name: "Recipe",
  strict: true,
  schema: RECIPE_SCHEMA_OBJECT,
} as const;

/**
 * Shape returned by the single monolithic call. Mirrors the keys under
 * `properties` in recipeSchema. Downstream `normalizeToCandidate`
 * consumes it via the matching fields on RawExtractionResult.
 */
export interface RecipeExtractionResult {
  title: string | null;
  servings: { min: number; max: number | null } | null;
  ingredients: Array<{
    text: string;
    isHeader: boolean;
    amount: number | null;
    amountMax: number | null;
    unit: string | null;
    name: string | null;
  }>;
  steps: Array<{ text: string; isHeader: boolean }>;
  description: string | null;
  metadata: {
    prepTime: string | null;
    prepTimeSource: "explicit" | "inferred" | null;
    cookTime: string | null;
    cookTimeSource: "explicit" | "inferred" | null;
    totalTime: string | null;
    totalTimeSource: "explicit" | "inferred" | null;
  };
  signals: {
    structureSeparable: boolean;
    lowConfidenceStructure: boolean;
    poorImageQuality: boolean;
    multiRecipeDetected: boolean;
    confirmedOmission: boolean;
    suspectedOmission: boolean;
    descriptionDetected: boolean;
  };
  ingredientSignals: Array<{
    index: number;
    text: string;
    mergedWhenSeparable: boolean;
    missingName: boolean;
    missingQuantityOrUnit: boolean;
    minorOcrArtifact: boolean;
    majorOcrArtifact: boolean;
  }>;
  stepSignals: Array<{
    index: number;
    text: string;
    mergedWhenSeparable: boolean;
    minorOcrArtifact: boolean;
    majorOcrArtifact: boolean;
  }>;
}

/**
 * Convert the monolithic response into a RawExtractionResult that
 * normalizeToCandidate can consume. Coerces null → undefined on metadata
 * fields because RecipeMetadata in ../../normalize.ts uses `field?: T`
 * (undefined) while the strict-JSON schema emits nulls.
 */
export function recipeToRawExtraction(
  r: RecipeExtractionResult,
): import("../normalize.js").RawExtractionResult {
  const metadata = {
    yield: undefined,
    prepTime: r.metadata.prepTime ?? undefined,
    prepTimeSource: r.metadata.prepTimeSource ?? undefined,
    cookTime: r.metadata.cookTime ?? undefined,
    cookTimeSource: r.metadata.cookTimeSource ?? undefined,
    totalTime: r.metadata.totalTime ?? undefined,
    totalTimeSource: r.metadata.totalTimeSource ?? undefined,
    imageUrl: undefined,
  };
  return {
    title: r.title,
    servings: r.servings,
    ingredients: r.ingredients,
    steps: r.steps,
    description: r.description,
    metadata,
    signals: r.signals,
    ingredientSignals: r.ingredientSignals,
    stepSignals: r.stepSignals,
  };
}
