import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from "react-native";
import { ChevronUp, ChevronDown } from "lucide-react-native";

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

  return (
    <View style={styles.container} testID="reorder-screen">
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel} testID="reorder-cancel" accessibilityRole="button" accessibilityLabel="reorder-cancel">
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
      <Text style={styles.header} testID="reorder-header">Arrange Pages</Text>
      <Text style={styles.subtitle}>
        Drag to reorder pages so the recipe reads in the correct order.
      </Text>

      <FlatList
        data={orderedPages}
        keyExtractor={(item) => item.pageId}
        renderItem={({ item, index }) => (
          <View style={styles.pageRow}>
            <Image source={{ uri: item.imageUri }} style={styles.pageThumb} />
            <Text style={styles.pageLabel}>Page {index + 1}</Text>
            <View style={styles.arrows}>
              <TouchableOpacity onPress={() => moveUp(index)} disabled={index === 0}>
                <ChevronUp size={20} color={index === 0 ? "#d1d5db" : "#2563eb"} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveDown(index)}
                disabled={index === orderedPages.length - 1}
              >
                <ChevronDown size={20} color={index === orderedPages.length - 1 ? "#d1d5db" : "#2563eb"} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        style={styles.list}
      />

      <TouchableOpacity style={styles.confirmButton} onPress={onConfirm} testID="reorder-confirm" accessibilityRole="button" accessibilityLabel="reorder-confirm">
        <Text style={styles.confirmText}>Continue to Parse</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 16, paddingTop: 8 },
  cancelButton: { alignSelf: "flex-start", paddingVertical: 8 },
  cancelText: { fontSize: 16, color: "#6b7280" },
  header: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#6b7280", marginBottom: 16 },
  list: { flex: 1 },
  pageRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  pageThumb: { width: 48, height: 64, borderRadius: 4, marginRight: 12 },
  pageLabel: { flex: 1, fontSize: 16 },
  arrows: { gap: 4 },
  arrow: { paddingHorizontal: 8 },
  confirmButton: {
    backgroundColor: "#2563eb", paddingVertical: 14,
    borderRadius: 12, alignItems: "center", marginTop: 16, marginBottom: 8,
  },
  confirmText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
