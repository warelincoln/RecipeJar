/**
 * Arm 2 — single Claude Sonnet 4.5 call with merged schema. Candidate
 * for the cost trade study. Sonnet 4.5 is Anthropic's flagship vision
 * model; pricing is in the neighborhood of gpt-4o with typically faster
 * per-token throughput for vision inputs.
 *
 * Uses Anthropic's tool-use pattern for structured JSON output: the
 * recipe schema is declared as a tool's input_schema and tool_choice
 * forces the model to invoke it. The tool_use block's input is the
 * structured recipe — no JSON parsing from free-text.
 *
 * Image inputs go as `type: "image"` blocks with `source.type:
 * "base64"`. Our image URLs are `data:image/jpeg;base64,XXX` so we
 * split on the comma and pass the base64 portion.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SourcePage } from "@orzo/shared";
import {
  normalizeToCandidate,
  buildErrorCandidate,
} from "../../normalize.js";
import { MONOLITHIC_PROMPT } from "./monolithic-prompt.js";
import {
  MONOLITHIC_SCHEMA,
  monolithicToRawExtraction,
  type MonolithicResult,
} from "./monolithic-schema.js";
import type { ArmResult, ImageParseArm } from "./types.js";

// Anthropic model IDs use hyphens, not dots. Sonnet 4.6 was released after
// the plan was written (2026-04-21 eval harness setup); it supersedes 4.5
// at the same price tier with strictly better vision accuracy. Using 4.6
// so eval results reflect what would actually ship.
const MODEL = "claude-sonnet-4-6";
const TOOL_NAME = "emit_recipe";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
});

interface Base64Image {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  data: string;
}

/**
 * Accept a data URL (our production + eval path) or a plain https URL.
 * Data URLs get converted to Anthropic's base64-source format; https
 * URLs would use the url-source format — eval always uses data URLs
 * so we only build that path for now.
 */
function toBase64Image(dataUrl: string): Base64Image {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error(
      `arm2-claude-sonnet expected data URL, got ${dataUrl.slice(0, 40)}…`,
    );
  }
  const mediaType = match[1] as Base64Image["mediaType"];
  return { mediaType, data: match[2] };
}

export async function parseForEvalClaude(
  model: string,
  armName: string,
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<ArmResult> {
  const imageBlocks = imageUrls.map((url) => {
    const { mediaType, data } = toBase64Image(url);
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: mediaType,
        data,
      },
    };
  });

  const startedAt = Date.now();
  let response: Anthropic.Messages.Message;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: 4500,
      // Anthropic default temperature is 1.0 (high variance). Lock to 0
      // for the same fraction-fidelity reasoning as Arm 0 — we want the
      // model to pick the same unicode-fraction reading every time.
      temperature: 0,
      system: MONOLITHIC_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Emit the extracted recipe as structured JSON. Call this tool exactly once per parse.",
          // Anthropic's tool input_schema uses standard JSON Schema,
          // compatible with our MONOLITHIC_SCHEMA shape. Cast away the
          // OpenAI-flavored readonly constraints — the SDK accepts
          // plain object schemas.
          input_schema: MONOLITHIC_SCHEMA as unknown as Anthropic.Messages.Tool.InputSchema,
        },
      ],
      // Force the model to call the recipe tool so we get structured
      // output deterministically instead of maybe-a-text-response.
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: "Extract the recipe from these images as structured JSON via the emit_recipe tool.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[${armName}] Anthropic call failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      candidate: buildErrorCandidate("image", sourcePages),
      calls: [],
      wallClockMs: Date.now() - startedAt,
    };
  }
  const latencyMs = Date.now() - startedAt;

  // Find the tool_use block — Anthropic's response.content is an array
  // of blocks; with tool_choice forced, exactly one tool_use block
  // should be present.
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use" && block.name === TOOL_NAME,
  );
  if (!toolUseBlock) {
    throw new Error(
      `[${armName}] expected ${TOOL_NAME} tool_use block in response, got: ${response.content
        .map((b) => b.type)
        .join(", ")}`,
    );
  }

  const parsed = toolUseBlock.input as MonolithicResult;

  const callMetric = {
    label: "monolithic",
    model,
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
    },
    latencyMs,
  };

  if (!parsed.ingredients || parsed.ingredients.length === 0) {
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

async function parseForEval(
  imageUrls: string[],
  sourcePages: SourcePage[],
): Promise<ArmResult> {
  return parseForEvalClaude(
    MODEL,
    "arm2-claude-sonnet",
    imageUrls,
    sourcePages,
  );
}

export const arm2ClaudeSonnet: ImageParseArm = {
  name: "A2_mono_claude_sonnet",
  description: "Claude Sonnet 4.5 single call, merged schema via tool-use, temp:0",
  parseForEval,
};
