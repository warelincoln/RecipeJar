import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import FastImage from "react-native-fast-image";
import LinearGradient from "react-native-linear-gradient";
import type { Recipe } from "@recipejar/shared";
import { ShimmerPlaceholder } from "./ShimmerPlaceholder";
import { RecipeImagePlaceholder } from "./RecipeImagePlaceholder";

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

interface RecipeCardProps {
  recipe: Recipe;
  width: number;
  onPress: () => void;
  onLongPress?: () => void;
  testID?: string;
}

export function RecipeCard({
  recipe,
  width,
  onPress,
  onLongPress,
  testID,
}: RecipeCardProps) {
  const [loaded, setLoaded] = useState(false);

  const hasRemoteImage = Boolean(recipe.thumbnailUrl || recipe.imageUrl);
  const imageSource = useMemo(() => {
    const raw = recipe.thumbnailUrl ?? recipe.imageUrl;
    const uri = imageUriWithVersion(raw, recipe.updatedAt);
    return uri ? { uri } : null;
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#d1d5db",
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
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
