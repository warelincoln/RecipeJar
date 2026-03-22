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
  ActionSheetIOS,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, X } from "lucide-react-native";
import { api } from "../services/api";
import { useCollectionsStore } from "../stores/collections.store";
import { CompactRecipeRating } from "../components/CompactRecipeRating";
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
  const { collections } = useCollectionsStore();

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
    const options = [`Remove from ${collectionName}`, "Cancel"];

    const handleSelection = async (buttonIndex: number) => {
      if (buttonIndex === 1) return;
      try {
        await api.recipes.assignCollection(item.id, null);
        fetchData();
      } catch {
        Alert.alert("Error", "Failed to remove from collection. Please try again.");
      }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 1,
          destructiveButtonIndex: 0,
          title: "Remove Recipe",
        },
        handleSelection,
      );
    } else {
      Alert.alert("Remove Recipe", `Remove from ${collectionName}?`, [
        {
          text: `Remove from ${collectionName}`,
          style: "destructive",
          onPress: () => handleSelection(0),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const handleLongPressAllRecipes = (item: Recipe) => {
    if (collections.length === 0) {
      Alert.alert("No Collections", "Create a collection first.");
      return;
    }

    const hasColl = (item.collections?.length ?? 0) > 0;
    const options = [
      ...collections.map((c) => c.name),
      ...(hasColl ? ["Remove from collection"] : []),
      "Cancel",
    ];
    const cancelIndex = options.length - 1;
    const removeIndex = hasColl ? options.length - 2 : -1;

    const handleSelection = async (buttonIndex: number) => {
      if (buttonIndex === cancelIndex) return;
      try {
        if (buttonIndex === removeIndex) {
          await api.recipes.assignCollection(item.id, null);
          fetchData();
          return;
        }
        const selected = collections[buttonIndex];
        await api.recipes.assignCollection(item.id, selected.id);
        fetchData();
      } catch {
        Alert.alert("Error", "Failed to update collection. Please try again.");
      }
    };

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: cancelIndex,
          destructiveButtonIndex: removeIndex >= 0 ? removeIndex : undefined,
          title: hasColl ? "Move or Remove" : "Assign to Collection",
        },
        handleSelection,
      );
    } else {
      Alert.alert(
        hasColl ? "Move or Remove" : "Assign to Collection",
        "Select a collection",
        [
          ...collections.map((c, i) => ({
            text: c.name,
            onPress: () => handleSelection(i),
          })),
          ...(hasColl
            ? [
                {
                  text: "Remove from collection",
                  style: "destructive" as const,
                  onPress: () => handleSelection(removeIndex),
                },
              ]
            : []),
          { text: "Cancel", style: "cancel" as const },
        ],
      );
    }
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
          <TouchableOpacity
            style={styles.recipeCard}
            testID={`recipe-card-${item.id}`}
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate("RecipeDetail", { recipeId: item.id })
            }
            onLongPress={() => handleLongPress(item)}
          >
            <Text style={styles.recipeTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {isAllRecipes && (item.collections?.length ?? 0) > 0 && (
              <View style={styles.collectionTag}>
                <Text style={styles.collectionTagText} numberOfLines={1}>
                  {item.collections[0].name}
                </Text>
              </View>
            )}
            <CompactRecipeRating rating={item.rating} />
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
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
  recipeCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    width: CARD_WIDTH,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  recipeTitle: { fontSize: 15, fontWeight: "600", lineHeight: 20 },
  collectionTag: {
    backgroundColor: "#e5e7eb",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  collectionTagText: {
    fontSize: 10,
    color: "#6b7280",
    fontWeight: "500",
  },
});
