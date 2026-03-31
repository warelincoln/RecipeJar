import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useImportQueueStore, type QueueEntry } from "../../stores/importQueue.store";
import { api } from "../../services/api";

const BASE_INTERVAL = 3000;
const MID_INTERVAL = 5000;
const MAX_INTERVAL = 10000;
const MID_THRESHOLD = 15000;
const MAX_THRESHOLD = 30000;

function getInterval(elapsedMs: number): number {
  if (elapsedMs > MAX_THRESHOLD) return MAX_INTERVAL;
  if (elapsedMs > MID_THRESHOLD) return MID_INTERVAL;
  return BASE_INTERVAL;
}

async function pollEntry(entry: QueueEntry) {
  if (!entry.draftId) return;

  try {
    const draft = await api.drafts.get(entry.draftId);
    const { updateEntry, removeEntry } = useImportQueueStore.getState();

    switch (draft.status) {
      case "PARSED": {
        const title =
          (draft.parsedCandidate as { title?: string } | null)?.title ??
          undefined;
        updateEntry(entry.localId, { status: "parsed", title });
        break;
      }
      case "NEEDS_RETAKE":
        updateEntry(entry.localId, { status: "needs_retake" });
        break;
      case "PARSE_FAILED":
        updateEntry(entry.localId, {
          status: "parse_failed",
          error: (draft as unknown as { parseErrorMessage?: string }).parseErrorMessage ?? "Parse failed",
        });
        break;
      case "SAVED":
      case "CANCELLED":
        removeEntry(entry.localId);
        break;
    }
  } catch {
    // network error — will retry on next tick
  }
}

export function useImportQueuePoller() {
  const entries = useImportQueueStore((s) => s.entries);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const startTimesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      appStateRef.current = next;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const parsingEntries = entries.filter(
      (e) => e.status === "parsing" && e.draftId,
    );

    if (parsingEntries.length === 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startTimesRef.current.clear();
      return;
    }

    const now = Date.now();
    for (const e of parsingEntries) {
      if (!startTimesRef.current.has(e.localId)) {
        startTimesRef.current.set(e.localId, now);
      }
    }

    function tick() {
      if (appStateRef.current !== "active") {
        timerRef.current = setTimeout(tick, BASE_INTERVAL);
        return;
      }

      const current = useImportQueueStore.getState().entries;
      const polling = current.filter(
        (e) => e.status === "parsing" && e.draftId,
      );

      if (polling.length === 0) {
        timerRef.current = null;
        return;
      }

      for (const entry of polling) {
        pollEntry(entry);
      }

      const maxElapsed = Math.max(
        ...polling.map((e) => {
          const start = startTimesRef.current.get(e.localId) ?? Date.now();
          return Date.now() - start;
        }),
      );

      timerRef.current = setTimeout(tick, getInterval(maxElapsed));
    }

    if (!timerRef.current) {
      timerRef.current = setTimeout(tick, BASE_INTERVAL);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [entries]);
}
