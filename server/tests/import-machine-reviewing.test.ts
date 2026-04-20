// @ts-nocheck — Cross-package import; we drive the real mobile machine but
// mock the React Native transitive dependencies (posthog-react-native, etc.)
// that vitest's loader can't transform without an RN babel preset.
//
// This file ONLY tests the new `reviewing` state transitions added for the
// per-shot capture review feature (design doc 2026-04-19, dad test). The
// pre-existing `machine.test.ts` has a SyntaxError on load due to an
// untransformed RN dependency in some other code path; this file avoids
// importing anything that triggers it by mocking aggressively up front.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the RN-leaning modules the machine imports transitively. The
// analytics module reads __DEV__ (RN global) at module scope, which Vitest
// cannot resolve — so we mock the analytics module directly rather than
// trying to define __DEV__ as a global. Same story for posthog-react-native
// and any RN-coupled stores.
vi.mock("../../mobile/src/services/analytics", () => ({
  analytics: {
    track: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    screen: vi.fn(),
  },
}));

vi.mock("../../mobile/src/services/api", () => ({
  api: {},
}));

vi.mock("../../mobile/src/stores/recipes.store", () => ({
  useRecipesStore: { getState: () => ({ fetchRecipes: () => {} }) },
}));

import { createActor } from "xstate";
import { importMachine } from "../../mobile/src/features/import/machine";

describe("Import machine — per-shot review (reviewing state)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function startInCapture() {
    const actor = createActor(importMachine).start();
    actor.send({ type: "NEW_IMAGE_IMPORT" });
    expect(actor.getSnapshot().matches("capture")).toBe(true);
    return actor;
  }

  it("PAGE_CAPTURED transitions capture → reviewing and stages pendingCapture without committing", () => {
    const actor = startInCapture();

    actor.send({ type: "PAGE_CAPTURED", imageUri: "file:///tmp/a.jpg" });

    const snap = actor.getSnapshot();
    expect(snap.matches("reviewing")).toBe(true);
    expect(snap.context.pendingCapture).toEqual({ imageUri: "file:///tmp/a.jpg" });
    // The whole point: no commit until the user confirms.
    expect(snap.context.capturedPages).toHaveLength(0);
  });

  it("KEEP_PENDING_PAGE commits the staged photo and returns to capture with pendingCapture cleared", () => {
    const actor = startInCapture();
    actor.send({ type: "PAGE_CAPTURED", imageUri: "file:///tmp/keep.jpg" });

    actor.send({ type: "KEEP_PENDING_PAGE" });

    const snap = actor.getSnapshot();
    expect(snap.matches("capture")).toBe(true);
    expect(snap.context.pendingCapture).toBeNull();
    expect(snap.context.capturedPages).toHaveLength(1);
    expect(snap.context.capturedPages[0]).toMatchObject({
      imageUri: "file:///tmp/keep.jpg",
      orderIndex: 0,
      pageId: "", // sentinel — server replaces during upload
    });
  });

  it("DISCARD_PENDING_PAGE clears pendingCapture without committing and returns to capture", () => {
    const actor = startInCapture();
    actor.send({ type: "PAGE_CAPTURED", imageUri: "file:///tmp/discard.jpg" });

    actor.send({ type: "DISCARD_PENDING_PAGE" });

    const snap = actor.getSnapshot();
    expect(snap.matches("capture")).toBe(true);
    expect(snap.context.pendingCapture).toBeNull();
    expect(snap.context.capturedPages).toHaveLength(0);
  });

  it("multi-page flow: keep, capture, keep, capture, keep — strip ends with 3 pages in correct order", () => {
    const actor = startInCapture();

    actor.send({ type: "PAGE_CAPTURED", imageUri: "file:///tmp/p1.jpg" });
    actor.send({ type: "KEEP_PENDING_PAGE" });
    actor.send({ type: "PAGE_CAPTURED", imageUri: "file:///tmp/p2.jpg" });
    actor.send({ type: "KEEP_PENDING_PAGE" });
    actor.send({ type: "PAGE_CAPTURED", imageUri: "file:///tmp/p3.jpg" });
    actor.send({ type: "KEEP_PENDING_PAGE" });

    const snap = actor.getSnapshot();
    expect(snap.matches("capture")).toBe(true);
    expect(snap.context.capturedPages).toHaveLength(3);
    expect(snap.context.capturedPages.map((p: any) => p.imageUri)).toEqual([
      "file:///tmp/p1.jpg",
      "file:///tmp/p2.jpg",
      "file:///tmp/p3.jpg",
    ]);
    expect(snap.context.capturedPages.map((p: any) => p.orderIndex)).toEqual([0, 1, 2]);
  });

  it("retake-then-keep flow: discard a bad shot, then capture again, only the kept photo lands in the strip", () => {
    const actor = startInCapture();

    actor.send({ type: "PAGE_CAPTURED", imageUri: "file:///tmp/blurry.jpg" });
    actor.send({ type: "DISCARD_PENDING_PAGE" });
    actor.send({ type: "PAGE_CAPTURED", imageUri: "file:///tmp/sharp.jpg" });
    actor.send({ type: "KEEP_PENDING_PAGE" });

    const snap = actor.getSnapshot();
    expect(snap.context.capturedPages).toHaveLength(1);
    expect(snap.context.capturedPages[0].imageUri).toBe("file:///tmp/sharp.jpg");
  });
});
