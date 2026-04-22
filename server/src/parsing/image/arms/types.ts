import type { ParsedRecipeCandidate, SourcePage } from "@orzo/shared";
import type { TokenUsage } from "../pricing.js";

/**
 * One call inside an arm's parse. Arm 0 (current split) produces 2 calls
 * per parse (ingredients + steps). Arms 1-3 (monolithic candidates)
 * produce exactly 1. The eval harness sums these for per-recipe cost
 * and takes max(latencyMs) for parallel-arm wall-clock latency.
 */
export interface ArmCallMetric {
  /** Human label for the call inside the arm ("ingredients", "steps", "monolithic"). */
  label: string;
  /** Exact model string passed to the vendor API. Feeds the pricing table. */
  model: string;
  usage: TokenUsage;
  /** Wall-clock latency of this specific call (ms). */
  latencyMs: number;
}

/**
 * Result of running an arm against one fixture. `candidate` is the
 * normalized ParsedRecipeCandidate that the eval scorer compares to
 * expected.json — every arm MUST produce this shape so scoring is
 * architecture-agnostic. `calls` is the per-call breakdown for the
 * comparison table.
 */
export interface ArmResult {
  candidate: ParsedRecipeCandidate;
  calls: ArmCallMetric[];
  /**
   * Wall-clock latency of the WHOLE parse (from first API call to final
   * candidate ready). For parallel arms this is max(call latencies); for
   * single-call arms this equals the single call's latency. Computed by
   * the arm itself so we measure what the user would actually wait.
   */
  wallClockMs: number;
}

/**
 * Each arm exposes one function. Signature matches the production
 * parseImages signature + returns richer metrics. The eval harness calls
 * it once per fixture.
 */
export interface ImageParseArm {
  /** Stable identifier, appears in the summary table + JSONL output. */
  name: string;
  /** One-line description for the comparison table. */
  description: string;
  parseForEval(
    imageUrls: string[],
    sourcePages: SourcePage[],
  ): Promise<ArmResult>;
}
