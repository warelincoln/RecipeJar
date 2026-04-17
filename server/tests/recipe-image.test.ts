import { describe, it, expect } from "vitest";
import { normalizeImageUrlForFetch } from "../src/services/recipe-image.service.js";

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
