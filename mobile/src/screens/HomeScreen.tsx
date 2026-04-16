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
  Dimensions,
  AppState,
  Linking,
  Image,
} from "react-native";
import { launchImageLibrary } from "react-native-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  Link,
  FolderOpen,
  BookOpen,
  ImageIcon,
  Plus,
  Minus,
  Trash2,
  X,
  Pencil,
  User,
} from "lucide-react-native";
import FastImage from "react-native-fast-image";
import { useAuthStore } from "../stores/auth.store";
import { useRecipesStore } from "../stores/recipes.store";
import { useCollectionsStore } from "../stores/collections.store";
import { useImportQueueStore } from "../stores/importQueue.store";
import { api, ApiError } from "../services/api";
import { ToastQueue, type ToastQueueHandle } from "../components/ToastQueue";
import { RecipeCard } from "../components/RecipeCard";
import type { Recipe } from "@orzo/shared";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import Clipboard from "@react-native-clipboard/clipboard";
import { ClipboardRecipePrompt } from "../components/ClipboardRecipePrompt";
import { CollectionPickerSheet } from "../components/CollectionPickerSheet";
import {
  RecipeQuickActionsSheet,
  RecipeDeleteConfirmSheet,
  DeleteCollectionConfirmSheet,
  type RecipeQuickAction,
} from "../components/RecipeQuickActionsSheet";
import { CreateCollectionSheet } from "../components/CreateCollectionSheet";
import { BulkActionsBar } from "../components/BulkActionsBar";
import { useBulkSelection } from "../hooks/useBulkSelection";
import { getCollectionIcon } from "../features/collections/collectionIconRules";
import { LUCIDE } from "../theme/lucideSizes";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  DIVIDER,
  ERROR,
  SURFACE,
  PRIMARY_LIGHT,
  WHITE,
  BLACK,
  GOLDEN_AMBER,
  SAGE_GREEN,
  MUTED_PLUM,
  DUSTY_ROSE,
} from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

// Module-level so it survives Home screen unmount/remount during navigation.
// Reset only when the app returns from genuine background (user switched apps
// and may have copied a new URL), NOT from inactive (iOS system dialogs).
let clipboardPasteUsedThisSession = false;

const SCREEN_WIDTH = Dimensions.get("window").width;
const HORIZONTAL_PADDING = 24;
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

/** Home import FAB — keep in sync with `styles.jarButton` and its `bottom` offset. */
const JAR_FAB_BOTTOM_OFFSET = 10;
const JAR_FAB_SIZE = 80;
const JAR_FAN_BUTTON_SIZE = 72;
const JAR_FAN_LABEL_GAP = 6;
const JAR_FAN_LABEL_LINE = 16;
const JAR_FAN_COLUMN_HEIGHT =
  JAR_FAN_BUTTON_SIZE + JAR_FAN_LABEL_GAP + JAR_FAN_LABEL_LINE;
/** Wide enough for "Add Folder"; keeps transform origin on the vertical centerline for every action. */
const JAR_FAN_SLOT_WIDTH = 128;
/** Arc radius from FAB center (px); larger = more space between fan actions. */
const JAR_FAN_RADIUS = 118;
/** Even 40° steps, symmetric about -90° (straight up in math coords → translateX balances). */
const JAR_FAN_ANGLES = [-150, -110, -70, -30] as const;

interface CollectionItem {
  id: string;
  name: string;
  isVirtual?: boolean;
}

function ProfileAvatar() {
  const user = useAuthStore((s) => s.user);
  const avatarUrl = user?.user_metadata?.avatar_url;
  const displayName = user?.user_metadata?.display_name || user?.user_metadata?.full_name;
  const initial = displayName?.[0]?.toUpperCase();

  const nav = require("@react-navigation/native").useNavigation();

  return (
    <TouchableOpacity
      style={avatarStyles.container}
      onPress={() => nav.navigate("Account")}
      activeOpacity={0.7}
    >
      {avatarUrl ? (
        <FastImage
          source={{ uri: avatarUrl }}
          style={avatarStyles.image}
        />
      ) : initial ? (
        <View style={[avatarStyles.circle, { backgroundColor: "#fdba74" }]}>
          <Text style={avatarStyles.initial}>{initial}</Text>
        </View>
      ) : (
        <View style={[avatarStyles.circle, { backgroundColor: "#fdba74" }]}>
          <User size={18} color={TEXT_SECONDARY} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const avatarStyles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 16,
    top: 52,
  },
  image: {
    width: 43,
    height: 43,
    borderRadius: 22,
  },
  circle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  initial: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "600",
  },
});

export function HomeScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const {
    recipes,
    loading,
    error,
    fetchRecipes,
    deleteRecipe,
    bulkDeleteRecipes,
    bulkAssignCollection,
  } = useRecipesStore();
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
    createCollection,
    updateCollection,
    deleteCollection,
  } = useCollectionsStore();
  const canImportMore = useImportQueueStore((s) => s.canImportMore);
  const [jarOpen, setJarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [clipboardPromptVisible, setClipboardPromptVisible] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{
    uri: string;
    type?: string;
    fileName?: string;
  } | null>(null);
  const [collectionPickerTarget, setCollectionPickerTarget] =
    useState<Recipe | null>(null);
  const [createCollectionSheetVisible, setCreateCollectionSheetVisible] =
    useState(false);
  const [recipeQuickActions, setRecipeQuickActions] = useState<{
    recipe: Recipe;
    actions: RecipeQuickAction[];
  } | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] =
    useState<Recipe | null>(null);
  const [folderQuickActions, setFolderQuickActions] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);
  const suppressClipboardPromptRef = useRef(false);
  const fanAnim = useRef(new Animated.Value(0)).current;
  const toastRef = useRef<ToastQueueHandle>(null);

  useEffect(() => {
    let prev = AppState.currentState;
    const sub = AppState.addEventListener("change", (next) => {
      if (prev === "background" && next === "active") {
        suppressClipboardPromptRef.current = false;
        clipboardPasteUsedThisSession = false;

        if (navigation.isFocused()) {
          setTimeout(async () => {
            if (
              suppressClipboardPromptRef.current ||
              clipboardPasteUsedThisSession
            )
              return;
            try {
              const has = await Clipboard.hasString();
              if (has) setClipboardPromptVisible(true);
            } catch {
              /* ignore */
            }
          }, 600);
        }
      }
      prev = next;
    });
    return () => sub.remove();
  }, [navigation]);

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

  useEffect(() => {
    if (route.params?.openFab && !jarOpen) {
      setJarOpen(true);
      Animated.spring(fanAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 120,
      }).start();
      navigation.setParams({ openFab: undefined } as any);
    }
  }, [route.params?.openFab]);

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
    setCreateCollectionSheetVisible(true);
  };

  const openPhotoPicker = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: "photo",
        selectionLimit: 1,
      });

      if (result.didCancel) return;

      if (result.errorCode) {
        if (result.errorCode === "permission") {
          Alert.alert(
            "Photo Access Required",
            "Orzo needs access to your photo library. You can enable it in Settings.",
            [
              { text: "Not Now", style: "cancel" },
              { text: "Open Settings", onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert("Could not open photos", result.errorMessage ?? "Unknown error");
        }
        return;
      }

      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setPhotoPreview({
        uri: asset.uri,
        type: asset.type,
        fileName: asset.fileName,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert("Could not open photos", msg);
    }
  }, []);

  // Long-press on a recipe card now enters iOS-Photos-style bulk-select
  // mode, preselecting the pressed recipe. Single-recipe quick actions
  // (via RecipeQuickActionsSheet) are still wired into HomeScreen for
  // other flows but no longer triggered by card long-press.
  const handleLongPressRecipe = (item: Recipe) => {
    bulk.enterBulk(item.id);
  };

  const handleBulkCardPress = (item: Recipe) => {
    bulk.toggle(item.id);
  };

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
      const result = await bulkDeleteRecipes(ids);
      setBulkDeleteConfirmVisible(false);
      bulk.exit();
      toastRef.current?.addToast({
        message:
          result.deletedCount === 1
            ? "Recipe deleted"
            : `${result.deletedCount} recipes deleted`,
      });
    } catch (err) {
      setBulkDeleteConfirmVisible(false);
      Alert.alert(
        "Delete failed",
        err instanceof Error ? err.message : "Could not delete recipes",
      );
    }
  };

  const handleBulkAddToCollection = () => {
    if (bulk.selectedCount === 0) return;
    // With the in-picker "+ New folder" row, zero-collection users get a
    // graceful onboarding path — no alert, just open the picker.
    setBulkCollectionPickerVisible(true);
  };

  const handleBulkCollectionChosen = async (collectionId: string) => {
    const ids = Array.from(bulk.selectedIds);
    try {
      const result = await bulkAssignCollection(ids, collectionId);
      setBulkCollectionPickerVisible(false);
      bulk.exit();
      toastRef.current?.addToast({
        message:
          result.updatedCount === 1
            ? "Moved to collection"
            : `${result.updatedCount} recipes moved`,
      });
    } catch (err) {
      setBulkCollectionPickerVisible(false);
      Alert.alert(
        "Move failed",
        err instanceof Error ? err.message : "Could not move recipes",
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

  const jarFabCenterFromBottom =
    insets.bottom + JAR_FAB_BOTTOM_OFFSET + JAR_FAB_SIZE / 2;
  const jarFanAnchorBottom =
    jarFabCenterFromBottom - JAR_FAN_COLUMN_HEIGHT / 2;

  return (
    <View style={styles.container} testID="home-screen">
      {bulk.bulkMode ? (
        <View
          style={[styles.bulkHeader, { paddingTop: insets.top + 12 }]}
          testID="home-bulk-header"
        >
          <TouchableOpacity
            onPress={bulk.exit}
            style={styles.bulkHeaderSide}
            testID="home-bulk-cancel"
            accessibilityRole="button"
            accessibilityLabel="home-bulk-cancel"
          >
            <Text style={styles.bulkHeaderCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.bulkHeaderCount} testID="home-bulk-count">
            {bulk.selectedCount === 0
              ? "Select recipes"
              : bulk.selectedCount === 1
                ? "1 selected"
                : `${bulk.selectedCount} selected`}
          </Text>
          <TouchableOpacity
            onPress={handleSelectAllToggle}
            style={styles.bulkHeaderSide}
            testID="home-bulk-select-all"
            accessibilityRole="button"
            accessibilityLabel="home-bulk-select-all"
          >
            <Text style={styles.bulkHeaderSelectAll}>
              {allFilteredSelected ? "Deselect All" : "Select All"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
            <Text style={styles.title} testID="home-title">
              Orzo
            </Text>
            <Text style={styles.subtitle} testID="home-subtitle">
              Save, Plan, Cook.
            </Text>
            <ProfileAvatar />
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search recipes..."
              placeholderTextColor={TEXT_SECONDARY}
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
                <X size={LUCIDE.md} color={TEXT_SECONDARY} />
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {!bulk.bulkMode && (
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
            delayLongPress={400}
            onPress={() =>
              navigation.navigate("Collection", {
                collectionId: item.id,
                collectionName: item.name,
                isAllRecipes: !!(item as CollectionItem).isVirtual,
              })
            }
            onLongPress={
              (item as CollectionItem).isVirtual
                ? undefined
                : () =>
                    setFolderQuickActions({
                      id: item.id,
                      name: item.name,
                    })
            }
          >
            {(item as CollectionItem).isVirtual ? (
              <BookOpen size={LUCIDE.collectionCardHome} color={PRIMARY} />
            ) : (
              (() => {
                const { Icon, color } = getCollectionIcon(item.name);
                return <Icon size={LUCIDE.collectionCardHome} color={color} />;
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
      )}

      {loading && recipes.length === 0 && (
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color={PRIMARY}
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
          <RecipeCard
            recipe={item}
            width={CARD_WIDTH}
            testID={`recipe-card-${item.id}`}
            bulkMode={bulk.bulkMode}
            selected={bulk.isSelected(item.id)}
            onPress={() =>
              bulk.bulkMode
                ? handleBulkCardPress(item)
                : navigation.navigate("RecipeDetail", { recipeId: item.id })
            }
            onLongPress={
              bulk.bulkMode ? undefined : () => handleLongPressRecipe(item)
            }
          />
        )}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          // When the bulk action bar is visible, pad the bottom so the
          // last row of cards isn't obscured. 96 ≈ bar height + a bit.
          bulk.bulkMode && { paddingBottom: 96 + insets.bottom },
        ]}
      />

      {/*
        Jar FAB + fan are hidden in bulk-select mode. The bulk action bar
        occupies the bottom-center region and starting a new import mid-
        selection would be a weird flow anyway. The block below renders
        nothing while bulk.bulkMode is true.
      */}
      {!bulk.bulkMode && jarOpen && (
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={toggleJar}
          testID="jar-backdrop"
        />
      )}

      {!bulk.bulkMode && [
        {
          icon: <Camera size={LUCIDE.jarFanAction} color={GOLDEN_AMBER} />,
          label: "Camera",
          testID: "jar-fan-camera",
          onPress: () => {
            toggleJar();
            if (!canImportMore()) {
              navigation.navigate("ImportHub");
              return;
            }
            navigation.navigate("ImportFlow", { mode: "image" });
          },
        },
        {
          icon: <ImageIcon size={LUCIDE.jarFanAction} color={DUSTY_ROSE} />,
          label: "Photos",
          testID: "jar-fan-photos",
          onPress: () => {
            toggleJar();
            if (!canImportMore()) {
              navigation.navigate("ImportHub");
              return;
            }
            openPhotoPicker();
          },
        },
        {
          icon: <Link size={LUCIDE.jarFanAction} color={SAGE_GREEN} />,
          label: "URL",
          testID: "jar-fan-url",
          onPress: () => {
            toggleJar();
            navigation.navigate("WebRecipeImport", {});
          },
        },
        {
          icon: <FolderOpen size={LUCIDE.jarFanAction} color={MUTED_PLUM} />,
          label: "Add Folder",
          testID: "jar-fan-collection",
          onPress: () => {
            toggleJar();
            handleCreateCollection();
          },
        },
      ].map((item, index) => {
        const angle = JAR_FAN_ANGLES[index] ?? -90;
        const rad = (angle * Math.PI) / 180;
        const tx = Math.cos(rad) * JAR_FAN_RADIUS;
        const ty = Math.sin(rad) * JAR_FAN_RADIUS;
        return (
          <Animated.View
            key={item.testID}
            pointerEvents={jarOpen ? "auto" : "none"}
            style={[
              styles.fanItem,
              {
                bottom: jarFanAnchorBottom,
                width: JAR_FAN_SLOT_WIDTH,
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
            <Text style={styles.fanLabel}>{item.label}</Text>
          </Animated.View>
        );
      })}

      {!bulk.bulkMode && (
        <TouchableOpacity
          style={[
            styles.jarButton,
            { bottom: insets.bottom + JAR_FAB_BOTTOM_OFFSET },
          ]}
          testID="jar-button"
          accessibilityRole="button"
          accessibilityLabel={jarOpen ? "Close import menu" : "Open import menu"}
          onPress={toggleJar}
        >
          {jarOpen ? (
            <Minus size={LUCIDE.fab} color={WHITE} />
          ) : (
            <Plus size={LUCIDE.fab} color={WHITE} />
          )}
        </TouchableOpacity>
      )}

      <ToastQueue ref={toastRef} />

      <ClipboardRecipePrompt
        visible={clipboardPromptVisible}
        onClose={closeClipboardPrompt}
        onPasteUrl={(url) =>
          navigation.navigate("WebRecipeImport", { initialUrl: url })
        }
      />

      <CreateCollectionSheet
        visible={createCollectionSheetVisible}
        mode="create"
        onClose={() => setCreateCollectionSheetVisible(false)}
        onSubmit={async (name) => {
          await createCollection(name);
        }}
      />

      <CreateCollectionSheet
        visible={renameFolderTarget !== null}
        mode="rename"
        initialName={renameFolderTarget?.name ?? ""}
        onClose={() => setRenameFolderTarget(null)}
        onSubmit={async (name) => {
          if (!renameFolderTarget) return;
          await updateCollection(renameFolderTarget.id, name);
          await fetchCollections();
        }}
      />

      <RecipeQuickActionsSheet
        visible={folderQuickActions !== null}
        onClose={() => setFolderQuickActions(null)}
        title="Folder"
        emphasisLabel={folderQuickActions?.name ?? ""}
        subtitle="Rename or delete this collection."
        actions={[
          {
            key: "rename-folder",
            label: "Rename folder",
            icon: <Pencil size={LUCIDE.row} color={PRIMARY} />,
            onPress: () => {
              const t = folderQuickActions;
              setFolderQuickActions(null);
              if (t) setRenameFolderTarget(t);
            },
            testID: "folder-quick-action-rename",
          },
          {
            key: "delete-folder",
            label: "Delete folder",
            destructive: true,
            icon: <Trash2 size={LUCIDE.row} color={ERROR} />,
            onPress: () => {
              const t = folderQuickActions;
              setFolderQuickActions(null);
              if (!t) return;
              void (async () => {
                try {
                  const list = await api.collections.getRecipes(t.id);
                  setDeleteFolderTarget({
                    id: t.id,
                    name: t.name,
                    count: list.length,
                  });
                } catch (err) {
                  if (err instanceof ApiError && err.status === 404) {
                    await fetchCollections();
                    fetchRecipes();
                    Alert.alert(
                      "Folder removed",
                      "This folder is no longer available.",
                    );
                    return;
                  }
                  setDeleteFolderTarget({
                    id: t.id,
                    name: t.name,
                    count: 0,
                  });
                }
              })();
            },
            testID: "folder-quick-action-delete",
          },
        ]}
      />

      <DeleteCollectionConfirmSheet
        visible={deleteFolderTarget !== null}
        onClose={() => setDeleteFolderTarget(null)}
        collectionName={deleteFolderTarget?.name ?? ""}
        recipeCount={deleteFolderTarget?.count ?? 0}
        onConfirm={async () => {
          if (!deleteFolderTarget) return;
          try {
            await deleteCollection(deleteFolderTarget.id);
            setDeleteFolderTarget(null);
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
          const selectedCollection = collections.find(
            (c) => c.id === collectionId,
          );
          try {
            await api.recipes.assignCollection(item.id, collectionId);
            fetchRecipes();
            if (selectedCollection) {
              toastRef.current?.addToast({
                message: `Added to ${selectedCollection.name}`,
                onUndo: async () => {
                  await api.recipes.assignCollection(item.id, null);
                  fetchRecipes();
                },
              });
            }
          } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
              await fetchCollections();
              Alert.alert(
                "Folder unavailable",
                "That folder no longer exists. Choose another or create a new one.",
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
            fetchRecipes();
          } catch {
            Alert.alert("Error", "Could not remove from folder. Please try again.");
          }
        }}
      />

      {/* Bulk mode overlays */}
      <BulkActionsBar
        visible={bulk.bulkMode}
        count={bulk.selectedCount}
        primaryAction="add-to-collection"
        onPrimary={handleBulkAddToCollection}
        onDelete={handleBulkDelete}
      />

      <RecipeDeleteConfirmSheet
        visible={bulkDeleteConfirmVisible}
        onClose={() => setBulkDeleteConfirmVisible(false)}
        // When exactly one recipe is selected the sheet renders the
        // single-recipe copy ("Recipe X will be permanently removed")
        // and needs the actual title. When multiple, `count > 1` makes
        // the sheet use plural copy and ignore recipeTitle.
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
          // Picker closes itself; we open the create sheet next frame.
          setBulkNewFolderSheetVisible(true);
        }}
      />

      <CreateCollectionSheet
        visible={bulkNewFolderSheetVisible}
        mode="create"
        onClose={() => setBulkNewFolderSheetVisible(false)}
        onSubmit={async (name) => {
          // Create the folder, then immediately assign the selection to it
          // in one user action. Selection is preserved across the picker →
          // create-sheet hop because bulk.exit() only runs on success here.
          const ids = Array.from(bulk.selectedIds);
          try {
            const newCollection = await createCollection(name);
            await bulkAssignCollection(ids, newCollection.id);
            setBulkNewFolderSheetVisible(false);
            bulk.exit();
            toastRef.current?.addToast({
              message:
                ids.length === 1
                  ? `Added to ${newCollection.name}`
                  : `${ids.length} recipes added to ${newCollection.name}`,
            });
          } catch (err) {
            setBulkNewFolderSheetVisible(false);
            Alert.alert(
              "Couldn't create folder",
              err instanceof Error ? err.message : "Please try again.",
            );
          }
        }}
      />

      {photoPreview && (
        <View style={[styles.photoPreviewOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="photo-preview">
          <Image
            source={{ uri: photoPreview.uri }}
            style={styles.photoPreviewImage}
            resizeMode="contain"
          />
          <View style={styles.photoPreviewActions}>
            <TouchableOpacity
              style={styles.photoPreviewCancel}
              onPress={() => {
                setPhotoPreview(null);
                openPhotoPicker();
              }}
              testID="photo-preview-back"
              accessibilityRole="button"
            >
              <Text style={styles.photoPreviewCancelText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.photoPreviewImport}
              onPress={() => {
                const { uri, type, fileName } = photoPreview;
                setPhotoPreview(null);
                if (!canImportMore()) {
                  navigation.navigate("ImportHub");
                  return;
                }
                navigation.navigate("ImportFlow", {
                  mode: "image",
                  photoUri: uri,
                  photoMimeType: type,
                  photoFileName: fileName,
                });
              }}
              testID="photo-preview-import"
              accessibilityRole="button"
            >
              <Text style={styles.photoPreviewImportText}>Import This Photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PRIMARY_LIGHT },
  header: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 12,
    alignItems: "center",
  },
  title: { fontSize: 30, fontWeight: "800", fontStyle: "italic" },
  subtitle: { fontSize: 14, marginTop: 2, color: TEXT_SECONDARY },
  bulkHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 12,
  },
  bulkHeaderSide: {
    paddingVertical: 8,
    minWidth: 80,
  },
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
  collectionsList: { flexGrow: 0 },
  collectionsContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    gap: 12,
    paddingBottom: 12,
  },
  collectionCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    width: 100,
    height: 116,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: BLACK,
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
    marginTop: 4,
  },
  loader: { marginTop: 40 },
  error: { color: ERROR, textAlign: "center", marginTop: 20 },
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
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 86,
  },
  columnWrapper: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  jarButton: {
    position: "absolute",
    alignSelf: "center",
    width: JAR_FAB_SIZE,
    height: JAR_FAB_SIZE,
    borderRadius: JAR_FAB_SIZE / 2,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 5,
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
    width: JAR_FAN_BUTTON_SIZE,
    height: JAR_FAN_BUTTON_SIZE,
    borderRadius: JAR_FAN_BUTTON_SIZE / 2,
    backgroundColor: DIVIDER,
    borderWidth: 1,
    borderColor: DIVIDER,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 4,
  },
  fanLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: TEXT_TERTIARY,
    marginTop: 6,
    textAlign: "center",
  },
  photoPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BLACK,
    justifyContent: "center",
    alignItems: "center",
  },
  photoPreviewImage: {
    flex: 1,
    width: "100%",
  },
  photoPreviewActions: {
    flexDirection: "row",
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
  },
  photoPreviewCancel: {
    flex: 1,
    backgroundColor: TEXT_TERTIARY,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  photoPreviewCancelText: {
    color: WHITE,
    fontSize: 17,
    fontWeight: "600",
  },
  photoPreviewImport: {
    flex: 1,
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  photoPreviewImportText: {
    color: WHITE,
    fontSize: 17,
    fontWeight: "600",
  },
});
