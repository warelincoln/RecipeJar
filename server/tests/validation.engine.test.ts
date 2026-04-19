import { describe, it, expect } from "vitest";
import { validateRecipe } from "../src/domain/validation/validation.engine.js";
import type { ParsedRecipeCandidate } from "@orzo/shared";

function makeCandidate(
  overrides: Partial<ParsedRecipeCandidate> = {},
): ParsedRecipeCandidate {
  return {
    title: "Test Recipe",
    ingredients: [
      { id: "i1", text: "1 cup flour", orderIndex: 0, isHeader: false, amount: 1, amountMax: null, unit: "cup", name: "flour", raw: "1 cup flour", isScalable: true },
    ],
    steps: [
      { id: "s1", text: "Mix ingredients.", orderIndex: 0, isHeader: false },
    ],
    servings: 4,
    description: null,
    sourceType: "image",
    sourcePages: [
      {
        id: "p1",
        orderIndex: 0,
        sourceType: "image",
        retakeCount: 0,
        imageUri: "test.jpg",
        extractedText: "extracted",
      },
    ],
    parseSignals: {
      structureSeparable: true,
      lowConfidenceStructure: false,
      poorImageQuality: false,
      multiRecipeDetected: false,
      confirmedOmission: false,
      suspectedOmission: false,
      descriptionDetected: false,
    },
    ingredientSignals: [
      {
        index: 0,
        text: "1 cup flour",
        mergedWhenSeparable: false,
        missingName: false,
        missingQuantityOrUnit: false,
        minorOcrArtifact: false,
        majorOcrArtifact: false,
      },
    ],
    stepSignals: [
      {
        index: 0,
        text: "Mix ingredients.",
        minorOcrArtifact: false,
        majorOcrArtifact: false,
      },
    ],
    ...overrides,
  };
}

describe("validateRecipe", () => {
  it("clean candidate produces SAVE_CLEAN with no issues", () => {
    const result = validateRecipe(makeCandidate());
    expect(result.saveState).toBe("SAVE_CLEAN");
    expect(result.hasBlockingIssues).toBe(false);
    expect(result.hasWarnings).toBe(false);
    expect(result.requiresRetake).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  it("missing title -> FLAG", () => {
    const result = validateRecipe(makeCandidate({ title: null }));
    const issue = result.issues.find((i) => i.code === "TITLE_MISSING");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
    expect(result.saveState).toBe("SAVE_CLEAN");
  });

  it("empty title -> FLAG", () => {
    const result = validateRecipe(makeCandidate({ title: "   " }));
    const issue = result.issues.find((i) => i.code === "TITLE_MISSING");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
  });

  it("missing ingredients -> BLOCK", () => {
    const result = validateRecipe(
      makeCandidate({ ingredients: [], ingredientSignals: [] }),
    );
    const issue = result.issues.find((i) => i.code === "INGREDIENTS_MISSING");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("BLOCK");
    expect(result.saveState).toBe("NO_SAVE");
  });

  it("only header ingredients count as missing -> BLOCK", () => {
    const result = validateRecipe(
      makeCandidate({
        ingredients: [
          { id: "h1", text: "For the sauce:", orderIndex: 0, isHeader: true, amount: null, amountMax: null, unit: null, name: null, raw: "For the sauce:", isScalable: false },
        ],
        ingredientSignals: [],
      }),
    );
    const issue = result.issues.find((i) => i.code === "INGREDIENTS_MISSING");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("BLOCK");
  });

  // Ingredient-only recipes are allowed — users often screenshot just the
  // ingredient list and want to save that. STEPS_MISSING downgraded from
  // BLOCK to FLAG (and the save stays CLEAN, not NO_SAVE).
  it("missing steps -> FLAG (ingredient-only recipe is allowed)", () => {
    const result = validateRecipe(
      makeCandidate({ steps: [], stepSignals: [] }),
    );
    const issue = result.issues.find((i) => i.code === "STEPS_MISSING");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
    expect(result.hasBlockingIssues).toBe(false);
    expect(result.saveState).toBe("SAVE_CLEAN");
  });

  it("extractionError 'steps_failed' with empty steps -> STEPS_EXTRACTION_FAILED FLAG, no double-flag with STEPS_MISSING", () => {
    const result = validateRecipe(
      makeCandidate({
        steps: [],
        stepSignals: [],
        extractionError: "steps_failed",
      }),
    );
    const extractionFailedIssue = result.issues.find(
      (i) => i.code === "STEPS_EXTRACTION_FAILED",
    );
    const stepsMissingIssue = result.issues.find(
      (i) => i.code === "STEPS_MISSING",
    );
    expect(extractionFailedIssue).toBeDefined();
    expect(extractionFailedIssue!.severity).toBe("FLAG");
    expect(stepsMissingIssue).toBeUndefined();
    expect(result.hasBlockingIssues).toBe(false);
    expect(result.saveState).toBe("SAVE_CLEAN");
  });

  it("extractionError 'steps_failed' after user adds steps -> STEPS_EXTRACTION_FAILED cleared", () => {
    const result = validateRecipe(
      makeCandidate({
        steps: [
          {
            id: "s1",
            text: "User-added step",
            orderIndex: 0,
            isHeader: false,
          },
        ],
        stepSignals: [],
        extractionError: "steps_failed",
      }),
    );
    const extractionFailedIssue = result.issues.find(
      (i) => i.code === "STEPS_EXTRACTION_FAILED",
    );
    expect(extractionFailedIssue).toBeUndefined();
  });

  it("merged ingredient lines -> FLAG", () => {
    const result = validateRecipe(
      makeCandidate({
        ingredientSignals: [
          {
            index: 0,
            text: "1 cup flour, 2 eggs",
            mergedWhenSeparable: true,
            missingName: false,
            missingQuantityOrUnit: false,
            minorOcrArtifact: false,
            majorOcrArtifact: false,
          },
        ],
      }),
    );
    const issue = result.issues.find((i) => i.code === "INGREDIENT_MERGED");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
    expect(issue!.userDismissible).toBe(true);
  });

  it("suspected omission -> FLAG", () => {
    const result = validateRecipe(
      makeCandidate({
        parseSignals: {
          structureSeparable: true,
          lowConfidenceStructure: false,
          poorImageQuality: false,
          multiRecipeDetected: false,
          confirmedOmission: false,
          suspectedOmission: true,
          descriptionDetected: false,
        },
      }),
    );
    const issue = result.issues.find((i) => i.code === "SUSPECTED_OMISSION");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
  });

  it("confirmed omission -> BLOCK", () => {
    const result = validateRecipe(
      makeCandidate({
        parseSignals: {
          structureSeparable: true,
          lowConfidenceStructure: false,
          poorImageQuality: false,
          multiRecipeDetected: false,
          confirmedOmission: true,
          suspectedOmission: false,
          descriptionDetected: false,
        },
      }),
    );
    const issue = result.issues.find((i) => i.code === "CONFIRMED_OMISSION");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("BLOCK");
  });

  it("missing quantity/unit -> FLAG", () => {
    const result = validateRecipe(
      makeCandidate({
        ingredientSignals: [
          {
            index: 0,
            text: "salt to taste",
            mergedWhenSeparable: false,
            missingName: false,
            missingQuantityOrUnit: true,
            minorOcrArtifact: false,
            majorOcrArtifact: false,
          },
        ],
      }),
    );
    const issue = result.issues.find(
      (i) => i.code === "INGREDIENT_QTY_OR_UNIT_MISSING",
    );
    expect(issue).toBeUndefined();
  });

  it("minor OCR artifact on ingredient -> FLAG", () => {
    const result = validateRecipe(
      makeCandidate({
        ingredientSignals: [
          {
            index: 0,
            text: "1 cup f1our",
            mergedWhenSeparable: false,
            missingName: false,
            missingQuantityOrUnit: false,
            minorOcrArtifact: true,
            majorOcrArtifact: false,
          },
        ],
      }),
    );
    const issue = result.issues.find(
      (i) =>
        i.code === "MINOR_OCR_ARTIFACT" &&
        i.fieldPath === "ingredients[0]",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
  });

  it("major OCR artifact on ingredient -> FLAG", () => {
    const result = validateRecipe(
      makeCandidate({
        ingredientSignals: [
          {
            index: 0,
            text: "1 %%% fl@#r",
            mergedWhenSeparable: false,
            missingName: false,
            missingQuantityOrUnit: false,
            minorOcrArtifact: false,
            majorOcrArtifact: true,
          },
        ],
      }),
    );
    const issue = result.issues.find(
      (i) =>
        i.code === "MAJOR_OCR_ARTIFACT" &&
        i.fieldPath === "ingredients[0]",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
  });

  it("minor OCR artifact on step -> FLAG", () => {
    const result = validateRecipe(
      makeCandidate({
        stepSignals: [
          {
            index: 0,
            text: "Mix we1l.",
            minorOcrArtifact: true,
            majorOcrArtifact: false,
          },
        ],
      }),
    );
    const issue = result.issues.find(
      (i) => i.code === "MINOR_OCR_ARTIFACT" && i.fieldPath === "steps[0]",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
  });

  it("major OCR artifact on step -> FLAG", () => {
    const result = validateRecipe(
      makeCandidate({
        stepSignals: [
          {
            index: 0,
            text: "@#$ %%% !!!",
            minorOcrArtifact: false,
            majorOcrArtifact: true,
          },
        ],
      }),
    );
    const issue = result.issues.find(
      (i) => i.code === "MAJOR_OCR_ARTIFACT" && i.fieldPath === "steps[0]",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
  });

  it("description detected -> FLAG", () => {
    const result = validateRecipe(
      makeCandidate({
        parseSignals: {
          structureSeparable: true,
          lowConfidenceStructure: false,
          poorImageQuality: false,
          multiRecipeDetected: false,
          confirmedOmission: false,
          suspectedOmission: false,
          descriptionDetected: true,
        },
      }),
    );
    const issue = result.issues.find((i) => i.code === "DESCRIPTION_DETECTED");
    expect(issue).toBeUndefined();
  });

  it("multi-recipe detected -> FLAG (dismissible)", () => {
    const result = validateRecipe(
      makeCandidate({
        parseSignals: {
          structureSeparable: true,
          lowConfidenceStructure: false,
          poorImageQuality: false,
          multiRecipeDetected: true,
          confirmedOmission: false,
          suspectedOmission: false,
          descriptionDetected: false,
        },
      }),
    );
    const issue = result.issues.find(
      (i) => i.code === "MULTI_RECIPE_DETECTED",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
    expect(issue!.userDismissible).toBe(true);
    expect(result.hasBlockingIssues).toBe(false);
    expect(result.saveState).toBe("SAVE_CLEAN");
  });

  it("structure not separable -> BLOCK", () => {
    const result = validateRecipe(
      makeCandidate({
        parseSignals: {
          structureSeparable: false,
          lowConfidenceStructure: false,
          poorImageQuality: false,
          multiRecipeDetected: false,
          confirmedOmission: false,
          suspectedOmission: false,
          descriptionDetected: false,
        },
      }),
    );
    const issue = result.issues.find(
      (i) => i.code === "STRUCTURE_NOT_SEPARABLE",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("BLOCK");
  });

  it("low confidence structure -> RETAKE when retakes available", () => {
    const result = validateRecipe(
      makeCandidate({
        parseSignals: {
          structureSeparable: true,
          lowConfidenceStructure: true,
          poorImageQuality: false,
          multiRecipeDetected: false,
          confirmedOmission: false,
          suspectedOmission: false,
          descriptionDetected: false,
        },
        sourcePages: [
          {
            id: "p1",
            orderIndex: 0,
            sourceType: "image",
            retakeCount: 0,
            imageUri: "test.jpg",
            extractedText: null,
          },
        ],
      }),
    );
    expect(result.requiresRetake).toBe(true);
    const issue = result.issues.find(
      (i) => i.code === "LOW_CONFIDENCE_STRUCTURE",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("RETAKE");
  });

  it("poor image quality -> RETAKE when retakes available", () => {
    const result = validateRecipe(
      makeCandidate({
        parseSignals: {
          structureSeparable: true,
          lowConfidenceStructure: false,
          poorImageQuality: true,
          multiRecipeDetected: false,
          confirmedOmission: false,
          suspectedOmission: false,
          descriptionDetected: false,
        },
        sourcePages: [
          {
            id: "p1",
            orderIndex: 0,
            sourceType: "image",
            retakeCount: 1,
            imageUri: "test.jpg",
            extractedText: null,
          },
        ],
      }),
    );
    expect(result.requiresRetake).toBe(true);
  });

  it("retake limit reached -> BLOCK after 2 retakes per page", () => {
    const result = validateRecipe(
      makeCandidate({
        parseSignals: {
          structureSeparable: true,
          lowConfidenceStructure: true,
          poorImageQuality: false,
          multiRecipeDetected: false,
          confirmedOmission: false,
          suspectedOmission: false,
          descriptionDetected: false,
        },
        sourcePages: [
          {
            id: "p1",
            orderIndex: 0,
            sourceType: "image",
            retakeCount: 2,
            imageUri: "test.jpg",
            extractedText: null,
          },
        ],
      }),
    );
    const issue = result.issues.find(
      (i) => i.code === "RETAKE_LIMIT_REACHED",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("BLOCK");
    expect(result.requiresRetake).toBe(false);
  });

  it("SAVE_CLEAN allowed when ingredient signals have no active rules", () => {
    const result = validateRecipe(
      makeCandidate({
        ingredientSignals: [
          {
            index: 0,
            text: "salt",
            mergedWhenSeparable: false,
            missingName: false,
            missingQuantityOrUnit: true,
            minorOcrArtifact: false,
            majorOcrArtifact: false,
          },
        ],
      }),
    );
    expect(result.saveState).toBe("SAVE_CLEAN");
  });

  it("missing ingredient name -> FLAG", () => {
    const result = validateRecipe(
      makeCandidate({
        ingredientSignals: [
          {
            index: 0,
            text: "1 cup",
            mergedWhenSeparable: false,
            missingName: true,
            missingQuantityOrUnit: false,
            minorOcrArtifact: false,
            majorOcrArtifact: false,
          },
        ],
      }),
    );
    const issue = result.issues.find(
      (i) => i.code === "INGREDIENT_NAME_MISSING",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("FLAG");
  });
});

describe("validateRecipe — URL and image use same downstream logic", () => {
  it("URL candidate with same content produces identical validation", () => {
    const base = makeCandidate();
    const urlCandidate = makeCandidate({
      sourceType: "url",
      sourcePages: [
        {
          id: "u1",
          orderIndex: 0,
          sourceType: "url",
          imageUri: null,
          extractedText: "html content",
        },
      ],
    });

    const imageResult = validateRecipe(base);
    const urlResult = validateRecipe(urlCandidate);

    expect(imageResult.saveState).toBe(urlResult.saveState);
    expect(imageResult.hasBlockingIssues).toBe(urlResult.hasBlockingIssues);
    expect(imageResult.issues.length).toBe(urlResult.issues.length);
  });
});
