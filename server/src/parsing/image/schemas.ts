/**
 * OpenAI strict `response_format` JSON schemas for the split-call image parse.
 *
 * Strict mode has three hard rules:
 *   1. Every key under `properties` must appear in `required` — use
 *      `type: ["X", "null"]` unions to make a field effectively optional
 *      (the model still has to emit the key, just with a null value).
 *   2. `additionalProperties: false` on every object.
 *   3. No `$ref`, no `anyOf`/`oneOf` at top level, no `pattern` on strings.
 *
 * Call A (ingredients) owns: title, servings, ingredients[], metadata,
 *   parseSignals.* (except descriptionDetected), ingredientSignals.
 * Call B (steps) owns: steps[], stepSignals, description, and
 *   parseSignals.descriptionDetected — since it's the only leg that reads
 *   the description paragraph.
 *
 * Shapes are kept in lockstep with RawExtractionResult in
 * ../../parsing/normalize.ts. If you add/remove a field there, mirror it
 * here or normalizeToCandidate will silently drop data.
 */

export const ingredientsSchema = {
  name: "RecipeIngredients",
  strict: true,
  schema: {
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
        },
        required: [
          "structureSeparable",
          "lowConfidenceStructure",
          "poorImageQuality",
          "multiRecipeDetected",
          "confirmedOmission",
          "suspectedOmission",
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
    },
    required: [
      "title",
      "servings",
      "ingredients",
      "metadata",
      "signals",
      "ingredientSignals",
    ],
  },
} as const;

export const stepsSchema = {
  name: "RecipeSteps",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
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
      descriptionDetected: { type: "boolean" },
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
    required: ["steps", "description", "descriptionDetected", "stepSignals"],
  },
} as const;
