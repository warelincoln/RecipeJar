import { create } from "zustand";
import type { Session, User, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "../services/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  pendingPasswordReset: boolean;
  initialize: () => Promise<void>;
  setPendingPasswordReset: (value: boolean) => void;
  signOut: () => Promise<void>;
}

let unsubscribe: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,
  pendingPasswordReset: false,

  async initialize() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        set({
          session: data.session,
          user: data.session.user,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ isAuthenticated: false, isLoading: false });
    }

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        set({
          session,
          user: session?.user ?? null,
          isAuthenticated: session !== null,
        });
      },
    );
    unsubscribe = () => listener.subscription.unsubscribe();
  },

  setPendingPasswordReset(value: boolean) {
    set({ pendingPasswordReset: value });
  },

  async signOut() {
    await supabase.auth.signOut();

    const { useRecipesStore } = await import("./recipes.store");
    const { useCollectionsStore } = await import("./collections.store");
    const { useImportQueueStore } = await import("./importQueue.store");

    useRecipesStore.getState().reset();
    useCollectionsStore.getState().reset();
    useImportQueueStore.getState().reset();

    set({
      session: null,
      user: null,
      isAuthenticated: false,
      pendingPasswordReset: false,
    });
  },
}));
