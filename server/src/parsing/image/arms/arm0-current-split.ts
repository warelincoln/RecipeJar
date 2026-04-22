/**
 * Arm 0 — the production split-call architecture, wrapped for the eval
 * harness so we can score accuracy + capture per-call token/latency/cost
 * metrics alongside the candidate monolithic arms.
 *
 * This does NOT duplicate the orchestration — it reuses the exported
 * `runSplitCallForEval` + `mergeSplitCallResults` from the production
 * adapter. Whatever ships to Railway is exactly what Arm 0 evaluates.
 */

import type { SourcePage } from "@orzo/shared";
import {
  buildImageContent,
  runSplitCallForEval,
  mergeSplitCallResults,
} from "../image-parse.adapter.js";
import { normalizeToCandidate, buildErrorCandidate } from "../../normalize.js";
import type { ArmResult, ImageParseArm, ArmCallMetric } from "./types.js";

async function parseForEval(
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<ArmResult> {
  const imageContent = buildImageContent(imageUrls);
  const wallStartedAt = Date.now();
  const { ingredients, steps } = await runSplitCallForEval(imageContent);
  const wallClockMs = Date.now() - wallStartedAt;

  // Per-call metrics for the summary table. Rejected legs have no usage
  // info — record the call label but skip it from metrics so sums aren't
  // inflated by zeroes that look like real readings.
  const calls: ArmCallMetric[] = [];
  if (ingredients.status === "fulfilled") {
    calls.push({
      label: "ingredients",
      model: ingredients.value.model,
      usage: ingredients.value.usage,
      latencyMs: ingredients.value.latencyMs,
    });
  }
  if (steps.status === "fulfilled") {
    calls.push({
      label: "steps",
      model: steps.value.model,
      usage: steps.value.usage,
      latencyMs: steps.value.latencyMs,
    });
  }

  // Reuse the production branching — same failure modes, same
  // partial-success flag — so eval scoring sees exactly what ships.
  if (ingredients.status === "rejected") {
    return {
      candidate: buildErrorCandidate("image", sourcePages),
      calls,
      wallClockMs,
    };
  }
  if (ingredients.value.data.ingredients.length === 0) {
    return {
      candidate: buildErrorCandidate("image", sourcePages),
      calls,
      wallClockMs,
    };
  }
  if (steps.status === "rejected") {
    const merged = mergeSplitCallResults(ingredients.value.data, null);
    const candidate = normalizeToCandidate(merged, "image", sourcePages);
    return {
      candidate: { ...candidate, extractionError: "steps_failed" },
      calls,
      wallClockMs,
    };
  }

  const merged = mergeSplitCallResults(
    ingredients.value.data,
    steps.value.data,
  );
  const candidate = normalizeToCandidate(merged, "image", sourcePages);
  return { candidate, calls, wallClockMs };
}

export const arm0CurrentSplit: ImageParseArm = {
  name: "A0_split_gpt5.4_gpt4o",
  description:
    "Current production: gpt-5.4 (ingredients) + gpt-4o (steps) in parallel",
  parseForEval,
};
