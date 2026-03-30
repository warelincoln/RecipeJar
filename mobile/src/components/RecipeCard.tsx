import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import FastImage from "react-native-fast-image";
import LinearGradient from "react-native-linear-gradient";
import type { Recipe } from "@recipejar/shared";
import { ShimmerPlaceholder } from "./ShimmerPlaceholder";
import { RecipeImagePlaceholder } from "./RecipeImagePlaceholder";

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
    if (recipe.thumbnailUrl) return { uri: recipe.thumbnailUrl };
    if (recipe.imageUrl) return { uri: recipe.imageUrl };
    return null;
  }, [recipe.imageUrl, recipe.thumbnailUrl]);

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
