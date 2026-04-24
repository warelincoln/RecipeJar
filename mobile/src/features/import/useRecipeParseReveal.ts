import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo } from "react-native";
import type { EditedRecipeCandidate } from "@orzo/shared";
import { buildRevealPlan, type RevealPlan } from "./recipeParseReveal";

/** Delay between each revealed word (~6000 WPM: 60000 ms ÷ 6000 words). */
const MS_PER_WORD = 60000 / 6000;

export function useRecipeParseReveal(
  candidate: EditedRecipeCandidate,
  parseRevealToken: number,
): {
  plan: RevealPlan;
  revealedWordCount: number;
  isRevealing: boolean;
} {
  // Plan is latched per reveal epoch (`parseRevealToken`). Keying the memo
  // on the candidate fingerprint caused a nasty regression: every keystroke
  // in the title field mutated the candidate, rebuilt the plan with new
  // totalWords, restarted the interval from revealed=0, and visibly
  // "reset" the field. Bug was reported 2026-04-23 (brightfarms.com edit).
  const plan = useMemo(
    () => buildRevealPlan(candidate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parseRevealToken],
  );

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduceMotion(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const shouldAnimate = parseRevealToken > 0 && !reduceMotion && plan.totalWords > 0;

  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!shouldAnimate) {
      setRevealed(plan.totalWords);
      return;
    }
    setRevealed(0);
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setRevealed(n);
      if (n >= plan.totalWords) {
        clearInterval(id);
      }
    }, MS_PER_WORD);
    return () => clearInterval(id);
  }, [shouldAnimate, parseRevealToken, plan.totalWords]);

  const revealedWordCount = shouldAnimate ? revealed : plan.totalWords;
  const isRevealing = shouldAnimate && revealed < plan.totalWords;

  return {
    plan,
    revealedWordCount,
    isRevealing,
  };
}
