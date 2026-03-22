import { create } from "zustand";
import { api } from "../services/api";

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
}));
