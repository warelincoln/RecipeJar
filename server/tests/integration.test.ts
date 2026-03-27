import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
        download: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
        getPublicUrl: vi.fn((path: string) => ({
          data: { publicUrl: `http://test.supabase.co/${path}` },
        })),
      })),
    },
  })),
}));

vi.mock("../src/persistence/drafts.repository.js", () => ({
  draftsRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    getPages: vi.fn(),
    addPage: vi.fn(),
    setParsedCandidate: vi.fn(),
    updateEditedCandidate: vi.fn(),
    markSaved: vi.fn(),
    reorderPages: vi.fn(),
    retakePage: vi.fn(),
    findPageById: vi.fn(),
    getWarningStates: vi.fn(),
    upsertWarningStates: vi.fn(),
    dismissWarning: vi.fn(),
    undismissWarning: vi.fn(),
  },
}));

vi.mock("../src/persistence/recipes.repository.js", () => ({
  recipesRepository: {
    save: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    assignToCollection: vi.fn(),
    removeFromCollection: vi.fn(),
    listByCollection: vi.fn(),
    setRating: vi.fn(),
  },
}));

vi.mock("../src/persistence/recipe-notes.repository.js", () => ({
  recipeNotesRepository: {
    listByRecipeId: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../src/parsing/image/image-parse.adapter.js", () => ({
  parseImages: vi.fn(),
}));

vi.mock("../src/parsing/url/url-parse.adapter.js", () => ({
  parseUrl: vi.fn(),
  parseUrlFromHtml: vi.fn(),
}));

vi.mock("../src/observability/event-logger.js", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../src/parsing/image/image-optimizer.js", () => ({
  optimizeForUpload: vi.fn((buf: Buffer) => Promise.resolve(buf)),
  optimizeForOcr: vi.fn((buf: Buffer) => Promise.resolve(buf)),
}));

process.env.SUPABASE_URL = "http://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { draftsRoutes } from "../src/api/drafts.routes.js";
import { recipesRoutes } from "../src/api/recipes.routes.js";
import { draftsRepository } from "../src/persistence/drafts.repository.js";
import { recipesRepository } from "../src/persistence/recipes.repository.js";
import { recipeNotesRepository } from "../src/persistence/recipe-notes.repository.js";
import { parseImages } from "../src/parsing/image/image-parse.adapter.js";
import { parseUrl, parseUrlFromHtml } from "../src/parsing/url/url-parse.adapter.js";
import type { ParsedRecipeCandidate } from "@recipejar/shared";

const draftRepo = vi.mocked(draftsRepository);
const recipeRepo = vi.mocked(recipesRepository);
const notesRepo = vi.mocked(recipeNotesRepository);
const mockParseImages = vi.mocked(parseImages);
const mockParseUrl = vi.mocked(parseUrl);
const mockParseUrlFromHtml = vi.mocked(parseUrlFromHtml);

function cleanCandidate(): ParsedRecipeCandidate {
  return {
    title: "Classic Pancakes",
    ingredients: [
      { id: "i1", text: "2 cups flour", orderIndex: 0, isHeader: false },
      { id: "i2", text: "1 cup milk", orderIndex: 1, isHeader: false },
    ],
    steps: [
      { id: "s1", text: "Mix dry ingredients.", orderIndex: 0, isHeader: false },
      { id: "s2", text: "Add wet ingredients and stir.", orderIndex: 1, isHeader: false },
    ],
    description: null,
    sourceType: "image",
    sourcePages: [
      { id: "p1", orderIndex: 0, sourceType: "image", retakeCount: 0, imageUri: "img.jpg" },
    ],
    parseSignals: {
      structureSeparable: true,
      lowConfidenceStructure: false,
      poorImageQuality: false,
      multiRecipeDetected: false,
      confirmedOmission: false,
      suspectedOmission: false,
      descriptionDetected: false,
    },
    ingredientSignals: [],
    stepSignals: [],
  };
}

async function buildApp() {
  const app = Fastify({ logger: false });
  app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  app.register(draftsRoutes);
  app.register(recipesRoutes);
  app.get("/health", async () => ({ status: "ok" }));
  await app.ready();
  return app;
}

describe("API Integration", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Health
  // ------------------------------------------------------------------
  describe("GET /health", () => {
    it("returns ok", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
    });
  });

  // ------------------------------------------------------------------
  // POST /drafts — create image draft
  // ------------------------------------------------------------------
  describe("POST /drafts", () => {
    it("creates an image draft and returns 201", async () => {
      const fakeDraft = {
        id: "d1",
        status: "CAPTURE_IN_PROGRESS",
        sourceType: "image",
        originalUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      draftRepo.create.mockResolvedValue(fakeDraft as never);

      const res = await app.inject({ method: "POST", url: "/drafts" });

      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe("d1");
      expect(res.json().sourceType).toBe("image");
      expect(draftRepo.create).toHaveBeenCalledWith({ sourceType: "image" });
    });
  });

  // ------------------------------------------------------------------
  // POST /drafts/url — create URL draft
  // ------------------------------------------------------------------
  describe("POST /drafts/url", () => {
    it("creates a URL draft and returns 201", async () => {
      const fakeDraft = {
        id: "d2",
        status: "READY_FOR_PARSE",
        sourceType: "url",
        originalUrl: "https://example.com/recipe",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      draftRepo.create.mockResolvedValue(fakeDraft as never);

      const res = await app.inject({
        method: "POST",
        url: "/drafts/url",
        payload: { url: "https://example.com/recipe" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().sourceType).toBe("url");
      expect(draftRepo.create).toHaveBeenCalledWith({
        sourceType: "url",
        originalUrl: "https://example.com/recipe",
      });
    });

    it("returns 400 when url is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/drafts/url",
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ------------------------------------------------------------------
  // POST /drafts/:draftId/parse — image parse with mocked parser
  // ------------------------------------------------------------------
  describe("POST /drafts/:draftId/parse", () => {
    it("parses image draft, runs validation, returns candidate + result", async () => {
      const candidate = cleanCandidate();

      draftRepo.findById.mockResolvedValue({
        id: "d1",
        status: "READY_FOR_PARSE",
        sourceType: "image",
        originalUrl: null,
      } as never);
      draftRepo.updateStatus.mockResolvedValue({} as never);
      draftRepo.getPages.mockResolvedValue([
        { id: "p1", draftId: "d1", orderIndex: 0, imageUri: "d1/p1.jpg", retakeCount: 0, ocrText: null },
      ] as never);
      mockParseImages.mockResolvedValue(candidate);
      draftRepo.setParsedCandidate.mockResolvedValue({} as never);
      draftRepo.upsertWarningStates.mockResolvedValue(undefined as never);

      const res = await app.inject({ method: "POST", url: "/drafts/d1/parse" });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("PARSED");
      expect(body.candidate.title).toBe("Classic Pancakes");
      expect(body.validationResult).toBeDefined();
      expect(body.validationResult.saveState).toBe("SAVE_CLEAN");
      expect(mockParseImages).toHaveBeenCalledTimes(1);
    });

    it("parses URL draft using URL parser cascade", async () => {
      const candidate = cleanCandidate();
      candidate.sourceType = "url";

      draftRepo.findById.mockResolvedValue({
        id: "d2",
        status: "READY_FOR_PARSE",
        sourceType: "url",
        originalUrl: "https://example.com/recipe",
      } as never);
      draftRepo.updateStatus.mockResolvedValue({} as never);
      draftRepo.getPages.mockResolvedValue([] as never);
      mockParseUrl.mockResolvedValue(candidate);
      draftRepo.setParsedCandidate.mockResolvedValue({} as never);
      draftRepo.upsertWarningStates.mockResolvedValue(undefined as never);

      const res = await app.inject({ method: "POST", url: "/drafts/d2/parse" });

      expect(res.statusCode).toBe(200);
      expect(res.json().candidate.title).toBe("Classic Pancakes");
      expect(mockParseUrl).toHaveBeenCalledWith(
        "https://example.com/recipe",
        expect.any(Array),
        "server-fetch",
      );
    });

    it("parses URL draft with browser-supplied HTML when provided", async () => {
      const candidate = cleanCandidate();
      candidate.sourceType = "url";

      draftRepo.findById.mockResolvedValue({
        id: "d2",
        status: "READY_FOR_PARSE",
        sourceType: "url",
        originalUrl: "https://example.com/recipe",
      } as never);
      draftRepo.updateStatus.mockResolvedValue({} as never);
      draftRepo.getPages.mockResolvedValue([] as never);
      mockParseUrlFromHtml.mockResolvedValue(candidate);
      draftRepo.setParsedCandidate.mockResolvedValue({} as never);
      draftRepo.upsertWarningStates.mockResolvedValue(undefined as never);

      const res = await app.inject({
        method: "POST",
        url: "/drafts/d2/parse",
        payload: {
          html: "<html><body>Recipe</body></html>",
          acquisitionMethod: "webview-html",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(mockParseUrlFromHtml).toHaveBeenCalledWith(
        "https://example.com/recipe",
        "<html><body>Recipe</body></html>",
        expect.any(Array),
        "webview-html",
      );
      expect(mockParseUrl).not.toHaveBeenCalled();
    });

    it("marks technical HTML capture fallback separately from normal server fetch", async () => {
      const candidate = cleanCandidate();
      candidate.sourceType = "url";

      draftRepo.findById.mockResolvedValue({
        id: "d2",
        status: "READY_FOR_PARSE",
        sourceType: "url",
        originalUrl: "https://example.com/recipe",
      } as never);
      draftRepo.updateStatus.mockResolvedValue({} as never);
      draftRepo.getPages.mockResolvedValue([] as never);
      mockParseUrl.mockResolvedValue(candidate);
      draftRepo.setParsedCandidate.mockResolvedValue({} as never);
      draftRepo.upsertWarningStates.mockResolvedValue(undefined as never);

      const res = await app.inject({
        method: "POST",
        url: "/drafts/d2/parse",
        payload: {
          acquisitionMethod: "server-fetch-fallback",
          captureFailureReason: "capture_timeout",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(mockParseUrl).toHaveBeenCalledWith(
        "https://example.com/recipe",
        expect.any(Array),
        "server-fetch-fallback",
      );
    });

    it("rejects oversized browser HTML before parsing", async () => {
      draftRepo.findById.mockResolvedValue({
        id: "d2",
        status: "READY_FOR_PARSE",
        sourceType: "url",
        originalUrl: "https://example.com/recipe",
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/drafts/d2/parse",
        payload: {
          html: "x".repeat(750_001),
          acquisitionMethod: "webview-html",
        },
      });

      expect(res.statusCode).toBe(413);
      expect(mockParseUrlFromHtml).not.toHaveBeenCalled();
      expect(mockParseUrl).not.toHaveBeenCalled();
      expect(draftRepo.updateStatus).not.toHaveBeenCalled();
    });

    it("does not fall back to server fetch when browser HTML parsing succeeds but yields a weak candidate", async () => {
      const weakCandidate = {
        ...cleanCandidate(),
        sourceType: "url" as const,
        title: null,
        ingredients: [],
        steps: [],
      };

      draftRepo.findById.mockResolvedValue({
        id: "d2",
        status: "READY_FOR_PARSE",
        sourceType: "url",
        originalUrl: "https://example.com/recipe",
      } as never);
      draftRepo.updateStatus.mockResolvedValue({} as never);
      draftRepo.getPages.mockResolvedValue([] as never);
      mockParseUrlFromHtml.mockResolvedValue(weakCandidate);
      draftRepo.setParsedCandidate.mockResolvedValue({} as never);
      draftRepo.upsertWarningStates.mockResolvedValue(undefined as never);

      const res = await app.inject({
        method: "POST",
        url: "/drafts/d2/parse",
        payload: {
          html: "<html><body>Not really a recipe</body></html>",
          acquisitionMethod: "webview-html",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(mockParseUrlFromHtml).toHaveBeenCalledTimes(1);
      expect(mockParseUrl).not.toHaveBeenCalled();
    });

    it("returns 404 for missing draft", async () => {
      draftRepo.findById.mockResolvedValue(null as never);
      const res = await app.inject({ method: "POST", url: "/drafts/unknown/parse" });
      expect(res.statusCode).toBe(404);
    });
  });

  // ------------------------------------------------------------------
  // PATCH /drafts/:draftId/candidate — edit + revalidate
  // ------------------------------------------------------------------
  describe("PATCH /drafts/:draftId/candidate", () => {
    it("accepts edits, revalidates, returns updated draft + validation", async () => {
      const candidate = cleanCandidate();
      draftRepo.findById.mockResolvedValue({
        id: "d1",
        status: "PARSED",
        sourceType: "image",
        parsedCandidateJson: candidate,
      } as never);
      draftRepo.updateEditedCandidate.mockResolvedValue({
        id: "d1",
        status: "PARSED",
      } as never);
      draftRepo.upsertWarningStates.mockResolvedValue(undefined as never);

      const editedCandidate = {
        title: "Classic Pancakes (edited)",
        ingredients: [
          { id: "i1", text: "2 cups flour", orderIndex: 0, isHeader: false },
          { id: "i2", text: "1 cup milk", orderIndex: 1, isHeader: false },
        ],
        steps: [
          { id: "s1", text: "Mix everything.", orderIndex: 0 },
          { id: "s2", text: "Cook on griddle.", orderIndex: 1 },
        ],
        description: null,
      };

      const res = await app.inject({
        method: "PATCH",
        url: "/drafts/d1/candidate",
        payload: editedCandidate,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.validationResult).toBeDefined();
      expect(body.validationResult.saveState).toBe("SAVE_CLEAN");
      expect(draftRepo.updateEditedCandidate).toHaveBeenCalled();
    });

    it("returns 400 if draft has no parsed candidate", async () => {
      draftRepo.findById.mockResolvedValue({
        id: "d1",
        status: "CAPTURE_IN_PROGRESS",
        parsedCandidateJson: null,
      } as never);

      const res = await app.inject({
        method: "PATCH",
        url: "/drafts/d1/candidate",
        payload: { title: "X", ingredients: [], steps: [] },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ------------------------------------------------------------------
  // POST /drafts/:draftId/save — clean save
  // ------------------------------------------------------------------
  describe("POST /drafts/:draftId/save", () => {
    it("saves recipe when validation is clean", async () => {
      draftRepo.findById.mockResolvedValue({
        id: "d1",
        status: "PARSED",
        sourceType: "image",
        originalUrl: null,
        validationResultJson: {
          issues: [],
          saveState: "SAVE_CLEAN",
          hasWarnings: false,
          hasBlockingIssues: false,
          hasCorrectionRequiredIssues: false,
          requiresRetake: false,
          canEnterCorrectionMode: false,
        },
        editedCandidateJson: {
          title: "Classic Pancakes",
          ingredients: [
            { text: "2 cups flour", orderIndex: 0, isHeader: false },
          ],
          steps: [{ text: "Mix.", orderIndex: 0 }],
          description: null,
        },
      } as never);
      draftRepo.getWarningStates.mockResolvedValue([] as never);
      draftRepo.getPages.mockResolvedValue([] as never);
      draftRepo.markSaved.mockResolvedValue({} as never);
      recipeRepo.save.mockResolvedValue({
        id: "r1",
        title: "Classic Pancakes",
      } as never);

      const res = await app.inject({ method: "POST", url: "/drafts/d1/save" });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.recipe.id).toBe("r1");
      expect(body.saveDecision.saveState).toBe("SAVE_CLEAN");
      expect(body.saveDecision.allowed).toBe(true);
      expect(recipeRepo.save).toHaveBeenCalledTimes(1);
      expect(draftRepo.markSaved).toHaveBeenCalledWith("d1");
    });

    it("saves as SAVE_USER_VERIFIED when FLAG warnings are dismissed", async () => {
      draftRepo.findById.mockResolvedValue({
        id: "d1",
        status: "PARSED",
        sourceType: "image",
        originalUrl: null,
        validationResultJson: {
          issues: [
            {
              issueId: "flag-1",
              code: "SUSPECTED_OMISSION",
              severity: "FLAG",
              message: "Possible missing content",
              userDismissible: true,
              userResolvable: false,
            },
          ],
          saveState: "SAVE_CLEAN",
          hasWarnings: true,
          hasBlockingIssues: false,
          hasCorrectionRequiredIssues: false,
          requiresRetake: false,
          canEnterCorrectionMode: false,
        },
        editedCandidateJson: {
          title: "Pancakes",
          ingredients: [{ text: "flour", orderIndex: 0, isHeader: false }],
          steps: [{ text: "Cook.", orderIndex: 0 }],
        },
      } as never);
      draftRepo.getWarningStates.mockResolvedValue([
        { issueId: "flag-1", dismissed: true },
      ] as never);
      draftRepo.getPages.mockResolvedValue([] as never);
      draftRepo.markSaved.mockResolvedValue({} as never);
      recipeRepo.save.mockResolvedValue({ id: "r2", title: "Pancakes" } as never);

      const res = await app.inject({ method: "POST", url: "/drafts/d1/save" });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.saveDecision.saveState).toBe("SAVE_USER_VERIFIED");
      expect(body.saveDecision.isUserVerified).toBe(true);
      expect(body.saveDecision.allowed).toBe(true);
    });

    it("rejects save with 422 when validation has blocking issues", async () => {
      draftRepo.findById.mockResolvedValue({
        id: "d1",
        status: "PARSED",
        sourceType: "image",
        validationResultJson: {
          issues: [
            {
              issueId: "block-1",
              code: "STRUCTURE_NOT_SEPARABLE",
              severity: "BLOCK",
              message: "Cannot separate",
              userDismissible: false,
              userResolvable: false,
            },
          ],
          saveState: "NO_SAVE",
          hasWarnings: false,
          hasBlockingIssues: true,
          hasCorrectionRequiredIssues: false,
          requiresRetake: false,
          canEnterCorrectionMode: false,
        },
        editedCandidateJson: { title: "X", ingredients: [], steps: [] },
      } as never);
      draftRepo.getWarningStates.mockResolvedValue([] as never);

      const res = await app.inject({ method: "POST", url: "/drafts/d1/save" });

      expect(res.statusCode).toBe(422);
      expect(res.json().saveDecision.allowed).toBe(false);
    });

    it("returns 400 if draft has not been validated", async () => {
      draftRepo.findById.mockResolvedValue({
        id: "d1",
        validationResultJson: null,
      } as never);

      const res = await app.inject({ method: "POST", url: "/drafts/d1/save" });
      expect(res.statusCode).toBe(400);
    });
  });

  // ------------------------------------------------------------------
  // GET /drafts/:draftId — draft resume path
  // ------------------------------------------------------------------
  describe("GET /drafts/:draftId (resume path)", () => {
    it("returns full draft state including pages and warning states", async () => {
      draftRepo.findById.mockResolvedValue({
        id: "d1",
        status: "PARSED",
        sourceType: "image",
        parsedCandidateJson: cleanCandidate(),
        editedCandidateJson: {
          title: "Classic Pancakes",
          ingredients: [{ id: "i1", text: "2 cups flour", orderIndex: 0, isHeader: false }],
          steps: [{ id: "s1", text: "Mix.", orderIndex: 0 }],
        },
        validationResultJson: {
          issues: [],
          saveState: "SAVE_CLEAN",
          hasWarnings: false,
          hasBlockingIssues: false,
          hasCorrectionRequiredIssues: false,
          requiresRetake: false,
          canEnterCorrectionMode: false,
        },
      } as never);
      draftRepo.getPages.mockResolvedValue([
        {
          id: "p1",
          draftId: "d1",
          orderIndex: 0,
          imageUri: "d1/p1.jpg",
          retakeCount: 0,
          ocrText: null,
        },
      ] as never);
      draftRepo.getWarningStates.mockResolvedValue([] as never);

      const res = await app.inject({ method: "GET", url: "/drafts/d1" });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe("d1");
      expect(body.status).toBe("PARSED");
      expect(body.pages).toHaveLength(1);
      expect(body.pages[0].imageUri).toBe("d1/p1.jpg");
      expect(body.warningStates).toHaveLength(0);
    });

    it("returns 404 for unknown draft", async () => {
      draftRepo.findById.mockResolvedValue(null as never);
      const res = await app.inject({ method: "GET", url: "/drafts/missing" });
      expect(res.statusCode).toBe(404);
    });
  });

  // ------------------------------------------------------------------
  // Full parse → edit → save flow with mocked parser
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // Notes CRUD
  // ------------------------------------------------------------------
  describe("POST /recipes/:id/notes", () => {
    it("creates a note and returns 201", async () => {
      recipeRepo.findById.mockResolvedValue({ id: "r1" } as never);
      notesRepo.create.mockResolvedValue({
        id: "n1",
        recipeId: "r1",
        text: "Great with extra garlic",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/recipes/r1/notes",
        payload: { text: "Great with extra garlic" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().text).toBe("Great with extra garlic");
      expect(notesRepo.create).toHaveBeenCalledWith("r1", "Great with extra garlic");
    });

    it("rejects note longer than 250 characters", async () => {
      recipeRepo.findById.mockResolvedValue({ id: "r1" } as never);

      const res = await app.inject({
        method: "POST",
        url: "/recipes/r1/notes",
        payload: { text: "x".repeat(251) },
      });

      expect(res.statusCode).toBe(400);
      expect(notesRepo.create).not.toHaveBeenCalled();
    });

    it("rejects empty/whitespace-only note", async () => {
      recipeRepo.findById.mockResolvedValue({ id: "r1" } as never);

      const res = await app.inject({
        method: "POST",
        url: "/recipes/r1/notes",
        payload: { text: "   " },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for missing recipe", async () => {
      recipeRepo.findById.mockResolvedValue(null as never);

      const res = await app.inject({
        method: "POST",
        url: "/recipes/missing/notes",
        payload: { text: "hello" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /recipes/:id/notes/:noteId", () => {
    it("updates a note", async () => {
      notesRepo.findById.mockResolvedValue({ id: "n1", recipeId: "r1" } as never);
      notesRepo.update.mockResolvedValue({
        id: "n1",
        recipeId: "r1",
        text: "Updated text",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const res = await app.inject({
        method: "PATCH",
        url: "/recipes/r1/notes/n1",
        payload: { text: "Updated text" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().text).toBe("Updated text");
    });

    it("returns 404 when note belongs to different recipe", async () => {
      notesRepo.findById.mockResolvedValue({ id: "n1", recipeId: "r2" } as never);

      const res = await app.inject({
        method: "PATCH",
        url: "/recipes/r1/notes/n1",
        payload: { text: "Updated" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 when note does not exist", async () => {
      notesRepo.findById.mockResolvedValue(null as never);

      const res = await app.inject({
        method: "PATCH",
        url: "/recipes/r1/notes/missing",
        payload: { text: "Updated" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /recipes/:id/notes/:noteId", () => {
    it("deletes a note", async () => {
      notesRepo.findById.mockResolvedValue({ id: "n1", recipeId: "r1" } as never);
      notesRepo.delete.mockResolvedValue({ id: "n1" } as never);

      const res = await app.inject({
        method: "DELETE",
        url: "/recipes/r1/notes/n1",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(notesRepo.delete).toHaveBeenCalledWith("n1");
    });

    it("returns 404 when note belongs to different recipe", async () => {
      notesRepo.findById.mockResolvedValue({ id: "n1", recipeId: "r2" } as never);

      const res = await app.inject({
        method: "DELETE",
        url: "/recipes/r1/notes/n1",
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ------------------------------------------------------------------
  // Rating
  // ------------------------------------------------------------------
  describe("PATCH /recipes/:id/rating", () => {
    it("sets a half-star rating", async () => {
      recipeRepo.findById.mockResolvedValueOnce({ id: "r1" } as never);
      recipeRepo.setRating.mockResolvedValue({ id: "r1" } as never);
      recipeRepo.findById.mockResolvedValueOnce({
        id: "r1",
        rating: 4.5,
        notes: [],
      } as never);

      const res = await app.inject({
        method: "PATCH",
        url: "/recipes/r1/rating",
        payload: { rating: 4.5 },
      });

      expect(res.statusCode).toBe(200);
      expect(recipeRepo.setRating).toHaveBeenCalledWith("r1", 9);
    });

    it("clears a rating with null", async () => {
      recipeRepo.findById.mockResolvedValueOnce({ id: "r1" } as never);
      recipeRepo.setRating.mockResolvedValue({ id: "r1" } as never);
      recipeRepo.findById.mockResolvedValueOnce({
        id: "r1",
        rating: null,
        notes: [],
      } as never);

      const res = await app.inject({
        method: "PATCH",
        url: "/recipes/r1/rating",
        payload: { rating: null },
      });

      expect(res.statusCode).toBe(200);
      expect(recipeRepo.setRating).toHaveBeenCalledWith("r1", null);
    });

    it("rejects invalid rating value (0.3)", async () => {
      recipeRepo.findById.mockResolvedValue({ id: "r1" } as never);

      const res = await app.inject({
        method: "PATCH",
        url: "/recipes/r1/rating",
        payload: { rating: 0.3 },
      });

      expect(res.statusCode).toBe(400);
      expect(recipeRepo.setRating).not.toHaveBeenCalled();
    });

    it("rejects out-of-range rating (6)", async () => {
      recipeRepo.findById.mockResolvedValue({ id: "r1" } as never);

      const res = await app.inject({
        method: "PATCH",
        url: "/recipes/r1/rating",
        payload: { rating: 6 },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for missing recipe", async () => {
      recipeRepo.findById.mockResolvedValue(null as never);

      const res = await app.inject({
        method: "PATCH",
        url: "/recipes/missing/rating",
        payload: { rating: 3 },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ------------------------------------------------------------------
  // Full parse → edit → save flow with mocked parser
  // ------------------------------------------------------------------
  describe("Full flow: parse → edit → save", () => {
    it("exercises the complete path from parse through edit to save", async () => {
      const candidate = cleanCandidate();

      // Step 1: parse
      draftRepo.findById.mockResolvedValueOnce({
        id: "d1",
        status: "CAPTURE_IN_PROGRESS",
        sourceType: "image",
        originalUrl: null,
      } as never);
      draftRepo.updateStatus.mockResolvedValue({} as never);
      draftRepo.getPages.mockResolvedValueOnce([
        { id: "p1", draftId: "d1", orderIndex: 0, imageUri: "d1/p1.jpg", retakeCount: 0, ocrText: null },
      ] as never);
      mockParseImages.mockResolvedValue(candidate);
      draftRepo.setParsedCandidate.mockResolvedValue({} as never);
      draftRepo.upsertWarningStates.mockResolvedValue(undefined as never);

      const parseRes = await app.inject({ method: "POST", url: "/drafts/d1/parse" });
      expect(parseRes.statusCode).toBe(200);
      expect(parseRes.json().status).toBe("PARSED");

      // Step 2: edit
      draftRepo.findById.mockResolvedValueOnce({
        id: "d1",
        status: "PARSED",
        sourceType: "image",
        parsedCandidateJson: candidate,
      } as never);
      draftRepo.updateEditedCandidate.mockResolvedValue({ id: "d1" } as never);

      const editRes = await app.inject({
        method: "PATCH",
        url: "/drafts/d1/candidate",
        payload: {
          title: "Classic Pancakes (tweaked)",
          ingredients: candidate.ingredients,
          steps: candidate.steps,
          description: "A breakfast classic.",
        },
      });
      expect(editRes.statusCode).toBe(200);
      expect(editRes.json().validationResult.saveState).toBe("SAVE_CLEAN");

      // Step 3: save
      draftRepo.findById.mockResolvedValueOnce({
        id: "d1",
        status: "PARSED",
        sourceType: "image",
        originalUrl: null,
        validationResultJson: editRes.json().validationResult,
        editedCandidateJson: {
          title: "Classic Pancakes (tweaked)",
          ingredients: candidate.ingredients,
          steps: candidate.steps,
          description: "A breakfast classic.",
        },
      } as never);
      draftRepo.getWarningStates.mockResolvedValue([] as never);
      draftRepo.getPages.mockResolvedValueOnce([] as never);
      draftRepo.markSaved.mockResolvedValue({} as never);
      recipeRepo.save.mockResolvedValue({
        id: "r1",
        title: "Classic Pancakes (tweaked)",
      } as never);

      const saveRes = await app.inject({ method: "POST", url: "/drafts/d1/save" });
      expect(saveRes.statusCode).toBe(201);
      expect(saveRes.json().recipe.title).toBe("Classic Pancakes (tweaked)");
      expect(saveRes.json().saveDecision.saveState).toBe("SAVE_CLEAN");
    });
  });
});
