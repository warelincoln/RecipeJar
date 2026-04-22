import OpenAI from "openai";
import type { SourcePage, ParsedRecipeCandidate } from "@orzo/shared";
import {
  normalizeToCandidate,
  buildErrorCandidate,
} from "../normalize.js";
import { RECIPE_PROMPT } from "./prompts.js";
import {
  recipeSchema,
  recipeToRawExtraction,
  type RecipeExtractionResult,
} from "./schemas.js";
import { estimateCostUsd, type TokenUsage } from "./pricing.js";
import { logEvent } from "../../observability/event-logger.js";
import { trackAnalytics } from "../../observability/analytics.js";

/*
 * IMAGE PARSE — SINGLE-CALL ARCHITECTURE (shipped 2026-04-21)
 * ─────────────────────────────────────────────────────────────────────
 *
 *                parseImages(imageUrls, sourcePages)
 *                              │
 *         base64-encoded URLs → imageContent[]
 *                              │
 *                              ▼
 *                       callMonolithic
 *                         gpt-4o
 *                         detail:high
 *                         max_tokens:4500
 *                         strict recipeSchema
 *                         ↓ returns title, servings, ingredients[],
 *                         ↓ steps[], description, metadata,
 *                         ↓ parseSignals (incl. descriptionDetected),
 *                         ↓ ingredientSignals, stepSignals
 *                              │
 *                              ▼
 *                        normalize
 *                              │
 *              ┌───────────────┴───────────────┐
 *              ▼                               ▼
 *        OpenAI rejected /             happy path
 *        zero ingredients              (strict schema
 *              │                        guarantees
 *              ▼                        shape; a single
 *      buildErrorCandidate              response either
 *      (existing retake UI)             fully succeeds
 *                                       or fully fails)
 *
 * HISTORY:
 *   - Pre-2026-04-19: single gpt-5.4 call, 30-45s p50 latency due to
 *     output-token generation dominating.
 *   - 2026-04-19: split into 2 parallel calls (gpt-5.4 ingredients,
 *     gpt-4o steps) to cut p50 latency to ~15s at the cost of sending
 *     images twice. Memory at ~/.claude/projects/…/memory/project_orzo_parse_state.md.
 *   - 2026-04-21: single-call architecture restored via the cost trade
 *     study at ~/.claude/plans/snug-waddling-quiche.md. Eval showed
 *     gpt-4o monolithic passes 5/5 fraction-fidelity fixtures at -42%
 *     cost ($0.048 → $0.028 per recipe) and SLIGHTLY BETTER p50 latency
 *     (19.4s → 18.7s) vs. the split. Claude Sonnet 4.6 + Haiku 4.5
 *     were evaluated as alternative arms and lost on latency (Sonnet
 *     37.7s) and accuracy (Haiku 3/5 fraction gate) respectively. The
 *     split architecture only made sense when the ingredient call had
 *     to be gpt-5.4 (expensive, slow); once the whole parse moved to
 *     gpt-4o, parallelism stopped paying for itself.
 *
 * Per-call token/cost instrumentation emits `parse_tokens` +
 * `server_parse_tokens` (per call) + `server_parse_cost` (per parse
 * aggregate) so we can monitor real prod p50/p90 cost vs. the eval
 * baseline. See ./pricing.ts for the rate table.
 */

const MODEL = "gpt-4o";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
});

export type ImageContentPart =
  OpenAI.Chat.Completions.ChatCompletionContentPart;

/**
 * Build a reusable imageContent array from base64-encoded image URLs.
 * Exported for tests + future cost-study eval runs that need to share
 * the exact input shape used by production.
 */
export function buildImageContent(imageUrls: string[]): ImageContentPart[] {
  return imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));
}

/**
 * Per-call outcome shape. Exported so the eval suite can reach into the
 * adapter for latency + token metrics without re-implementing the call
 * orchestration.
 */
export interface CallOutcome<T> {
  data: T;
  usage: TokenUsage;
  model: string;
  latencyMs: number;
}

export async function parseImages(
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<ParsedRecipeCandidate> {
  const imageContent = buildImageContent(imageUrls);
  const pageCount = imageUrls.length;

  let outcome: CallOutcome<RecipeExtractionResult>;
  try {
    outcome = await callMonolithic(imageContent);
  } catch (err) {
    console.error(
      "[image-parse] Monolithic call failed:",
      formatError(err),
    );
    emitCostTelemetry(pageCount, null, "call_failed");
    return buildErrorCandidate("image", sourcePages);
  }

  emitCostTelemetry(pageCount, outcome, "ok");

  // Semantic gate: strict JSON schema guarantees structure, not
  // correctness. An empty ingredients array means the model produced
  // valid JSON but the recipe is useless. Surface as an error candidate
  // so the retake UI kicks in, matching the pre-monolithic behavior.
  if (outcome.data.ingredients.length === 0) {
    console.error("[image-parse] Monolithic call returned zero ingredients");
    return buildErrorCandidate("image", sourcePages);
  }

  const raw = recipeToRawExtraction(outcome.data);
  return normalizeToCandidate(raw, "image", sourcePages);
}

/**
 * Exported for the eval harness (arms/arm0-*). Same call semantics
 * as parseImages but returns the rich CallOutcome so eval can score
 * accuracy alongside latency + tokens without re-issuing the call.
 * Skips the production telemetry emit — eval runs shouldn't pollute
 * the analytics firehose with repeated fixture parses.
 */
export async function parseImagesForEvalSingleCall(
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<{
  outcome: CallOutcome<RecipeExtractionResult>;
  candidate: ParsedRecipeCandidate;
}> {
  const imageContent = buildImageContent(imageUrls);
  const outcome = await callMonolithic(imageContent);
  if (outcome.data.ingredients.length === 0) {
    return {
      outcome,
      candidate: buildErrorCandidate("image", sourcePages),
    };
  }
  const raw = recipeToRawExtraction(outcome.data);
  return {
    outcome,
    candidate: normalizeToCandidate(raw, "image", sourcePages),
  };
}

async function callMonolithic(
  imageContent: ImageContentPart[],
): Promise<CallOutcome<RecipeExtractionResult>> {
  const startedAt = Date.now();
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: RECIPE_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the recipe from these images as structured JSON:",
          },
          ...imageContent,
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: recipeSchema,
    },
    // Sum of the old split-call budgets (2500 + 2000). Covers the
    // fattest recipes we've seen in eval (13+ ingredients, 8+ dense
    // steps with ≤40-word concision).
    max_completion_tokens: 4500,
    // temperature=0 for deterministic fraction reads. Production
    // testing at temp=0.1 surfaced ⅔↔½ and 1 3/4↔1 1/4 flips on
    // visually-similar unicode glyphs; temp=0 locks the model onto the
    // same reading every time for the same source. Fraction accuracy
    // on scalable amounts is the hard ship bar.
    temperature: 0,
  });
  const latencyMs = Date.now() - startedAt;

  const choice = response.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error(
      "Monolithic call truncated (finish_reason=length). Raise max_completion_tokens.",
    );
  }
  const content = choice?.message?.content;
  if (!content) {
    throw new Error("Monolithic call returned empty content");
  }
  return {
    data: JSON.parse(content) as RecipeExtractionResult,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
    },
    model: MODEL,
    latencyMs,
  };
}

/**
 * Emit per-call parse_tokens + per-recipe server_parse_cost analytics.
 * In the monolithic architecture these are effectively the same — one
 * call per parse — but we keep both event types emitting so the
 * dashboards from the split-call era don't silently lose signal.
 */
function emitCostTelemetry(
  pageCount: number,
  outcome: CallOutcome<RecipeExtractionResult> | null,
  status: "ok" | "call_failed",
): void {
  if (outcome == null) {
    // Call failed outright — emit a minimal cost event so we can track
    // failure rates alongside successful cost distribution.
    trackAnalytics(
      "server_parse_cost",
      {
        architecture: "mono_gpt4o_failed",
        models: [MODEL],
        page_count: pageCount,
        total_prompt_tokens: 0,
        total_completion_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: null,
      },
      { userId: null },
    );
    return;
  }

  const { usage, model, latencyMs } = outcome;
  const costUsd = estimateCostUsd(model, usage);

  logEvent("parse_tokens", {
    callLabel: "monolithic",
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
      call_label: "monolithic",
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
  trackAnalytics(
    "server_parse_cost",
    {
      architecture: status === "ok" ? "mono_gpt4o" : "mono_gpt4o_failed",
      models: [model],
      page_count: pageCount,
      total_prompt_tokens: usage.prompt_tokens,
      total_completion_tokens: usage.completion_tokens,
      total_tokens: usage.prompt_tokens + usage.completion_tokens,
      estimated_cost_usd: costUsd,
    },
    { userId: null },
  );
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Unknown error";
}
