/**
 * Arm 1 — single gpt-4o call with merged schema. Candidate for the cost
 * trade study. Halves image input tokens (one call vs current two)
 * AND uses a cheaper model than current Arm 0's gpt-5.4 ingredient leg.
 *
 * Fraction-fidelity risk: the 2026-04-19 decision that drove the split
 * called out gpt-4o as riskier than gpt-5.4 for ingredients. But the
 * context was a DEDICATED ingredient call with no step context. A
 * monolithic call that sees both ingredients and steps at once may
 * behave differently (better or worse) — eval will tell.
 *
 * Reuses ../normalize.js unchanged so the parsed candidate is identical
 * in shape to Arm 0's output. The eval scorer doesn't need to know which
 * arm produced which candidate.
 */

import OpenAI from "openai";
import type { SourcePage } from "@orzo/shared";
import {
  normalizeToCandidate,
  buildErrorCandidate,
} from "../../normalize.js";
import { buildImageContent } from "../image-parse.adapter.js";
import { MONOLITHIC_PROMPT } from "./monolithic-prompt.js";
import {
  monolithicSchemaForOpenAI,
  monolithicToRawExtraction,
  type MonolithicResult,
} from "./monolithic-schema.js";
import type { ArmResult, ImageParseArm } from "./types.js";

const MODEL = "gpt-4o";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
});

async function parseForEval(
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<ArmResult> {
  const imageContent = buildImageContent(imageUrls);
  const startedAt = Date.now();

  let response: OpenAI.Chat.Completions.ChatCompletion;
  try {
    response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: MONOLITHIC_PROMPT },
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
        json_schema: monolithicSchemaForOpenAI,
      },
      // Sum of split-call budgets (2500 + 2000 = 4500). Gives the model
      // headroom for verbose recipes that span both ingredient and step
      // token budgets in one response.
      max_completion_tokens: 4500,
      // Same reasoning as Arm 0: fraction fidelity on scalable amounts
      // is the hard bar. Deterministic output drops visually-similar
      // unicode-fraction flip risk.
      temperature: 0,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[arm1-gpt4o-mono] OpenAI call failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      candidate: buildErrorCandidate("image", sourcePages),
      calls: [],
      wallClockMs: Date.now() - startedAt,
    };
  }
  const latencyMs = Date.now() - startedAt;

  const choice = response.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error(
      "Arm 1 truncated (finish_reason=length). Raise max_completion_tokens.",
    );
  }
  const content = choice?.message?.content;
  if (!content) {
    throw new Error("Arm 1 returned empty content");
  }

  const parsed = JSON.parse(content) as MonolithicResult;

  const callMetric = {
    label: "monolithic",
    model: MODEL,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
    },
    latencyMs,
  };

  // Parity check with Arm 0's failure branches: empty ingredients =
  // unusable recipe → error candidate.
  if (parsed.ingredients.length === 0) {
    return {
      candidate: buildErrorCandidate("image", sourcePages),
      calls: [callMetric],
      wallClockMs: latencyMs,
    };
  }

  const raw = monolithicToRawExtraction(parsed);
  const candidate = normalizeToCandidate(raw, "image", sourcePages);
  return { candidate, calls: [callMetric], wallClockMs: latencyMs };
}

export const arm1Gpt4oMono: ImageParseArm = {
  name: "A1_mono_gpt4o",
  description: "gpt-4o single call, merged schema, detail:high, temp:0",
  parseForEval,
};
