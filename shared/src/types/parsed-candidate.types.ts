import type { IngredientSignal, StepSignal, SourcePage } from "./signal.types.js";

export interface ParsedIngredientEntry {
  id: string;
  text: string;
  orderIndex: number;
  isHeader: boolean;
}

export interface ParsedStepEntry {
  id: string;
  text: string;
  orderIndex: number;
}

export interface ParsedRecipeCandidate {
  title: string | null;
  ingredients: ParsedIngredientEntry[];
  steps: ParsedStepEntry[];
  description?: string | null;

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
}
