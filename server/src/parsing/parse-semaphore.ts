// README advertises "up to 3 image-based recipes concurrently." Matches
// that promise. Each parse now fires TWO parallel OpenAI calls (split-call
// architecture), so MAX_CONCURRENT=3 means up to 6 simultaneous OpenAI
// requests server-wide. Well under the 500 RPM Tier 1 cap at sustained load.
const MAX_CONCURRENT = 3;

let active = 0;
const waiting: Array<() => void> = [];

export async function acquireParseLock(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  return new Promise<void>((resolve) => {
    waiting.push(() => {
      active++;
      resolve();
    });
  });
}

export function releaseParseLock(): void {
  active--;
  const next = waiting.shift();
  if (next) next();
}
