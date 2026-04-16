import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FolderMinus, FolderPlus, Trash2 } from "lucide-react-native";
import {
  DIVIDER,
  ERROR,
  PRIMARY,
  WHITE,
} from "../theme/colors";

interface BulkActionsBarProps {
  /** Controls slide-in/out animation. */
  visible: boolean;
  /** Number of selected recipes. Both actions disable when 0. */
  count: number;
  /**
   * Primary action variant. Controls the label + icon on the left button.
   *   - "add-to-collection": used on Home + All Recipes. Opens the
   *     CollectionPickerSheet to let the user pick a destination folder.
   *   - "remove-from-collection": used inside a specific collection,
   *     where the "add" semantic doesn't apply. Clears the selected
   *     recipes' collection assignment (equivalent to a bulk null-assign).
   */
  primaryAction?: "add-to-collection" | "remove-from-collection";
  onPrimary: () => void;
  onDelete: () => void;
}

/**
 * Floating bottom action bar for bulk-select mode. Slides up from the
 * bottom when `visible` becomes true, mirroring the HomeScreen FAB fan
 * animation pattern (Animated.spring, native driver).
 *
 * Positioned with `position: "absolute"` + safe-area bottom inset; the
 * parent screen is expected to add a matching bottom paddingBottom to the
 * FlatList so the last row of cards isn't obscured.
 *
 * Both action buttons disable (reduced opacity, no press handler) when
 * `count === 0`. Cancel is handled in the header, not here — keeping
 * this bar focused on destructive/modifying actions.
 */
export function BulkActionsBar({
  visible,
  count,
  primaryAction = "add-to-collection",
  onPrimary,
  onDelete,
}: BulkActionsBarProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [visible, slideAnim]);

  // Keep the bar mounted while it's visibly animating so the slide-out
  // completes. Unmount only once fully off-screen.
  if (!visible && (slideAnim as unknown as { _value: number })._value === 0) {
    return null;
  }

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [120, 0],
  });

  const disabled = count === 0;

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.bar,
        {
          bottom: insets.bottom + 12,
          transform: [{ translateY }],
          opacity: slideAnim,
        },
      ]}
      testID="bulk-actions-bar"
    >
      <TouchableOpacity
        style={[styles.action, styles.assignAction, disabled && styles.actionDisabled]}
        onPress={onPrimary}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          primaryAction === "remove-from-collection"
            ? "bulk-remove-from-collection"
            : "bulk-add-to-collection"
        }
        testID={
          primaryAction === "remove-from-collection"
            ? "bulk-remove-from-collection"
            : "bulk-add-to-collection"
        }
      >
        {primaryAction === "remove-from-collection" ? (
          <FolderMinus size={18} color={WHITE} strokeWidth={2} />
        ) : (
          <FolderPlus size={18} color={WHITE} strokeWidth={2} />
        )}
        <Text style={styles.actionText}>
          {primaryAction === "remove-from-collection"
            ? "Remove from folder"
            : "Add to collection"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.action, styles.deleteAction, disabled && styles.actionDisabled]}
        onPress={onDelete}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="bulk-delete"
        testID="bulk-delete"
      >
        <Trash2 size={18} color={ERROR} strokeWidth={2} />
        <Text style={[styles.actionText, styles.deleteActionText]}>Delete</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 10,
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: DIVIDER,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  assignAction: {
    backgroundColor: PRIMARY,
  },
  deleteAction: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: ERROR,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
  },
  deleteActionText: {
    color: ERROR,
  },
});
