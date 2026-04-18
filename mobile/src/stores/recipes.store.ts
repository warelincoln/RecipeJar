import { create } from "zustand";
import type { Recipe } from "@orzo/shared";
import { api } from "../services/api";

interface RecipesState {
  recipes: Recipe[];
  loading: boolean;
  error: string | null;
  fetchRecipes: () => Promise<void>;
  /** Optimistically prepend a recipe to the list after save.
   *  Avoids the post-save refetch round-trip so the home screen
   *  renders the new recipe within a single React tick. */
  addRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: string) => Promise<void>;
  /** Delete N recipes in one server call. Optimistically removes from
   *  local state before awaiting; server rejection is a rare edge case. */
  bulkDeleteRecipes: (ids: string[]) => Promise<{ deletedCount: number }>;
  /** Assign (or clear) a collection on N recipes in one server call.
   *  Calls fetchRecipes() on success to reflect updated `collections`
   *  arrays in the local state. */
  bulkAssignCollection: (
    ids: string[],
    collectionId: string | null,
  ) => Promise<{ updatedCount: number }>;
  reset: () => void;
}

export const useRecipesStore = create<RecipesState>((set) => ({
  recipes: [],
  loading: false,
  error: null,

  async fetchRecipes() {
    set({ loading: true, error: null });
    try {
      const recipes = await api.recipes.list();
      set({ recipes, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load recipes",
        loading: false,
      });
    }
  },

  addRecipe(recipe: Recipe) {
    set((state) => {
      // De-dupe: if the caller happens to re-save an existing id, swap
      // the row in place instead of doubling it.
      const existing = state.recipes.findIndex((r) => r.id === recipe.id);
      if (existing >= 0) {
        const next = state.recipes.slice();
        next[existing] = recipe;
        return { recipes: next };
      }
      return { recipes: [recipe, ...state.recipes] };
    });
  },

  async deleteRecipe(id: string) {
    await api.recipes.delete(id);
    set((state) => ({
      recipes: state.recipes.filter((r) => r.id !== id),
    }));
  },

  async bulkDeleteRecipes(ids: string[]) {
    const result = await api.recipes.bulkDelete(ids);
    // Filter local state by the IDs we asked to delete. The server may
    // have silently skipped any non-owned ids, but those weren't in our
    // local store anyway.
    const idSet = new Set(ids);
    set((state) => ({
      recipes: state.recipes.filter((r) => !idSet.has(r.id)),
    }));
    return result;
  },

  async bulkAssignCollection(ids: string[], collectionId: string | null) {
    const result = await api.recipes.bulkAssignCollection(ids, collectionId);
    // Refetch to pick up the updated `collections` arrays — matches the
    // single-assign pattern where HomeScreen/CollectionScreen call
    // fetchRecipes after assignment.
    await (async () => {
      const refreshed = await api.recipes.list();
      set({ recipes: refreshed });
    })();
    return result;
  },

  reset() {
    set({ recipes: [], loading: false, error: null });
  },
}));
