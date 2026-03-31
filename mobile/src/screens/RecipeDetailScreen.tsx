import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import FastImage from "react-native-fast-image";
import { api } from "../services/api";
import { useRecipesStore } from "../stores/recipes.store";
import { useCollectionsStore } from "../stores/collections.store";
import { RecipeRatingInput } from "../components/RecipeRatingInput";
import { RecipeNotesSection } from "../components/RecipeNotesSection";
import { ShimmerPlaceholder } from "../components/ShimmerPlaceholder";
import { RecipeImagePlaceholder } from "../components/RecipeImagePlaceholder";
import { FullScreenImageViewer } from "../components/FullScreenImageViewer";
import { CollectionPickerSheet } from "../components/CollectionPickerSheet";
import type { Recipe } from "@recipejar/shared";
import { scaleIngredient } from "../utils/scaling";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "RecipeDetail">;

export function RecipeDetailScreen({ route, navigation }: Props) {
  const { recipeId } = route.params;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [imgCacheBuster, setImgCacheBuster] = useState(() => Date.now());
  const [collectionPickerVisible, setCollectionPickerVisible] = useState(false);
  const [displayServingsText, setDisplayServingsText] = useState("");
  const { deleteRecipe } = useRecipesStore();
  const { collections, fetchCollections } = useCollectionsStore();

  const hasCollection = (recipe?.collections?.length ?? 0) > 0;

  const handleAddToCollection = () => {
    if (collections.length === 0) {
      Alert.alert("No Collections", "Create a collection first from the home screen.");
      return;
    }
    setCollectionPickerVisible(true);
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

  const refreshRecipe = useCallback(() => {
    api.recipes.get(recipeId).then((r) => {
      setRecipe(r);
      setImgCacheBuster(Date.now());
      setHeroLoaded(false);
      if (r.baselineServings != null) {
        setDisplayServingsText(String(r.baselineServings));
      }
    });
  }, [recipeId]);

  useEffect(() => {
    fetchCollections();
    api.recipes
      .get(recipeId)
      .then((next) => {
        setRecipe(next);
        setHeroLoaded(false);
        if (next.baselineServings != null) {
          setDisplayServingsText(String(next.baselineServings));
        }
      })
      .finally(() => setLoading(false));
  }, [recipeId]);

  useEffect(() => {
    return navigation.addListener("focus", refreshRecipe);
  }, [navigation, refreshRecipe]);

  const baseline = recipe?.baselineServings ?? null;
  const displayServings = useMemo(() => {
    const parsed = parseFloat(displayServingsText);
    if (!isNaN(parsed) && parsed >= 0.25 && parsed <= 99) return parsed;
    return baseline;
  }, [displayServingsText, baseline]);

  const scaleFactor = useMemo(() => {
    if (baseline == null || baseline === 0 || displayServings == null) return 1;
    return displayServings / baseline;
  }, [baseline, displayServings]);

  const handleServingsChange = (text: string) => {
    setDisplayServingsText(text);
  };

  const handleServingsStep = (delta: number) => {
    const current = displayServings ?? baseline ?? 1;
    const next = Math.max(0.25, Math.min(99, current + delta));
    setDisplayServingsText(String(next));
  };

  const handleServingsReset = () => {
    if (baseline != null) {
      setDisplayServingsText(String(baseline));
    }
  };

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

  const heroUrl = recipe.imageUrl ? `${recipe.imageUrl}?t=${imgCacheBuster}` : null;

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="recipe-detail-screen">
      <TouchableOpacity
        style={styles.heroWrap}
        onPress={() => setViewerVisible(true)}
        activeOpacity={0.95}
        testID="recipe-detail-hero"
      >
        {heroUrl ? (
          <>
            {!heroLoaded && (
              <ShimmerPlaceholder
                style={StyleSheet.absoluteFillObject}
                borderRadius={14}
              />
            )}
            <FastImage
              source={{ uri: heroUrl }}
              style={[styles.heroImage, !heroLoaded && styles.heroImageHidden]}
              resizeMode={FastImage.resizeMode.cover}
              onLoadEnd={() => setHeroLoaded(true)}
            />
          </>
        ) : (
          <RecipeImagePlaceholder style={styles.heroImage} />
        )}
      </TouchableOpacity>

      <View style={styles.body}>
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

      <RecipeRatingInput
        rating={recipe.rating}
        onRate={(value) => {
          api.recipes.setRating(recipeId, value);
        }}
      />

      {recipe.isUserVerified && (
        <View style={styles.badge} testID="recipe-detail-verified-badge">
          <Text style={styles.badgeText}>User Verified</Text>
        </View>
      )}

      {baseline != null && (
        <View style={styles.servingsControl}>
          <Text style={styles.servingsLabel}>Servings</Text>
          <View style={styles.servingsRow}>
            <TouchableOpacity
              style={styles.servingsStepBtn}
              onPress={() => handleServingsStep(-1)}
              accessibilityLabel="Decrease servings"
            >
              <Text style={styles.servingsStepText}>−</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.servingsInput}
              value={displayServingsText}
              onChangeText={handleServingsChange}
              keyboardType="numeric"
              testID="recipe-detail-servings-input"
            />
            <TouchableOpacity
              style={styles.servingsStepBtn}
              onPress={() => handleServingsStep(1)}
              accessibilityLabel="Increase servings"
            >
              <Text style={styles.servingsStepText}>+</Text>
            </TouchableOpacity>
            {displayServings !== baseline && (
              <TouchableOpacity onPress={handleServingsReset}>
                <Text style={styles.servingsResetText}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
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
            <Text style={styles.ingredientText}>
              {scaleIngredient(ing, scaleFactor)}
            </Text>
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

      <RecipeNotesSection
        notes={recipe.notes ?? []}
        onAdd={async (text) => {
          await api.recipes.createNote(recipeId, text);
          refreshRecipe();
        }}
        onEdit={async (noteId, text) => {
          await api.recipes.updateNote(recipeId, noteId, text);
          refreshRecipe();
        }}
        onDelete={async (noteId) => {
          await api.recipes.deleteNote(recipeId, noteId);
          refreshRecipe();
        }}
      />

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
      </View>
      <FullScreenImageViewer
        visible={viewerVisible}
        imageUrl={heroUrl}
        onClose={() => setViewerVisible(false)}
      />
    </ScrollView>
    <CollectionPickerSheet
      visible={collectionPickerVisible}
      onClose={() => setCollectionPickerVisible(false)}
      title="Add to collection"
      recipeTitle={recipe.title}
      subtitle="Choose a folder for this recipe."
      collections={collections}
      onSelectCollection={async (collectionId) => {
        await api.recipes.assignCollection(recipeId, collectionId);
        const updated = await api.recipes.get(recipeId);
        setRecipe(updated);
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { paddingBottom: 40 },
  heroWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    marginBottom: 14,
    backgroundColor: "#e5e7eb",
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageHidden: {
    opacity: 0,
  },
  body: {
    paddingHorizontal: 24,
  },
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
  servingsControl: {
    marginTop: 20,
  },
  servingsLabel: {
    fontSize: 16, fontWeight: "600", color: "#374151", marginBottom: 8,
  },
  servingsRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  servingsStepBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#e5e7eb", alignItems: "center", justifyContent: "center",
  },
  servingsStepText: {
    fontSize: 20, fontWeight: "600", color: "#374151", lineHeight: 22,
  },
  servingsInput: {
    borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, fontSize: 16,
    width: 60, textAlign: "center",
  },
  servingsResetText: {
    fontSize: 14, color: "#2563eb", fontWeight: "500",
  },
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
