/**
 * Merged JSON schema for the single-call monolithic candidate arms.
 *
 * Union of:
 *   - ingredientsSchema (title, servings, ingredients[], metadata,
 *     signals, ingredientSignals[] — see ../schemas.ts)
 *   - stepsSchema (steps[], description, descriptionDetected, stepSignals[])
 *
 * Kept OpenAI-strict-mode compatible (every property listed in required,
 * additionalProperties: false everywhere, `type: ["X", "null"]` unions
 * for optional fields). Anthropic's JSON mode is less strict but accepts
 * the same shape — the adapter converts before passing to the API.
 *
 * Shape mirrors RawExtractionResult in ../../normalize.ts. Add/remove
 * here and there in lockstep or normalizeToCandidate will drop data.
 */

export const MONOLITHIC_SCHEMA_NAME = "Recipe";

/**
 * The inner `schema` object, usable both for OpenAI's strict json_schema
 * response_format AND as-is for Anthropic (which accepts a JSON-schema
 * validation in the system-prompt-as-contract pattern). Exposed without
 * the outer OpenAI wrapper so each arm can wrap it as needed.
 */
export const MONOLITHIC_SCHEMA = {
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

/**
 * OpenAI strict-mode wrapper — pass as `response_format.json_schema`.
 */
export const monolithicSchemaForOpenAI = {
  name: MONOLITHIC_SCHEMA_NAME,
  strict: true,
  schema: MONOLITHIC_SCHEMA,
} as const;

/**
 * Shape returned by the monolithic call. Mirrors RawExtractionResult
 * union keys; normalizeToCandidate consumes it directly.
 */
export interface MonolithicResult {
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
 * normalizeToCandidate can consume. Split out so each arm (OpenAI or
 * Anthropic) can share the same normalizer plumbing without
 * re-implementing the shape wiring.
 */
export function monolithicToRawExtraction(
  m: MonolithicResult,
): import("../../normalize.js").RawExtractionResult {
  // RecipeMetadata in ../../normalize.ts uses `field?: string` (undefined)
  // while the strict-JSON schema emits nulls. Coerce null → undefined so
  // normalizeToCandidate's `typeof ... === "string"` guards don't have to
  // change behavior across arms.
  const metadata = {
    yield: undefined,
    prepTime: m.metadata.prepTime ?? undefined,
    prepTimeSource: m.metadata.prepTimeSource ?? undefined,
    cookTime: m.metadata.cookTime ?? undefined,
    cookTimeSource: m.metadata.cookTimeSource ?? undefined,
    totalTime: m.metadata.totalTime ?? undefined,
    totalTimeSource: m.metadata.totalTimeSource ?? undefined,
    imageUrl: undefined,
  };
  return {
    title: m.title,
    servings: m.servings,
    ingredients: m.ingredients,
    steps: m.steps,
    description: m.description,
    metadata,
    signals: m.signals,
    ingredientSignals: m.ingredientSignals,
    stepSignals: m.stepSignals,
  };
}
