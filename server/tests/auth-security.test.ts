import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

const mockGetUser = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
        download: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
        getPublicUrl: vi.fn((path: string) => ({
          data: { publicUrl: `http://test.supabase.co/${path}` },
        })),
        createSignedUrl: vi.fn((path: string) =>
          Promise.resolve({ data: { signedUrl: `http://test.supabase.co/signed/${path}` }, error: null }),
        ),
      })),
      getBucket: vi.fn().mockResolvedValue({ data: { name: "recipe-images", public: false }, error: null }),
      createBucket: vi.fn().mockResolvedValue({ data: {}, error: null }),
      updateBucket: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  })),
}));

vi.mock("../src/persistence/recipes.repository.js", () => ({
  recipesRepository: {
    save: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setImage: vi.fn(),
    assignToCollection: vi.fn(),
    removeFromCollection: vi.fn(),
    listByCollection: vi.fn(),
    setRating: vi.fn(),
  },
}));

vi.mock("../src/persistence/collections.repository.js", () => ({
  collectionsRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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

vi.mock("../src/persistence/drafts.repository.js", () => ({
  draftsRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
    getPages: vi.fn(),
    addPage: vi.fn(),
    setParsedCandidate: vi.fn(),
    setParseError: vi.fn(),
    updateEditedCandidate: vi.fn(),
    markSaved: vi.fn(),
    reorderPages: vi.fn(),
    retakePage: vi.fn(),
    findPageById: vi.fn(),
    getWarningStates: vi.fn(),
    upsertWarningStates: vi.fn(),
    dismissWarning: vi.fn(),
    undismissWarning: vi.fn(),
    resetStuckParsingDrafts: vi.fn().mockResolvedValue(0),
    deleteOldCancelledDrafts: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock("../src/observability/event-logger.js", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../src/parsing/image/image-optimizer.js", () => ({
  optimizeForUpload: vi.fn((buf: Buffer) => Promise.resolve(buf)),
  optimizeForOcr: vi.fn((buf: Buffer) => Promise.resolve(buf)),
  optimizeForHero: vi.fn((buf: Buffer) => Promise.resolve(buf)),
  optimizeForThumbnail: vi.fn((buf: Buffer) => Promise.resolve(buf)),
}));

vi.mock("../src/parsing/image/image-parse.adapter.js", () => ({
  parseImages: vi.fn(),
}));

vi.mock("../src/parsing/url/url-parse.adapter.js", () => ({
  parseUrl: vi.fn(),
  parseUrlFromHtml: vi.fn(),
}));

process.env.SUPABASE_URL = "http://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { registerAuth } from "../src/middleware/auth.js";
import { recipesRoutes } from "../src/api/recipes.routes.js";
import { collectionsRoutes } from "../src/api/collections.routes.js";
import { draftsRoutes } from "../src/api/drafts.routes.js";
import { recipesRepository } from "../src/persistence/recipes.repository.js";
import { collectionsRepository } from "../src/persistence/collections.repository.js";
import { draftsRepository } from "../src/persistence/drafts.repository.js";

const USER_A = "aaaa-aaaa-aaaa-aaaa";
const USER_B = "bbbb-bbbb-bbbb-bbbb";

function buildApp() {
  const app = Fastify({ logger: false });

  registerAuth(app);
  app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  app.register(recipesRoutes);
  app.register(collectionsRoutes);
  app.register(draftsRoutes);
  app.get("/health", async () => ({ status: "ok" }));

  return app;
}

describe("Auth Middleware", () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await app.inject({ method: "GET", url: "/recipes" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Authentication required");
  });

  it("returns 401 when Authorization header has wrong format", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/recipes",
      headers: { authorization: "Basic abc123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Authentication required");
  });

  it("returns 401 when token is invalid/expired", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Token expired" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/recipes",
      headers: { authorization: "Bearer expired-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("Invalid or expired token");
  });

  it("allows request with valid token and sets userId", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: USER_A } },
      error: null,
    });

    vi.mocked(recipesRepository.list).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "GET",
      url: "/recipes",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(recipesRepository.list).toHaveBeenCalledWith(USER_A);
  });

  it("allows /health without authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("IDOR Prevention", () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });
  });

  it("returns 404 when user A tries to access user B's recipe", async () => {
    vi.mocked(recipesRepository.findById).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "GET",
      url: "/recipes/some-recipe-id",
      headers: { authorization: "Bearer valid-token-user-a" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Recipe not found");
    expect(recipesRepository.findById).toHaveBeenCalledWith("some-recipe-id", USER_A);
  });

  it("returns 404 when user A tries to delete user B's recipe", async () => {
    vi.mocked(recipesRepository.findById).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "DELETE",
      url: "/recipes/some-recipe-id",
      headers: { authorization: "Bearer valid-token-user-a" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when user A tries to access user B's collection", async () => {
    vi.mocked(collectionsRepository.findById).mockResolvedValueOnce(undefined as any);

    const res = await app.inject({
      method: "GET",
      url: "/collections/some-collection-id/recipes",
      headers: { authorization: "Bearer valid-token-user-a" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Collection not found");
  });

  it("returns 404 when user A tries to access user B's draft", async () => {
    vi.mocked(draftsRepository.findById).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "GET",
      url: "/drafts/some-draft-id",
      headers: { authorization: "Bearer valid-token-user-a" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("Draft not found");
  });

  it("returns 404 when user A tries to update user B's recipe", async () => {
    vi.mocked(recipesRepository.findById).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: "PUT",
      url: "/recipes/some-recipe-id",
      headers: {
        authorization: "Bearer valid-token-user-a",
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        title: "hacked",
        ingredients: [],
        steps: [],
      }),
    });

    expect(res.statusCode).toBe(404);
  });

  it("scopes recipe list to the authenticated user", async () => {
    vi.mocked(recipesRepository.list).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "GET",
      url: "/recipes",
      headers: { authorization: "Bearer valid-token-user-a" },
    });

    expect(res.statusCode).toBe(200);
    expect(recipesRepository.list).toHaveBeenCalledWith(USER_A);
  });

  it("scopes collection list to the authenticated user", async () => {
    vi.mocked(collectionsRepository.list).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "GET",
      url: "/collections",
      headers: { authorization: "Bearer valid-token-user-a" },
    });

    expect(res.statusCode).toBe(200);
    expect(collectionsRepository.list).toHaveBeenCalledWith(USER_A);
  });
});
