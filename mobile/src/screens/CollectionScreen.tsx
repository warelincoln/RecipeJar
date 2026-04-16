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
import {
  ChevronLeft,
  FolderMinus,
  FolderOpen,
  Trash2,
  X,
  MoreHorizontal,
  Pencil,
} from "lucide-react-native";
import { api, ApiError } from "../services/api";
import { useCollectionsStore } from "../stores/collections.store";
import { useRecipesStore } from "../stores/recipes.store";
import { RecipeCard } from "../components/RecipeCard";
import { CollectionPickerSheet } from "../components/CollectionPickerSheet";
import { CreateCollectionSheet } from "../components/CreateCollectionSheet";
import { BulkActionsBar } from "../components/BulkActionsBar";
import { useBulkSelection } from "../hooks/useBulkSelection";
import {
  RecipeQuickActionsSheet,
  RecipeDeleteConfirmSheet,
  DeleteCollectionConfirmSheet,
  type RecipeQuickAction,
} from "../components/RecipeQuickActionsSheet";
import type { Recipe } from "@orzo/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { LUCIDE } from "../theme/lucideSizes";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  ERROR,
  SURFACE,
  WHITE,
  BLACK,
} from "../theme/colors";

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
  const [folderMenuVisible, setFolderMenuVisible] = useState(false);
  const [renameFolderVisible, setRenameFolderVisible] = useState(false);
  const [deleteFolderVisible, setDeleteFolderVisible] = useState(false);
  const bulk = useBulkSelection();
  const [bulkDeleteConfirmVisible, setBulkDeleteConfirmVisible] =
    useState(false);
  const [bulkCollectionPickerVisible, setBulkCollectionPickerVisible] =
    useState(false);
  const [bulkNewFolderSheetVisible, setBulkNewFolderSheetVisible] =
    useState(false);

  const {
    collections,
    fetchCollections,
    updateCollection,
    deleteCollection,
  } = useCollectionsStore();
  const deleteRecipe = useRecipesStore((s) => s.deleteRecipe);

  const fetchData = () => {
    const fetcher = isAllRecipes
      ? api.recipes.list()
      : api.collections.getRecipes(collectionId);
    return fetcher
      .then(setRecipes)
      .catch((err: unknown) => {
        if (!isAllRecipes && err instanceof ApiError && err.status === 404) {
          Alert.alert("Folder removed", "This folder no longer exists.", [
            { text: "OK", onPress: () => navigation.goBack() },
          ]);
          return;
        }
        Alert.alert("Error", "Could not load recipes.");
        setRecipes([]);
      });
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
          icon: <FolderMinus size={LUCIDE.row} color={TEXT_SECONDARY} />,
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
          icon: <Trash2 size={LUCIDE.row} color={ERROR} />,
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
        icon: <FolderOpen size={LUCIDE.row} color={PRIMARY} />,
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
      icon: <Trash2 size={LUCIDE.row} color={ERROR} />,
      onPress: () => {
        setRecipeQuickActions(null);
        setDeleteConfirmTarget(item);
      },
      testID: "recipe-quick-action-delete",
    });
    setRecipeQuickActions({ recipe: item, actions });
  };

  // Long-press on a recipe card now enters bulk-select mode (iOS Photos
  // style). The single-recipe RecipeQuickActionsSheet handlers above are
  // preserved but no longer triggered by long-press — they remain in the
  // file in case any future flow needs to re-enable them.
  const handleLongPress = (item: Recipe) => {
    bulk.enterBulk(item.id);
  };
  // Silence TS "defined but never used" warnings for now-unused handlers.
  void handleLongPressNormal;
  void handleLongPressAllRecipes;

  const allFilteredSelected =
    bulk.bulkMode &&
    filteredRecipes.length > 0 &&
    filteredRecipes.every((r) => bulk.isSelected(r.id));

  const handleSelectAllToggle = () => {
    if (allFilteredSelected) {
      bulk.clear();
    } else {
      bulk.selectAll(filteredRecipes.map((r) => r.id));
    }
  };

  const handleBulkDelete = () => {
    if (bulk.selectedCount === 0) return;
    setBulkDeleteConfirmVisible(true);
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(bulk.selectedIds);
    try {
      await api.recipes.bulkDelete(ids);
      setBulkDeleteConfirmVisible(false);
      bulk.exit();
      fetchData();
    } catch (err) {
      setBulkDeleteConfirmVisible(false);
      Alert.alert(
        "Delete failed",
        err instanceof Error ? err.message : "Could not delete recipes",
      );
    }
  };

  // On Home + All Recipes, the bar's primary action is "Add to collection"
  // (open picker). Inside a specific collection, it's "Remove from folder"
  // (bulk null-assign). Each handler wraps the appropriate bulk endpoint.
  const handleBulkPrimary = () => {
    if (bulk.selectedCount === 0) return;
    if (isAllRecipes) {
      // Zero-collection path is handled by the picker's "+ New folder" row,
      // so we open unconditionally now.
      setBulkCollectionPickerVisible(true);
    } else {
      void handleBulkRemoveFromCollection();
    }
  };

  const handleBulkRemoveFromCollection = async () => {
    const ids = Array.from(bulk.selectedIds);
    try {
      await api.recipes.bulkAssignCollection(ids, null);
      bulk.exit();
      fetchData();
    } catch (err) {
      Alert.alert(
        "Could not remove",
        err instanceof Error ? err.message : "Please try again.",
      );
    }
  };

  const handleBulkCollectionChosen = async (chosenId: string) => {
    const ids = Array.from(bulk.selectedIds);
    try {
      await api.recipes.bulkAssignCollection(ids, chosenId);
      setBulkCollectionPickerVisible(false);
      bulk.exit();
      fetchData();
    } catch (err) {
      setBulkCollectionPickerVisible(false);
      Alert.alert(
        "Move failed",
        err instanceof Error ? err.message : "Could not move recipes",
      );
    }
  };

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
      {bulk.bulkMode ? (
        <View
          style={[styles.bulkHeader, { paddingTop: insets.top + 12 }]}
          testID="collection-bulk-header"
        >
          <TouchableOpacity
            onPress={bulk.exit}
            style={styles.bulkHeaderSide}
            testID="collection-bulk-cancel"
            accessibilityRole="button"
            accessibilityLabel="collection-bulk-cancel"
          >
            <Text style={styles.bulkHeaderCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.bulkHeaderCount} testID="collection-bulk-count">
            {bulk.selectedCount === 0
              ? "Select recipes"
              : bulk.selectedCount === 1
                ? "1 selected"
                : `${bulk.selectedCount} selected`}
          </Text>
          <TouchableOpacity
            onPress={handleSelectAllToggle}
            style={styles.bulkHeaderSide}
            testID="collection-bulk-select-all"
            accessibilityRole="button"
            accessibilityLabel="collection-bulk-select-all"
          >
            <Text style={styles.bulkHeaderSelectAll}>
              {allFilteredSelected ? "Deselect All" : "Select All"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              testID="collection-back"
              accessibilityRole="button"
              accessibilityLabel="collection-back"
            >
              <View style={styles.backRow}>
                <ChevronLeft size={LUCIDE.nav} color={PRIMARY} />
                <Text style={styles.backText}>Back</Text>
              </View>
            </TouchableOpacity>
            {!isAllRecipes ? (
              <TouchableOpacity
                onPress={() => setFolderMenuVisible(true)}
                hitSlop={14}
                testID="collection-folder-menu"
                accessibilityRole="button"
                accessibilityLabel="Folder options"
              >
                <MoreHorizontal size={LUCIDE.lg} color={TEXT_SECONDARY} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerMenuSpacer} />
            )}
          </View>
          <Text style={styles.title} testID="collection-title">
            {collectionName}
          </Text>
          <Text style={styles.subtitle}>
            {recipes.length} recipe{recipes.length !== 1 ? "s" : ""}
          </Text>
        </View>
      )}

      {!bulk.bulkMode && (
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={
            isAllRecipes
              ? "Search all recipes..."
              : `Search in ${collectionName}...`
          }
          placeholderTextColor={TEXT_SECONDARY}
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
            <X size={LUCIDE.md} color={TEXT_SECONDARY} />
          </TouchableOpacity>
        )}
      </View>
      )}

      {loading && (
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color={PRIMARY}
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
            bulkMode={bulk.bulkMode}
            selected={bulk.isSelected(item.id)}
            onPress={() =>
              bulk.bulkMode
                ? bulk.toggle(item.id)
                : navigation.navigate("RecipeDetail", { recipeId: item.id })
            }
            onLongPress={
              bulk.bulkMode ? undefined : () => handleLongPress(item)
            }
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          bulk.bulkMode && { paddingBottom: 96 + insets.bottom },
        ]}
      />

      <BulkActionsBar
        visible={bulk.bulkMode}
        count={bulk.selectedCount}
        primaryAction={isAllRecipes ? "add-to-collection" : "remove-from-collection"}
        onPrimary={handleBulkPrimary}
        onDelete={handleBulkDelete}
      />

      <RecipeDeleteConfirmSheet
        visible={bulkDeleteConfirmVisible}
        onClose={() => setBulkDeleteConfirmVisible(false)}
        recipeTitle={
          bulk.selectedCount === 1
            ? recipes.find((r) => bulk.isSelected(r.id))?.title ?? ""
            : ""
        }
        count={bulk.selectedCount}
        onConfirm={handleBulkDeleteConfirm}
      />

      <CollectionPickerSheet
        visible={bulkCollectionPickerVisible}
        onClose={() => setBulkCollectionPickerVisible(false)}
        title={
          bulk.selectedCount === 1
            ? "Add to collection"
            : `Add ${bulk.selectedCount} recipes to collection`
        }
        subtitle={
          collections.length === 0
            ? "Start a new folder to organize your recipes."
            : "Choose a folder."
        }
        collections={collections}
        onSelectCollection={handleBulkCollectionChosen}
        onCreateNewCollection={() => {
          setBulkNewFolderSheetVisible(true);
        }}
      />

      <CreateCollectionSheet
        visible={bulkNewFolderSheetVisible}
        mode="create"
        onClose={() => setBulkNewFolderSheetVisible(false)}
        onSubmit={async (name) => {
          const ids = Array.from(bulk.selectedIds);
          try {
            const { createCollection } =
              useCollectionsStore.getState();
            const newCollection = await createCollection(name);
            await api.recipes.bulkAssignCollection(ids, newCollection.id);
            setBulkNewFolderSheetVisible(false);
            bulk.exit();
            fetchData();
          } catch (err) {
            setBulkNewFolderSheetVisible(false);
            Alert.alert(
              "Couldn't create folder",
              err instanceof Error ? err.message : "Please try again.",
            );
          }
        }}
      />

      <RecipeQuickActionsSheet
        visible={folderMenuVisible && !isAllRecipes}
        onClose={() => setFolderMenuVisible(false)}
        title="Folder"
        emphasisLabel={collectionName}
        subtitle="Rename or delete this collection."
        actions={[
          {
            key: "rename-folder",
            label: "Rename folder",
            icon: <Pencil size={LUCIDE.row} color={PRIMARY} />,
            onPress: () => {
              setFolderMenuVisible(false);
              setRenameFolderVisible(true);
            },
            testID: "collection-folder-rename",
          },
          {
            key: "delete-folder",
            label: "Delete folder",
            destructive: true,
            icon: <Trash2 size={LUCIDE.row} color={ERROR} />,
            onPress: () => {
              setFolderMenuVisible(false);
              setDeleteFolderVisible(true);
            },
            testID: "collection-folder-delete",
          },
        ]}
      />

      <CreateCollectionSheet
        visible={renameFolderVisible && !isAllRecipes}
        mode="rename"
        initialName={collectionName}
        onClose={() => setRenameFolderVisible(false)}
        onSubmit={async (name) => {
          await updateCollection(collectionId, name);
          navigation.setParams({ collectionName: name });
          await fetchCollections();
        }}
      />

      <DeleteCollectionConfirmSheet
        visible={deleteFolderVisible && !isAllRecipes}
        onClose={() => setDeleteFolderVisible(false)}
        collectionName={collectionName}
        recipeCount={recipes.length}
        onConfirm={async () => {
          try {
            await deleteCollection(collectionId);
            setDeleteFolderVisible(false);
            navigation.goBack();
          } catch {
            Alert.alert(
              "Could not delete folder",
              "Please try again.",
            );
          }
        }}
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
        onSelectCollection={async (targetCollectionId) => {
          const item = collectionPickerTarget;
          if (!item) return;
          try {
            await api.recipes.assignCollection(item.id, targetCollectionId);
            fetchData();
          } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
              await fetchCollections();
              Alert.alert(
                "Folder unavailable",
                "That folder no longer exists. Try another.",
              );
              return;
            }
            Alert.alert("Error", "Could not update folder. Please try again.");
          }
        }}
        onRemove={async () => {
          const item = collectionPickerTarget;
          if (!item) return;
          try {
            await api.recipes.assignCollection(item.id, null);
            fetchData();
          } catch {
            Alert.alert("Error", "Could not remove from folder. Please try again.");
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE },
  header: { paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 12 },
  bulkHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 12,
  },
  bulkHeaderSide: { paddingVertical: 8, minWidth: 80 },
  bulkHeaderCancel: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    fontWeight: "500",
    textAlign: "left",
  },
  bulkHeaderSelectAll: {
    fontSize: 16,
    color: PRIMARY,
    fontWeight: "600",
    textAlign: "right",
  },
  bulkHeaderCount: {
    fontSize: 17,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
    flex: 1,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerMenuSpacer: { width: 24, height: 24 },
  backRow: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 16, color: PRIMARY },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 14, color: TEXT_SECONDARY, marginTop: 2 },
  searchContainer: {
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: 12,
    position: "relative",
  },
  searchInput: {
    backgroundColor: WHITE,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    letterSpacing: 0,
    color: TEXT_PRIMARY,
    shadowColor: BLACK,
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
    color: TEXT_SECONDARY,
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
