import React, { useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRecipesStore } from "../stores/recipes.store";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { recipes, loading, error, fetchRecipes } = useRecipesStore();

  useEffect(() => {
    fetchRecipes();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", fetchRecipes);
    return unsubscribe;
  }, [navigation, fetchRecipes]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>RecipeJar</Text>
        <Text style={styles.subtitle}>Your recipe collection</Text>
      </View>

      {loading && recipes.length === 0 && (
        <ActivityIndicator style={styles.loader} size="large" color="#2563eb" />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && recipes.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No recipes yet</Text>
          <Text style={styles.emptySubtitle}>
            Capture a cookbook page or paste a URL to get started.
          </Text>
        </View>
      )}

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.recipeCard}
            onPress={() =>
              navigation.navigate("RecipeDetail", { recipeId: item.id })
            }
          >
            <Text style={styles.recipeTitle}>{item.title}</Text>
            {item.isUserVerified && (
              <Text style={styles.verifiedBadge}>User Verified</Text>
            )}
          </TouchableOpacity>
        )}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

      <View style={styles.fab}>
        <TouchableOpacity
          style={styles.fabButton}
          onPress={() =>
            navigation.navigate("ImportFlow", { mode: "image" })
          }
        >
          <Text style={styles.fabIcon}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.fabButton, styles.fabSecondary]}
          onPress={() =>
            navigation.navigate("ImportFlow", { mode: "url" })
          }
        >
          <Text style={styles.fabIcon}>🔗</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16 },
  title: { fontSize: 28, fontWeight: "800" },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  loader: { marginTop: 40 },
  error: { color: "#dc2626", textAlign: "center", marginTop: 20 },
  empty: { alignItems: "center", marginTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "#6b7280", textAlign: "center", lineHeight: 20 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 100 },
  recipeCard: {
    backgroundColor: "#fff", borderRadius: 12,
    padding: 16, marginBottom: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  recipeTitle: { fontSize: 16, fontWeight: "600" },
  verifiedBadge: {
    fontSize: 11, color: "#ca8a04", fontWeight: "600", marginTop: 4,
  },
  fab: {
    position: "absolute", bottom: 32, right: 16,
    flexDirection: "column", gap: 12,
  },
  fabButton: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  fabSecondary: { backgroundColor: "#7c3aed" },
  fabIcon: { fontSize: 24 },
});
