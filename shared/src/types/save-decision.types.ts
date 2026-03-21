export type RecipeSaveState =
  | "SAVE_CLEAN"
  | "SAVE_USER_VERIFIED"
  | "NO_SAVE";

export interface SaveDecision {
  saveState: RecipeSaveState;
  isUserVerified: boolean;
  hasUnresolvedWarnings: boolean;
  allowed: boolean;
}
