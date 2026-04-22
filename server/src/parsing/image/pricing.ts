/**
 * Model pricing table + cost estimator for image parse instrumentation.
 *
 * Input/output rates are USD per 1,000,000 tokens. Numbers here are used for
 * the `estimated_cost_usd` field on `server_parse_tokens` analytics events
 * and for eval summary tables — NOT for billing or invoicing. When the model
 * vendor changes pricing, update this table. A ±10% drift in the numbers
 * here doesn't change any product decision because we compare RELATIVE cost
 * across arms (current split vs candidate monolithic) on the same fixtures,
 * so the constant factor cancels.
 *
 * Sources (verify before trusting the absolute dollars):
 *  - OpenAI: https://openai.com/pricing — gpt-5.4, gpt-4o pricing pages
 *  - Anthropic: https://www.anthropic.com/pricing — Claude Sonnet / Haiku
 *
 * Image tokens are already included in OpenAI's `prompt_tokens` counter on
 * vision responses (they get tokenized via the tiling algorithm before the
 * model sees them), so we don't need a separate image-token accounting —
 * multiply `prompt_tokens × input_rate` and `completion_tokens × output_rate`
 * and sum. Anthropic works the same way on `input_tokens` / `output_tokens`.
 */

export interface ModelPricing {
  /** USD per 1,000,000 input (prompt) tokens. */
  inputPerMillion: number;
  /** USD per 1,000,000 output (completion) tokens. */
  outputPerMillion: number;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

/**
 * Pricing as of 2026-04-21. Update when vendors change rates. Keys are the
 * exact model strings we pass to the APIs so the lookup is direct.
 */
const PRICING: Record<string, ModelPricing> = {
  // OpenAI — vision-capable chat models
  "gpt-5.4": { inputPerMillion: 5.0, outputPerMillion: 15.0 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },

  // Anthropic — vision-capable Claude models. Anthropic uses hyphen not
  // dot IDs ("claude-sonnet-4-6", not "claude-sonnet-4.5"). Keep both
  // the shorthand ID and the dated aliases here so the lookup works
  // regardless of how the arm references them.
  "claude-sonnet-4-6": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-sonnet-4-5-20250929": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-haiku-4-5-20251001": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
};

/**
 * Estimate USD cost for a single API call given the model + token usage.
 * Returns null for unknown models (caller should log a warning; the event
 * still emits with null cost so we don't lose the token-count signal).
 */
export function estimateCostUsd(
  model: string,
  usage: TokenUsage,
): number | null {
  const price = PRICING[model];
  if (!price) return null;

  const inputCost = (usage.prompt_tokens * price.inputPerMillion) / 1_000_000;
  const outputCost =
    (usage.completion_tokens * price.outputPerMillion) / 1_000_000;
  return inputCost + outputCost;
}

/**
 * Return the pricing entry for a model, or null if not in the table.
 * Exported for tests + the eval harness's summary table.
 */
export function getPricing(model: string): ModelPricing | null {
  return PRICING[model] ?? null;
}

/**
 * Test-only accessor for the pricing table snapshot. Kept internal-ish via
 * no default export; callers outside tests should use `getPricing`.
 */
export function __getPricingTableForTests(): Readonly<
  Record<string, ModelPricing>
> {
  return PRICING;
}
