import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
} from "react-native";
import { ChevronUp, ChevronDown } from "lucide-react-native";
import { LUCIDE } from "../../theme/lucideSizes";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  DIVIDER,
  SURFACE,
  WHITE,
} from "../../theme/colors";

const THUMB_W = 48 * 3;
const THUMB_H = 64 * 3;

interface ReorderViewProps {
  pages: { pageId: string; imageUri: string; orderIndex: number }[];
  onReorder: (pageOrder: { pageId: string; orderIndex: number }[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ReorderView({ pages, onReorder, onConfirm, onCancel }: ReorderViewProps) {
  const [orderedPages, setOrderedPages] = useState(pages);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...orderedPages];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    const reindexed = updated.map((p, i) => ({ ...p, orderIndex: i }));
    setOrderedPages(reindexed);
    onReorder(reindexed.map((p) => ({ pageId: p.pageId, orderIndex: p.orderIndex })));
  };

  const moveDown = (index: number) => {
    if (index === orderedPages.length - 1) return;
    const updated = [...orderedPages];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    const reindexed = updated.map((p, i) => ({ ...p, orderIndex: i }));
    setOrderedPages(reindexed);
    onReorder(reindexed.map((p) => ({ pageId: p.pageId, orderIndex: p.orderIndex })));
  };

  const multiplePages = orderedPages.length > 1;

  const { width: winW, height: winH } = Dimensions.get("window");
  const singlePreviewW = winW - 32;
  const singlePreviewH = Math.min(winH * 0.52, singlePreviewW * 1.45);

  return (
    <View style={styles.container} testID="reorder-screen">
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={onCancel}
        testID="reorder-cancel"
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>

      <Text style={styles.header} testID="reorder-header">
        {multiplePages ? "Line up your pages" : "Review your photo"}
      </Text>
      <Text style={styles.subtitle}>
        {multiplePages
          ? "Reorder with the arrows if needed, then tap Import Recipe—we'll turn your photos into a clean recipe."
          : "Tap Import Recipe and we'll turn this photo into a clean recipe."}
      </Text>

      {multiplePages ? (
        <FlatList
          data={orderedPages}
          keyExtractor={(item) => item.pageId}
          renderItem={({ item, index }) => (
            <View style={styles.pageRow}>
              <Image
                source={{ uri: item.imageUri }}
                style={styles.pageThumb}
                resizeMode="contain"
                accessibilityLabel={`Photo ${index + 1} of ${orderedPages.length}`}
              />
              <View style={styles.arrows}>
                <TouchableOpacity
                  onPress={() => moveUp(index)}
                  disabled={index === 0}
                  style={styles.arrowHit}
                  accessibilityRole="button"
                  accessibilityLabel="Move photo up"
                  hitSlop={8}
                >
                  <ChevronUp
                    size={LUCIDE.xl}
                    color={index === 0 ? DIVIDER : PRIMARY}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveDown(index)}
                  disabled={index === orderedPages.length - 1}
                  style={styles.arrowHit}
                  accessibilityRole="button"
                  accessibilityLabel="Move photo down"
                  hitSlop={8}
                >
                  <ChevronDown
                    size={LUCIDE.xl}
                    color={
                      index === orderedPages.length - 1 ? DIVIDER : PRIMARY
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}
          style={styles.list}
        />
      ) : orderedPages[0] ? (
        <View style={styles.singlePreviewArea}>
          <Image
            source={{ uri: orderedPages[0].imageUri }}
            style={[
              styles.singlePreviewImage,
              { width: singlePreviewW, height: singlePreviewH },
            ]}
            resizeMode="contain"
            accessibilityLabel="Recipe photo preview"
          />
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.confirmButton}
        onPress={onConfirm}
        testID="reorder-confirm"
        accessibilityRole="button"
        accessibilityLabel="Import recipe"
      >
        <Text style={styles.confirmText}>Import Recipe</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WHITE,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  cancelButton: { alignSelf: "flex-start", paddingVertical: 8 },
  cancelText: { fontSize: 16, color: TEXT_SECONDARY },
  header: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
    color: TEXT_PRIMARY,
    paddingHorizontal: 8,
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    marginBottom: 12,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  list: { flex: 1 },
  singlePreviewArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    minHeight: 120,
  },
  singlePreviewImage: {
    borderRadius: 12,
    backgroundColor: SURFACE,
  },
  pageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    gap: 12,
  },
  pageThumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 10,
    backgroundColor: SURFACE,
    flexShrink: 0,
  },
  arrows: {
    flex: 1,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 10,
    minWidth: 56,
  },
  arrowHit: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  confirmButton: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  confirmText: { color: WHITE, fontSize: 16, fontWeight: "600" },
});
