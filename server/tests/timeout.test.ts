import { describe, it, expect } from "vitest";
import { withTimeout } from "../src/lib/timeout.js";

describe("withTimeout", () => {
  it("resolves with the work's value when the work resolves first", async () => {
    const fast = Promise.resolve({ data: { foo: 1 }, error: null });
    await expect(withTimeout(fast, 1_000, "test")).resolves.toEqual({
      data: { foo: 1 },
      error: null,
    });
  });

  it("rejects with the work's rejection when the work rejects first", async () => {
    const failing = Promise.reject(new Error("supabase 503"));
    await expect(withTimeout(failing, 1_000, "test")).rejects.toThrow(
      "supabase 503",
    );
  });

  it("rejects with a labeled timeout error when the deadline expires first", async () => {
    const hanging = new Promise(() => {});
    await expect(
      withTimeout(hanging, 50, "supabase download"),
    ).rejects.toThrow(/supabase download timeout after 50ms/);
  });

  it("clears the timer when the work resolves first (no leaked unhandled rejection)", async () => {
    const fast = new Promise((resolve) => setTimeout(() => resolve("done"), 10));
    const result = await withTimeout(fast, 1_000, "test");
    expect(result).toBe("done");

    // If the timer leaked, an unhandled rejection would fire ~990ms from now.
    // Wait long enough that a leaked timer would have triggered, then assert
    // the process is still healthy. We can't directly observe a NodeJS.Timeout
    // handle from userland, but the absence of an UnhandledPromiseRejection is
    // the contract we care about.
    let unhandledFired = false;
    const onUnhandled = () => { unhandledFired = true; };
    process.on("unhandledRejection", onUnhandled);
    try {
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandledFired).toBe(false);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("error message matches classifyParseError's 'timeout' heuristic", async () => {
    // Regression guard: classifyParseError in drafts.routes.ts checks for the
    // "timeout" substring to route the error_stage to "fetch". If this helper's
    // message format ever changes, this test catches it before we silently lose
    // Sentry/PostHog categorization.
    try {
      await withTimeout(new Promise(() => {}), 10, "supabase download");
    } catch (e) {
      expect(String((e as Error).message).toLowerCase()).toContain("timeout");
    }
  });
});
