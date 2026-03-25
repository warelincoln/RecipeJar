import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  assertUrlSafeForSsrf,
} from "../src/parsing/url/url-ssrf-guard.js";
import * as ssrfGuard from "../src/parsing/url/url-ssrf-guard.js";
import { fetchUrl, normalizeUrl } from "../src/parsing/url/url-fetch.service.js";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  return {
    ...actual,
    lookup: lookupMock,
  };
});

describe("assertUrlSafeForSsrf", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("allows public IPv4 literal", async () => {
    await expect(assertUrlSafeForSsrf("http://8.8.8.8/path")).resolves.toBeUndefined();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("blocks loopback IPv4 literal", async () => {
    await expect(assertUrlSafeForSsrf("http://127.0.0.1/")).rejects.toThrow(
      "Target address is not allowed",
    );
  });

  it("blocks private IPv4 literal", async () => {
    await expect(assertUrlSafeForSsrf("https://192.168.1.1/x")).rejects.toThrow(
      "Target address is not allowed",
    );
  });

  it("blocks link-local IPv4 literal", async () => {
    await expect(assertUrlSafeForSsrf("http://169.254.1.1/")).rejects.toThrow(
      "Target address is not allowed",
    );
  });

  it("blocks IPv6 loopback literal", async () => {
    await expect(assertUrlSafeForSsrf("http://[::1]/")).rejects.toThrow(
      "Target address is not allowed",
    );
  });

  it("blocks IPv4-mapped loopback in IPv6 literal", async () => {
    await expect(assertUrlSafeForSsrf("http://[::ffff:127.0.0.1]/")).rejects.toThrow(
      "Target address is not allowed",
    );
  });

  it("rejects non-http(s) scheme", async () => {
    await expect(assertUrlSafeForSsrf("file:///etc/passwd")).rejects.toThrow(
      "Only http(s) URLs are allowed",
    );
  });

  it("rejects URLs with credentials", async () => {
    await expect(
      assertUrlSafeForSsrf("http://user:pass@example.com/"),
    ).rejects.toThrow("URL must not contain credentials");
  });

  it("allows hostname when all resolved addresses are public", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "151.101.1.140", family: 4 },
      { address: "151.101.65.140", family: 4 },
    ]);

    await expect(assertUrlSafeForSsrf("https://example.com/recipe")).resolves.toBeUndefined();
    expect(lookupMock).toHaveBeenCalledWith("example.com", {
      all: true,
      verbatim: true,
    });
  });

  it("blocks hostname when any resolved address is private", async () => {
    lookupMock.mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]);

    await expect(assertUrlSafeForSsrf("https://evil.example/")).rejects.toThrow(
      "Target resolves to a disallowed address",
    );
  });

  it("maps ENOTFOUND to a stable error", async () => {
    const err = Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    lookupMock.mockRejectedValueOnce(err);

    await expect(assertUrlSafeForSsrf("https://nohost.invalid/")).rejects.toThrow(
      "Could not resolve host: nohost.invalid",
    );
  });
});

describe("fetchUrl with mocked fetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    lookupMock.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("checks SSRF for initial URL and redirect target", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    const assertSpy = vi.spyOn(ssrfGuard, "assertUrlSafeForSsrf");

    const first = new Response(null, {
      status: 302,
      headers: { Location: "https://151.101.1.140/final" },
    });
    const second = new Response("<html>ok</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const html = await fetchUrl("https://example.com/start");
    expect(html).toBe("<html>ok</html>");
    expect(assertSpy).toHaveBeenCalledTimes(2);
    expect(assertSpy.mock.calls[0]![0]).toContain("example.com");
    expect(assertSpy.mock.calls[1]![0]).toContain("151.101.1.140");

    assertSpy.mockRestore();
  });

  it("throws too many redirects after MAX_REDIRECTS", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { Location: "https://8.8.8.8/next" },
        }),
      ),
    );

    await expect(fetchUrl("https://8.8.8.8/start")).rejects.toThrow("Too many redirects");
  });
});

describe("normalizeUrl", () => {
  it("strips hash and normalizes path", () => {
    expect(normalizeUrl("https://ex.com/a#frag")).toBe("https://ex.com/a");
  });
});
