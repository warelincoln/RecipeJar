const MAX_CONCURRENT = 2;

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
