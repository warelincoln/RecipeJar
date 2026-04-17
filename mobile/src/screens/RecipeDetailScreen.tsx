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
  Linking,
} from "react-native";
import FastImage from "react-native-fast-image";
import { Clock, Globe, Camera } from "lucide-react-native";
import { api } from "../services/api";
import { analytics } from "../services/analytics";
import { useRecipesStore } from "../stores/recipes.store";
import { useCollectionsStore } from "../stores/collections.store";
import { RecipeRatingInput } from "../components/RecipeRatingInput";
import { RecipeNotesSection } from "../components/RecipeNotesSection";
import { ShimmerPlaceholder } from "../components/ShimmerPlaceholder";
import { RecipeImagePlaceholder } from "../components/RecipeImagePlaceholder";
import { FullScreenImageViewer } from "../components/FullScreenImageViewer";
import { CollectionPickerSheet } from "../components/CollectionPickerSheet";
import type { Recipe } from "@orzo/shared";
import { scaleIngredient } from "../utils/scaling";
import { formatMinutes, hasAnyTime } from "../utils/time";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import {
  PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  DIVIDER,
  ERROR,
  SUCCESS,
  WARNING,
  WHITE,
  TINT_AMBER,
} from "../theme/colors";

const SERVINGS_MULTIPLIERS: { label: string; value: number }[] = [
  { label: "½", value: 0.5 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
];

function hostnameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

type Props = NativeStackScreenProps<RootStackParamList, "RecipeDetail">;

export function RecipeDetailScreen({ route, navigation }: Props) {
  const { recipeId } = route.params;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [pageViewerUrl, setPageViewerUrl] = useState<string | null>(null);
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
        analytics.track("recipe_viewed", {
          recipeId: next.id,
          hasHeroImage: Boolean(next.imageUrl),
        });
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

  const handleServingsMultiplier = (multiplier: number) => {
    if (baseline == null || baseline === 0) return;
    const next = Math.max(0.25, Math.min(99, baseline * multiplier));
    setDisplayServingsText(String(next));
  };

  const handleOpenSourceUrl = async () => {
    const url = recipe?.sourceContext?.originalUrl;
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          "Cannot open link",
          "This device doesn't have an app that can open this link.",
        );
      }
    } catch (err) {
      Alert.alert("Cannot open link", "Something went wrong opening the link.");
    }
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={PRIMARY} />
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

  const heroUrl = recipe.imageUrl
    ? `${recipe.imageUrl}${recipe.imageUrl.includes("?") ? "&" : "?"}t=${imgCacheBuster}`
    : null;

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

      {(() => {
        const sourceType = recipe.sourceContext?.sourceType;
        const originalUrl = recipe.sourceContext?.originalUrl ?? null;
        const pages = recipe.sourceContext?.pages ?? [];
        if (sourceType === "url" && originalUrl) {
          const host = hostnameFromUrl(originalUrl);
          if (!host) return null;
          return (
            <TouchableOpacity
              style={styles.sourceChip}
              onPress={handleOpenSourceUrl}
              testID="recipe-detail-source-chip"
              accessibilityRole="link"
              accessibilityLabel={`Open source: ${host}`}
            >
              <Globe size={14} color={TEXT_SECONDARY} strokeWidth={2} />
              <Text style={styles.sourceChipText} numberOfLines={1}>{host}</Text>
            </TouchableOpacity>
          );
        }
        if (sourceType === "image" && pages.length > 0) {
          return (
            <View style={styles.sourceSection} testID="recipe-detail-source-pages">
              <View style={styles.sourceChipStatic}>
                <Camera size={14} color={TEXT_SECONDARY} strokeWidth={2} />
                <Text style={styles.sourceChipText}>Imported from photo</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pageStrip}
              >
                {pages.map((page) => {
                  const uri = page.imageUri;
                  if (!uri) return null;
                  return (
                    <TouchableOpacity
                      key={page.id}
                      style={styles.pageThumb}
                      onPress={() => setPageViewerUrl(uri)}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`View source page ${page.orderIndex + 1}`}
                    >
                      <FastImage
                        source={{ uri }}
                        style={styles.pageThumbImage}
                        resizeMode={FastImage.resizeMode.cover}
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          );
        }
        return null;
      })()}

      {hasAnyTime(
        recipe.prepTimeMinutes,
        recipe.cookTimeMinutes,
        recipe.totalTimeMinutes,
      ) && (() => {
        // Unconfirmed AI estimates get a muted "~" prefix on the chip so
        // users can tell at a glance which values were stated vs. guessed.
        // Explicit (authored on the source) and user_confirmed values
        // render clean.
        const fmt = (
          minutes: number | null,
          source: Recipe["prepTimeSource"],
          label: string,
        ): string | null => {
          const text = formatMinutes(minutes);
          if (!text) return null;
          const prefix = source === "inferred" ? "~" : "";
          return `${prefix}${text} ${label}`;
        };
        // Display-layer fallback: if the source didn't supply a total but
        // did supply prep and/or cook, derive total = prep + cook at render
        // time and prefix with "~" so it reads as a computed estimate. This
        // fills the common JSON-LD gap where sites authoritatively publish
        // prepTime/cookTime but not totalTime.
        const storedTotal = formatMinutes(recipe.totalTimeMinutes);
        const derivedTotalMinutes =
          recipe.totalTimeMinutes == null &&
          (recipe.prepTimeMinutes != null || recipe.cookTimeMinutes != null)
            ? (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0)
            : null;
        const totalChip = storedTotal
          ? fmt(recipe.totalTimeMinutes, recipe.totalTimeSource, "total")
          : derivedTotalMinutes != null && derivedTotalMinutes > 0
            ? `~${formatMinutes(derivedTotalMinutes)} total`
            : null;
        const parts = [
          fmt(recipe.prepTimeMinutes, recipe.prepTimeSource, "prep"),
          fmt(recipe.cookTimeMinutes, recipe.cookTimeSource, "cook"),
          totalChip,
        ].filter(Boolean);
        const anyInferred =
          recipe.prepTimeSource === "inferred" ||
          recipe.cookTimeSource === "inferred" ||
          recipe.totalTimeSource === "inferred";
        return (
          <View style={styles.timeRow} testID="recipe-detail-time-row">
            <Clock size={14} color={TEXT_SECONDARY} strokeWidth={2} />
            <Text
              style={[
                styles.timeText,
                anyInferred && styles.timeTextInferred,
              ]}
            >
              {parts.join(" · ")}
            </Text>
          </View>
        );
      })()}

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
          <View style={styles.servingsMultiplierRow}>
            {SERVINGS_MULTIPLIERS.map(({ label, value }) => {
              const isActive =
                displayServings != null &&
                Math.abs(displayServings - baseline * value) < 0.01;
              return (
                <TouchableOpacity
                  key={label}
                  style={[
                    styles.servingsMultiplierChip,
                    isActive && styles.servingsMultiplierChipActive,
                  ]}
                  onPress={() => handleServingsMultiplier(value)}
                  testID={`recipe-detail-servings-x${value}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Scale servings by ${label}`}
                >
                  <Text
                    style={[
                      styles.servingsMultiplierText,
                      isActive && styles.servingsMultiplierTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
      <FullScreenImageViewer
        visible={pageViewerUrl != null}
        imageUrl={pageViewerUrl}
        onClose={() => setPageViewerUrl(null)}
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
  container: { flex: 1, backgroundColor: WHITE },
  content: { paddingBottom: 40 },
  heroWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    marginBottom: 14,
    backgroundColor: DIVIDER,
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
  errorText: { fontSize: 16, color: ERROR },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  title: { fontSize: 26, fontWeight: "800", flex: 1, marginRight: 12 },
  titleActions: { flexDirection: "row", gap: 8, marginTop: 2 },
  collectionButton: {
    backgroundColor: SUCCESS,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  collectionButtonText: { color: WHITE, fontSize: 14, fontWeight: "600" },
  editButton: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editButtonText: { color: WHITE, fontSize: 14, fontWeight: "600" },
  description: { fontSize: 15, color: TEXT_SECONDARY, lineHeight: 22, marginBottom: 12 },
  sourceChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: DIVIDER,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 12,
    maxWidth: "100%",
  },
  sourceChipStatic: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: DIVIDER,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginBottom: 8,
  },
  sourceChipText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontWeight: "500",
    flexShrink: 1,
  },
  sourceSection: {
    marginBottom: 12,
  },
  pageStrip: {
    gap: 8,
    paddingRight: 16,
  },
  pageThumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: DIVIDER,
  },
  pageThumbImage: {
    width: "100%",
    height: "100%",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  timeText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    fontWeight: "500",
  },
  timeTextInferred: {
    fontStyle: "italic",
    color: TEXT_TERTIARY,
  },
  badge: {
    alignSelf: "flex-start", backgroundColor: TINT_AMBER,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 16,
  },
  badgeText: { fontSize: 12, fontWeight: "600", color: WARNING },
  servingsControl: {
    marginTop: 20,
  },
  servingsMultiplierRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  servingsMultiplierChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: DIVIDER,
    minWidth: 44,
    alignItems: "center",
  },
  servingsMultiplierChipActive: {
    backgroundColor: PRIMARY,
  },
  servingsMultiplierText: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_TERTIARY,
  },
  servingsMultiplierTextActive: {
    color: WHITE,
  },
  servingsLabel: {
    fontSize: 16, fontWeight: "600", color: TEXT_TERTIARY, marginBottom: 8,
  },
  servingsRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  servingsStepBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: DIVIDER, alignItems: "center", justifyContent: "center",
  },
  servingsStepText: {
    fontSize: 20, fontWeight: "600", color: TEXT_TERTIARY, lineHeight: 22,
  },
  servingsInput: {
    borderWidth: 1, borderColor: DIVIDER, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, fontSize: 16,
    width: 60, textAlign: "center",
  },
  servingsResetText: {
    fontSize: 14, color: PRIMARY, fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 20, fontWeight: "700", marginTop: 24, marginBottom: 12,
  },
  ingredientHeader: {
    fontSize: 15, fontWeight: "600", fontStyle: "italic",
    color: TEXT_TERTIARY, marginTop: 12, marginBottom: 4,
  },
  ingredientRow: { flexDirection: "row", marginBottom: 6 },
  bullet: { fontSize: 15, marginRight: 8, color: PRIMARY },
  ingredientText: { flex: 1, fontSize: 15, lineHeight: 22 },
  stepSectionHeader: {
    fontSize: 15, fontWeight: "600", fontStyle: "italic",
    color: TEXT_TERTIARY, marginTop: 12, marginBottom: 4,
  },
  stepRow: { flexDirection: "row", marginBottom: 16 },
  stepNumber: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: PRIMARY, color: WHITE,
    textAlign: "center", lineHeight: 28, fontSize: 14, fontWeight: "700",
    marginRight: 12,
  },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22 },
  deleteButton: {
    marginTop: 32,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ERROR,
    alignItems: "center",
  },
  deleteButtonText: {
    color: ERROR,
    fontSize: 16,
    fontWeight: "600",
  },
});
