import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

interface SavedViewProps {
  recipeId: string | null;
  onViewRecipe: (id: string) => void;
  onDone: () => void;
}

export function SavedView({ recipeId, onViewRecipe, onDone }: SavedViewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.checkmark}>✓</Text>
      <Text style={styles.title}>Recipe Saved</Text>
      <Text style={styles.subtitle}>
        Your recipe has been saved to your collection.
      </Text>

      <View style={styles.actions}>
        {recipeId && (
          <TouchableOpacity
            style={styles.viewButton}
            onPress={() => onViewRecipe(recipeId)}
          >
            <Text style={styles.viewText}>View Recipe</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.doneButton} onPress={onDone}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center", padding: 32,
  },
  checkmark: { fontSize: 64, color: "#16a34a", marginBottom: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#6b7280", textAlign: "center" },
  actions: {
    flexDirection: "row", gap: 12, marginTop: 32,
  },
  viewButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12,
  },
  viewText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  doneButton: {
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12,
  },
  doneText: { fontSize: 16, fontWeight: "600", color: "#374151" },
});
