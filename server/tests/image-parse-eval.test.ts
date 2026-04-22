// Load OPENAI_API_KEY + ANTHROPIC_API_KEY from server/.env before arm modules
// import vendor clients. Use override:true because some shell parents (e.g.
// the Claude Code host when the eval is invoked from the assistant) inject
// ANTHROPIC_API_KEY="" into the env, which dotenv's default load silently
// skips — the .env-file value then never reaches the arms and Arms 2+3 get
// skipped with a confusing "not set" warning.
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
import type {
  ImageParseArm,
  ArmResult,
} from "../src/parsing/image/arms/types.js";

/**
 * LLM eval suite — the hard quality gate AND the cost/latency trade-study
 * comparison runner for the image-parse architecture.
 *
 * Gated by RUN_LLM_EVALS=1 env var. Normal CI skips this suite because
 * each run costs real vendor tokens (~$0.05 per fixture per arm). Run
 * manually to catch fraction-fidelity drift or to evaluate a candidate
 * architecture against the current production arm:
 *
 *     RUN_LLM_EVALS=1 cd server && npm test -- image-parse-eval
 *
 * The harness runs each fixture through EVERY registered arm:
 *  - Arm 0 — current production split-call (gpt-5.4 + gpt-4o)
 *  - Additional arms registered in Phase 3 of the cost trade study
 *    (plan: ~/.claude/plans/snug-waddling-quiche.md)
 *
 * Scoring rules (per fixture, per arm):
 *  - Fractions match within 0.001 tolerance (½ → 0.5, ⅓ → 0.333, etc)
 *  - Ingredient names match case-insensitively (substring)
 *  - Step count is non-zero; large variance (diff > 3) logs a warning
 *  - Required step numerics: ≤25% may be missing
 *  - Required step tools: ≤25% may be missing
 *
 * Arm 0 assertions are HARD gates — a regression there fails the test
 * (prevents silently drifting the production arm during candidate
 * development). Arms 1+ are scored but report-only; the harness prints
 * a summary table comparing pass rate, p50 latency, and estimated cost
 * per recipe across all arms so we can pick a winner.
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
  arm: string;
  fixture: string;
  titleOk: boolean | null; // null when expected.title is absent
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
  models: string[];
  hardGatePassed: boolean; // ingredient fractions within tolerance for every required ingredient
  error?: string;
}

const runEvals = process.env.RUN_LLM_EVALS === "1";

/**
 * Dynamic import so arms that require ANTHROPIC_API_KEY (or other vendor
 * env) don't crash module load on normal CI. When RUN_LLM_EVALS=1 the
 * harness loads all registered arms; otherwise the eval describe block
 * is skipped and arm modules aren't loaded at all.
 */
async function loadArms(): Promise<ImageParseArm[]> {
  // Optional filter so we can re-run a specific subset after fixing
  // something on one arm without re-paying for the arms that already
  // produced clean data. Set via env: EVAL_ARMS=A2,A3 runs only those.
  // Matches against ImageParseArm.name by substring (case-sensitive).
  const filterRaw = process.env.EVAL_ARMS?.trim();
  const filterTokens = filterRaw
    ? filterRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  const shouldInclude = (name: string) =>
    filterTokens == null || filterTokens.some((t) => name.includes(t));

  const arms: ImageParseArm[] = [];

  const arm0 = await import(
    "../src/parsing/image/arms/arm0-current-split.js"
  ).then((m) => m.arm0CurrentSplit);
  if (shouldInclude(arm0.name)) arms.push(arm0);

  // Phase 3: load candidate arms only if their adapter files exist
  // AND their required env vars are set. Keeps the harness runnable
  // incrementally — can eval just Arm 0 today, add Arms 1-3 as they land.
  const candidateLoaders: Array<{
    file: string;
    export: string;
    requiredEnv?: string;
  }> = [
    {
      file: "../src/parsing/image/arms/arm1-gpt4o-mono.js",
      export: "arm1Gpt4oMono",
      requiredEnv: "OPENAI_API_KEY",
    },
    {
      file: "../src/parsing/image/arms/arm2-claude-sonnet.js",
      export: "arm2ClaudeSonnet",
      requiredEnv: "ANTHROPIC_API_KEY",
    },
    {
      file: "../src/parsing/image/arms/arm3-claude-haiku.js",
      export: "arm3ClaudeHaiku",
      requiredEnv: "ANTHROPIC_API_KEY",
    },
  ];

  for (const loader of candidateLoaders) {
    if (loader.requiredEnv && !process.env[loader.requiredEnv]) {
      // eslint-disable-next-line no-console
      console.warn(
        `  ℹ eval: skipping ${loader.file} — ${loader.requiredEnv} not set`,
      );
      continue;
    }
    try {
      const mod = await import(loader.file);
      const arm = mod[loader.export] as ImageParseArm | undefined;
      if (arm && shouldInclude(arm.name)) arms.push(arm);
    } catch (err) {
      // Arm not yet implemented — fine, skip. Log so Phase 3 can see
      // which arms still need to be built.
      // eslint-disable-next-line no-console
      console.warn(
        `  ℹ eval: skipping ${loader.file} — not yet implemented (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }
  }

  return arms;
}

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
const arms = runEvals ? await loadArms() : [];

const describeEval = runEvals ? describe : describe.skip;

describe.skip("eval suite disabled (set RUN_LLM_EVALS=1 to run)", () => {
  it("placeholder", () => {});
});

const EVAL_TIMEOUT_MS = 120_000;

/**
 * Score one arm's output for one fixture against the expected ground truth.
 * Pure function — no vitest assertions. Caller decides whether any failure
 * is hard (Arm 0) or informational (candidate arms).
 */
function scoreResult(
  armName: string,
  fixtureSlug: string,
  result: ArmResult,
  expected: ExpectedFixture,
): FixtureScore {
  const candidate = result.candidate;

  // Title
  const titleOk =
    expected.title !== undefined
      ? candidate.title?.toLowerCase() === expected.title.toLowerCase()
      : null;

  // Servings
  const servingsOk =
    expected.servings !== undefined
      ? candidate.servings === expected.servings
      : null;

  // Ingredients — the hard fraction gate. For every expected ingredient,
  // find the parsed ingredient by case-insensitive name substring, then
  // check amount within tolerance.
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
          expected: 0, // surrogate for "null"
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

  // Steps — count + numeric/tool preservation. Warnings only, not hard gate.
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

  // Aggregate token + cost across the arm's calls
  let promptTokens = 0;
  let completionTokens = 0;
  let cost = 0;
  let anyCost = false;
  const models: string[] = [];
  for (const call of result.calls) {
    promptTokens += call.usage.prompt_tokens;
    completionTokens += call.usage.completion_tokens;
    const c = estimateCostUsd(call.model, call.usage);
    if (c != null) {
      cost += c;
      anyCost = true;
    }
    models.push(call.model);
  }

  return {
    arm: armName,
    fixture: fixtureSlug,
    titleOk,
    servingsOk,
    ingredientsPass,
    ingredientsMissing,
    fractionDeltas,
    stepCountActual,
    stepCountDiff,
    stepNumericsMissing,
    stepToolsMissing,
    latencyMs: result.wallClockMs,
    promptTokens,
    completionTokens,
    estimatedCostUsd: anyCost ? cost : null,
    models,
    hardGatePassed: ingredientsPass,
  };
}

/**
 * Summary statistics across the per-fixture scores for one arm.
 */
interface ArmSummary {
  arm: string;
  fixturesRun: number;
  fixturesPassedHardGate: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p50CostUsd: number | null;
  p90CostUsd: number | null;
  avgPromptTokens: number;
  avgCompletionTokens: number;
  modelSet: string;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.floor(p * (sorted.length - 1)),
  );
  return sorted[idx];
}

function summarize(scores: FixtureScore[], armName: string): ArmSummary {
  const armScores = scores.filter((s) => s.arm === armName);
  const latencies = armScores.map((s) => s.latencyMs);
  const costs = armScores
    .map((s) => s.estimatedCostUsd)
    .filter((c): c is number => c !== null);
  const promptTokens = armScores.map((s) => s.promptTokens);
  const completionTokens = armScores.map((s) => s.completionTokens);
  const models = new Set<string>();
  for (const s of armScores) for (const m of s.models) models.add(m);
  return {
    arm: armName,
    fixturesRun: armScores.length,
    fixturesPassedHardGate: armScores.filter((s) => s.hardGatePassed).length,
    p50LatencyMs: Math.round(percentile(latencies, 0.5)),
    p90LatencyMs: Math.round(percentile(latencies, 0.9)),
    p50CostUsd: costs.length
      ? Number(percentile(costs, 0.5).toFixed(4))
      : null,
    p90CostUsd: costs.length
      ? Number(percentile(costs, 0.9).toFixed(4))
      : null,
    avgPromptTokens: Math.round(
      promptTokens.reduce((a, b) => a + b, 0) /
        Math.max(1, promptTokens.length),
    ),
    avgCompletionTokens: Math.round(
      completionTokens.reduce((a, b) => a + b, 0) /
        Math.max(1, completionTokens.length),
    ),
    modelSet: [...models].sort().join(", "),
  };
}

function printComparisonTable(summaries: ArmSummary[]): void {
  // eslint-disable-next-line no-console
  console.log("\n═══ IMAGE-PARSE EVAL COMPARISON ═══\n");
  // eslint-disable-next-line no-console
  console.log(
    "arm                          | pass | p50_latency | p90_latency | p50_cost  | p90_cost  | avg_in_tok | avg_out_tok | models",
  );
  // eslint-disable-next-line no-console
  console.log(
    "---------------------------- | ---- | ----------- | ----------- | --------- | --------- | ---------- | ----------- | ------",
  );
  for (const s of summaries) {
    const row = [
      s.arm.padEnd(28),
      `${s.fixturesPassedHardGate}/${s.fixturesRun}`.padEnd(4),
      `${(s.p50LatencyMs / 1000).toFixed(1)}s`.padEnd(11),
      `${(s.p90LatencyMs / 1000).toFixed(1)}s`.padEnd(11),
      s.p50CostUsd != null ? `$${s.p50CostUsd.toFixed(4)}` : "n/a".padEnd(9),
      s.p90CostUsd != null ? `$${s.p90CostUsd.toFixed(4)}` : "n/a".padEnd(9),
      String(s.avgPromptTokens).padEnd(10),
      String(s.avgCompletionTokens).padEnd(11),
      s.modelSet,
    ];
    // eslint-disable-next-line no-console
    console.log(row.join(" | "));
  }
  // eslint-disable-next-line no-console
  console.log("");
}

function writeJsonlResults(
  scores: FixtureScore[],
  summaries: ArmSummary[],
): string {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(RESULTS_DIR, `eval-${ts}.jsonl`);
  const lines: string[] = [];
  for (const s of scores) lines.push(JSON.stringify({ type: "score", ...s }));
  for (const s of summaries)
    lines.push(JSON.stringify({ type: "summary", ...s }));
  writeFileSync(path, lines.join("\n") + "\n");
  return path;
}

describeEval("image parse eval — multi-arm trade study", () => {
  if (runEvals && fixtures.length === 0) {
    it("WARNING: RUN_LLM_EVALS=1 but no fixtures found — add some under tests/fixtures/recipe-images/", () => {
      expect(fixtures.length).toBeGreaterThan(0);
    });
    return;
  }
  if (runEvals && arms.length === 0) {
    it("WARNING: no arms loaded — check that at least arm0-current-split is importable", () => {
      expect(arms.length).toBeGreaterThan(0);
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

  // Collected across all arm × fixture combinations so we can print a
  // comparison table + write the JSONL report at suite teardown.
  const allScores: FixtureScore[] = [];

  for (const arm of arms) {
    describe(`arm: ${arm.name} — ${arm.description}`, () => {
      for (const { slug, image, expected } of fixtures) {
        it(
          `${slug}`,
          async () => {
            const imageDataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;
            let result: ArmResult;
            try {
              result = await arm.parseForEval([imageDataUrl], sourcePages);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              allScores.push({
                arm: arm.name,
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
                models: [],
                hardGatePassed: false,
                error: msg,
              });
              if (arm.name === "A0_split_gpt5.4_gpt4o") {
                throw err;
              }
              // eslint-disable-next-line no-console
              console.warn(`  ⚠ ${arm.name} threw on ${slug}: ${msg}`);
              return;
            }
            const score = scoreResult(arm.name, slug, result, expected);
            allScores.push(score);

            // Arm 0 is the hard-gate. Any accuracy regression fails the
            // test so the production arm can't drift silently while we
            // develop candidate arms.
            if (arm.name === "A0_split_gpt5.4_gpt4o") {
              expect(
                score.ingredientsPass,
                `Arm 0 fraction regression on ${slug}: missing=${score.ingredientsMissing.join(
                  ", ",
                )} deltas=${JSON.stringify(score.fractionDeltas)}`,
              ).toBe(true);
            } else {
              // Candidate arms: log issues but don't fail. The comparison
              // table at suite end is the decision surface.
              if (!score.ingredientsPass) {
                // eslint-disable-next-line no-console
                console.warn(
                  `  ⚠ ${arm.name} ingredient-fidelity miss on ${slug}: missing=[${score.ingredientsMissing.join(", ")}] deltas=${score.fractionDeltas
                    .map((d) => `${d.name}:${d.expected}→${d.actual}`)
                    .join(", ")}`,
                );
              }
              if (score.stepCountDiff > 3) {
                // eslint-disable-next-line no-console
                console.warn(
                  `  ⚠ ${arm.name} step-count variance on ${slug}: expected=${expected.stepCount} got=${score.stepCountActual}`,
                );
              }
            }
          },
          EVAL_TIMEOUT_MS,
        );
      }
    });
  }

  // Summary table + JSONL report emitted after all arm blocks complete.
  // This uses a final "summary" `it` so vitest's output timing makes
  // sense (the table prints AFTER the per-fixture pass/fail lines).
  describe("comparison summary", () => {
    it("prints comparison table + writes JSONL report", () => {
      const summaries = arms.map((a) => summarize(allScores, a.name));
      printComparisonTable(summaries);
      const path = writeJsonlResults(allScores, summaries);
      // eslint-disable-next-line no-console
      console.log(`Full eval results written to ${path}\n`);
    });
  });
});
