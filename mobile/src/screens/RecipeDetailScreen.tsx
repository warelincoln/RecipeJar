import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ActionSheetIOS,
  Platform,
} from "react-native";
import { api } from "../services/api";
import { useRecipesStore } from "../stores/recipes.store";
import { useCollectionsStore } from "../stores/collections.store";
import type { Recipe } from "@recipejar/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "RecipeDetail">;

export function RecipeDetailScreen({ route, navigation }: Props) {
  const { recipeId } = route.params;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const { deleteRecipe } = useRecipesStore();
  const { collections, fetchCollections } = useCollectionsStore();

  const hasCollection = !!(recipe as any)?.collectionId;

  const handleAddToCollection = () => {
    if (collections.length === 0) {
      Alert.alert("No Collections", "Create a collection first from the home screen.");
      return;
    }

    const options = [...collections.map((c) => c.name), "Cancel"];
    const cancelIndex = options.length - 1;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: "Add to Collection" },
        async (buttonIndex) => {
          if (buttonIndex === cancelIndex) return;
          await api.recipes.assignCollection(recipeId, collections[buttonIndex].id);
          const updated = await api.recipes.get(recipeId);
          setRecipe(updated);
        },
      );
    } else {
      Alert.alert(
        "Add to Collection",
        "Select a collection",
        [
          ...collections.map((c) => ({
            text: c.name,
            onPress: async () => {
              await api.recipes.assignCollection(recipeId, c.id);
              const updated = await api.recipes.get(recipeId);
              setRecipe(updated);
            },
          })),
          { text: "Cancel", style: "cancel" as const },
        ],
      );
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Recipe",
      `Are you sure you want to permanently delete "${recipe?.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteRecipe(recipeId);
            navigation.goBack();
          },
        },
      ],
    );
  };

  useEffect(() => {
    fetchCollections();
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="recipe-detail-screen">
      <View style={styles.titleRow}>
        <Text style={styles.title} testID="recipe-detail-title">{recipe.title}</Text>
        <View style={styles.titleActions}>
          {!hasCollection && (
            <TouchableOpacity
              style={styles.collectionButton}
              onPress={handleAddToCollection}
              testID="recipe-detail-add-collection"
              accessibilityRole="button"
              accessibilityLabel="recipe-detail-add-collection"
            >
              <Text style={styles.collectionButtonText}>+ Collection</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => navigation.navigate("RecipeEdit", { recipeId })}
            testID="recipe-detail-edit"
            accessibilityRole="button"
            accessibilityLabel="recipe-detail-edit"
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {recipe.description && (
        <Text style={styles.description} testID="recipe-detail-description">{recipe.description}</Text>
      )}

      {recipe.isUserVerified && (
        <View style={styles.badge} testID="recipe-detail-verified-badge">
          <Text style={styles.badgeText}>User Verified</Text>
        </View>
      )}

      <Text style={styles.sectionTitle} testID="recipe-detail-ingredients-section">Ingredients</Text>
      {(recipe.ingredients ?? []).map((ing, i) =>
        ing.isHeader ? (
          <Text key={ing.id ?? `ing-${i}`} style={styles.ingredientHeader}>
            {ing.text}
          </Text>
        ) : (
          <View key={ing.id ?? `ing-${i}`} style={styles.ingredientRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.ingredientText}>{ing.text}</Text>
          </View>
        ),
      )}

      <Text style={styles.sectionTitle} testID="recipe-detail-steps-section">Steps</Text>
      {(() => {
        const stepsArr = recipe.steps ?? [];
        let stepNum = 0;
        return stepsArr.map((step, i) => {
          if (step.isHeader) {
            return (
              <Text key={step.id ?? `step-${i}`} style={styles.stepSectionHeader}>
                {step.text}
              </Text>
            );
          }
          stepNum++;
          return (
            <View key={step.id ?? `step-${i}`} style={styles.stepRow}>
              <Text style={styles.stepNumber}>{stepNum}</Text>
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          );
        });
      })()}

      <View style={styles.meta}>
        {recipe.sourceContext?.sourceType && (
          <Text style={styles.metaText}>
            Source: {recipe.sourceContext.sourceType}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={handleDelete}
        testID="recipe-detail-delete"
        accessibilityRole="button"
        accessibilityLabel="recipe-detail-delete"
      >
        <Text style={styles.deleteButtonText}>Delete Recipe</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, paddingBottom: 40 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16, color: "#dc2626" },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: "800", flex: 1, marginRight: 12 },
  titleActions: { flexDirection: "row", gap: 8, marginTop: 2 },
  collectionButton: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  collectionButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  editButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
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
  stepSectionHeader: {
    fontSize: 15, fontWeight: "600", fontStyle: "italic",
    color: "#374151", marginTop: 12, marginBottom: 4,
  },
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
  deleteButton: {
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dc2626",
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#dc2626",
    fontSize: 16,
    fontWeight: "600",
  },
});
