import type { EditedRecipeCandidate } from "@recipejar/shared";

export type RevealBlockKind = "title" | "ingredient" | "step";

export interface RevealBlock {
  kind: RevealBlockKind;
  index: number;
  words: string[];
  isHeader: boolean;
}

export interface RevealPlan {
  blocks: RevealBlock[];
  /** Cumulative word index at the start of each block (same length as blocks) */
  offsets: number[];
  totalWords: number;
}

function splitWords(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  return t.split(/\s+/).filter(Boolean);
}

export function buildRevealPlan(candidate: EditedRecipeCandidate): RevealPlan {
  const blocks: RevealBlock[] = [];
  blocks.push({
    kind: "title",
    index: 0,
    words: splitWords(candidate.title ?? ""),
    isHeader: false,
  });
  candidate.ingredients.forEach((ing, index) => {
    blocks.push({
      kind: "ingredient",
      index,
      words: splitWords(ing.text),
      isHeader: ing.isHeader,
    });
  });
  candidate.steps.forEach((step, index) => {
    blocks.push({
      kind: "step",
      index,
      words: splitWords(step.text),
      isHeader: step.isHeader,
    });
  });

  const offsets: number[] = [];
  let total = 0;
  for (const b of blocks) {
    offsets.push(total);
    total += b.words.length;
  }
  return { blocks, offsets, totalWords: total };
}

/** How many words of this block are visible when `revealedWordCount` words have been revealed globally. */
export function visibleWordCountForBlock(
  plan: RevealPlan,
  blockIndex: number,
  revealedWordCount: number,
): number {
  const start = plan.offsets[blockIndex] ?? 0;
  const len = plan.blocks[blockIndex]?.words.length ?? 0;
  return Math.min(len, Math.max(0, revealedWordCount - start));
}

export function sliceWordsToText(words: string[], visibleCount: number): string {
  return words.slice(0, Math.max(0, visibleCount)).join(" ");
}

export function candidateContentFingerprint(candidate: EditedRecipeCandidate): string {
  return JSON.stringify({
    t: candidate.title,
    i: candidate.ingredients.map((x) => ({ x: x.text, h: x.isHeader })),
    s: candidate.steps.map((x) => ({ x: x.text, h: x.isHeader })),
  });
}

export function blockIndexForField(
  plan: RevealPlan,
  kind: RevealBlockKind,
  index: number,
): number {
  return plan.blocks.findIndex((b) => b.kind === kind && b.index === index);
}
