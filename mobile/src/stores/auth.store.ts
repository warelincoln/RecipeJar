import { create } from "zustand";
import type { Session, User, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "../services/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  pendingPasswordReset: boolean;
  needsMfaVerify: boolean;
  initialize: () => Promise<void>;
  setPendingPasswordReset: (value: boolean) => void;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<void>;
}

let unsubscribe: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  isLoading: true,
  isAuthenticated: false,
  pendingPasswordReset: false,
  needsMfaVerify: false,

  async initialize() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }

    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const factors = data.session.user?.factors ?? [];
        const hasVerifiedTotp = factors.some(
          (f) => f.factor_type === "totp" && f.status === "verified",
        );
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        const needsMfa = hasVerifiedTotp && aalData?.currentLevel !== "aal2";
        set({
          session: data.session,
          user: data.session.user,
          isAuthenticated: true,
          needsMfaVerify: needsMfa,
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
        if (session) {
          const factors = session.user?.factors ?? [];
          const hasVerifiedTotp = factors.some(
            (f) => f.factor_type === "totp" && f.status === "verified",
          );

          set({
            session,
            user: session.user,
            isAuthenticated: true,
          });

          // Defer AAL check to avoid deadlocking the Supabase session lock
          // (onAuthStateChange fires while the lock is held by the triggering call)
          setTimeout(async () => {
            try {
              const { data: aalData } =
                await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
              const needsMfa =
                hasVerifiedTotp && aalData?.currentLevel !== "aal2";
              set({ needsMfaVerify: needsMfa });
            } catch {
              if (hasVerifiedTotp) set({ needsMfaVerify: true });
            }
          }, 0);
        } else {
          set({
            session: null,
            user: null,
            isAuthenticated: false,
            needsMfaVerify: false,
          });
        }
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

  async signOutAll() {
    await supabase.auth.signOut({ scope: "global" });

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
