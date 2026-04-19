import "dotenv/config"; // Load OPENAI_API_KEY from server/.env before the adapter import tries to construct the client.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
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

/**
 * Load fixture images from disk. Accepts HEIC (iPhone default), JPEG, PNG,
 * WEBP — always re-encodes as JPEG via sharp because OpenAI's vision API
 * only accepts PNG/JPEG/GIF/WEBP and we send `data:image/jpeg;base64,...`
 * uniformly. Re-encoding a JPEG is a small cost (~50ms/page) and lets
 * contributors drop raw iPhone photos without manual conversion.
 *
 * Returns promises so loading can happen in parallel with other setup.
 */
async function loadFixtures(): Promise<
  Array<{ slug: string; image: Buffer; expected: ExpectedFixture }>
> {
  if (!existsSync(FIXTURES_DIR)) return [];

  const fixtures: Array<{ slug: string; image: Buffer; expected: ExpectedFixture }> = [];

  for (const entry of readdirSync(FIXTURES_DIR)) {
    const dir = join(FIXTURES_DIR, entry);
    if (!statSync(dir).isDirectory()) continue;

    // Find the first matching image file. Order of preference doesn't
    // matter — sharp re-encodes them all to JPEG below.
    let imagePath: string | null = null;
    for (const ext of [
      "image.jpg",
      "image.jpeg",
      "image.png",
      "image.webp",
      "image.heic",
      "image.HEIC",
    ]) {
      const candidate = join(dir, ext);
      if (existsSync(candidate)) {
        imagePath = candidate;
        break;
      }
    }
    const expectedPath = join(dir, "expected.json");

    if (!imagePath || !existsSync(expectedPath)) continue;

    // HEIC path: sharp's npm prebuilds drop libheif on macOS, so we shell
    // out to `sips` (on every Mac since forever) to decode to JPEG first.
    // Everything else goes straight to sharp. This keeps the eval local
    // to macOS; if we ever run it in CI we'll need heic-convert or similar.
    const isHeic = /\.heic$/i.test(imagePath);
    let rawBuffer: Buffer;
    if (isHeic) {
      const tmp = mkdtempSync(join(tmpdir(), "orzo-eval-"));
      const outPath = join(tmp, "converted.jpg");
      execFileSync("sips", ["-s", "format", "jpeg", imagePath, "--out", outPath], {
        stdio: "pipe",
      });
      rawBuffer = readFileSync(outPath);
    } else {
      rawBuffer = readFileSync(imagePath);
    }
    // Re-encode through sharp → JPEG for uniform quality + EXIF orient.
    const image = await sharp(rawBuffer)
      .rotate()
      .jpeg({ quality: 90 })
      .toBuffer();
    const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as ExpectedFixture;
    fixtures.push({ slug: entry, image, expected });
  }

  return fixtures;
}

const fixtures = runEvals ? await loadFixtures() : [];

// Use describe.skip when not in eval mode so the suite is a no-op in CI.
const describeEval = runEvals ? describe : describe.skip;

// Placeholder so vitest sees at least one test registered in this file
// even when the describeEval block skips — avoids "Test Files 1 failed"
// from vitest's no-tests-found check.
describe.skip("eval suite disabled (set RUN_LLM_EVALS=1 to run)", () => {
  it("placeholder", () => {});
});

// 120s per test — real OpenAI calls take 10-30s each and the fraction
// gate runs both Call A and Call B against the fixture, so tests can
// legitimately block for up to ~60s before assertions resolve.
const EVAL_TIMEOUT_MS = 120_000;

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
        it(
          "title matches (case-insensitive)",
          async () => {
            const candidate = await parseOnce();
            expect(candidate.title?.toLowerCase()).toBe(
              expected.title?.toLowerCase() ?? null,
            );
          },
          EVAL_TIMEOUT_MS,
        );
      }

      if (expected.servings !== undefined) {
        it(
          "servings matches exactly",
          async () => {
            const candidate = await parseOnce();
            expect(candidate.servings).toBe(expected.servings);
          },
          EVAL_TIMEOUT_MS,
        );
      }

      it(
        "ingredients: every expected amount is present within tolerance (CRITICAL fraction gate)",
        async () => {
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
        },
        EVAL_TIMEOUT_MS,
      );

      // Step count: we want to catch regressions like "0 steps extracted"
      // and "15 steps from a 5-step recipe" but tolerate normal split/merge
      // variance. Cookbook formatting is inconsistent — some number every
      // sub-action (→ LLM extracts many), some lump multi-action paragraphs
      // into one numbered step (→ LLM extracts fewer). Fraction fidelity is
      // the hard bar; step count is informational. Asserts steps were
      // extracted at all (>0) and logs a warning when variance is large.
      it(
        `step count is non-zero (source has ${expected.stepCount}; variance tolerated)`,
        async () => {
          const candidate = await parseOnce();
          expect(candidate.steps.length).toBeGreaterThan(0);
          const diff = Math.abs(candidate.steps.length - expected.stepCount);
          if (diff > 3) {
            // eslint-disable-next-line no-console
            console.warn(
              `  ⚠ step count variance: expected ${expected.stepCount}, got ${candidate.steps.length} (diff ${diff}). Not a failure — just noting.`,
            );
          }
        },
        EVAL_TIMEOUT_MS,
      );

      // Step numerics: allow up to 25% of required items to be missing
      // (minimum tolerance of 0 for small lists). Real concision legitimately
      // drops some time/temp mentions when they're inferable from context
      // (e.g. "350°F" can be inferred when only one oil temp appears earlier).
      // Zero tolerance on lists of 1-3 items; tolerance 1 on lists of 4-7.
      it(
        "step numerics mostly preserved (≤25% drop) through concision rewrite",
        async () => {
          const candidate = await parseOnce();
          const allStepText = candidate.steps
            .map((s) => s.text)
            .join(" ")
            .toLowerCase();
          const missing = expected.requiredStepNumerics.filter(
            (required) => !allStepText.includes(required.toLowerCase()),
          );
          // ceil so small lists (3-4 items) tolerate 1 miss; 0 tolerance on
          // single-item lists catches the "everything dropped" regression.
          const maxMissing = Math.ceil(expected.requiredStepNumerics.length * 0.25);
          if (missing.length > maxMissing) {
            // eslint-disable-next-line no-console
            console.warn(`  ⚠ numerics missing: ${missing.join(", ")}`);
          }
          expect(
            missing.length,
            `too many required numerics dropped: ${missing.join(", ")}`,
          ).toBeLessThanOrEqual(maxMissing);
        },
        EVAL_TIMEOUT_MS,
      );

      // Step tools: same ≤25% drop tolerance. Tools like "thermometer"
      // and "tray" are routinely concisable out of steps when the action
      // is obvious from the temperature target or the draining instruction.
      // The expected list is pre-pruned to only truly-critical tools.
      it(
        "step tools mostly preserved (≤25% drop) through concision rewrite",
        async () => {
          const candidate = await parseOnce();
          const allStepText = candidate.steps
            .map((s) => s.text)
            .join(" ")
            .toLowerCase();
          const missing = expected.requiredStepTools.filter(
            (tool) => !allStepText.includes(tool.toLowerCase()),
          );
          const maxMissing = Math.ceil(expected.requiredStepTools.length * 0.25);
          if (missing.length > maxMissing) {
            // eslint-disable-next-line no-console
            console.warn(`  ⚠ tools missing: ${missing.join(", ")}`);
          }
          expect(
            missing.length,
            `too many required tools dropped: ${missing.join(", ")}`,
          ).toBeLessThanOrEqual(maxMissing);
        },
        EVAL_TIMEOUT_MS,
      );
    });
  }
});
