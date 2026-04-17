import { decode } from "he";
import { v4 as uuidv4 } from "uuid";
import type {
  ParsedRecipeCandidate,
  ParsedIngredientEntry,
  ParsedStepEntry,
  IngredientSignal,
  StepSignal,
  SourcePage,
} from "@orzo/shared";

export interface RecipeMetadata {
  yield?: string;
  prepTime?: string;
  /**
   * "explicit" when the time was literally stated on the source, "inferred"
   * when the parser estimated it. Absent when no value was extracted.
   */
  prepTimeSource?: "explicit" | "inferred";
  cookTime?: string;
  cookTimeSource?: "explicit" | "inferred";
  totalTime?: string;
  totalTimeSource?: "explicit" | "inferred";
  imageUrl?: string;
}

export interface RawExtractionResult {
  title?: string | null;
  ingredients?: RawIngredient[];
  steps?: RawStep[];
  description?: string | null;

  servings?: { min?: number; max?: number | null } | null;

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

  metadata?: RecipeMetadata;
}

export interface RawIngredient {
  text?: string;
  isHeader?: boolean;
  amount?: number | null;
  amountMax?: number | null;
  unit?: string | null;
  name?: string | null;
}

interface RawStep {
  text?: string;
  isHeader?: boolean;
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

/**
 * JSON-LD and scraped HTML often carry HTML entities (e.g. &amp; for &).
 * Decode once so stored recipes show plain text in the app.
 */
export function decodeHtmlEntities(value: string): string {
  if (typeof value !== "string" || value.length === 0) return value;
  return decode(value);
}

export function normalizeToCandidate(
  raw: RawExtractionResult,
  sourceType: "image" | "url",
  sourcePages: SourcePage[],
): ParsedRecipeCandidate {
  const ingredients: ParsedIngredientEntry[] = (raw.ingredients ?? []).map(
    (ing, i) => {
      const decodedText =
        typeof ing.text === "string" ? decodeHtmlEntities(ing.text) : "";
      const isHeader = ing.isHeader === true;
      const amount = typeof ing.amount === "number" ? ing.amount : null;
      const amountMax = typeof ing.amountMax === "number" ? ing.amountMax : null;
      const unit = typeof ing.unit === "string" && ing.unit.length > 0 ? ing.unit : null;
      const name = typeof ing.name === "string" && ing.name.length > 0 ? decodeHtmlEntities(ing.name) : null;
      const isScalable = !isHeader && amount !== null;

      return {
        id: uuidv4(),
        text: decodedText,
        orderIndex: i,
        isHeader,
        amount,
        amountMax,
        unit,
        name,
        raw: decodedText,
        isScalable,
      };
    },
  );

  const steps: ParsedStepEntry[] = (raw.steps ?? []).map((step, i) => ({
    id: uuidv4(),
    text:
      typeof step.text === "string" ? decodeHtmlEntities(step.text) : "",
    orderIndex: i,
    isHeader: step.isHeader === true,
  }));

  const signals = raw.signals ?? {};

  const ingredientSignals: IngredientSignal[] = (
    raw.ingredientSignals ?? []
  ).map((sig, i) => ({
    index: typeof sig.index === "number" ? sig.index : i,
    text:
      typeof sig.text === "string" ? decodeHtmlEntities(sig.text) : "",
    mergedWhenSeparable: sig.mergedWhenSeparable === true,
    missingName: sig.missingName === true,
    missingQuantityOrUnit: sig.missingQuantityOrUnit === true,
    minorOcrArtifact: sig.minorOcrArtifact === true,
    majorOcrArtifact: sig.majorOcrArtifact === true,
  }));

  const stepSignals: StepSignal[] = (raw.stepSignals ?? []).map((sig, i) => ({
    index: typeof sig.index === "number" ? sig.index : i,
    text:
      typeof sig.text === "string" ? decodeHtmlEntities(sig.text) : "",
    mergedWhenSeparable: sig.mergedWhenSeparable === true,
    minorOcrArtifact: sig.minorOcrArtifact === true,
    majorOcrArtifact: sig.majorOcrArtifact === true,
  }));

  const titleDecoded =
    typeof raw.title === "string" ? decodeHtmlEntities(raw.title) : null;
  const descriptionDecoded =
    typeof raw.description === "string"
      ? decodeHtmlEntities(raw.description)
      : null;

  const hasMissingContent =
    ingredients.length === 0 || steps.length === 0 || !titleDecoded;

  const rawServings = raw.servings;
  const servings =
    rawServings && typeof rawServings.min === "number" && rawServings.min > 0
      ? rawServings.min
      : null;

  return {
    title: titleDecoded,
    ingredients,
    steps,
    description: descriptionDecoded,
    servings,
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
    metadata: raw.metadata,
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
    servings: null,
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
    extractionMethod: "error",
  };
}
