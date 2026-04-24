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
    /**
     * Set when structured extraction returned only 1–2 HowToSteps and at least
     * one step exceeds ~400 characters — i.e. the author concatenated the
     * whole method into one or two big paragraphs (BigOven, TasteOfHome,
     * southernliving pattern). Emission-only today; future mobile UI may
     * offer a manual step-split affordance keyed on this flag.
     */
    stepLongPrimaryText?: boolean;
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
  extractionError?:
    | "steps_failed"
    | "ingredients_failed"
    | "url_bot_blocked"
    | null;

  /**
   * Set when the URL parse cascade failed on the user-supplied URL but the
   * server followed a recipe link on that page (Layer 1 canonical short-circuit,
   * or Layer 2 scored link-fallback in `parseUrlFromHtml`) and successfully
   * parsed the resolved URL. This field holds the ORIGINAL URL the user
   * pasted. Mobile uses it as a boolean signal to render a disclosure banner
   * on the import-review screen: "we couldn't find a recipe on that page, but
   * we followed a link to {host} — does this look right?". The `{host}` is
   * extracted from `fallbackResolvedUrl` below.
   */
  fallbackFromUrl?: string | null;

  /**
   * Set in tandem with `fallbackFromUrl`: the URL the server actually parsed
   * after the fallback cascade picked a recipe link (canonical or scored).
   * Mobile displays the host part of this in the fallback banner so the user
   * can see the domain they're about to save. The server also persists this
   * onto the drafts row (`resolved_url` column) so retries of `POST
   * /drafts/:id/parse` skip link discovery.
   */
  fallbackResolvedUrl?: string | null;

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
