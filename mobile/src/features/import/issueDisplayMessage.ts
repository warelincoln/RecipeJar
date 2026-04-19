import type { ValidationIssue } from "@orzo/shared";

/**
 * User-facing copy for validation issues. Prefer this over `issue.message` so
 * drafts opened after a server copy change still show friendly text (persisted
 * validation JSON keeps whatever was returned at parse time).
 */
export function displayMessageForIssue(issue: ValidationIssue): string {
  const fp = issue.fieldPath ?? "";
  const isStep = fp.startsWith("steps");

  switch (issue.code) {
    case "TITLE_MISSING":
      return "We don't see a title yet—add one if it's missing.";
    case "INGREDIENTS_MISSING":
      return "We couldn't find ingredient lines—add a few so you can save.";
    case "STEPS_MISSING":
      return "No step instructions yet. Save ingredients-only or add steps below.";
    case "STEPS_EXTRACTION_FAILED":
      return "We couldn't read the step instructions from this photo. Edit them below, retake the page, or save ingredients-only.";
    case "INGREDIENT_MERGED":
      return "This line may combine two ingredients—split it if that looks right.";
    case "INGREDIENT_NAME_MISSING":
      return "We couldn't spot an ingredient name on this line—give it a quick look.";
    case "INGREDIENT_QTY_OR_UNIT_MISSING":
      return "This line might be missing an amount or unit—take a quick look.";
    case "STRUCTURE_NOT_SEPARABLE":
      return "We couldn't split ingredients and steps cleanly—edit them in manually to save.";
    case "LOW_CONFIDENCE_STRUCTURE":
      return "We're not quite confident in the layout—a clearer photo usually helps.";
    case "POOR_IMAGE_QUALITY":
      return "This shot's a bit hard to read—try another photo if you can.";
    case "RETAKE_LIMIT_REACHED":
      return "You've used the max retakes—tidy things up below, then save when you're ready.";
    case "CONFIRMED_OMISSION":
      return "Some of the recipe may not have made it off the page—fill in what's missing before saving.";
    case "SUSPECTED_OMISSION":
      return "We might be missing a bit of the recipe—peek at the photo and tweak if needed.";
    case "MINOR_OCR_ARTIFACT":
      return "Small scan glitch possible here—a quick glance is enough.";
    case "MAJOR_OCR_ARTIFACT":
      return isStep
        ? "The photo may have garbled this step—double-check the wording."
        : "The photo may have garbled this line—double-check the wording.";
    case "DESCRIPTION_DETECTED":
      return "There's a short blurb here—keep it or remove it if you don't want it.";
    case "MULTI_RECIPE_DETECTED":
      return "We may have picked up more than one recipe—make sure what's below matches what you want.";
    case "SERVINGS_MISSING":
      return "How many does this recipe serve? Add it now or skip — you can save either way.";
    default:
      return issue.message;
  }
}
