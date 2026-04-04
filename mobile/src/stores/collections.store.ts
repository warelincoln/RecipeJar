import { create } from "zustand";
import { api } from "../services/api";
import { useRecipesStore } from "./recipes.store";

interface Collection {
  id: string;
  name: string;
}

interface CollectionsState {
  collections: Collection[];
  loading: boolean;
  error: string | null;
  fetchCollections: () => Promise<void>;
  createCollection: (name: string) => Promise<Collection>;
  updateCollection: (id: string, name: string) => Promise<Collection>;
  deleteCollection: (id: string) => Promise<void>;
  reset: () => void;
}

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
  collections: [],
  loading: false,
  error: null,

  async fetchCollections() {
    set({ loading: true, error: null });
    try {
      const collections = await api.collections.list();
      set({ collections, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load collections",
        loading: false,
      });
    }
  },

  async createCollection(name: string) {
    const collection = await api.collections.create(name);
    set({ collections: [...get().collections, collection] });
    return collection;
  },

  async updateCollection(id: string, name: string) {
    const updated = await api.collections.update(id, name);
    if (!updated?.id) {
      throw new Error("Invalid response from server");
    }
    set({
      collections: get().collections.map((c) =>
        c.id === id ? { id: updated.id, name: updated.name } : c,
      ),
    });
    return updated;
  },

  async deleteCollection(id: string) {
    await api.collections.delete(id);
    set({
      collections: get().collections.filter((c) => c.id !== id),
    });
    await useRecipesStore.getState().fetchRecipes();
  },

  reset() {
    set({ collections: [], loading: false, error: null });
  },
}));
