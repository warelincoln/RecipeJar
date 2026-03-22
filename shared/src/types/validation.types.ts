export type ValidationSeverity =
  | "PASS"
  | "FLAG"
  | "RETAKE"
  | "BLOCK";

export type ValidationIssueCode =
  | "TITLE_MISSING"
  | "INGREDIENTS_MISSING"
  | "STEPS_MISSING"
  | "INGREDIENT_MERGED"
  | "INGREDIENT_NAME_MISSING"
  | "INGREDIENT_QTY_OR_UNIT_MISSING"
  | "STRUCTURE_NOT_SEPARABLE"
  | "LOW_CONFIDENCE_STRUCTURE"
  | "POOR_IMAGE_QUALITY"
  | "RETAKE_LIMIT_REACHED"
  | "CONFIRMED_OMISSION"
  | "SUSPECTED_OMISSION"
  | "MINOR_OCR_ARTIFACT"
  | "MAJOR_OCR_ARTIFACT"
  | "DESCRIPTION_DETECTED"
  | "MULTI_RECIPE_DETECTED";

export interface ValidationIssue {
  issueId: string;
  code: ValidationIssueCode;
  severity: ValidationSeverity;
  message: string;
  fieldPath?: string;
  userDismissible: boolean;
  userResolvable: boolean;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  saveState: "SAVE_CLEAN" | "NO_SAVE";
  hasWarnings: boolean;
  hasBlockingIssues: boolean;
  requiresRetake: boolean;
}
