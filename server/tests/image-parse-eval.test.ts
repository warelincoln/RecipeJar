import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SourcePage } from "@orzo/shared";

// Dynamic import guard: only load the adapter when we're actually running
// the eval suite. The adapter constructs an OpenAI client at module-load,
// which throws without OPENAI_API_KEY — normal CI doesn't set that and
// doesn't need to, because the whole suite is skipped there anyway.
const runEvals = process.env.RUN_LLM_EVALS === "1";
const parseImagesPromise = runEvals
  ? import("../src/parsing/image/image-parse.adapter.js").then((m) => m.parseImages)
  : Promise.resolve(
      (() => {
        throw new Error("eval suite not enabled — set RUN_LLM_EVALS=1");
      }) as unknown as typeof import("../src/parsing/image/image-parse.adapter.js")["parseImages"],
    );

/**
 * LLM eval suite — the hard quality gate for the split-call architecture.
 *
 * Gated by RUN_LLM_EVALS=1 env var. Normal CI skips this suite because
 * each run costs real OpenAI tokens (~$0.05 per fixture per run). Run
 * manually before opening PR 2 and on demand to catch drift:
 *
 *     RUN_LLM_EVALS=1 cd server && npm test -- image-parse-eval
 *
 * Every fixture in tests/fixtures/recipe-images/<slug>/ is run through
 * the real OpenAI API (both Call A and Call B) and scored against its
 * expected.json ground truth.
 *
 * Scoring rules (see tests/fixtures/recipe-images/README.md for the full
 * authoring guide):
 *  - Fractions match within 0.001 tolerance (½ → 0.5, ⅓ → 0.333, etc)
 *  - Ingredient names match case-insensitively (substring)
 *  - Step count matches exactly (summarization is per-step, not merging)
 *  - Every required numeric from the source must survive Call B's rewrite
 *  - Every required tool from the source must survive Call B's rewrite
 *
 * Any failure blocks the PR. Don't downgrade thresholds without
 * reopening the eng review.
 */

const FIXTURES_DIR = join(__dirname, "fixtures/recipe-images");
const FRACTION_TOLERANCE = 0.001;

interface ExpectedIngredient {
  amount: number | null;
  unit?: string | null;
  name: string;
}

interface ExpectedFixture {
  title?: string;
  servings?: number | null;
  ingredients: ExpectedIngredient[];
  stepCount: number;
  requiredStepNumerics: string[];
  requiredStepTools: string[];
}

function loadFixtures(): Array<{ slug: string; image: Buffer; expected: ExpectedFixture }> {
  if (!existsSync(FIXTURES_DIR)) return [];

  const fixtures: Array<{ slug: string; image: Buffer; expected: ExpectedFixture }> = [];

  for (const entry of readdirSync(FIXTURES_DIR)) {
    const dir = join(FIXTURES_DIR, entry);
    if (!statSync(dir).isDirectory()) continue;

    // Accept jpg/jpeg/png.
    let imagePath: string | null = null;
    for (const ext of ["image.jpg", "image.jpeg", "image.png"]) {
      const candidate = join(dir, ext);
      if (existsSync(candidate)) {
        imagePath = candidate;
        break;
      }
    }
    const expectedPath = join(dir, "expected.json");

    if (!imagePath || !existsSync(expectedPath)) continue;

    const image = readFileSync(imagePath);
    const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as ExpectedFixture;
    fixtures.push({ slug: entry, image, expected });
  }

  return fixtures;
}

const fixtures = runEvals ? loadFixtures() : [];

// Use describe.skip when not in eval mode so the suite is a no-op in CI.
const describeEval = runEvals ? describe : describe.skip;

// Placeholder so vitest sees at least one test registered in this file
// even when the describeEval block skips — avoids "Test Files 1 failed"
// from vitest's no-tests-found check.
describe.skip("eval suite disabled (set RUN_LLM_EVALS=1 to run)", () => {
  it("placeholder", () => {});
});

describeEval("image parse eval — real OpenAI", () => {
  if (runEvals && fixtures.length === 0) {
    it("WARNING: RUN_LLM_EVALS=1 but no fixtures found — add some under tests/fixtures/recipe-images/", () => {
      // Fails loudly so nobody thinks the eval passed with zero fixtures.
      expect(fixtures.length).toBeGreaterThan(0);
    });
    return;
  }

  const sourcePages: SourcePage[] = [
    {
      id: "eval-page-1",
      orderIndex: 0,
      sourceType: "image",
      retakeCount: 0,
      imageUri: "eval/page.jpg",
      extractedText: null,
    },
  ];

  for (const { slug, image, expected } of fixtures) {
    describe(`fixture: ${slug}`, () => {
      // Hoisted so title/ingredient/step assertions share one parse.
      // Each fixture runs parseImages exactly once to keep token cost bounded.
      const imageDataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;
      let candidatePromise: Promise<
        Awaited<ReturnType<Awaited<typeof parseImagesPromise>>>
      > | null = null;

      const parseOnce = () => {
        if (!candidatePromise) {
          candidatePromise = parseImagesPromise.then((parseImages) =>
            parseImages([imageDataUrl], sourcePages),
          );
        }
        return candidatePromise;
      };

      if (expected.title !== undefined) {
        it("title matches (case-insensitive)", async () => {
          const candidate = await parseOnce();
          expect(candidate.title?.toLowerCase()).toBe(
            expected.title?.toLowerCase() ?? null,
          );
        });
      }

      if (expected.servings !== undefined) {
        it("servings matches exactly", async () => {
          const candidate = await parseOnce();
          expect(candidate.servings).toBe(expected.servings);
        });
      }

      it("ingredients: every expected amount is present within tolerance (CRITICAL fraction gate)", async () => {
        const candidate = await parseOnce();
        for (const expectedIng of expected.ingredients) {
          const match = candidate.ingredients.find(
            (actual) =>
              actual.name?.toLowerCase().includes(expectedIng.name.toLowerCase()),
          );
          expect(match, `ingredient "${expectedIng.name}" missing`).toBeDefined();
          if (expectedIng.amount === null) {
            expect(match!.amount, `${expectedIng.name} expected null amount`).toBeNull();
          } else {
            expect(
              match!.amount,
              `${expectedIng.name} expected ${expectedIng.amount}, got ${match!.amount}`,
            ).not.toBeNull();
            expect(Math.abs(match!.amount! - expectedIng.amount)).toBeLessThan(
              FRACTION_TOLERANCE,
            );
          }
        }
      });

      it(`step count matches exactly (expected ${expected.stepCount})`, async () => {
        const candidate = await parseOnce();
        expect(candidate.steps.length).toBe(expected.stepCount);
      });

      it("step numerics preserved through concision rewrite", async () => {
        const candidate = await parseOnce();
        const allStepText = candidate.steps
          .map((s) => s.text)
          .join(" ")
          .toLowerCase();
        for (const required of expected.requiredStepNumerics) {
          expect(
            allStepText.includes(required.toLowerCase()),
            `required numeric "${required}" missing from steps`,
          ).toBe(true);
        }
      });

      it("step tools preserved through concision rewrite", async () => {
        const candidate = await parseOnce();
        const allStepText = candidate.steps
          .map((s) => s.text)
          .join(" ")
          .toLowerCase();
        for (const tool of expected.requiredStepTools) {
          expect(
            allStepText.includes(tool.toLowerCase()),
            `required tool "${tool}" missing from steps`,
          ).toBe(true);
        }
      });
    });
  }
});
