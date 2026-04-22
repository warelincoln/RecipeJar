/**
 * Arm 3 — single Claude Haiku 4.5 call with merged schema. Stretch
 * candidate for the cost trade study. Haiku is Anthropic's cheapest
 * capable vision model — ~4-5x cheaper than Sonnet on both input and
 * output tokens. Faster too.
 *
 * Risk: fraction fidelity. Haiku is a smaller model; historically the
 * tradeoff is speed + cost vs. precision on visually-similar details
 * (unicode fractions, italic vs. roman digits). Only a real candidate
 * if eval shows it passes the hard gate. If it passes, it's the runaway
 * winner on cost + latency.
 *
 * Implementation reuses the exact Claude Sonnet plumbing — only the
 * model string changes. Kept in a separate file rather than a shared
 * "generic-claude" adapter so each arm has one clear owner and the
 * eval summary table has an obvious one-line-per-arm tie-in.
 */

import type { SourcePage } from "@orzo/shared";
import { parseForEvalClaude } from "./arm2-claude-sonnet.js";
import type { ArmResult, ImageParseArm } from "./types.js";

// Anthropic model IDs use hyphens, not dots. The dated alias avoids
// surprise behavior when Anthropic rotates the "latest" pointer.
const MODEL = "claude-haiku-4-5-20251001";

async function parseForEval(
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<ArmResult> {
  return parseForEvalClaude(
    MODEL,
    "arm3-claude-haiku",
    imageUrls,
    sourcePages,
  );
}

export const arm3ClaudeHaiku: ImageParseArm = {
  name: "A3_mono_claude_haiku",
  description: "Claude Haiku 4.5 single call, merged schema via tool-use, temp:0",
  parseForEval,
};
