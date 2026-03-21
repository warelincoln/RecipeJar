import type {
  RecipeDraft,
  EditedRecipeCandidate,
  ParsedRecipeCandidate,
  ValidationResult,
  Recipe,
} from "@recipejar/shared";

const BASE_URL = __DEV__
  ? "http://192.168.146.239:3000"
  : "https://api.recipejar.app";

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers as Record<string, string> };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error ?? "Request failed");
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

    async addPage(draftId: string, imageUri: string) {
      const formData = new FormData();
      formData.append("file", {
        uri: imageUri,
        type: "image/jpeg",
        name: "page.jpg",
      } as unknown as Blob);

      const response = await fetch(`${BASE_URL}/drafts/${draftId}/pages`, {
        method: "POST",
        body: formData,
      });

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

      const response = await fetch(
        `${BASE_URL}/drafts/${draftId}/retake/${pageId}`,
        { method: "POST", body: formData },
      );

      if (!response.ok) throw new ApiError(response.status, "Retake failed");
      return response.json();
    },

    parse(draftId: string) {
      return request<{
        status: string;
        candidate: ParsedRecipeCandidate;
        validationResult: ValidationResult;
      }>(`/drafts/${draftId}/parse`, { method: "POST" });
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
  },

  recipes: {
    list() {
      return request<Recipe[]>("/recipes");
    },

    get(id: string) {
      return request<Recipe>(`/recipes/${id}`);
    },
  },
};
