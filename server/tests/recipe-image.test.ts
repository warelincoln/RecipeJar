import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { createSignedUrlMock, createSignedUrlsMock } = vi.hoisted(() => ({
  createSignedUrlMock: vi.fn(),
  createSignedUrlsMock: vi.fn(),
}));

vi.mock("../src/services/supabase.js", () => ({
  getSupabase: () => ({
    storage: {
      from: () => ({
        createSignedUrl: createSignedUrlMock,
        createSignedUrls: createSignedUrlsMock,
      }),
    },
  }),
}));

import {
  normalizeImageUrlForFetch,
  resolveImageUrls,
  resolveImageUrlsBatch,
  __clearSignedUrlCacheForTests,
} from "../src/services/recipe-image.service.js";

beforeEach(() => {
  createSignedUrlMock.mockReset();
  createSignedUrlsMock.mockReset();
  __clearSignedUrlCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

// --- Cluster A: URL normalization for imageUrl downloads ---------------

describe("normalizeImageUrlForFetch", () => {
  it("prepends https: to protocol-relative URLs (hungry-girl CloudFront pattern)", () => {
    // Real example observed in PostHog `server_hero_image_missing`
    // reason=download_failed:
    //   https://www.hungry-girl.com/recipe-makeovers/low-carb-patty-melt-burger-bowl-recipe
    //   → metadata.imageUrl = "//d2gtpjxvvd720b.cloudfront.net/.../recipe.jpg"
    const result = normalizeImageUrlForFetch(
      "//d2gtpjxvvd720b.cloudfront.net/system/recipe/image/6538/recipe.jpg",
    );
    expect(result).toBe(
      "https://d2gtpjxvvd720b.cloudfront.net/system/recipe/image/6538/recipe.jpg",
    );
  });

  it("leaves fully-qualified https URLs untouched (modulo URL normalization)", () => {
    const result = normalizeImageUrlForFetch(
      "https://cdn.example.com/recipes/pancakes.jpg",
    );
    expect(result).toBe("https://cdn.example.com/recipes/pancakes.jpg");
  });

  it("leaves fully-qualified http URLs untouched", () => {
    const result = normalizeImageUrlForFetch(
      "http://cdn.example.com/recipes/pancakes.jpg",
    );
    expect(result).toBe("http://cdn.example.com/recipes/pancakes.jpg");
  });

  it("trims surrounding whitespace before normalizing", () => {
    const result = normalizeImageUrlForFetch(
      "  //cdn.example.com/image.jpg  ",
    );
    expect(result).toBe("https://cdn.example.com/image.jpg");
  });

  it("returns null for null / undefined / empty", () => {
    expect(normalizeImageUrlForFetch(null)).toBeNull();
    expect(normalizeImageUrlForFetch(undefined)).toBeNull();
    expect(normalizeImageUrlForFetch("")).toBeNull();
    expect(normalizeImageUrlForFetch("   ")).toBeNull();
  });

  it("returns null for non-http(s) schemes", () => {
    // data URLs, ftp, etc. — nothing we'd successfully fetch + store
    expect(
      normalizeImageUrlForFetch("data:image/jpeg;base64,/9j/4AAQ..."),
    ).toBeNull();
    expect(
      normalizeImageUrlForFetch("ftp://example.com/image.jpg"),
    ).toBeNull();
  });

  it("returns null for strings that don't parse as URLs", () => {
    expect(normalizeImageUrlForFetch("not a url")).toBeNull();
    expect(normalizeImageUrlForFetch("/relative/path.jpg")).toBeNull();
    expect(normalizeImageUrlForFetch("relative.jpg")).toBeNull();
  });

  it("preserves URL query strings and fragments", () => {
    // Some CDNs include signing params we don't want to strip
    const result = normalizeImageUrlForFetch(
      "//cdn.example.com/image.jpg?token=abc&expires=123",
    );
    expect(result).toBe(
      "https://cdn.example.com/image.jpg?token=abc&expires=123",
    );
  });
});

// --- Part C: server-side signed-URL cache ------------------------------

describe("resolveImageUrls signed-URL cache", () => {
  it("returns cached signed URLs on repeat call within TTL", async () => {
    let counter = 0;
    createSignedUrlMock.mockImplementation((path: string) =>
      Promise.resolve({
        data: { signedUrl: `https://signed/${path}?token=${++counter}` },
        error: null,
      }),
    );

    const heroPath = "user/recipes/abc/hero.jpg";
    const first = await resolveImageUrls(heroPath);
    const second = await resolveImageUrls(heroPath);

    // hero + thumb on the first call, zero on the second.
    expect(createSignedUrlMock).toHaveBeenCalledTimes(2);
    expect(second.imageUrl).toBe(first.imageUrl);
    expect(second.thumbnailUrl).toBe(first.thumbnailUrl);
  });

  it("re-signs after cache expires (advance 56 min past signing)", async () => {
    vi.useFakeTimers();
    const start = new Date("2026-04-17T00:00:00Z").getTime();
    vi.setSystemTime(start);

    let counter = 0;
    createSignedUrlMock.mockImplementation((path: string) =>
      Promise.resolve({
        data: { signedUrl: `https://signed/${path}?token=${++counter}` },
        error: null,
      }),
    );

    const heroPath = "user/recipes/abc/hero.jpg";
    await resolveImageUrls(heroPath);
    expect(createSignedUrlMock).toHaveBeenCalledTimes(2);

    // Signed URLs live 60 min; buffer is 5 min, so 56 min in the cache
    // has only 4 min of life left and must be treated as a miss.
    vi.setSystemTime(start + 56 * 60 * 1000);
    await resolveImageUrls(heroPath);
    expect(createSignedUrlMock).toHaveBeenCalledTimes(4);
  });

  it("does not cache signing errors", async () => {
    createSignedUrlMock.mockResolvedValue({
      data: null,
      error: { message: "fail" },
    });

    const heroPath = "user/recipes/x/hero.jpg";
    const first = await resolveImageUrls(heroPath);
    const second = await resolveImageUrls(heroPath);

    expect(first.imageUrl).toBeNull();
    expect(first.thumbnailUrl).toBeNull();
    expect(second.imageUrl).toBeNull();
    // Both attempts must re-hit Supabase so a transient error can recover
    // on the next request instead of being sticky until process restart.
    expect(createSignedUrlMock).toHaveBeenCalledTimes(4);
  });
});

describe("resolveImageUrlsBatch signed-URL cache", () => {
  function mockBatchEcho() {
    let counter = 0;
    createSignedUrlsMock.mockImplementation((paths: string[]) =>
      Promise.resolve({
        data: paths.map((p) => ({
          path: p,
          signedUrl: `https://signed/${p}?token=${++counter}`,
          error: null,
        })),
        error: null,
      }),
    );
  }

  it("serves the whole batch from cache on the second call", async () => {
    mockBatchEcho();
    const paths = ["user/recipes/a/hero.jpg", "user/recipes/b/hero.jpg"];

    const first = await resolveImageUrlsBatch(paths);
    createSignedUrlsMock.mockClear();
    const second = await resolveImageUrlsBatch(paths);

    // Every path was cached on the first call (hero + thumb), so the
    // second call must not issue any Supabase request at all.
    expect(createSignedUrlsMock).toHaveBeenCalledTimes(0);
    expect(second).toEqual(first);
  });

  it("only batch-signs the uncached paths on a partial-overlap call", async () => {
    mockBatchEcho();

    await resolveImageUrlsBatch(["user/recipes/a/hero.jpg"]);
    createSignedUrlsMock.mockClear();

    await resolveImageUrlsBatch([
      "user/recipes/a/hero.jpg",
      "user/recipes/b/hero.jpg",
    ]);

    // Two invocations: one for the hero bucket, one for the thumb
    // bucket. Each must carry only the new recipe's path.
    const allPaths = createSignedUrlsMock.mock.calls.map(
      (call) => call[0] as string[],
    );
    const heroCall = allPaths.find((paths) =>
      paths.every((p) => p.endsWith("hero.jpg")),
    );
    const thumbCall = allPaths.find((paths) =>
      paths.every((p) => p.endsWith("thumb.jpg")),
    );
    expect(heroCall).toEqual(["user/recipes/b/hero.jpg"]);
    expect(thumbCall).toEqual(["user/recipes/b/thumb.jpg"]);
  });
});
