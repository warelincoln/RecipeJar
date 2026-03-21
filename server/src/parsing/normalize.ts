import { v4 as uuidv4 } from "uuid";
import type {
  ParsedRecipeCandidate,
  ParsedIngredientEntry,
  ParsedStepEntry,
  IngredientSignal,
  StepSignal,
  SourcePage,
} from "@recipejar/shared";

export interface RawExtractionResult {
  title?: string | null;
  ingredients?: RawIngredient[];
  steps?: RawStep[];
  description?: string | null;

  signals?: {
    structureSeparable?: boolean;
    lowConfidenceStructure?: boolean;
    poorImageQuality?: boolean;
    multiRecipeDetected?: boolean;
    confirmedOmission?: boolean;
    suspectedOmission?: boolean;
    descriptionDetected?: boolean;
  };

  ingredientSignals?: RawIngredientSignal[];
  stepSignals?: RawStepSignal[];
}

interface RawIngredient {
  text?: string;
  isHeader?: boolean;
}

interface RawStep {
  text?: string;
}

interface RawIngredientSignal {
  index?: number;
  text?: string;
  mergedWhenSeparable?: boolean;
  missingName?: boolean;
  missingQuantityOrUnit?: boolean;
  minorOcrArtifact?: boolean;
  majorOcrArtifact?: boolean;
}

interface RawStepSignal {
  index?: number;
  text?: string;
  mergedWhenSeparable?: boolean;
  minorOcrArtifact?: boolean;
  majorOcrArtifact?: boolean;
}

export function normalizeToCandidate(
  raw: RawExtractionResult,
  sourceType: "image" | "url",
  sourcePages: SourcePage[],
): ParsedRecipeCandidate {
  const ingredients: ParsedIngredientEntry[] = (raw.ingredients ?? []).map(
    (ing, i) => ({
      id: uuidv4(),
      text: typeof ing.text === "string" ? ing.text : "",
      orderIndex: i,
      isHeader: ing.isHeader === true,
    }),
  );

  const steps: ParsedStepEntry[] = (raw.steps ?? []).map((step, i) => ({
    id: uuidv4(),
    text: typeof step.text === "string" ? step.text : "",
    orderIndex: i,
  }));

  const signals = raw.signals ?? {};

  const ingredientSignals: IngredientSignal[] = (
    raw.ingredientSignals ?? []
  ).map((sig, i) => ({
    index: typeof sig.index === "number" ? sig.index : i,
    text: typeof sig.text === "string" ? sig.text : "",
    mergedWhenSeparable: sig.mergedWhenSeparable === true,
    missingName: sig.missingName === true,
    missingQuantityOrUnit: sig.missingQuantityOrUnit === true,
    minorOcrArtifact: sig.minorOcrArtifact === true,
    majorOcrArtifact: sig.majorOcrArtifact === true,
  }));

  const stepSignals: StepSignal[] = (raw.stepSignals ?? []).map((sig, i) => ({
    index: typeof sig.index === "number" ? sig.index : i,
    text: typeof sig.text === "string" ? sig.text : "",
    mergedWhenSeparable: sig.mergedWhenSeparable === true,
    minorOcrArtifact: sig.minorOcrArtifact === true,
    majorOcrArtifact: sig.majorOcrArtifact === true,
  }));

  const hasMissingContent =
    ingredients.length === 0 || steps.length === 0 || !raw.title;

  return {
    title: typeof raw.title === "string" ? raw.title : null,
    ingredients,
    steps,
    description:
      typeof raw.description === "string" ? raw.description : null,
    sourceType,
    sourcePages,
    parseSignals: {
      structureSeparable: signals.structureSeparable !== false,
      lowConfidenceStructure: signals.lowConfidenceStructure === true,
      poorImageQuality: signals.poorImageQuality === true,
      multiRecipeDetected: signals.multiRecipeDetected === true,
      confirmedOmission: signals.confirmedOmission === true,
      suspectedOmission:
        signals.suspectedOmission === true || hasMissingContent,
      descriptionDetected: signals.descriptionDetected === true,
    },
    ingredientSignals,
    stepSignals,
  };
}

/**
 * Builds a fully-errored candidate for when extraction completely fails.
 * The validation engine will produce RETAKE or BLOCK from these signals.
 */
export function buildErrorCandidate(
  sourceType: "image" | "url",
  sourcePages: SourcePage[],
): ParsedRecipeCandidate {
  return {
    title: null,
    ingredients: [],
    steps: [],
    description: null,
    sourceType,
    sourcePages,
    parseSignals: {
      structureSeparable: false,
      lowConfidenceStructure: true,
      poorImageQuality: sourceType === "image",
      multiRecipeDetected: false,
      confirmedOmission: false,
      suspectedOmission: true,
      descriptionDetected: false,
    },
    ingredientSignals: [],
    stepSignals: [],
  };
}
