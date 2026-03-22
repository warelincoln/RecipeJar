import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Alert,
  ActionSheetIOS,
  Dimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Amphora, Camera, Link, FolderOpen } from "lucide-react-native";
import { useRecipesStore } from "../stores/recipes.store";
import { useCollectionsStore } from "../stores/collections.store";
import { api } from "../services/api";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const SCREEN_WIDTH = Dimensions.get("window").width;
const HORIZONTAL_PADDING = 24;
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { recipes, loading, error, fetchRecipes } = useRecipesStore();
  const { collections, fetchCollections, createCollection } =
    useCollectionsStore();
  const [jarOpen, setJarOpen] = useState(false);
  const fanAnim = useRef(new Animated.Value(0)).current;

  const toggleJar = () => {
    const opening = !jarOpen;
    setJarOpen(opening);
    Animated.spring(fanAnim, {
      toValue: opening ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
      tension: 120,
    }).start();
  };

  useEffect(() => {
    fetchRecipes();
    fetchCollections();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      fetchRecipes();
      fetchCollections();
    });
    return unsubscribe;
  }, [navigation, fetchRecipes, fetchCollections]);

  const handleCreateCollection = () => {
    setJarOpen(false);
    Alert.prompt(
      "New Collection",
      "Enter a name for the collection",
      async (name) => {
        if (name && name.trim().length > 0) {
          await createCollection(name.trim());
        }
      },
    );
  };

  const handleLongPressRecipe = (recipeId: string) => {
    if (collections.length === 0) {
      Alert.alert("No Collections", "Create a collection first.");
      return;
    }

    const options = [
      ...collections.map((c) => c.name),
      "Remove from collection",
      "Cancel",
    ];
    const cancelIndex = options.length - 1;
    const removeIndex = options.length - 2;

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: cancelIndex,
          destructiveButtonIndex: removeIndex,
          title: "Assign to Collection",
        },
        async (buttonIndex) => {
          if (buttonIndex === cancelIndex) return;
          const collectionId =
            buttonIndex === removeIndex ? null : collections[buttonIndex].id;
          await api.recipes.assignCollection(recipeId, collectionId);
          fetchRecipes();
        },
      );
    } else {
      Alert.alert(
        "Assign to Collection",
        "Select a collection",
        [
          ...collections.map((c) => ({
            text: c.name,
            onPress: async () => {
              await api.recipes.assignCollection(recipeId, c.id);
              fetchRecipes();
            },
          })),
          {
            text: "Remove from collection",
            style: "destructive" as const,
            onPress: async () => {
              await api.recipes.assignCollection(recipeId, null);
              fetchRecipes();
            },
          },
          { text: "Cancel", style: "cancel" as const },
        ],
      );
    }
  };

  return (
    <View style={styles.container} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title} testID="home-title">
          RecipeJar
        </Text>
        <Text
          style={styles.subtitle}
          testID="home-subtitle"
        >
          Your recipe collection
        </Text>
      </View>

      {collections.length > 0 && (
        <FlatList
          testID="home-collections-row"
          horizontal
          showsHorizontalScrollIndicator={false}
          data={collections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.collectionCard}
              testID={`collection-card-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`collection-${item.name}`}
              onPress={() =>
                navigation.navigate("Collection", {
                  collectionId: item.id,
                  collectionName: item.name,
                })
              }
            >
              <FolderOpen size={22} color="#b8860b" />
              <Text style={styles.collectionName} numberOfLines={2}>
                {item.name.charAt(0).toUpperCase() + item.name.slice(1)}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.collectionsContent}
          style={styles.collectionsList}
        />
      )}

      {loading && recipes.length === 0 && (
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color="#2563eb"
          testID="home-loader"
        />
      )}

      {error && (
        <Text style={styles.error} testID="home-error">
          {error}
        </Text>
      )}

      {!loading && recipes.length === 0 && (
        <View style={styles.empty} testID="home-empty-state">
          <Text style={styles.emptyTitle}>No recipes yet</Text>
          <Text style={styles.emptySubtitle}>
            Capture a cookbook page or paste a URL to get started.
          </Text>
        </View>
      )}

      <FlatList
        testID="home-recipe-list"
        data={recipes}
        numColumns={2}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.recipeCard}
            testID={`recipe-card-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={`recipe-${item.title}`}
            onPress={() =>
              navigation.navigate("RecipeDetail", { recipeId: item.id })
            }
            onLongPress={() => handleLongPressRecipe(item.id)}
          >
            <Text style={styles.recipeTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {item.isUserVerified && (
              <Text style={styles.verifiedBadge}>Verified</Text>
            )}
          </TouchableOpacity>
        )}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

      {/* Backdrop when fan is open */}
      {jarOpen && (
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={toggleJar}
          testID="jar-backdrop"
        />
      )}

      {/* Fan action icons */}
      {[
        { icon: <Camera size={24} color="#fff" />, label: "Camera", angle: -140, testID: "jar-fan-camera", onPress: () => { toggleJar(); navigation.navigate("ImportFlow", { mode: "image" }); } },
        { icon: <Link size={24} color="#fff" />, label: "URL", angle: -90, testID: "jar-fan-url", onPress: () => { toggleJar(); navigation.navigate("ImportFlow", { mode: "url" }); } },
        { icon: <FolderOpen size={24} color="#fff" />, label: "Add Folder", angle: -40, testID: "jar-fan-collection", onPress: () => { toggleJar(); handleCreateCollection(); } },
      ].map((item, i) => {
        const rad = (item.angle * Math.PI) / 180;
        const radius = 110;
        const tx = Math.cos(rad) * radius;
        const ty = Math.sin(rad) * radius;
        return (
          <Animated.View
            key={item.testID}
            pointerEvents={jarOpen ? "auto" : "none"}
            style={[
              styles.fanItem,
              { bottom: insets.bottom + 50 },
              {
                opacity: fanAnim,
                transform: [
                  { translateX: fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, tx] }) },
                  { translateY: fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, ty] }) },
                  { scale: fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                ],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.fanButton}
              testID={item.testID}
              accessibilityRole="button"
              accessibilityLabel={item.testID}
              onPress={item.onPress}
            >
              {item.icon}
            </TouchableOpacity>
            <Animated.Text style={[styles.fanLabel, { opacity: fanAnim }]}>{item.label}</Animated.Text>
          </Animated.View>
        );
      })}

      {/* Jar button */}
      <TouchableOpacity
        style={[styles.jarButton, { bottom: insets.bottom + 20 }]}
        testID="jar-button"
        accessibilityRole="button"
        accessibilityLabel="jar-button"
        onPress={toggleJar}
      >
        <Amphora size={56} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eff6ff" },
  header: { paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 16, alignItems: "center" },
  title: { fontSize: 30, fontWeight: "800", fontStyle: "italic" },
  subtitle: { fontSize: 14, marginTop: 2, color: "#888" },
  collectionsList: { flexGrow: 0 },
  collectionsContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    gap: 12,
    paddingBottom: 12,
    justifyContent: "center",
    flexGrow: 1,
  },
  collectionCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  collectionName: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 6,
  },
  loader: { marginTop: 40 },
  error: { color: "#dc2626", textAlign: "center", marginTop: 20 },
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
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 100,
  },
  columnWrapper: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  recipeCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 10,
    width: CARD_WIDTH,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  recipeTitle: { fontSize: 13, fontWeight: "600", lineHeight: 18 },
  verifiedBadge: {
    fontSize: 10,
    color: "#16a34a",
    fontWeight: "600",
    marginTop: 4,
  },
  jarButton: {
    position: "absolute",
    alignSelf: "center",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  fanItem: {
    position: "absolute",
    alignSelf: "center",
    alignItems: "center",
  },
  fanButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  fanLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
    marginTop: 4,
  },
});
