/**
 * Race a Promise against a deadline.
 *
 * Used for non-cancellable Promises (Supabase JS SDK's .download(), our own
 * fetchUrl helper) where AbortSignal isn't available. The underlying work
 * keeps running in the background after timeout and is GC'd when it
 * eventually settles — fine at our scale (few hundred parses/min worst case).
 *
 * Always clears the timer in `finally` so a fast-resolving work doesn't leave
 * a dead-reject timer running ~ms milliseconds longer than it needs to.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timeout after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
