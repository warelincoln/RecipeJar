import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { api } from "../services/api";
import type { Recipe } from "@recipejar/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Collection">;

const SCREEN_WIDTH = Dimensions.get("window").width;
const HORIZONTAL_PADDING = 24;
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

export function CollectionScreen({ route, navigation }: Props) {
  const { collectionId, collectionName } = route.params;
  const insets = useSafeAreaInsets();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.collections
      .getRecipes(collectionId)
      .then(setRecipes)
      .finally(() => setLoading(false));
  }, [collectionId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      api.collections.getRecipes(collectionId).then(setRecipes);
    });
    return unsubscribe;
  }, [navigation, collectionId]);

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

      {loading && (
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color="#2563eb"
        />
      )}

      {!loading && recipes.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No recipes in this collection</Text>
          <Text style={styles.emptySubtitle}>
            Long-press a recipe card on the home screen to assign it here.
          </Text>
        </View>
      )}

      <FlatList
        testID="collection-recipe-list"
        data={recipes}
        numColumns={2}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.recipeCard}
            testID={`recipe-card-${item.id}`}
            accessibilityRole="button"
            onPress={() =>
              navigation.navigate("RecipeDetail", { recipeId: item.id })
            }
          >
            <Text style={styles.recipeTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: { paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 16 },
  backRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  backText: { fontSize: 16, color: "#2563eb" },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 2 },
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
});
