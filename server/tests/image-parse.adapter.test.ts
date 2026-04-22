import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SourcePage } from "@orzo/shared";

/**
 * Unit tests for the single-call image parse adapter. We mock the OpenAI
 * SDK at the module level so each test controls what the one call
 * returns. The actual HTTP path to api.openai.com is never touched here
 * — real LLM behavior is covered by the eval suite
 * (image-parse-eval.test.ts), which is gated behind RUN_LLM_EVALS=1.
 */

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

/**
 * Valid monolithic response that satisfies recipeSchema — title,
 * servings, ingredients, steps, description, metadata, signals,
 * ingredientSignals, stepSignals all present in one JSON payload.
 */
function recipeResponse(overrides: Record<string, unknown> = {}) {
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
            steps: [
              { text: "Mix dry ingredients.", isHeader: false },
              { text: "Add wet ingredients and stir.", isHeader: false },
            ],
            description: "Weekend pancakes.",
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
              descriptionDetected: true,
            },
            ingredientSignals: [],
            stepSignals: [],
            ...overrides,
          }),
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 1500,
      completion_tokens: 800,
      total_tokens: 2300,
    },
  };
}

describe("parseImages — single-call monolithic architecture", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("happy path: single call returns merged candidate with ingredients + steps + description", async () => {
    createMock.mockResolvedValueOnce(recipeResponse());
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

  it("OpenAI throws → buildErrorCandidate", async () => {
    createMock.mockRejectedValueOnce(new Error("OpenAI 500"));
    const candidate = await parseImages(imageUrls, sourcePages);
    expect(candidate.ingredients).toHaveLength(0);
    expect(candidate.extractionMethod).toBe("error");
    expect(candidate.parseSignals.poorImageQuality).toBe(true);
  });

  it("returns valid JSON with empty ingredients → buildErrorCandidate (semantic gate)", async () => {
    createMock.mockResolvedValueOnce(recipeResponse({ ingredients: [] }));
    const candidate = await parseImages(imageUrls, sourcePages);
    expect(candidate.extractionMethod).toBe("error");
    expect(candidate.ingredients).toHaveLength(0);
  });

  it("empty message.content → buildErrorCandidate", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: null }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 },
    });
    const candidate = await parseImages(imageUrls, sourcePages);
    expect(candidate.extractionMethod).toBe("error");
  });

  it("finish_reason=length (truncated) → buildErrorCandidate via thrown error", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: null }, finish_reason: "length" }],
      usage: { prompt_tokens: 1500, completion_tokens: 4500, total_tokens: 6000 },
    });
    const candidate = await parseImages(imageUrls, sourcePages);
    expect(candidate.extractionMethod).toBe("error");
  });

  it("exactly ONE OpenAI call per parse (halves image cost vs. split architecture)", async () => {
    createMock.mockResolvedValueOnce(recipeResponse());
    await parseImages(imageUrls, sourcePages);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("uses gpt-4o for the monolithic call", async () => {
    createMock.mockResolvedValueOnce(recipeResponse());
    await parseImages(imageUrls, sourcePages);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe("gpt-4o");
  });

  it("uses strict json_schema response_format with recipeSchema", async () => {
    createMock.mockResolvedValueOnce(recipeResponse());
    await parseImages(imageUrls, sourcePages);
    const call = createMock.mock.calls[0][0];
    expect(call.response_format.type).toBe("json_schema");
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(call.response_format.json_schema.name).toBe("Recipe");
  });

  it("sends images with detail:high (still — users frame tighter post-WYSIWYG fix)", async () => {
    createMock.mockResolvedValueOnce(recipeResponse());
    await parseImages(imageUrls, sourcePages);
    const call = createMock.mock.calls[0][0];
    const imagePart = call.messages[1].content[1];
    expect(imagePart.type).toBe("image_url");
    expect(imagePart.image_url.url).toBe(imageUrls[0]);
    expect(imagePart.image_url.detail).toBe("high");
  });

  it("temperature=0 for deterministic fraction reads", async () => {
    createMock.mockResolvedValueOnce(recipeResponse());
    await parseImages(imageUrls, sourcePages);
    const call = createMock.mock.calls[0][0];
    expect(call.temperature).toBe(0);
  });

  it("max_completion_tokens covers dense recipes (4500, sum of old split budgets)", async () => {
    createMock.mockResolvedValueOnce(recipeResponse());
    await parseImages(imageUrls, sourcePages);
    const call = createMock.mock.calls[0][0];
    expect(call.max_completion_tokens).toBe(4500);
  });
});
