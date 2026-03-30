import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, FolderMinus, FolderOpen, Trash2, X } from "lucide-react-native";
import { api } from "../services/api";
import { useCollectionsStore } from "../stores/collections.store";
import { useRecipesStore } from "../stores/recipes.store";
import { RecipeCard } from "../components/RecipeCard";
import { CollectionPickerSheet } from "../components/CollectionPickerSheet";
import {
  RecipeQuickActionsSheet,
  RecipeDeleteConfirmSheet,
  type RecipeQuickAction,
} from "../components/RecipeQuickActionsSheet";
import type { Recipe } from "@recipejar/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Collection">;

const SCREEN_WIDTH = Dimensions.get("window").width;
const HORIZONTAL_PADDING = 24;
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

export function CollectionScreen({ route, navigation }: Props) {
  const { collectionId, collectionName, isAllRecipes } = route.params;
  const insets = useSafeAreaInsets();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [collectionPickerTarget, setCollectionPickerTarget] =
    useState<Recipe | null>(null);
  const [recipeQuickActions, setRecipeQuickActions] = useState<{
    recipe: Recipe;
    actions: RecipeQuickAction[];
  } | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] =
    useState<Recipe | null>(null);
  const { collections } = useCollectionsStore();
  const deleteRecipe = useRecipesStore((s) => s.deleteRecipe);

  const fetchData = () => {
    const fetcher = isAllRecipes
      ? api.recipes.list()
      : api.collections.getRecipes(collectionId);
    return fetcher.then(setRecipes);
  };

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [collectionId, isAllRecipes]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      fetchData();
    });
    return unsubscribe;
  }, [navigation, collectionId, isAllRecipes]);

  const isSearching = searchQuery.length > 0;

  const filteredRecipes = useMemo(() => {
    if (!isSearching) return recipes;
    const q = searchQuery.toLowerCase();
    return recipes.filter((r) => r.title.toLowerCase().includes(q));
  }, [recipes, searchQuery, isSearching]);

  const handleLongPressNormal = (item: Recipe) => {
    setRecipeQuickActions({
      recipe: item,
      actions: [
        {
          key: "remove-from-collection",
          label: `Remove from ${collectionName}`,
          icon: <FolderMinus size={22} color="#6b7280" />,
          onPress: async () => {
            setRecipeQuickActions(null);
            try {
              await api.recipes.assignCollection(item.id, null);
              fetchData();
            } catch {
              Alert.alert(
                "Error",
                "Failed to remove from collection. Please try again.",
              );
            }
          },
          testID: "recipe-quick-action-remove-from-collection",
        },
        {
          key: "delete",
          label: "Delete recipe",
          destructive: true,
          icon: <Trash2 size={22} color="#dc2626" />,
          onPress: () => {
            setRecipeQuickActions(null);
            setDeleteConfirmTarget(item);
          },
          testID: "recipe-quick-action-delete",
        },
      ],
    });
  };

  const handleLongPressAllRecipes = (item: Recipe) => {
    const actions: RecipeQuickAction[] = [];
    if (collections.length > 0) {
      actions.push({
        key: "add-collection",
        label: "Add to collection",
        icon: <FolderOpen size={22} color="#2563eb" />,
        onPress: () => {
          setRecipeQuickActions(null);
          setCollectionPickerTarget(item);
        },
        testID: "recipe-quick-action-add-collection",
      });
    }
    actions.push({
      key: "delete",
      label: "Delete recipe",
      destructive: true,
      icon: <Trash2 size={22} color="#dc2626" />,
      onPress: () => {
        setRecipeQuickActions(null);
        setDeleteConfirmTarget(item);
      },
      testID: "recipe-quick-action-delete",
    });
    setRecipeQuickActions({ recipe: item, actions });
  };

  const handleLongPress = isAllRecipes
    ? handleLongPressAllRecipes
    : handleLongPressNormal;

  const renderEmptyState = () => {
    if (loading) return null;
    if (isSearching && filteredRecipes.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            No recipes matching &ldquo;{searchQuery}&rdquo;
          </Text>
        </View>
      );
    }
    if (!isSearching && recipes.length === 0) {
      if (isAllRecipes) {
        return (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No recipes yet</Text>
            <Text style={styles.emptySubtitle}>
              Import your first recipe to get started.
            </Text>
          </View>
        );
      }
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No recipes in this collection</Text>
          <Text style={styles.emptySubtitle}>
            Long-press a recipe card on the home screen to assign it here.
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.container} testID="collection-screen">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          testID="collection-back"
          accessibilityRole="button"
          accessibilityLabel="collection-back"
        >
          <View style={styles.backRow}>
            <ChevronLeft size={20} color="#2563eb" />
            <Text style={styles.backText}>Back</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.title} testID="collection-title">
          {collectionName}
        </Text>
        <Text style={styles.subtitle}>
          {recipes.length} recipe{recipes.length !== 1 ? "s" : ""}
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={
            isAllRecipes
              ? "Search all recipes..."
              : `Search in ${collectionName}...`
          }
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          testID="collection-search-input"
        />
        {isSearching && (
          <TouchableOpacity
            style={styles.searchClear}
            onPress={() => setSearchQuery("")}
            testID="collection-search-clear"
          >
            <X size={18} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {loading && (
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color="#2563eb"
        />
      )}

      {renderEmptyState()}

      <FlatList
        testID="collection-recipe-list"
        data={filteredRecipes}
        numColumns={2}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.columnWrapper}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            width={CARD_WIDTH}
            testID={`recipe-card-${item.id}`}
            onPress={() =>
              navigation.navigate("RecipeDetail", { recipeId: item.id })
            }
            onLongPress={() => handleLongPress(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
      />

      <RecipeQuickActionsSheet
        visible={recipeQuickActions !== null}
        onClose={() => setRecipeQuickActions(null)}
        recipeTitle={recipeQuickActions?.recipe.title ?? ""}
        actions={recipeQuickActions?.actions ?? []}
      />

      <RecipeDeleteConfirmSheet
        visible={deleteConfirmTarget !== null}
        onClose={() => setDeleteConfirmTarget(null)}
        recipeTitle={deleteConfirmTarget?.title ?? ""}
        onConfirm={async () => {
          const item = deleteConfirmTarget;
          if (!item) return;
          try {
            await deleteRecipe(item.id);
            setDeleteConfirmTarget(null);
            fetchData();
          } catch {
            Alert.alert(
              "Error",
              "Could not delete recipe. Please try again.",
            );
          }
        }}
      />

      <CollectionPickerSheet
        visible={collectionPickerTarget !== null}
        onClose={() => setCollectionPickerTarget(null)}
        title={
          (collectionPickerTarget?.collections?.length ?? 0) > 0
            ? "Move or remove"
            : "Add to collection"
        }
        recipeTitle={collectionPickerTarget?.title}
        subtitle="Choose a folder for this recipe."
        collections={collections}
        showRemoveOption={
          (collectionPickerTarget?.collections?.length ?? 0) > 0
        }
        onSelectCollection={async (collectionId) => {
          const item = collectionPickerTarget;
          if (!item) return;
          await api.recipes.assignCollection(item.id, collectionId);
          fetchData();
        }}
        onRemove={async () => {
          const item = collectionPickerTarget;
          if (!item) return;
          await api.recipes.assignCollection(item.id, null);
          fetchData();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: { paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 12 },
  backRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  backText: { fontSize: 16, color: "#2563eb" },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  searchContainer: {
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: 12,
    position: "relative",
  },
  searchInput: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  searchClear: {
    position: "absolute",
    right: HORIZONTAL_PADDING + 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  loader: { marginTop: 40 },
  empty: {
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 40,
  },
  columnWrapper: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
});
