import { describe, it, expect } from "vitest";
import { isoDurationToMinutes } from "../src/parsing/time.js";

describe("isoDurationToMinutes", () => {
  it("parses minutes-only durations", () => {
    expect(isoDurationToMinutes("PT15M")).toBe(15);
    expect(isoDurationToMinutes("PT1M")).toBe(1);
    expect(isoDurationToMinutes("PT90M")).toBe(90);
  });

  it("parses hours-only durations", () => {
    expect(isoDurationToMinutes("PT1H")).toBe(60);
    expect(isoDurationToMinutes("PT2H")).toBe(120);
  });

  it("parses combined hours and minutes", () => {
    expect(isoDurationToMinutes("PT1H30M")).toBe(90);
    expect(isoDurationToMinutes("PT2H15M")).toBe(135);
  });

  it("rounds seconds to the nearest minute", () => {
    expect(isoDurationToMinutes("PT45S")).toBe(1);
    expect(isoDurationToMinutes("PT30S")).toBe(1);
    expect(isoDurationToMinutes("PT1M30S")).toBe(2);
  });

  it("returns null for sub-minute durations that round to 0", () => {
    expect(isoDurationToMinutes("PT29S")).toBeNull();
    expect(isoDurationToMinutes("PT0S")).toBeNull();
  });

  it("returns null for null or undefined", () => {
    expect(isoDurationToMinutes(null)).toBeNull();
    expect(isoDurationToMinutes(undefined)).toBeNull();
  });

  it("returns null for empty or whitespace strings", () => {
    expect(isoDurationToMinutes("")).toBeNull();
    expect(isoDurationToMinutes("   ")).toBeNull();
  });

  it("returns null for unparseable strings", () => {
    expect(isoDurationToMinutes("garbage")).toBeNull();
    expect(isoDurationToMinutes("15 minutes")).toBeNull();
    expect(isoDurationToMinutes("1:30")).toBeNull();
    expect(isoDurationToMinutes("PT")).toBeNull();
  });

  it("tolerates leading date components it doesn't care about", () => {
    // The domain (recipes) won't produce these, but we shouldn't crash.
    expect(isoDurationToMinutes("P0DT45M")).toBe(45);
  });

  it("handles non-string inputs defensively", () => {
    // Runtime safety for callers that pass through untyped metadata
    expect(
      isoDurationToMinutes(15 as unknown as string),
    ).toBeNull();
  });
});
