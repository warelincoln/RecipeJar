import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../services/api";

export type QueueEntryStatus =
  | "uploading"
  | "parsing"
  | "parsed"
  | "needs_retake"
  | "parse_failed"
  | "reviewing"
  | "saving";

export interface QueueEntry {
  localId: string;
  draftId: string | null;
  status: QueueEntryStatus;
  thumbnailUri: string;
  title?: string;
  addedAt: number;
  error?: string;
  /** Status before entering "reviewing", so we can restore on unmount */
  preReviewStatus?: QueueEntryStatus;
}

const MAX_QUEUE_SIZE = 3;

interface ImportQueueState {
  entries: QueueEntry[];
  addEntry: (entry: QueueEntry) => void;
  updateEntry: (localId: string, updates: Partial<QueueEntry>) => void;
  removeEntry: (localId: string) => void;
  canImportMore: () => boolean;
  setReviewing: (localId: string) => void;
  clearReviewing: (localId: string) => void;
}

export const useImportQueueStore = create<ImportQueueState>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry(entry) {
        set((state) => ({ entries: [...state.entries, entry] }));
      },

      updateEntry(localId, updates) {
        set((state) => ({
          entries: state.entries.map((e) =>
            e.localId === localId ? { ...e, ...updates } : e,
          ),
        }));
      },

      removeEntry(localId) {
        set((state) => ({
          entries: state.entries.filter((e) => e.localId !== localId),
        }));
      },

      canImportMore() {
        return get().entries.length < MAX_QUEUE_SIZE;
      },

      setReviewing(localId) {
        set((state) => ({
          entries: state.entries.map((e) =>
            e.localId === localId
              ? { ...e, preReviewStatus: e.status, status: "reviewing" as const }
              : e,
          ),
        }));
      },

      clearReviewing(localId) {
        set((state) => ({
          entries: state.entries.map((e) =>
            e.localId === localId && e.status === "reviewing"
              ? { ...e, status: e.preReviewStatus ?? "parsed", preReviewStatus: undefined }
              : e,
          ),
        }));
      },
    }),
    {
      name: "import-queue",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ entries: state.entries }),
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (error) {
            console.warn("[importQueue] Rehydration failed:", error);
            return;
          }
          reconcileQueue();
        };
      },
    },
  ),
);

async function reconcileQueue() {
  const { entries, updateEntry, removeEntry } = useImportQueueStore.getState();

  for (const entry of entries) {
    if (entry.status === "reviewing") {
      updateEntry(entry.localId, {
        status: entry.preReviewStatus ?? "parsed",
        preReviewStatus: undefined,
      });
    }

    if (!entry.draftId) {
      if (entry.status === "uploading") {
        removeEntry(entry.localId);
      }
      continue;
    }

    if (entry.status === "uploading" || entry.status === "parsing") {
      try {
        const draft = await api.drafts.get(entry.draftId);
        const serverStatus = draft.status;

        if (serverStatus === "SAVED" || serverStatus === "CANCELLED") {
          removeEntry(entry.localId);
        } else if (serverStatus === "PARSED") {
          const title =
            (draft.parsedCandidate as { title?: string } | null)?.title ??
            undefined;
          updateEntry(entry.localId, { status: "parsed", title });
        } else if (serverStatus === "NEEDS_RETAKE") {
          updateEntry(entry.localId, { status: "needs_retake" });
        } else if (serverStatus === "PARSE_FAILED") {
          updateEntry(entry.localId, {
            status: "parse_failed",
            error: (draft as unknown as { parseErrorMessage?: string }).parseErrorMessage ?? "Parse failed",
          });
        }
      } catch {
        removeEntry(entry.localId);
      }
    }
  }
}
