import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Star } from "lucide-react-native";

const GOLD = "#eab308";

interface CompactRecipeRatingProps {
  rating: number | null;
}

export function CompactRecipeRating({ rating }: CompactRecipeRatingProps) {
  if (rating == null) return null;

  const display = Number.isInteger(rating) ? `${rating}` : `${rating}`;

  return (
    <View style={styles.container}>
      <Star size={12} color={GOLD} fill={GOLD} strokeWidth={1.5} />
      <Text style={styles.text}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
    color: "#92400e",
  },
});
