import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import LinearGradient from "react-native-linear-gradient";
import { ImageIcon } from "lucide-react-native";
import { LUCIDE } from "../theme/lucideSizes";

interface RecipeImagePlaceholderProps {
  style?: StyleProp<ViewStyle>;
}

export function RecipeImagePlaceholder({ style }: RecipeImagePlaceholderProps) {
  return (
    <View style={[styles.wrap, style]}>
      <LinearGradient
        colors={["#f7f4ee", "#edf2e8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.circle} />
      <ImageIcon size={LUCIDE.xl} color="#9ca3af" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  circle: {
    position: "absolute",
    width: "62%",
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
});
