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
