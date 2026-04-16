/**
 * Provenance of a recipe time field.
 *  - "explicit": the time was literally stated on the source (JSON-LD,
 *    Microdata, or a cookbook page that said "Prep: 15 min").
 *  - "inferred": the AI parser estimated the time because it wasn't stated.
 *    The mobile app shows a review banner and renders the time with a
 *    muted "~" prefix on the detail chip until the user confirms.
 *  - "user_confirmed": the user accepted or edited the value in the app.
 */
export type TimeSource = "explicit" | "inferred" | "user_confirmed";

export interface RecipeIngredientEntry {
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

export interface RecipeStepEntry {
  id: string;
  text: string;
  summaryText: string | null;
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

export interface RecipeCollectionRef {
  id: string;
  name: string;
}

export interface RecipeNote {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recipe {
  id: string;
  title: string;
  ingredients: RecipeIngredientEntry[];
  steps: RecipeStepEntry[];
  description?: string | null;
  descriptionSummary: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  baselineServings: number | null;
  prepTimeMinutes: number | null;
  prepTimeSource: TimeSource | null;
  cookTimeMinutes: number | null;
  cookTimeSource: TimeSource | null;
  totalTimeMinutes: number | null;
  totalTimeSource: TimeSource | null;

  rating: number | null;
  notes: RecipeNote[];

  sourceContext: RecipeSourceContext;
  collections: RecipeCollectionRef[];

  saveState: "SAVE_CLEAN" | "SAVE_USER_VERIFIED";
  isUserVerified: boolean;
  hasUnresolvedWarnings: boolean;

  createdAt: string;
  updatedAt: string;
}
