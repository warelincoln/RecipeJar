import { create } from "zustand";
import type { Recipe } from "@recipejar/shared";
import { api } from "../services/api";

interface RecipesState {
  recipes: Recipe[];
  loading: boolean;
  error: string | null;
  fetchRecipes: () => Promise<void>;
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
}));
