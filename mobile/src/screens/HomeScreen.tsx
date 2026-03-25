import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Alert,
  ActionSheetIOS,
  Dimensions,
  Platform,
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Amphora,
  Camera,
  Link,
  FolderOpen,
  BookOpen,
  X,
  Egg,
  EggFried,
  Coffee,
  Sandwich,
  UtensilsCrossed,
  IceCreamCone,
  CakeSlice,
  Cake,
  Wine,
  Martini,
  Soup,
  Salad,
  Fish,
  Drumstick,
  Wheat,
  Vegan,
  Heart,
  Cookie,
  Utensils,
  Pizza,
  Star,
  Gift,
  Timer,
  Flame,
  Cherry,
  Apple,
  Banana,
  Carrot,
  Beef,
  Milk,
  Croissant,
  Popcorn,
  Bean,
  Citrus,
  Grape,
  Ham,
  Hamburger,
  Lollipop,
  Nut,
  Popsicle,
  ChefHat,
  Beer,
  CupSoda,
  Donut,
  Candy,
  Sprout,
  Snowflake,
  Sun,
  Globe,
  Zap,
  PartyPopper,
  CookingPot,
  Sparkles,
  HandPlatter,
  GlassWater,
  LeafyGreen,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useRecipesStore } from "../stores/recipes.store";
import { useCollectionsStore } from "../stores/collections.store";
import { api } from "../services/api";
import { ToastQueue, type ToastQueueHandle } from "../components/ToastQueue";
import { CompactRecipeRating } from "../components/CompactRecipeRating";
import type { Recipe } from "@recipejar/shared";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import Clipboard from "@react-native-clipboard/clipboard";
import { ClipboardRecipePrompt } from "../components/ClipboardRecipePrompt";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

// Module-level so it survives Home screen unmount/remount during navigation.
// Reset only when the app returns from genuine background (user switched apps
// and may have copied a new URL), NOT from inactive (iOS system dialogs).
let clipboardPasteUsedThisSession = false;

const SCREEN_WIDTH = Dimensions.get("window").width;
const HORIZONTAL_PADDING = 24;
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

interface CollectionItem {
  id: string;
  name: string;
  isVirtual?: boolean;
}

const ICON_RULES: [string[], LucideIcon, string][] = [
  [["breakfast", "morning", "brunch"], Egg, "#f59e0b"],
  [["lunch"], Sandwich, "#16a34a"],
  [["dinner", "supper", "entree"], UtensilsCrossed, "#dc2626"],
  [["dessert", "sweet"], IceCreamCone, "#ec4899"],
  [["appetizer", "starter", "tapas"], HandPlatter, "#8b5cf6"],
  [["soup", "stew", "chili", "chowder"], Soup, "#ea580c"],
  [["salad"], Salad, "#22c55e"],
  [["pasta", "noodle"], Wheat, "#ca8a04"],
  [["pizza"], Pizza, "#dc2626"],
  [["burger", "hamburger"], Hamburger, "#d97706"],
  [["sandwich", "wrap"], Sandwich, "#16a34a"],
  [["curry"], CookingPot, "#f97316"],
  [["casserole"], CookingPot, "#92400e"],
  [["stir fry", "stirfry", "wok"], Flame, "#f97316"],
  [["cake", "cupcake"], CakeSlice, "#a855f7"],
  [["bread", "loaf"], Croissant, "#92400e"],
  [["cookie", "biscuit"], Cookie, "#d97706"],
  [["pie", "tart", "pastry"], Cake, "#a855f7"],
  [["donut", "doughnut"], Donut, "#ec4899"],
  [["candy", "chocolate", "fudge"], Candy, "#ec4899"],
  [["lollipop"], Lollipop, "#f472b6"],
  [["popsicle", "ice pop"], Popsicle, "#06b6d4"],
  [["chicken", "poultry", "turkey"], Drumstick, "#d97706"],
  [["beef", "steak", "meat"], Beef, "#b91c1c"],
  [["pork", "ham", "bacon"], Ham, "#f97316"],
  [["fish", "seafood", "shrimp", "salmon", "tuna", "sushi"], Fish, "#0ea5e9"],
  [["egg", "omelette", "frittata"], EggFried, "#eab308"],
  [["bean", "lentil", "legume", "chickpea"], Bean, "#92400e"],
  [["nut", "almond", "walnut", "pecan"], Nut, "#a16207"],
  [["fruit", "berry"], Cherry, "#e11d48"],
  [["apple"], Apple, "#16a34a"],
  [["banana"], Banana, "#eab308"],
  [["grape"], Grape, "#7c3aed"],
  [["citrus", "lemon", "lime", "orange"], Citrus, "#f59e0b"],
  [["carrot", "vegetable", "veggie"], Carrot, "#f97316"],
  [["coffee", "espresso", "latte"], Coffee, "#78350f"],
  [["tea", "matcha", "chai"], GlassWater, "#059669"],
  [["smoothie", "juice", "shake"], CupSoda, "#06b6d4"],
  [["cocktail", "margarita", "mojito"], Martini, "#6366f1"],
  [["wine"], Wine, "#7c3aed"],
  [["beer", "ale", "brew"], Beer, "#d97706"],
  [["drink", "beverage"], GlassWater, "#3b82f6"],
  [["milk", "dairy"], Milk, "#78350f"],
  [["popcorn", "movie night"], Popcorn, "#eab308"],
  [["vegan", "plant based", "plant-based"], Sprout, "#22c55e"],
  [["vegetarian"], Vegan, "#16a34a"],
  [["gluten free", "gluten-free"], Wheat, "#a16207"],
  [["healthy", "clean", "light", "low cal"], Heart, "#ef4444"],
  [["keto", "low carb", "low-carb"], Zap, "#f59e0b"],
  [["italian", "mediterranean"], Pizza, "#dc2626"],
  [["mexican", "tex-mex", "taco", "burrito"], Flame, "#ea580c"],
  [["asian", "chinese", "japanese", "korean", "thai", "vietnamese"], Utensils, "#e11d48"],
  [["indian"], Flame, "#f97316"],
  [["french"], Croissant, "#3b82f6"],
  [["greek"], Salad, "#0ea5e9"],
  [["bbq", "barbecue", "grill"], Flame, "#f97316"],
  [["bake", "baking"], CakeSlice, "#a855f7"],
  [["slow cook", "crockpot", "instant pot", "pressure cook"], CookingPot, "#92400e"],
  [["quick", "fast", "easy", "weeknight", "under 30"], Timer, "#3b82f6"],
  [["meal prep", "batch", "freezer"], Snowflake, "#0ea5e9"],
  [["holiday", "christmas", "thanksgiving", "easter", "halloween"], Gift, "#059669"],
  [["party", "potluck", "entertaining"], PartyPopper, "#ec4899"],
  [["summer", "spring"], Sun, "#f59e0b"],
  [["winter", "fall", "autumn", "comfort"], Snowflake, "#64748b"],
  [["favorite", "best", "top"], Star, "#eab308"],
  [["family", "kid", "children"], Heart, "#ec4899"],
  [["date night", "romantic"], Sparkles, "#ec4899"],
  [["world", "international", "global"], Globe, "#3b82f6"],
  [["chef", "special", "gourmet"], ChefHat, "#1e293b"],
  [["try", "new", "experiment"], Sparkles, "#8b5cf6"],
  [["snack"], Cookie, "#d97706"],
  [["side", "sides"], LeafyGreen, "#22c55e"],
];

function getCollectionIcon(name: string): { Icon: LucideIcon; color: string } {
  const lower = name.toLowerCase();
  for (const [keywords, Icon, color] of ICON_RULES) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return { Icon, color };
    }
  }
  return { Icon: FolderOpen, color: "#b8860b" };
}

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { recipes, loading, error, fetchRecipes } = useRecipesStore();
  const { collections, fetchCollections, createCollection } =
    useCollectionsStore();
  const [jarOpen, setJarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [clipboardPromptVisible, setClipboardPromptVisible] = useState(false);
  const suppressClipboardPromptRef = useRef(false);
  const fanAnim = useRef(new Animated.Value(0)).current;
  const toastRef = useRef<ToastQueueHandle>(null);

  useEffect(() => {
    let prev = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      // Only reset when returning from genuine background (user switched apps
      // and may have copied something new). "inactive" fires for iOS system
      // dialogs (paste permission, etc.) and must NOT reset the flag.
      if (prev === "background" && next === "active") {
        suppressClipboardPromptRef.current = false;
        clipboardPasteUsedThisSession = false;
      }
      prev = next;
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const timer = setTimeout(async () => {
        if (
          cancelled ||
          suppressClipboardPromptRef.current ||
          clipboardPasteUsedThisSession
        )
          return;
        try {
          const has = await Clipboard.hasString();
          if (!cancelled && has) {
            setClipboardPromptVisible(true);
          }
        } catch {
          /* ignore */
        }
      }, 600);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        setClipboardPromptVisible(false);
      };
    }, []),
  );

  const closeClipboardPrompt = useCallback(() => {
    suppressClipboardPromptRef.current = true;
    clipboardPasteUsedThisSession = true;
    setClipboardPromptVisible(false);
  }, []);

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

  const collectionsWithAll = useMemo<CollectionItem[]>(
    () => [
      { id: "__all__", name: "All Recipes", isVirtual: true },
      ...collections,
    ],
    [collections],
  );

  const isSearching = searchQuery.length > 0;

  const filteredRecipes = useMemo(() => {
    if (isSearching) {
      const q = searchQuery.toLowerCase();
      return recipes.filter((r) => r.title.toLowerCase().includes(q));
    }
    return recipes.filter((r) => (r.collections?.length ?? 0) === 0);
  }, [recipes, searchQuery, isSearching]);

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

  const handleLongPressRecipe = (item: Recipe) => {
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
          fetchRecipes();
          return;
        }

        const selectedCollection = collections[buttonIndex];
        await api.recipes.assignCollection(item.id, selectedCollection.id);
        fetchRecipes();

        toastRef.current?.addToast({
          message: `Added to ${selectedCollection.name}`,
          onUndo: async () => {
            await api.recipes.assignCollection(item.id, null);
            fetchRecipes();
          },
        });
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

  const renderEmptyState = () => {
    if (loading && recipes.length === 0) return null;
    if (isSearching && filteredRecipes.length === 0) {
      return (
        <View style={styles.empty} testID="home-empty-search">
          <Text style={styles.emptyTitle}>
            No recipes matching &ldquo;{searchQuery}&rdquo;
          </Text>
        </View>
      );
    }
    if (recipes.length === 0) {
      return (
        <View style={styles.empty} testID="home-empty-state">
          <Text style={styles.emptyTitle}>No recipes yet</Text>
          <Text style={styles.emptySubtitle}>
            Capture a cookbook page or paste a URL to get started.
          </Text>
        </View>
      );
    }
    if (!isSearching && filteredRecipes.length === 0) {
      return (
        <View style={styles.empty} testID="home-empty-organized">
          <Text style={styles.emptyTitle}>All recipes organized</Text>
          <Text style={styles.emptySubtitle}>
            Search or browse a collection to find a recipe.
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={styles.container} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title} testID="home-title">
          RecipeJar
        </Text>
        <Text style={styles.subtitle} testID="home-subtitle">
          Your recipe collection
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          testID="home-search-input"
        />
        {isSearching && (
          <TouchableOpacity
            style={styles.searchClear}
            onPress={() => setSearchQuery("")}
            testID="home-search-clear"
          >
            <X size={18} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        testID="home-collections-row"
        horizontal
        showsHorizontalScrollIndicator={false}
        data={collectionsWithAll}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
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
                isAllRecipes: !!(item as CollectionItem).isVirtual,
              })
            }
          >
            {(item as CollectionItem).isVirtual ? (
              <BookOpen size={22} color="#2563eb" />
            ) : (
              (() => {
                const { Icon, color } = getCollectionIcon(item.name);
                return <Icon size={22} color={color} />;
              })()
            )}
            <Text style={styles.collectionName} numberOfLines={2}>
              {item.name.charAt(0).toUpperCase() + item.name.slice(1)}
            </Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.collectionsContent}
        style={styles.collectionsList}
      />

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

      {renderEmptyState()}

      <FlatList
        testID="home-recipe-list"
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
            accessibilityLabel={`recipe-${item.title}`}
            onPress={() =>
              navigation.navigate("RecipeDetail", { recipeId: item.id })
            }
            onLongPress={() => handleLongPressRecipe(item)}
          >
            <Text style={styles.recipeTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {isSearching && (item.collections?.length ?? 0) > 0 && (
              <View style={styles.collectionTag}>
                <Text style={styles.collectionTagText} numberOfLines={1}>
                  {item.collections[0].name}
                </Text>
              </View>
            )}
            <CompactRecipeRating rating={item.rating} />
            {item.isUserVerified && (
              <Text style={styles.verifiedBadge}>Verified</Text>
            )}
          </TouchableOpacity>
        )}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

      {jarOpen && (
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={toggleJar}
          testID="jar-backdrop"
        />
      )}

      {[
        {
          icon: <Camera size={24} color="#fff" />,
          label: "Camera",
          angle: -140,
          testID: "jar-fan-camera",
          onPress: () => {
            toggleJar();
            navigation.navigate("ImportFlow", { mode: "image" });
          },
        },
        {
          icon: <Link size={24} color="#fff" />,
          label: "URL",
          angle: -90,
          testID: "jar-fan-url",
          onPress: () => {
            toggleJar();
            navigation.navigate("WebRecipeImport", {});
          },
        },
        {
          icon: <FolderOpen size={24} color="#fff" />,
          label: "Add Folder",
          angle: -40,
          testID: "jar-fan-collection",
          onPress: () => {
            toggleJar();
            handleCreateCollection();
          },
        },
      ].map((item) => {
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
                  {
                    translateX: fanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, tx],
                    }),
                  },
                  {
                    translateY: fanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, ty],
                    }),
                  },
                  {
                    scale: fanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 1],
                    }),
                  },
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
            <Animated.Text style={[styles.fanLabel, { opacity: fanAnim }]}>
              {item.label}
            </Animated.Text>
          </Animated.View>
        );
      })}

      <TouchableOpacity
        style={[styles.jarButton, { bottom: insets.bottom + 20 }]}
        testID="jar-button"
        accessibilityRole="button"
        accessibilityLabel="jar-button"
        onPress={toggleJar}
      >
        <Amphora size={56} color="#fff" />
      </TouchableOpacity>

      <ToastQueue ref={toastRef} />

      <ClipboardRecipePrompt
        visible={clipboardPromptVisible}
        onClose={closeClipboardPrompt}
        onPasteUrl={(url) =>
          navigation.navigate("WebRecipeImport", { initialUrl: url })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eff6ff" },
  header: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 12,
    alignItems: "center",
  },
  title: { fontSize: 30, fontWeight: "800", fontStyle: "italic" },
  subtitle: { fontSize: 14, marginTop: 2, color: "#888" },
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
  collectionsList: { flexGrow: 0 },
  collectionsContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    gap: 12,
    paddingBottom: 12,
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
