import { useCallback, useState } from "react";
import { haptics } from "../services/haptics";

/**
 * Shared bulk-selection state for the grid screens (Home + Collection).
 *
 * Behavior:
 *   - `enterBulk(initialId)` — long-press entry. Activates bulk mode with
 *     exactly one card preselected. Fires a light haptic tap.
 *   - `toggle(id)` — card tap in bulk mode. Toggles the id in the set and
 *     fires a selection haptic. If toggling leaves the set empty, bulk
 *     mode stays on — caller decides whether to exit (matches iOS Photos:
 *     deselecting the last item shows an empty "0 selected" state rather
 *     than auto-exiting, so the user doesn't accidentally leave the mode).
 *   - `selectAll(allIds)` / `clear()` — header actions.
 *   - `exit()` — called after a successful bulk action (delete/assign) or
 *     when the user taps Cancel / presses hardware back.
 *
 * Haptics are fired on entry and every toggle — polish for the iOS
 * Photos-style metaphor. No-op if the native binary isn't rebuilt yet
 * (the haptics service swallows errors).
 */
export interface BulkSelection {
  bulkMode: boolean;
  selectedIds: Set<string>;
  selectedCount: number;
  isSelected: (id: string) => boolean;
  enterBulk: (initialId: string) => void;
  toggle: (id: string) => void;
  selectAll: (allIds: string[]) => void;
  clear: () => void;
  exit: () => void;
}

export function useBulkSelection(): BulkSelection {
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enterBulk = useCallback((initialId: string) => {
    setBulkMode(true);
    setSelectedIds(new Set([initialId]));
    haptics.tap();
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    haptics.toggle();
  }, []);

  const selectAll = useCallback((allIds: string[]) => {
    setSelectedIds(new Set(allIds));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const exit = useCallback(() => {
    setBulkMode(false);
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  return {
    bulkMode,
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    enterBulk,
    toggle,
    selectAll,
    clear,
    exit,
  };
}
