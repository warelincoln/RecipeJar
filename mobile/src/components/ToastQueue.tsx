import React, {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WARNING,
  WHITE,
  BLACK,
} from "../theme/colors";

interface ToastItem {
  id: string;
  message: string;
  /** Optional — omit for informational toasts (e.g. bulk delete
   *  confirmation) where undo isn't meaningful. When absent, the Undo
   *  button is hidden and the toast is dismiss-on-timeout only. */
  onUndo?: () => Promise<void>;
}

export interface ToastQueueHandle {
  addToast: (item: Omit<ToastItem, "id">) => void;
}

const AUTO_DISMISS_MS = 4000;

export const ToastQueue = forwardRef<ToastQueueHandle>((_props, ref) => {
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const [undoing, setUndoing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCounter = useRef(0);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setQueue((prev) => prev.slice(1));
  }, []);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (!current) return;
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current?.id, dismiss]);

  useImperativeHandle(ref, () => ({
    addToast(item: Omit<ToastItem, "id">) {
      const id = `toast-${++idCounter.current}`;
      setQueue((prev) => [...prev, { ...item, id }]);
    },
  }));

  const handleUndo = async () => {
    if (!current || undoing || !current.onUndo) return;
    setUndoing(true);
    try {
      await current.onUndo();
    } catch {
      // undo failed — dismiss anyway; next fetchRecipes corrects state
    } finally {
      setUndoing(false);
      dismiss();
    }
  };

  if (!current) return null;

  return (
    <View
      style={[styles.container, { bottom: insets.bottom + 150 }]}
      pointerEvents="box-none"
    >
      <View style={styles.toast}>
        <Text style={styles.message} numberOfLines={1}>
          {current.message}
        </Text>
        {current.onUndo && (
          <TouchableOpacity
            onPress={handleUndo}
            disabled={undoing}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.undoText, undoing && styles.undoDisabled]}>
              {undoing ? "..." : "Undo"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 24,
    right: 24,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: TEXT_PRIMARY,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 12,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  message: {
    flex: 1,
    color: WHITE,
    fontSize: 14,
    fontWeight: "500",
  },
  undoText: {
    color: WARNING,
    fontSize: 14,
    fontWeight: "700",
  },
  undoDisabled: {
    color: TEXT_SECONDARY,
  },
});
