import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { Check } from "lucide-react-native";

interface SavedViewProps {
  recipeId: string | null;
  onViewRecipe: (id: string) => void;
  onAddMore: () => void;
  addMoreLabel?: string;
  onDone: () => void;
}

export function SavedView({
  recipeId,
  onViewRecipe,
  onAddMore,
  addMoreLabel,
  onDone,
}: SavedViewProps) {
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 7,
        tension: 140,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [checkOpacity, checkScale]);

  return (
    <View style={styles.container} testID="saved-screen">
      <Animated.View
        style={[
          styles.checkWrap,
          {
            opacity: checkOpacity,
            transform: [{ scale: checkScale }],
          },
        ]}
        testID="saved-checkmark"
      >
        <Check size={64} color="#16a34a" accessibilityLabel="Recipe saved" />
      </Animated.View>
      <Text style={styles.title} testID="saved-title">
        Recipe Saved
      </Text>
      <Text style={styles.subtitle}>
        Your recipe has been saved to your collection.
      </Text>

      <View style={styles.actions}>
        {recipeId && (
          <TouchableOpacity
            style={styles.viewButton}
            onPress={() => onViewRecipe(recipeId)}
            testID="saved-view-recipe"
            accessibilityRole="button"
            accessibilityLabel="saved-view-recipe"
          >
            <Text style={styles.viewText}>View Recipe</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.addMoreButton}
          onPress={onAddMore}
          testID="saved-add-more"
          accessibilityRole="button"
          accessibilityLabel="saved-add-more"
        >
          <Text style={styles.addMoreText}>{addMoreLabel ?? "Add More"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={onDone}
          testID="saved-done"
          accessibilityRole="button"
          accessibilityLabel="saved-done"
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  checkWrap: {
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#6b7280", textAlign: "center" },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 32,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  viewButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  viewText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  addMoreButton: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addMoreText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  doneButton: {
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneText: { fontSize: 16, fontWeight: "600", color: "#374151" },
});
