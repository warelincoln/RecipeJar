import type {
  RecipeDraft,
  EditedRecipeCandidate,
  ParsedRecipeCandidate,
  ValidationResult,
  Recipe,
  RecipeNote,
} from "@orzo/shared";
import type { Session } from "@supabase/supabase-js";
import { ORZO_LAN_HOST } from "../devLanHost";
import { supabase } from "./supabase";

export interface UrlParseRequest {
  html?: string;
  acquisitionMethod?: "webview-html" | "server-fetch" | "server-fetch-fallback";
  captureFailureReason?:
    | "injection_failed"
    | "capture_timeout"
    | "page_not_ready"
    | "payload_too_large"
    | "message_transport_failed";
}

const BASE_URL = __DEV__
  ? `http://${ORZO_LAN_HOST}:3000`
  : "https://api.getorzo.com";

// Single-flight token refresh lock
let refreshPromise: Promise<Session | null> | null = null;

async function refreshOnce(): Promise<Session | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = supabase.auth
    .refreshSession()
    .then(({ data }) => data.session)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authenticatedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response = await fetch(url, { ...init, headers });

  if (response.status === 401 && token) {
    const newSession = await refreshOnce();
    if (newSession) {
      headers["Authorization"] = `Bearer ${newSession.access_token}`;
      response = await fetch(url, { ...init, headers });
    } else {
      const { useAuthStore } = await import("../stores/auth.store");
      await useAuthStore.getState().signOut();
    }
  }

  return response;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers as Record<string, string> };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await authenticatedFetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    const msg =
      (typeof body.message === "string" && body.message.trim()) ||
      (typeof body.error === "string" && body.error.trim()) ||
      "Request failed";
    throw new ApiError(response.status, msg);
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = {
  drafts: {
    create() {
      return request<RecipeDraft>("/drafts", { method: "POST" });
    },

    createFromUrl(url: string) {
      return request<RecipeDraft>("/drafts/url", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
    },

    async addPage(draftId: string, imageUri: string, mimeType?: string, fileName?: string) {
      const formData = new FormData();
      formData.append("file", {
        uri: imageUri,
        type: mimeType ?? "image/jpeg",
        name: fileName ?? "page.jpg",
      } as unknown as Blob);

      const response = await authenticatedFetch(
        `${BASE_URL}/drafts/${draftId}/pages`,
        { method: "POST", body: formData },
      );

      if (!response.ok) throw new ApiError(response.status, "Upload failed");
      return response.json();
    },

    reorderPages(
      draftId: string,
      pageOrder: { pageId: string; orderIndex: number }[],
    ) {
      return request(`/drafts/${draftId}/pages/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ pageOrder }),
      });
    },

    async retakePage(draftId: string, pageId: string, imageUri: string) {
      const formData = new FormData();
      formData.append("file", {
        uri: imageUri,
        type: "image/jpeg",
        name: "retake.jpg",
      } as unknown as Blob);

      const response = await authenticatedFetch(
        `${BASE_URL}/drafts/${draftId}/retake/${pageId}`,
        { method: "POST", body: formData },
      );

      if (!response.ok) throw new ApiError(response.status, "Retake failed");
      return response.json();
    },

    parse(draftId: string, payload?: UrlParseRequest) {
      return request<{
        status: string;
        candidate?: ParsedRecipeCandidate;
        validationResult?: ValidationResult;
      }>(`/drafts/${draftId}/parse`, payload
        ? { method: "POST", body: JSON.stringify(payload) }
        : { method: "POST" });
    },

    updateCandidate(draftId: string, candidate: EditedRecipeCandidate) {
      return request<{ draft: RecipeDraft; validationResult: ValidationResult }>(
        `/drafts/${draftId}/candidate`,
        { method: "PATCH", body: JSON.stringify(candidate) },
      );
    },

    dismissWarning(draftId: string, issueId: string) {
      return request(`/drafts/${draftId}/dismiss-warning`, {
        method: "POST",
        body: JSON.stringify({ issueId }),
      });
    },

    undismissWarning(draftId: string, issueId: string) {
      return request(`/drafts/${draftId}/undismiss-warning`, {
        method: "POST",
        body: JSON.stringify({ issueId }),
      });
    },

    get(draftId: string) {
      return request<RecipeDraft & { pages: unknown[]; warningStates: unknown[] }>(
        `/drafts/${draftId}`,
      );
    },

    save(draftId: string) {
      return request<{ recipe: Recipe; saveDecision: unknown }>(
        `/drafts/${draftId}/save`,
        { method: "POST" },
      );
    },

    cancel(draftId: string) {
      return request<{ ok: boolean }>(
        `/drafts/${draftId}/cancel`,
        { method: "POST" },
      );
    },
  },

  recipes: {
    list() {
      return request<Recipe[]>("/recipes");
    },

    get(id: string) {
      return request<Recipe>(`/recipes/${id}`);
    },

    update(
      id: string,
      body: {
        title: string;
        description?: string | null;
        collectionId?: string | null;
        baselineServings?: number | null;
        prepTimeMinutes?: number | null;
        cookTimeMinutes?: number | null;
        totalTimeMinutes?: number | null;
        ingredients: { text: string; orderIndex: number; isHeader: boolean }[];
        steps: { text: string; orderIndex: number; isHeader: boolean }[];
      },
    ) {
      return request<Recipe>(`/recipes/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    },

    delete(id: string) {
      return request(`/recipes/${id}`, { method: "DELETE" });
    },

    async uploadImage(id: string, imageUri: string, mimeType?: string, fileName?: string) {
      const formData = new FormData();
      formData.append("file", {
        uri: imageUri,
        type: mimeType ?? "image/jpeg",
        name: fileName ?? "hero.jpg",
      } as unknown as Blob);

      const response = await authenticatedFetch(
        `${BASE_URL}/recipes/${id}/image`,
        { method: "POST", body: formData },
      );
      if (!response.ok) throw new ApiError(response.status, "Image upload failed");
      return response.json() as Promise<Recipe>;
    },

    removeImage(id: string) {
      return request<Recipe>(`/recipes/${id}/image`, { method: "DELETE" });
    },

    assignCollection(id: string, collectionId: string | null) {
      return request(`/recipes/${id}/collection`, {
        method: "PATCH",
        body: JSON.stringify({ collectionId }),
      });
    },

    createNote(recipeId: string, text: string) {
      return request<RecipeNote>(`/recipes/${recipeId}/notes`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
    },

    updateNote(recipeId: string, noteId: string, text: string) {
      return request<RecipeNote>(`/recipes/${recipeId}/notes/${noteId}`, {
        method: "PATCH",
        body: JSON.stringify({ text }),
      });
    },

    deleteNote(recipeId: string, noteId: string) {
      return request(`/recipes/${recipeId}/notes/${noteId}`, {
        method: "DELETE",
      });
    },

    setRating(recipeId: string, rating: number | null) {
      return request<Recipe>(`/recipes/${recipeId}/rating`, {
        method: "PATCH",
        body: JSON.stringify({ rating }),
      });
    },
  },

  account: {
    deleteAccount() {
      return request<{ success: boolean; message: string }>("/account", {
        method: "DELETE",
      });
    },

    generateRecoveryCodes() {
      return request<{ codes: string[] }>("/account/recovery-codes", {
        method: "POST",
      });
    },

    verifyRecoveryCode(code: string) {
      return request<{ success: boolean }>("/account/verify-recovery-code", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
    },

    getRemainingRecoveryCodes() {
      return request<{ remaining: number }>("/account/recovery-codes/remaining");
    },

    getSessions() {
      return request<{
        sessions: {
          id: string;
          deviceInfo: string | null;
          ipAddress: string | null;
          lastSeenAt: string;
          createdAt: string;
        }[];
      }>("/account/sessions");
    },
  },

  collections: {
    create(name: string) {
      return request<{ id: string; name: string }>("/collections", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },

    list() {
      return request<{ id: string; name: string }[]>("/collections");
    },

    getRecipes(collectionId: string) {
      return request<Recipe[]>(`/collections/${collectionId}/recipes`);
    },

    update(id: string, name: string) {
      return request<{ id: string; name: string }>(`/collections/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
    },

    async delete(id: string) {
      const response = await authenticatedFetch(
        `${BASE_URL}/collections/${id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new ApiError(
          response.status,
          typeof body.error === "string" ? body.error : "Request failed",
        );
      }
    },
  },
};
