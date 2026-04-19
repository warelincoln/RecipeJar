import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SourcePage } from "@orzo/shared";

/**
 * Unit tests for the split-call image parse adapter. We mock the OpenAI
 * SDK at the module level so each test controls what each of the two
 * parallel calls returns. The actual HTTP path to api.openai.com is
 * never touched here — real LLM behavior is covered by the eval suite
 * (image-parse-eval.test.ts), which is gated behind RUN_LLM_EVALS=1.
 */

// Vitest hoists `vi.mock` calls to the top of the file, so any symbol the
// mock factory references must also be hoisted. Use `vi.hoisted` to keep
// `createMock` accessible from both the factory and the test bodies.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    };
  },
}));

import { parseImages } from "../src/parsing/image/image-parse.adapter.js";

const sourcePages: SourcePage[] = [
  {
    id: "page-1",
    orderIndex: 0,
    sourceType: "image",
    retakeCount: 0,
    imageUri: "test/path.jpg",
    extractedText: null,
  },
];

const imageUrls = ["data:image/jpeg;base64,fakebytes"];

// Valid "Call A" response that satisfies the ingredients schema.
function ingredientsResponse() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            title: "Classic Pancakes",
            servings: { min: 4, max: null },
            ingredients: [
              {
                text: "2 cups flour",
                isHeader: false,
                amount: 2,
                amountMax: null,
                unit: "cup",
                name: "flour",
              },
              {
                text: "1 ½ cups milk",
                isHeader: false,
                amount: 1.5,
                amountMax: null,
                unit: "cup",
                name: "milk",
              },
            ],
            metadata: {
              prepTime: "PT10M",
              prepTimeSource: "explicit",
              cookTime: "PT15M",
              cookTimeSource: "explicit",
              totalTime: "PT25M",
              totalTimeSource: "explicit",
            },
            signals: {
              structureSeparable: true,
              lowConfidenceStructure: false,
              poorImageQuality: false,
              multiRecipeDetected: false,
              confirmedOmission: false,
              suspectedOmission: false,
            },
            ingredientSignals: [],
          }),
        },
      },
    ],
  };
}

// Valid "Call B" response that satisfies the steps schema.
function stepsResponse() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            steps: [
              { text: "Mix dry ingredients.", isHeader: false },
              { text: "Add wet ingredients and stir.", isHeader: false },
            ],
            description: "Weekend pancakes.",
            descriptionDetected: true,
            stepSignals: [],
          }),
        },
      },
    ],
  };
}

// Set up the two-call mock: first call (A) returns ingredients, second (B) returns steps.
function mockHappyPath() {
  createMock.mockReset();
  createMock
    .mockResolvedValueOnce(ingredientsResponse())
    .mockResolvedValueOnce(stepsResponse());
}

describe("parseImages — split-call architecture", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("happy path: both calls succeed, merged candidate has ingredients from A + steps from B", async () => {
    mockHappyPath();
    const candidate = await parseImages(imageUrls, sourcePages);

    expect(candidate.title).toBe("Classic Pancakes");
    expect(candidate.servings).toBe(4);
    expect(candidate.ingredients).toHaveLength(2);
    expect(candidate.ingredients[0].amount).toBe(2);
    expect(candidate.ingredients[1].amount).toBe(1.5);
    expect(candidate.steps).toHaveLength(2);
    expect(candidate.description).toBe("Weekend pancakes.");
    expect(candidate.parseSignals.descriptionDetected).toBe(true);
    expect(candidate.parseSignals.structureSeparable).toBe(true);
    expect(candidate.extractionError).toBeUndefined();
  });

  it("fires both OpenAI calls in parallel (not serial)", async () => {
    // Two overlapping promises — both should have been started before either resolves.
    let aStarted = 0;
    let bStarted = 0;
    let aResolvedAt: number | null = null;
    let bResolvedAt: number | null = null;

    createMock.mockReset();
    createMock.mockImplementationOnce(async () => {
      aStarted = Date.now();
      await new Promise((r) => setTimeout(r, 30));
      aResolvedAt = Date.now();
      return ingredientsResponse();
    });
    createMock.mockImplementationOnce(async () => {
      bStarted = Date.now();
      await new Promise((r) => setTimeout(r, 30));
      bResolvedAt = Date.now();
      return stepsResponse();
    });

    await parseImages(imageUrls, sourcePages);

    // If parallel: B started before A resolved.
    // If serial: B would start after A resolved (bStarted >= aResolvedAt).
    expect(aStarted).toBeGreaterThan(0);
    expect(bStarted).toBeGreaterThan(0);
    expect(aResolvedAt).not.toBeNull();
    expect(bResolvedAt).not.toBeNull();
    expect(bStarted).toBeLessThan(aResolvedAt!);
  });

  it("Call A fails (OpenAI throws) → buildErrorCandidate, not partial", async () => {
    createMock.mockReset();
    // Call A rejects
    createMock.mockRejectedValueOnce(new Error("OpenAI 500"));
    // Call B succeeds (should NOT be surfaced — no recipe without ingredients)
    createMock.mockResolvedValueOnce(stepsResponse());

    const candidate = await parseImages(imageUrls, sourcePages);

    // buildErrorCandidate returns empty ingredients + error extractionMethod
    expect(candidate.ingredients).toHaveLength(0);
    expect(candidate.extractionMethod).toBe("error");
    expect(candidate.extractionError).toBeUndefined();
    expect(candidate.parseSignals.poorImageQuality).toBe(true);
  });

  it("Call A returns valid JSON with empty ingredients → buildErrorCandidate (semantic gate)", async () => {
    createMock.mockReset();
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: "Empty",
              servings: null,
              ingredients: [], // ← zero ingredients = useless recipe
              metadata: {
                prepTime: null,
                prepTimeSource: null,
                cookTime: null,
                cookTimeSource: null,
                totalTime: null,
                totalTimeSource: null,
              },
              signals: {
                structureSeparable: true,
                lowConfidenceStructure: false,
                poorImageQuality: false,
                multiRecipeDetected: false,
                confirmedOmission: false,
                suspectedOmission: false,
              },
              ingredientSignals: [],
            }),
          },
        },
      ],
    });
    createMock.mockResolvedValueOnce(stepsResponse());

    const candidate = await parseImages(imageUrls, sourcePages);

    expect(candidate.extractionMethod).toBe("error");
    expect(candidate.ingredients).toHaveLength(0);
  });

  it("Call B fails but A succeeded → partial success with extractionError='steps_failed'", async () => {
    createMock.mockReset();
    createMock.mockResolvedValueOnce(ingredientsResponse());
    createMock.mockRejectedValueOnce(new Error("OpenAI 500 on steps"));

    const candidate = await parseImages(imageUrls, sourcePages);

    // A's data is preserved
    expect(candidate.title).toBe("Classic Pancakes");
    expect(candidate.ingredients).toHaveLength(2);
    // B's data is empty
    expect(candidate.steps).toHaveLength(0);
    expect(candidate.description).toBeNull();
    expect(candidate.parseSignals.descriptionDetected).toBe(false);
    // Flag is set for the validation engine to pick up
    expect(candidate.extractionError).toBe("steps_failed");
  });

  it("Both A and B fail → buildErrorCandidate", async () => {
    createMock.mockReset();
    createMock.mockRejectedValueOnce(new Error("A crashed"));
    createMock.mockRejectedValueOnce(new Error("B crashed"));

    const candidate = await parseImages(imageUrls, sourcePages);

    expect(candidate.extractionMethod).toBe("error");
    expect(candidate.ingredients).toHaveLength(0);
    expect(candidate.steps).toHaveLength(0);
    expect(candidate.extractionError).toBeUndefined();
  });

  it("Call A returns empty content (null message.content) → buildErrorCandidate", async () => {
    createMock.mockReset();
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });
    createMock.mockResolvedValueOnce(stepsResponse());

    const candidate = await parseImages(imageUrls, sourcePages);
    expect(candidate.extractionMethod).toBe("error");
  });

  it("Call B returns empty content → partial success (treats empty as failure)", async () => {
    createMock.mockReset();
    createMock.mockResolvedValueOnce(ingredientsResponse());
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    const candidate = await parseImages(imageUrls, sourcePages);
    expect(candidate.extractionError).toBe("steps_failed");
    expect(candidate.ingredients).toHaveLength(2);
    expect(candidate.steps).toHaveLength(0);
  });

  it("sends the same imageContent to both calls (base64 dedup)", async () => {
    mockHappyPath();
    await parseImages(imageUrls, sourcePages);

    expect(createMock).toHaveBeenCalledTimes(2);
    const aCall = createMock.mock.calls[0][0];
    const bCall = createMock.mock.calls[1][0];

    // User message content = text block + image_url part(s). The image_url
    // should be the same reference in both calls since we build once and share.
    const aImage = aCall.messages[1].content[1];
    const bImage = bCall.messages[1].content[1];
    expect(aImage).toBe(bImage);
    expect(aImage.image_url.url).toBe(imageUrls[0]);
    expect(aImage.image_url.detail).toBe("high");
  });

  it("uses gpt-5.4 for Call A and gpt-4o for Call B", async () => {
    mockHappyPath();
    await parseImages(imageUrls, sourcePages);

    const aCall = createMock.mock.calls[0][0];
    const bCall = createMock.mock.calls[1][0];
    expect(aCall.model).toBe("gpt-5.4");
    expect(bCall.model).toBe("gpt-4o");
  });

  it("uses strict json_schema response_format for both calls", async () => {
    mockHappyPath();
    await parseImages(imageUrls, sourcePages);

    const aCall = createMock.mock.calls[0][0];
    const bCall = createMock.mock.calls[1][0];
    expect(aCall.response_format.type).toBe("json_schema");
    expect(aCall.response_format.json_schema.strict).toBe(true);
    expect(aCall.response_format.json_schema.name).toBe("RecipeIngredients");
    expect(bCall.response_format.type).toBe("json_schema");
    expect(bCall.response_format.json_schema.strict).toBe(true);
    expect(bCall.response_format.json_schema.name).toBe("RecipeSteps");
  });
});
