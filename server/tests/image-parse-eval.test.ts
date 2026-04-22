// Load OPENAI_API_KEY from server/.env before the adapter imports the
// OpenAI client. Use override:true in case a shell parent (e.g. the
// Claude Code host) injects an empty value that would otherwise shadow
// the real key.
import { config as loadDotenv } from "dotenv";
loadDotenv({ override: true });

import { describe, it, expect } from "vitest";
import {
  readdirSync,
  readFileSync,
  existsSync,
  statSync,
  mkdtempSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import type { SourcePage } from "@orzo/shared";
import { estimateCostUsd } from "../src/parsing/image/pricing.js";

/**
 * LLM eval suite — the hard quality gate for the single-call image parse
 * architecture (shipped 2026-04-21 after the cost trade study at
 * ~/.claude/plans/snug-waddling-quiche.md).
 *
 * Gated by RUN_LLM_EVALS=1 env var. Normal CI skips this because each
 * run costs real OpenAI tokens (~$0.03 per fixture, ~$0.15 per full
 * 5-fixture run). Run manually on-demand or before any change to the
 * prompt / schema / model:
 *
 *     RUN_LLM_EVALS=1 cd server && npm test -- image-parse-eval
 *
 * For each fixture in tests/fixtures/recipe-images/<slug>/:
 *  - Run the parse, capture latency + token usage
 *  - Score the candidate against expected.json:
 *    - Fractions match within 0.001 tolerance (½ → 0.5, ⅓ → 0.333, etc)
 *    - Ingredient names match case-insensitively (substring)
 *    - Step count is non-zero; diff > 3 logs a warning
 *    - Required step numerics: ≤25% may be missing
 *    - Required step tools: ≤25% may be missing
 *
 * Ingredient-fraction failures are HARD GATES. Every other check is
 * warning-only. Summary table + per-fixture JSONL written at suite end.
 *
 * To compare a candidate architecture (e.g. a new vendor, a prompt
 * change) against this baseline, add a second parse function + a
 * second describe block. Historical multi-arm harness (2026-04-21
 * trade study) lived in git history on branch fix/parse-cost-study-eval
 * if you want to resurrect the pattern.
 */

const FIXTURES_DIR = join(__dirname, "fixtures/recipe-images");
const RESULTS_DIR = join(__dirname, "eval-results");
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

interface FixtureScore {
  fixture: string;
  titleOk: boolean | null;
  servingsOk: boolean | null;
  ingredientsPass: boolean;
  ingredientsMissing: string[];
  fractionDeltas: Array<{ name: string; expected: number; actual: number | null }>;
  stepCountActual: number;
  stepCountDiff: number;
  stepNumericsMissing: string[];
  stepToolsMissing: string[];
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number | null;
  model: string;
  hardGatePassed: boolean;
  error?: string;
}

const runEvals = process.env.RUN_LLM_EVALS === "1";

const parseForEvalPromise = runEvals
  ? import("../src/parsing/image/image-parse.adapter.js").then(
      (m) => m.parseImagesForEvalSingleCall,
    )
  : Promise.resolve(
      (() => {
        throw new Error("eval suite not enabled — set RUN_LLM_EVALS=1");
      }) as unknown as typeof import(
        "../src/parsing/image/image-parse.adapter.js"
      )["parseImagesForEvalSingleCall"],
    );

async function loadFixtures(): Promise<
  Array<{ slug: string; image: Buffer; expected: ExpectedFixture }>
> {
  if (!existsSync(FIXTURES_DIR)) return [];

  const fixtures: Array<{
    slug: string;
    image: Buffer;
    expected: ExpectedFixture;
  }> = [];

  for (const entry of readdirSync(FIXTURES_DIR)) {
    const dir = join(FIXTURES_DIR, entry);
    if (!statSync(dir).isDirectory()) continue;

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

    // HEIC decode via macOS `sips` (sharp's npm prebuilds drop libheif
    // on macOS). Running this eval on non-macOS CI would need
    // heic-convert or similar; today evals are local-dev-only.
    const isHeic = /\.heic$/i.test(imagePath);
    let rawBuffer: Buffer;
    if (isHeic) {
      const tmp = mkdtempSync(join(tmpdir(), "orzo-eval-"));
      const outPath = join(tmp, "converted.jpg");
      execFileSync("sips", [
        "-s",
        "format",
        "jpeg",
        imagePath,
        "--out",
        outPath,
      ], { stdio: "pipe" });
      rawBuffer = readFileSync(outPath);
    } else {
      rawBuffer = readFileSync(imagePath);
    }
    const image = await sharp(rawBuffer)
      .rotate()
      .jpeg({ quality: 90 })
      .toBuffer();
    const expected = JSON.parse(
      readFileSync(expectedPath, "utf8"),
    ) as ExpectedFixture;
    fixtures.push({ slug: entry, image, expected });
  }

  return fixtures;
}

const fixtures = runEvals ? await loadFixtures() : [];
const describeEval = runEvals ? describe : describe.skip;

describe.skip("eval suite disabled (set RUN_LLM_EVALS=1 to run)", () => {
  it("placeholder", () => {});
});

const EVAL_TIMEOUT_MS = 120_000;

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.floor(p * (sorted.length - 1)),
  );
  return sorted[idx];
}

describeEval("image parse eval — single-call gpt-4o", () => {
  if (runEvals && fixtures.length === 0) {
    it("WARNING: no fixtures found — add some under tests/fixtures/recipe-images/", () => {
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

  const scores: FixtureScore[] = [];

  for (const { slug, image, expected } of fixtures) {
    it(
      `fixture: ${slug}`,
      async () => {
        const parseForEval = await parseForEvalPromise;
        const imageDataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;

        let result;
        try {
          result = await parseForEval([imageDataUrl], sourcePages);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          scores.push({
            fixture: slug,
            titleOk: null,
            servingsOk: null,
            ingredientsPass: false,
            ingredientsMissing: [],
            fractionDeltas: [],
            stepCountActual: 0,
            stepCountDiff: 0,
            stepNumericsMissing: [],
            stepToolsMissing: [],
            latencyMs: 0,
            promptTokens: 0,
            completionTokens: 0,
            estimatedCostUsd: null,
            model: "",
            hardGatePassed: false,
            error: msg,
          });
          throw err;
        }

        const candidate = result.candidate;
        const { usage, model, latencyMs } = result.outcome;

        const titleOk =
          expected.title !== undefined
            ? candidate.title?.toLowerCase() === expected.title.toLowerCase()
            : null;
        const servingsOk =
          expected.servings !== undefined
            ? candidate.servings === expected.servings
            : null;

        const ingredientsMissing: string[] = [];
        const fractionDeltas: Array<{
          name: string;
          expected: number;
          actual: number | null;
        }> = [];
        let ingredientsPass = true;
        for (const expectedIng of expected.ingredients) {
          const match = candidate.ingredients.find((actual) =>
            actual.name?.toLowerCase().includes(expectedIng.name.toLowerCase()),
          );
          if (!match) {
            ingredientsMissing.push(expectedIng.name);
            ingredientsPass = false;
            continue;
          }
          if (expectedIng.amount === null) {
            if (match.amount !== null) {
              ingredientsPass = false;
              fractionDeltas.push({
                name: expectedIng.name,
                expected: 0,
                actual: match.amount,
              });
            }
          } else {
            if (
              match.amount === null ||
              Math.abs(match.amount - expectedIng.amount) >= FRACTION_TOLERANCE
            ) {
              ingredientsPass = false;
              fractionDeltas.push({
                name: expectedIng.name,
                expected: expectedIng.amount,
                actual: match.amount,
              });
            }
          }
        }

        const stepCountActual = candidate.steps.length;
        const stepCountDiff = Math.abs(stepCountActual - expected.stepCount);
        const allStepText = candidate.steps
          .map((s) => s.text)
          .join(" ")
          .toLowerCase();
        const stepNumericsMissing = expected.requiredStepNumerics.filter(
          (n) => !allStepText.includes(n.toLowerCase()),
        );
        const stepToolsMissing = expected.requiredStepTools.filter(
          (t) => !allStepText.includes(t.toLowerCase()),
        );

        const estimatedCostUsd = estimateCostUsd(model, usage);

        scores.push({
          fixture: slug,
          titleOk,
          servingsOk,
          ingredientsPass,
          ingredientsMissing,
          fractionDeltas,
          stepCountActual,
          stepCountDiff,
          stepNumericsMissing,
          stepToolsMissing,
          latencyMs,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          estimatedCostUsd,
          model,
          hardGatePassed: ingredientsPass,
        });

        // Hard gate: fraction fidelity. Every other check is warning-only.
        expect(
          ingredientsPass,
          `Fraction regression on ${slug}: missing=${ingredientsMissing.join(
            ", ",
          )} deltas=${JSON.stringify(fractionDeltas)}`,
        ).toBe(true);

        if (stepCountDiff > 3) {
          // eslint-disable-next-line no-console
          console.warn(
            `  ⚠ step-count variance on ${slug}: expected=${expected.stepCount} got=${stepCountActual}`,
          );
        }
        const maxNumericMiss = Math.ceil(
          expected.requiredStepNumerics.length * 0.25,
        );
        if (stepNumericsMissing.length > maxNumericMiss) {
          // eslint-disable-next-line no-console
          console.warn(
            `  ⚠ step numerics missing (>${maxNumericMiss}): ${stepNumericsMissing.join(", ")}`,
          );
        }
        const maxToolsMiss = Math.ceil(
          expected.requiredStepTools.length * 0.25,
        );
        if (stepToolsMissing.length > maxToolsMiss) {
          // eslint-disable-next-line no-console
          console.warn(
            `  ⚠ step tools missing (>${maxToolsMiss}): ${stepToolsMissing.join(", ")}`,
          );
        }
      },
      EVAL_TIMEOUT_MS,
    );
  }

  // Summary table + JSONL report emitted after per-fixture tests.
  it("prints summary table + writes JSONL report", () => {
    const latencies = scores.map((s) => s.latencyMs).filter((x) => x > 0);
    const costs = scores
      .map((s) => s.estimatedCostUsd)
      .filter((c): c is number => c !== null);
    const promptTokens = scores.map((s) => s.promptTokens);
    const completionTokens = scores.map((s) => s.completionTokens);

    // eslint-disable-next-line no-console
    console.log("\n═══ IMAGE-PARSE EVAL SUMMARY ═══");
    // eslint-disable-next-line no-console
    console.log(
      `fixtures:       ${scores.filter((s) => s.hardGatePassed).length}/${scores.length} passed fraction gate`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `p50 latency:    ${(percentile(latencies, 0.5) / 1000).toFixed(1)}s`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `p90 latency:    ${(percentile(latencies, 0.9) / 1000).toFixed(1)}s`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `p50 cost/parse: ${costs.length ? "$" + percentile(costs, 0.5).toFixed(4) : "n/a"}`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `p90 cost/parse: ${costs.length ? "$" + percentile(costs, 0.9).toFixed(4) : "n/a"}`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `avg in tokens:  ${Math.round(
        promptTokens.reduce((a, b) => a + b, 0) /
          Math.max(1, promptTokens.length),
      )}`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `avg out tokens: ${Math.round(
        completionTokens.reduce((a, b) => a + b, 0) /
          Math.max(1, completionTokens.length),
      )}`,
    );

    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = join(RESULTS_DIR, `eval-${ts}.jsonl`);
    writeFileSync(
      path,
      scores.map((s) => JSON.stringify({ type: "score", ...s })).join("\n") + "\n",
    );
    // eslint-disable-next-line no-console
    console.log(`\nFull eval results written to ${path}\n`);
  });
});
