import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Star } from "lucide-react-native";
import { LUCIDE } from "../theme/lucideSizes";
import { GOLDEN_AMBER, DEEP_TERRACOTTA } from "../theme/colors";

const GOLD = GOLDEN_AMBER;

interface CompactRecipeRatingProps {
  rating: number | null;
}

export function CompactRecipeRating({ rating }: CompactRecipeRatingProps) {
  if (rating == null) return null;

  const display = Number.isInteger(rating) ? `${rating}` : `${rating}`;

  return (
    <View style={styles.container}>
      <Star size={LUCIDE.xs} color={GOLD} fill={GOLD} strokeWidth={1.5} />
      <Text style={styles.text}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    color: DEEP_TERRACOTTA,
    paddingTop: 2,
  },
});
