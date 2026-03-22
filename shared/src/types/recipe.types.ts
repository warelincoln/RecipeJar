export interface RecipeIngredientEntry {
  id: string;
  text: string;
  orderIndex: number;
  isHeader: boolean;
}

export interface RecipeStepEntry {
  id: string;
  text: string;
  orderIndex: number;
  isHeader: boolean;
}

export interface RecipeSourcePage {
  id: string;
  orderIndex: number;
  imageUri?: string | null;
  extractedText?: string | null;
}

export interface RecipeSourceContext {
  sourceType: "image" | "url";
  originalUrl?: string | null;
  pages: RecipeSourcePage[];
}

export interface Recipe {
  id: string;
  title: string;
  ingredients: RecipeIngredientEntry[];
  steps: RecipeStepEntry[];
  description?: string | null;

  sourceContext: RecipeSourceContext;

  saveState: "SAVE_CLEAN" | "SAVE_USER_VERIFIED";
  isUserVerified: boolean;
  hasUnresolvedWarnings: boolean;

  createdAt: string;
  updatedAt: string;
}
