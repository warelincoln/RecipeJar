import { describe, it, expect } from "vitest";
import {
  estimateCostUsd,
  getPricing,
  __getPricingTableForTests,
} from "../src/parsing/image/pricing.js";

describe("estimateCostUsd", () => {
  it("computes cost for gpt-5.4 at known rates", () => {
    // gpt-5.4: $5/1M input, $15/1M output
    // 1000 input + 500 output = $0.005 + $0.0075 = $0.0125
    const cost = estimateCostUsd("gpt-5.4", {
      prompt_tokens: 1000,
      completion_tokens: 500,
    });
    expect(cost).toBeCloseTo(0.0125, 6);
  });

  it("computes cost for gpt-4o at known rates", () => {
    // gpt-4o: $2.5/1M input, $10/1M output
    // 2000 input + 1000 output = $0.005 + $0.010 = $0.015
    const cost = estimateCostUsd("gpt-4o", {
      prompt_tokens: 2000,
      completion_tokens: 1000,
    });
    expect(cost).toBeCloseTo(0.015, 6);
  });

  it("computes cost for claude-sonnet-4-6", () => {
    // claude-sonnet-4-6: $3/1M input, $15/1M output
    // 1500 input + 500 output = $0.0045 + $0.0075 = $0.012
    const cost = estimateCostUsd("claude-sonnet-4-6", {
      prompt_tokens: 1500,
      completion_tokens: 500,
    });
    expect(cost).toBeCloseTo(0.012, 6);
  });

  it("computes cost for claude-haiku-4-5-20251001", () => {
    // claude-haiku-4-5: $1/1M input, $5/1M output
    // 10000 input + 2000 output = $0.01 + $0.01 = $0.02
    const cost = estimateCostUsd("claude-haiku-4-5-20251001", {
      prompt_tokens: 10000,
      completion_tokens: 2000,
    });
    expect(cost).toBeCloseTo(0.02, 6);
  });

  it("returns null for unknown models so the event still emits", () => {
    expect(
      estimateCostUsd("some-future-model", {
        prompt_tokens: 100,
        completion_tokens: 50,
      }),
    ).toBeNull();
  });

  it("handles zero tokens", () => {
    expect(
      estimateCostUsd("gpt-5.4", { prompt_tokens: 0, completion_tokens: 0 }),
    ).toBe(0);
  });

  it("scales linearly with token count", () => {
    const small = estimateCostUsd("gpt-4o", {
      prompt_tokens: 100,
      completion_tokens: 100,
    });
    const big = estimateCostUsd("gpt-4o", {
      prompt_tokens: 1000,
      completion_tokens: 1000,
    });
    expect(big).toBeCloseTo((small ?? 0) * 10, 6);
  });
});

describe("getPricing", () => {
  it("returns the pricing entry for a known model", () => {
    const price = getPricing("gpt-5.4");
    expect(price).not.toBeNull();
    expect(price!.inputPerMillion).toBe(5.0);
    expect(price!.outputPerMillion).toBe(15.0);
  });

  it("returns null for unknown model", () => {
    expect(getPricing("does-not-exist")).toBeNull();
  });
});

describe("pricing table", () => {
  it("covers all models we plan to eval", () => {
    const table = __getPricingTableForTests();
    for (const model of [
      "gpt-5.4",
      "gpt-4o",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
    ]) {
      expect(table[model], `${model} must be in the pricing table`).toBeDefined();
      expect(table[model].inputPerMillion).toBeGreaterThan(0);
      expect(table[model].outputPerMillion).toBeGreaterThan(0);
    }
  });
});
