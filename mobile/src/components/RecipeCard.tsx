import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import FastImage from "react-native-fast-image";
import LinearGradient from "react-native-linear-gradient";
import { Check } from "lucide-react-native";
import type { Recipe } from "@orzo/shared";
import { ShimmerPlaceholder } from "./ShimmerPlaceholder";
import { RecipeImagePlaceholder } from "./RecipeImagePlaceholder";
import { DIVIDER, PRIMARY, WHITE } from "../theme/colors";

/** Storage paths stay the same after re-upload; bust FastImage cache when recipe row changes. */
function imageUriWithVersion(
  url: string | null | undefined,
  updatedAt: string | undefined,
): string | null {
  if (!url) return null;
  const v = updatedAt
    ? String(new Date(updatedAt).getTime())
    : "0";
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${v}`;
}

/**
 * Stable FastImage disk-cache key derived from the Supabase Storage
 * path (pathname, minus the `?token=…&expires=…` query that changes on
 * every server-side sign) plus `updatedAt` so a hero replacement still
 * invalidates cache cleanly. Belt + suspenders to the server-side
 * signed-URL cache (`server/src/services/recipe-image.service.ts`):
 * even if the server cache busts between requests, FastImage still
 * hits the same disk entry and the card renders without flicker.
 */
function stableCacheKey(
  url: string | null | undefined,
  updatedAt: string | undefined,
): string | undefined {
  if (!url) return undefined;
  try {
    const { pathname } = new URL(url);
    return `${pathname}#${updatedAt ?? "0"}`;
  } catch {
    return undefined;
  }
}

interface RecipeCardProps {
  recipe: Recipe;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
  /** When true, render an iOS-Photos-style checkmark overlay in the top-
   *  right corner. Tap still calls `onPress` — caller wires the tap to
   *  `toggle(id)` on the selection hook instead of navigating. */
  bulkMode?: boolean;
  /** When `bulkMode` is true, `selected` controls whether the checkmark
   *  renders filled (primary color) or empty (thin outline). */
  selected?: boolean;
  testID?: string;
}

export function RecipeCard({
  recipe,
  width,
  onPress,
  onLongPress,
  bulkMode = false,
  selected = false,
  testID,
}: RecipeCardProps) {
  const [loaded, setLoaded] = useState(false);

  const hasRemoteImage = Boolean(recipe.thumbnailUrl || recipe.imageUrl);
  const imageSource = useMemo(() => {
    const raw = recipe.thumbnailUrl ?? recipe.imageUrl;
    const uri = imageUriWithVersion(raw, recipe.updatedAt);
    if (!uri) return null;
    const cacheKey = stableCacheKey(raw, recipe.updatedAt);
    return cacheKey ? { uri, cacheKey } : { uri };
  }, [recipe.imageUrl, recipe.thumbnailUrl, recipe.updatedAt]);

  useEffect(() => {
    setLoaded(false);
  }, [imageSource?.uri]);

  return (
    <TouchableOpacity
      style={[styles.card, { width, height: width }]}
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`recipe-${recipe.title}`}
      activeOpacity={0.9}
    >
      {hasRemoteImage ? (
        <>
          {!loaded && <ShimmerPlaceholder style={StyleSheet.absoluteFillObject} borderRadius={12} />}
          <FastImage
            source={imageSource!}
            style={[StyleSheet.absoluteFillObject, !loaded && styles.hidden]}
            resizeMode={FastImage.resizeMode.cover}
            onLoadEnd={() => setLoaded(true)}
          />
        </>
      ) : (
        <RecipeImagePlaceholder style={StyleSheet.absoluteFillObject} />
      )}
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.72)"]}
        style={styles.gradient}
      />
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={2}>
          {recipe.title}
        </Text>
      </View>
      {bulkMode && (
        <View
          style={[
            styles.checkmarkCircle,
            selected
              ? styles.checkmarkCircleSelected
              : styles.checkmarkCircleEmpty,
          ]}
          testID={`recipe-card-checkmark-${recipe.id}`}
          accessibilityLabel={selected ? "selected" : "not selected"}
        >
          {selected && <Check size={16} color={WHITE} strokeWidth={3} />}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: DIVIDER,
  },
  hidden: {
    opacity: 0,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  titleWrap: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
  },
  title: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  checkmarkCircle: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmarkCircleSelected: {
    backgroundColor: PRIMARY,
    borderWidth: 2,
    borderColor: WHITE,
  },
  checkmarkCircleEmpty: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1.5,
    borderColor: WHITE,
  },
});
