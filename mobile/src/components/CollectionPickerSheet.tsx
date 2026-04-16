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
import { FolderPlus, X } from "lucide-react-native";
import { getCollectionIcon } from "../features/collections/collectionIconRules";
import { LUCIDE } from "../theme/lucideSizes";
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  DIVIDER,
  SURFACE,
  PRIMARY,
  PRIMARY_LIGHT,
  TINT_RED,
  ERROR,
  WHITE,
  BLACK,
  DEEP_TERRACOTTA,
} from "../theme/colors";

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
  /** When provided, adds a "+ New folder" row at the top of the list.
   *  Parent is responsible for closing the picker, opening a
   *  CreateCollectionSheet, creating the collection, and then running
   *  the assignment. Keeps this sheet state-free. */
  onCreateNewCollection?: () => void;
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
  onCreateNewCollection,
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
            <Icon size={LUCIDE.row} color={color} />
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
            <X size={LUCIDE.lg} color={TEXT_SECONDARY} />
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
            ListHeaderComponent={
              onCreateNewCollection ? (
                <>
                  <TouchableOpacity
                    style={[styles.row, styles.newFolderRow]}
                    onPress={() => {
                      onClose();
                      onCreateNewCollection();
                    }}
                    testID="collection-picker-new-folder"
                    accessibilityRole="button"
                    accessibilityLabel="Create new folder"
                  >
                    <View style={[styles.rowIconWrap, styles.newFolderIconWrap]}>
                      <FolderPlus size={LUCIDE.row} color={WHITE} />
                    </View>
                    <Text style={[styles.rowLabel, styles.newFolderLabel]}>
                      New folder
                    </Text>
                  </TouchableOpacity>
                  {collections.length > 0 && <View style={styles.rowSep} />}
                </>
              ) : null
            }
            ListEmptyComponent={
              onCreateNewCollection ? null : (
                <Text style={styles.emptyText}>No folders yet.</Text>
              )
            }
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
    backgroundColor: PRIMARY_LIGHT,
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
    color: TEXT_PRIMARY,
    marginBottom: 6,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  recipeTitleLine: {
    fontSize: 17,
    fontWeight: "600",
    color: DEEP_TERRACOTTA,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
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
    backgroundColor: WHITE,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  rowIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: SURFACE,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    paddingTop: 2,
  },
  newFolderRow: {
    backgroundColor: PRIMARY,
  },
  newFolderIconWrap: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  newFolderLabel: {
    color: WHITE,
  },
  emptyText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    paddingVertical: 12,
  },
  removeRow: {
    marginTop: 6,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: TINT_RED,
    borderWidth: 1,
    borderColor: TINT_RED,
  },
  removeLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: ERROR,
  },
});
