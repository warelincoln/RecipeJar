import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { api } from "../services/api";
import type { Recipe } from "@recipejar/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "RecipeDetail">;

export function RecipeDetailScreen({ route }: Props) {
  const { recipeId } = route.params;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.recipes
      .get(recipeId)
      .then(setRecipe)
      .finally(() => setLoading(false));
  }, [recipeId]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={styles.loader}>
        <Text style={styles.errorText}>Recipe not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{recipe.title}</Text>

      {recipe.description && (
        <Text style={styles.description}>{recipe.description}</Text>
      )}

      {recipe.isUserVerified && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>User Verified</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Ingredients</Text>
      {recipe.ingredients.map((ing) =>
        ing.isHeader ? (
          <Text key={ing.id} style={styles.ingredientHeader}>
            {ing.text}
          </Text>
        ) : (
          <View key={ing.id} style={styles.ingredientRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.ingredientText}>{ing.text}</Text>
          </View>
        ),
      )}

      <Text style={styles.sectionTitle}>Steps</Text>
      {recipe.steps.map((step, i) => (
        <View key={step.id} style={styles.stepRow}>
          <Text style={styles.stepNumber}>{i + 1}</Text>
          <Text style={styles.stepText}>{step.text}</Text>
        </View>
      ))}

      <View style={styles.meta}>
        <Text style={styles.metaText}>
          Source: {recipe.sourceContext.sourceType}
        </Text>
        <Text style={styles.metaText}>
          Save state: {recipe.saveState}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 40 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16, color: "#dc2626" },
  title: { fontSize: 26, fontWeight: "800", marginBottom: 8 },
  description: { fontSize: 15, color: "#6b7280", lineHeight: 22, marginBottom: 16 },
  badge: {
    alignSelf: "flex-start", backgroundColor: "#fef3c7",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 16,
  },
  badgeText: { fontSize: 12, fontWeight: "600", color: "#b45309" },
  sectionTitle: {
    fontSize: 20, fontWeight: "700", marginTop: 24, marginBottom: 12,
  },
  ingredientHeader: {
    fontSize: 15, fontWeight: "600", fontStyle: "italic",
    color: "#374151", marginTop: 12, marginBottom: 4,
  },
  ingredientRow: { flexDirection: "row", marginBottom: 6 },
  bullet: { fontSize: 15, marginRight: 8, color: "#2563eb" },
  ingredientText: { flex: 1, fontSize: 15, lineHeight: 22 },
  stepRow: { flexDirection: "row", marginBottom: 16 },
  stepNumber: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "#2563eb", color: "#fff",
    textAlign: "center", lineHeight: 28, fontSize: 14, fontWeight: "700",
    marginRight: 12,
  },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22 },
  meta: {
    marginTop: 32, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: "#e5e7eb",
  },
  metaText: { fontSize: 12, color: "#9ca3af", marginBottom: 4 },
});
