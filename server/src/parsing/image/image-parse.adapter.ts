import OpenAI from "openai";
import type { SourcePage, ParsedRecipeCandidate } from "@orzo/shared";
import {
  normalizeToCandidate,
  buildErrorCandidate,
  type RawExtractionResult,
} from "../normalize.js";
import { INGREDIENTS_PROMPT, STEPS_PROMPT } from "./prompts.js";
import { ingredientsSchema, stepsSchema } from "./schemas.js";
import { estimateCostUsd, type TokenUsage } from "./pricing.js";
import { logEvent } from "../../observability/event-logger.js";
import { trackAnalytics } from "../../observability/analytics.js";

/*
 * IMAGE PARSE — SPLIT-CALL ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────
 *
 *                parseImages(imageUrls, sourcePages)
 *                              │
 *         base64-encoded URLs → imageContent[] (built once)
 *                              │
 *                ┌─────────────┴─────────────┐
 *                ▼                           ▼
 *        callIngredients              callSteps
 *          gpt-5.4                      gpt-4o
 *          detail:high                  detail:high
 *          max_tokens:1500              max_tokens:1200
 *          strict ingredientsSchema     strict stepsSchema
 *          owns: title, servings,       owns: steps, description,
 *            ingredients[], metadata,     stepSignals[],
 *            parseSignals.* (minus         parseSignals.descriptionDetected
 *            descriptionDetected),
 *            ingredientSignals
 *                │                           │
 *                │  Promise.allSettled       │
 *                └─────────────┬─────────────┘
 *                              ▼
 *                        merge + normalize
 *                              │
 *              ┌───────────────┼───────────────┐
 *              ▼               ▼               ▼
 *         A rejected      A ok, B rejected   both ok
 *         (or 0 ings)     partial recipe:    full recipe
 *              │          extractionError:
 *              ▼          "steps_failed"
 *      buildErrorCandidate       │
 *      (existing retake UI)      ▼
 *                         merged candidate with
 *                         empty steps + flag
 *                         (validation engine
 *                          emits STEPS_EXTRACTION_FAILED
 *                          at FLAG severity → warning
 *                          banner in PreviewEditView)
 *
 * WHY SPLIT:
 *   - Output token generation dominated latency in the monolithic call.
 *     Verbose cookbook pages produced 2-3K output tokens at ~50 tok/s,
 *     giving 30-60s on steps prose alone. Splitting lets us (a) run both
 *     calls in parallel so total = max(A, B) not A+B, and (b) swap the
 *     steps call to a faster model + concision prompt without risking
 *     fraction fidelity, which is the hard quality bar.
 *
 * WHY extractionError INSTEAD OF THROWING ON B FAILURE:
 *   - If A produced ingredients, we have a real partial recipe. Forcing
 *     the user to retake just to get steps is worse UX than showing the
 *     extracted ingredients with a "steps couldn't be read — edit manually
 *     or retake" banner. The adapter sets the flag; rules.steps.ts emits
 *     the FLAG; the existing warning-banner UI renders it.
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
});

type ImageContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

/**
 * A single OpenAI call's outcome plus cost-instrumentation payload. We
 * return usage + latency alongside the parsed data so the orchestrator can
 * emit analytics per call. Wrapping (instead of threading a callback) keeps
 * the call helpers pure; the top-level parseImages owns observability.
 */
interface CallOutcome<T> {
  data: T;
  usage: TokenUsage;
  model: string;
  latencyMs: number;
}

export async function parseImages(
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<ParsedRecipeCandidate> {
  // Build the imageContent array ONCE and share it across both calls.
  // Avoids duplicating N object allocations per parse for multi-page imports.
  const imageContent: ImageContentPart[] = imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));

  const pageCount = imageUrls.length;

  // allSettled so one leg's rejection doesn't cancel the other. We decide
  // total vs partial failure based on which legs settled which way.
  const [ingredientsResult, stepsResult] = await Promise.allSettled([
    callIngredients(imageContent),
    callSteps(imageContent),
  ]);

  // Cost instrumentation: emit per-call tokens + an aggregate per-recipe
  // total for each call that actually returned. Rejected calls don't have
  // usage info (the thrown error doesn't carry it), so we report only the
  // legs that settled. This lets us observe real prod p50/p90 cost to
  // compare against the eval-driven candidate architectures — see the
  // plan at ~/.claude/plans/snug-waddling-quiche.md.
  emitCallTelemetry("ingredients", pageCount, ingredientsResult);
  emitCallTelemetry("steps", pageCount, stepsResult);
  emitAggregateCostTelemetry(pageCount, ingredientsResult, stepsResult);

  // Call A (ingredients) is the hard floor. No recipe without ingredients.
  if (ingredientsResult.status === "rejected") {
    console.error(
      "[image-parse] Call A (ingredients) failed:",
      formatError(ingredientsResult.reason),
    );
    return buildErrorCandidate("image", sourcePages);
  }

  // Semantic gate: strict JSON schema guarantees structure, not correctness.
  // An empty ingredients array means the model produced valid JSON but the
  // recipe is useless. Mirror the URL path's isValidAIResponse check.
  if (ingredientsResult.value.data.ingredients.length === 0) {
    console.error("[image-parse] Call A returned zero ingredients");
    return buildErrorCandidate("image", sourcePages);
  }

  // Call B (steps) failed but Call A succeeded → partial success.
  // Surface title + ingredients with an extractionError flag that
  // rules.steps.ts will convert into a user-visible FLAG warning.
  if (stepsResult.status === "rejected") {
    console.error(
      "[image-parse] Call B (steps) failed, surfacing partial candidate:",
      formatError(stepsResult.reason),
    );
    const merged = mergeRaw(ingredientsResult.value.data, null);
    const candidate = normalizeToCandidate(merged, "image", sourcePages);
    return { ...candidate, extractionError: "steps_failed" };
  }

  // Happy path.
  const merged = mergeRaw(
    ingredientsResult.value.data,
    stepsResult.value.data,
  );
  return normalizeToCandidate(merged, "image", sourcePages);
}

/** Per-call telemetry: one event per leg that settled successfully. */
function emitCallTelemetry(
  callLabel: "ingredients" | "steps",
  pageCount: number,
  result: PromiseSettledResult<CallOutcome<unknown>>,
): void {
  if (result.status !== "fulfilled") return;
  const { usage, model, latencyMs } = result.value;
  const costUsd = estimateCostUsd(model, usage);
  logEvent("parse_tokens", {
    callLabel,
    model,
    pageCount,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    latencyMs,
    estimatedCostUsd: costUsd,
  });
  trackAnalytics(
    "server_parse_tokens",
    {
      call_label: callLabel,
      model,
      page_count: pageCount,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.prompt_tokens + usage.completion_tokens,
      latency_ms: latencyMs,
      estimated_cost_usd: costUsd,
    },
    { userId: null },
  );
}

/**
 * Per-recipe aggregate: sums cost/tokens across whatever legs settled so we
 * can compare real prod p50 cost per parse to the eval-study candidates.
 * Emitted even on partial success (one leg failed) so our cost dashboards
 * don't silently lose a chunk of parses — the architecture spec of 2026-04-19
 * explicitly calls out that partial success is a first-class outcome.
 */
function emitAggregateCostTelemetry(
  pageCount: number,
  ingredientsResult: PromiseSettledResult<CallOutcome<unknown>>,
  stepsResult: PromiseSettledResult<CallOutcome<unknown>>,
): void {
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCostUsd = 0;
  let anyCost = false;
  const models: string[] = [];

  for (const r of [ingredientsResult, stepsResult]) {
    if (r.status !== "fulfilled") continue;
    const { usage, model } = r.value;
    totalPromptTokens += usage.prompt_tokens;
    totalCompletionTokens += usage.completion_tokens;
    const costUsd = estimateCostUsd(model, usage);
    if (costUsd != null) {
      totalCostUsd += costUsd;
      anyCost = true;
    }
    models.push(model);
  }

  const architecture =
    ingredientsResult.status === "fulfilled" &&
    stepsResult.status === "fulfilled"
      ? "split_both_ok"
      : ingredientsResult.status === "fulfilled"
        ? "split_ingredients_only"
        : stepsResult.status === "fulfilled"
          ? "split_steps_only"
          : "split_both_failed";

  trackAnalytics(
    "server_parse_cost",
    {
      architecture,
      models,
      page_count: pageCount,
      total_prompt_tokens: totalPromptTokens,
      total_completion_tokens: totalCompletionTokens,
      total_tokens: totalPromptTokens + totalCompletionTokens,
      estimated_cost_usd: anyCost ? totalCostUsd : null,
    },
    { userId: null },
  );
}

/** Result shape from Call A (ingredients). Mirrors the ingredientsSchema keys. */
interface IngredientsResult {
  title: string | null;
  servings: { min: number; max: number | null } | null;
  ingredients: NonNullable<RawExtractionResult["ingredients"]>;
  metadata: NonNullable<RawExtractionResult["metadata"]>;
  signals: {
    structureSeparable: boolean;
    lowConfidenceStructure: boolean;
    poorImageQuality: boolean;
    multiRecipeDetected: boolean;
    confirmedOmission: boolean;
    suspectedOmission: boolean;
  };
  ingredientSignals: NonNullable<RawExtractionResult["ingredientSignals"]>;
}

/** Result shape from Call B (steps). Mirrors the stepsSchema keys. */
interface StepsResult {
  steps: NonNullable<RawExtractionResult["steps"]>;
  description: string | null;
  descriptionDetected: boolean;
  stepSignals: NonNullable<RawExtractionResult["stepSignals"]>;
}

const INGREDIENTS_MODEL = "gpt-5.4";
const STEPS_MODEL = "gpt-4o";

async function callIngredients(
  imageContent: ImageContentPart[],
): Promise<CallOutcome<IngredientsResult>> {
  const startedAt = Date.now();
  const response = await openai.chat.completions.create({
    model: INGREDIENTS_MODEL,
    messages: [
      { role: "system", content: INGREDIENTS_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the recipe's ingredients, title, servings, metadata, and page-level signals from these images:",
          },
          ...imageContent,
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: ingredientsSchema,
    },
    // Bumped from 1500 after eval showed truncation on a recipe with 13+
    // ingredients + signals + metadata. 2500 is still well under the per-call
    // response budget and covers the fattest recipes we've seen.
    max_completion_tokens: 2500,
    // temperature=0 (deterministic) not 0.1. Production testing surfaced
    // non-deterministic Unicode-fraction misreads on a 2/4 import sample
    // (e.g. ⅔ read as ½, or ⅓ as ¼). Fraction accuracy on scalable amounts
    // is the hard ship bar — we'd rather the model lock onto the same
    // reading every time than occasionally flip on visually-similar glyphs.
    // Call B (steps) stays at 0.1 because step prose rewriting benefits
    // from some sampling variety.
    temperature: 0,
  });
  const latencyMs = Date.now() - startedAt;

  const choice = response.choices[0];
  if (choice?.finish_reason === "length") {
    // Truncation mid-JSON guarantees JSON.parse will throw. Surface a clear
    // error instead of "Unexpected end of JSON input" so future triage is
    // obvious.
    throw new Error(
      "Call A truncated (finish_reason=length). Raise max_completion_tokens.",
    );
  }
  const content = choice?.message?.content;
  if (!content) {
    throw new Error("Call A returned empty content");
  }
  return {
    data: JSON.parse(content) as IngredientsResult,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
    },
    model: INGREDIENTS_MODEL,
    latencyMs,
  };
}

async function callSteps(
  imageContent: ImageContentPart[],
): Promise<CallOutcome<StepsResult>> {
  const startedAt = Date.now();
  const response = await openai.chat.completions.create({
    model: STEPS_MODEL,
    messages: [
      { role: "system", content: STEPS_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the recipe's step instructions and description from these images:",
          },
          ...imageContent,
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: stepsSchema,
    },
    // Bumped from 1200 after eval showed truncation on recipes with 6+
    // dense multi-action steps (takikomi-gohan, mochi-waffles). Step text
    // is bounded by the ≤40-words rule but stepSignals/description can add
    // another ~300 tokens. 2000 leaves headroom without overpaying on
    // typical recipes.
    max_completion_tokens: 2000,
    // temperature=0 (deterministic) — same reasoning as Call A. Production
    // test surfaced Call B flipping "1 3/4 tsp" → "1 1/4 tsp" in a step
    // rewrite. Numeric fidelity in steps matters: if the step says "season
    // with 1 3/4 tsp salt" the user cooks with the wrong amount. "Creative
    // concision variety" is not a feature — we want the model to pick the
    // same rewrite every time for the same source, and drop the flip risk.
    temperature: 0,
  });
  const latencyMs = Date.now() - startedAt;

  const choice = response.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error(
      "Call B truncated (finish_reason=length). Raise max_completion_tokens.",
    );
  }
  const content = choice?.message?.content;
  if (!content) {
    throw new Error("Call B returned empty content");
  }
  return {
    data: JSON.parse(content) as StepsResult,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
    },
    model: STEPS_MODEL,
    latencyMs,
  };
}

/**
 * Combine Call A + Call B into a single RawExtractionResult that
 * normalizeToCandidate can process. Call B nullable so we can also build
 * a partial result for the Call-B-failed path.
 */
function mergeRaw(
  a: IngredientsResult,
  b: StepsResult | null,
): RawExtractionResult {
  return {
    // Call A owns these
    title: a.title,
    servings: a.servings,
    ingredients: a.ingredients,
    metadata: a.metadata,
    ingredientSignals: a.ingredientSignals,
    // Call B owns these; defaults when B failed so normalize still sees valid shape
    steps: b?.steps ?? [],
    description: b?.description ?? null,
    stepSignals: b?.stepSignals ?? [],
    // signals is mostly A's, but descriptionDetected is B's
    signals: {
      ...a.signals,
      descriptionDetected: b?.descriptionDetected ?? false,
    },
  };
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}
