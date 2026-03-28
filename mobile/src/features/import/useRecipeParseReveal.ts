import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo } from "react-native";
import type { EditedRecipeCandidate } from "@recipejar/shared";
import {
  buildRevealPlan,
  candidateContentFingerprint,
  type RevealPlan,
} from "./recipeParseReveal";

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
  const fingerprint = useMemo(
    () => candidateContentFingerprint(candidate),
    [candidate],
  );
  const plan = useMemo(() => buildRevealPlan(candidate), [fingerprint]);

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
  }, [shouldAnimate, parseRevealToken, plan.totalWords, fingerprint]);

  const revealedWordCount = shouldAnimate ? revealed : plan.totalWords;
  const isRevealing = shouldAnimate && revealed < plan.totalWords;

  return {
    plan,
    revealedWordCount,
    isRevealing,
  };
}
