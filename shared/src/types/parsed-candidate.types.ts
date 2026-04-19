import type { IngredientSignal, StepSignal, SourcePage } from "./signal.types.js";

export interface ParsedIngredientEntry {
  id: string;
  text: string;
  orderIndex: number;
  isHeader: boolean;
  amount: number | null;
  amountMax: number | null;
  unit: string | null;
  name: string | null;
  raw: string | null;
  isScalable: boolean;
}

export interface ParsedStepEntry {
  id: string;
  text: string;
  orderIndex: number;
  isHeader: boolean;
}

export interface ParsedRecipeCandidate {
  title: string | null;
  ingredients: ParsedIngredientEntry[];
  steps: ParsedStepEntry[];
  description?: string | null;
  servings: number | null;

  sourceType: "image" | "url";
  sourcePages: SourcePage[];

  parseSignals: {
    structureSeparable: boolean;
    lowConfidenceStructure: boolean;
    poorImageQuality: boolean;
    multiRecipeDetected: boolean;
    confirmedOmission: boolean;
    suspectedOmission: boolean;
    descriptionDetected: boolean;
  };

  ingredientSignals: IngredientSignal[];
  stepSignals: StepSignal[];

  extractionMethod?: "json-ld" | "microdata" | "dom-ai" | "error";

  /**
   * Set by the image parse adapter when one leg of the split-call
   * architecture fails but the other produced usable data. Today only
   * "steps_failed" is emitted — Call A (ingredients/title/servings/metadata)
   * succeeded but Call B (steps/description) failed or returned invalid JSON.
   * The validation engine reads this field and emits STEPS_EXTRACTION_FAILED
   * as a FLAG so the mobile client can render a "couldn't read the steps"
   * warning banner in the preview/edit view and let the user edit manually.
   *
   * Kept optional so existing fixtures and the URL parse path don't need
   * to set it. Ingredients-leg failure is still a total failure (no recipe
   * without ingredients), so "ingredients_failed" is reserved for future use
   * but not surfaced today.
   */
  extractionError?: "steps_failed" | "ingredients_failed" | null;

  metadata?: {
    yield?: string;
    prepTime?: string;
    /** "explicit" if literally stated on the source, "inferred" if the
     *  parser estimated the time when it wasn't stated. Absent if no
     *  value was extracted or inferred. */
    prepTimeSource?: "explicit" | "inferred";
    cookTime?: string;
    cookTimeSource?: "explicit" | "inferred";
    totalTime?: string;
    totalTimeSource?: "explicit" | "inferred";
    imageUrl?: string;
  };
}
