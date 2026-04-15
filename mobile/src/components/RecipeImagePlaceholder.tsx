import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { ImageIcon } from "lucide-react-native";
import { LUCIDE } from "../theme/lucideSizes";
import {
  WARM_CREAM,
  LIGHT_PEACH,
  SAND,
  SURFACE,
  TEXT_SECONDARY,
} from "../theme/colors";

interface RecipeImagePlaceholderProps {
  style?: StyleProp<ViewStyle>;
}

export function RecipeImagePlaceholder({ style }: RecipeImagePlaceholderProps) {
  return (
    <View style={[styles.wrap, style]}>
      <LinearGradient
        colors={[WARM_CREAM, SAND]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.circle} />
      <ImageIcon size={LUCIDE.xl} color={TEXT_SECONDARY} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE,
  },
  circle: {
    position: "absolute",
    width: "62%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
});
