/**
 * LLM vision can occasionally misread visually-similar fraction glyphs
 * (½ vs ⅓, ¼ vs ¾, 3/4 vs 1/4). Temperature=0 on both parse calls
 * eliminates the random-flip variance, but it can't fix deterministic
 * misreads caused by fonts or layouts the model consistently
 * mis-parses — that's a residual ~10% failure rate on fractional
 * amounts we can't prompt our way out of.
 *
 * Rather than chase 100% accuracy (which would require either a slower
 * verification pass or a human OCR QA step), we flag fractional amounts
 * at the UI layer and nudge the user to verify once before cooking.
 * Integer amounts don't have the visual-similarity failure mode and
 * don't get flagged.
 */
export function isFractionalAmount(
  amount: number | null | undefined,
): boolean {
  if (amount == null) return false;
  if (!Number.isFinite(amount)) return false;
  return amount !== Math.floor(amount);
}
