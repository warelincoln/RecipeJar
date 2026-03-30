import React, { useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Dimensions,
  ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { getCollectionIcon } from "../features/collections/collectionIconRules";

export type CollectionPickerItem = { id: string; name: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Shown under the title in accent color (same treatment as recipe quick-actions sheet). */
  recipeTitle?: string;
  subtitle?: string;
  collections: CollectionPickerItem[];
  onSelectCollection: (collectionId: string) => void | Promise<void>;
  showRemoveOption?: boolean;
  removeLabel?: string;
  onRemove?: () => void | Promise<void>;
};

const LIST_MAX_HEIGHT = Math.round(Dimensions.get("window").height * 0.42);

export function CollectionPickerSheet({
  visible,
  onClose,
  title,
  recipeTitle,
  subtitle,
  collections,
  onSelectCollection,
  showRemoveOption = false,
  removeLabel = "Remove from collection",
  onRemove,
}: Props) {
  const insets = useSafeAreaInsets();

  const runAndClose = useCallback(
    async (fn: () => void | Promise<void>) => {
      try {
        await fn();
        onClose();
      } catch {
        Alert.alert("Error", "Failed to update collection. Please try again.");
      }
    },
    [onClose],
  );

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<CollectionPickerItem>) => {
      const { Icon, color } = getCollectionIcon(item.name);
      const label =
        item.name.charAt(0).toUpperCase() + item.name.slice(1);
      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => runAndClose(() => onSelectCollection(item.id))}
          testID={`collection-picker-row-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Assign to ${label}`}
        >
          <View style={styles.rowIconWrap}>
            <Icon size={22} color={color} />
          </View>
          <Text style={styles.rowLabel} numberOfLines={2}>
            {label}
          </Text>
        </TouchableOpacity>
      );
    },
    [onSelectCollection, runAndClose],
  );

  const keyExtractor = useCallback((c: CollectionPickerItem) => c.id, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Dismiss collection picker backdrop"
        />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + 20,
              paddingHorizontal: 20,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={14}
            testID="collection-picker-close"
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <X size={24} color="#6b7280" />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          {recipeTitle ? (
            <Text style={styles.recipeTitleLine} numberOfLines={2}>
              {recipeTitle}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}

          <FlatList
            data={collections}
            keyExtractor={keyExtractor}
            renderItem={renderRow}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.rowSep} />}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={collections.length > 6}
          />

          {showRemoveOption && onRemove ? (
            <TouchableOpacity
              style={styles.removeRow}
              onPress={() => runAndClose(onRemove)}
              testID="collection-picker-remove"
              accessibilityRole="button"
              accessibilityLabel={removeLabel}
            >
              <Text style={styles.removeLabel}>{removeLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#eff6ff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 36,
    maxHeight: "78%",
  },
  closeBtn: {
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  recipeTitleLine: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1e40af",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  list: {
    maxHeight: LIST_MAX_HEIGHT,
    marginHorizontal: -4,
  },
  listContent: {
    paddingBottom: 8,
  },
  rowSep: {
    height: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  removeRow: {
    marginTop: 6,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  removeLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#dc2626",
  },
});
