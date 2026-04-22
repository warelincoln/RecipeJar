import { describe, it, expect } from "vitest";
import { parseIngredientLine } from "../src/parsing/ingredient-parser.js";

describe("parseIngredientLine — fraction handling", () => {
  describe("unicode fractions", () => {
    it("leading unicode fraction: '½ cup flour'", () => {
      const r = parseIngredientLine("½ cup flour");
      expect(r.amount).toBeCloseTo(0.5);
      expect(r.amountMax).toBeNull();
      expect(r.unit).toBe("cup");
      expect(r.name).toBe("flour");
      expect(r.isScalable).toBe(true);
    });

    it("leading unicode fraction: '¼ cup flour'", () => {
      const r = parseIngredientLine("¼ cup flour");
      expect(r.amount).toBeCloseTo(0.25);
      expect(r.unit).toBe("cup");
      expect(r.name).toBe("flour");
    });

    it("mixed unicode fraction: '1½ cups milk'", () => {
      const r = parseIngredientLine("1½ cups milk");
      expect(r.amount).toBeCloseTo(1.5);
      expect(r.unit).toBe("cup");
      expect(r.name).toBe("milk");
    });
  });

  describe("slash fractions — the 1/2 regression", () => {
    // These are the exact cases that produce the "1 /2 cup flour" rendering
    // bug before the fix. Prior behavior: parser returned amount=1,
    // unit=null, name="/2 cup flour". Fix: recognize that "1" followed by
    // "/2" is the fraction 1/2, not the integer 1.
    it("bare slash fraction: '1/2 cup flour'", () => {
      const r = parseIngredientLine("1/2 cup flour");
      expect(r.amount).toBeCloseTo(0.5);
      expect(r.amountMax).toBeNull();
      expect(r.unit).toBe("cup");
      expect(r.name).toBe("flour");
      expect(r.isScalable).toBe(true);
    });

    it("bare slash fraction: '3/4 tsp salt'", () => {
      const r = parseIngredientLine("3/4 tsp salt");
      expect(r.amount).toBeCloseTo(0.75);
      expect(r.unit).toBe("tsp");
      expect(r.name).toBe("salt");
    });

    it("bare slash fraction with no unit: '1/4 onion'", () => {
      const r = parseIngredientLine("1/4 onion");
      expect(r.amount).toBeCloseTo(0.25);
      expect(r.unit).toBeNull();
      expect(r.name).toBe("onion");
    });

    it("bare slash fraction alone: '2/3'", () => {
      const r = parseIngredientLine("2/3");
      expect(r.amount).toBeCloseTo(0.6666667);
      // With no trailing text, the trimmed input is what the name
      // collapses to; behavior before and after the fix is consistent
      // — we care that amount is correct and unit is null.
      expect(r.unit).toBeNull();
    });

    it("slash fraction with extra whitespace: '1 / 2 cups sugar'", () => {
      // parseFloat consumes "1" then \s* consumes one space, leaving
      // "/ 2 cups sugar" in rest. The nakedSlashMatch regex handles
      // optional whitespace around the slash.
      const r = parseIngredientLine("1 / 2 cups sugar");
      expect(r.amount).toBeCloseTo(0.5);
      expect(r.unit).toBe("cup");
      expect(r.name).toBe("sugar");
    });

    it("mixed number with slash fraction: '1 1/2 cups milk'", () => {
      // This must keep working after the fix — the existing mixed-number
      // path still wins because slashMatch runs on rest after the first
      // number consumes "1 ", so rest starts with "1/2" (digit, not "/").
      const r = parseIngredientLine("1 1/2 cups milk");
      expect(r.amount).toBeCloseTo(1.5);
      expect(r.unit).toBe("cup");
      expect(r.name).toBe("milk");
    });

    it("mixed number with slash fraction: '2 3/4 lbs chicken'", () => {
      const r = parseIngredientLine("2 3/4 lbs chicken");
      expect(r.amount).toBeCloseTo(2.75);
      expect(r.unit).toBe("lb");
      expect(r.name).toBe("chicken");
    });
  });

  describe("integers, decimals, ranges", () => {
    it("integer: '2 cups flour'", () => {
      const r = parseIngredientLine("2 cups flour");
      expect(r.amount).toBe(2);
      expect(r.unit).toBe("cup");
      expect(r.name).toBe("flour");
    });

    it("decimal: '1.5 cups milk'", () => {
      const r = parseIngredientLine("1.5 cups milk");
      expect(r.amount).toBeCloseTo(1.5);
      expect(r.unit).toBe("cup");
      expect(r.name).toBe("milk");
    });

    it("range with hyphen: '1-2 cups water'", () => {
      const r = parseIngredientLine("1-2 cups water");
      expect(r.amount).toBe(1);
      expect(r.amountMax).toBe(2);
      expect(r.unit).toBe("cup");
      expect(r.name).toBe("water");
    });
  });

  describe("non-scalable patterns", () => {
    it("'salt and pepper to taste' → not scalable", () => {
      const r = parseIngredientLine("salt and pepper to taste");
      expect(r.amount).toBeNull();
      expect(r.isScalable).toBe(false);
      expect(r.name).toBe("salt and pepper to taste");
    });

    it("'oil for frying' → not scalable", () => {
      const r = parseIngredientLine("oil for frying");
      expect(r.isScalable).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("empty string", () => {
      const r = parseIngredientLine("");
      expect(r.amount).toBeNull();
      expect(r.name).toBe("");
    });

    it("division by zero in bare fraction: '1/0 cup flour'", () => {
      // Denominator 0 should fall through and treat "1" as whole number.
      // This is a degenerate case but the parser must not NaN.
      const r = parseIngredientLine("1/0 cup flour");
      expect(r.amount).not.toBeNull();
      expect(Number.isFinite(r.amount!)).toBe(true);
    });

    it("no slash in rest, just whitespace: '1 cup flour'", () => {
      const r = parseIngredientLine("1 cup flour");
      expect(r.amount).toBe(1);
      expect(r.unit).toBe("cup");
      expect(r.name).toBe("flour");
    });
  });
});
