import type { ParsedRecipeCandidate } from "./parsed-candidate.types.js";
import type { ValidationIssueCode } from "./validation.types.js";
import type { ValidationResult } from "./validation.types.js";

export type DraftStatus =
  | "CAPTURE_IN_PROGRESS"
  | "READY_FOR_PARSE"
  | "PARSING"
  | "PARSED"
  | "NEEDS_RETAKE"
  | "IN_GUIDED_CORRECTION"
  | "READY_TO_SAVE"
  | "SAVED";

export interface DraftInputPage {
  id: string;
  orderIndex: number;
  imageUri: string;
  retakeCount: number;
}

export interface DraftInputState {
  sourceType: "image" | "url";
  pages: DraftInputPage[];
  url?: string | null;
}

export interface EditableIngredientEntry {
  id: string;
  text: string;
  orderIndex: number;
  isHeader: boolean;
}

export interface EditableStepEntry {
  id: string;
  text: string;
  orderIndex: number;
}

export interface EditedRecipeCandidate {
  title: string;
  ingredients: EditableIngredientEntry[];
  steps: EditableStepEntry[];
  description?: string | null;
}

export interface DraftWarningState {
  issueId: string;
  code: ValidationIssueCode;
  fieldPath?: string;
  dismissed: boolean;
  dismissedAt?: string | null;
}

export interface RecipeDraft {
  id: string;
  status: DraftStatus;
  sourceType: "image" | "url";
  originalUrl?: string | null;

  input: DraftInputState;
  parsedCandidate: ParsedRecipeCandidate | null;
  editedCandidate: EditedRecipeCandidate | null;
  validationResult: ValidationResult | null;
  warningStates: DraftWarningState[];

  createdAt: string;
  updatedAt: string;
}
