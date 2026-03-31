import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Star } from "lucide-react-native";
import { LUCIDE } from "../theme/lucideSizes";

const STAR_SIZE = LUCIDE.sm;
const STAR_GAP = 8;
const GOLD = "#eab308";
const EMPTY_COLOR = "#d1d5db";
const DEBOUNCE_MS = 600;

interface RecipeRatingInputProps {
  rating: number | null;
  onRate: (value: number | null) => void;
}

export function RecipeRatingInput({ rating, onRate }: RecipeRatingInputProps) {
  const [localRating, setLocalRating] = useState(rating);
  const ratingRef = useRef(localRating);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRateRef = useRef(onRate);
  onRateRef.current = onRate;

  useEffect(() => {
    setLocalRating(rating);
    ratingRef.current = rating;
  }, [rating]);

  const commitRating = useCallback((value: number | null) => {
    ratingRef.current = value;
    setLocalRating(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onRateRef.current(value);
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleStarPress = useCallback(
    (starIndex: number) => {
      const cur = ratingRef.current;
      const halfValue = starIndex - 0.5;
      const fullValue = starIndex;

      if (cur === halfValue) {
        commitRating(fullValue);
      } else if (cur === fullValue) {
        commitRating(halfValue);
      } else {
        commitRating(halfValue);
      }
    },
    [commitRating],
  );

  const handleClear = useCallback(() => {
    ratingRef.current = null;
    setLocalRating(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onRateRef.current(null);
  }, []);

  return (
    <View style={styles.container} testID="rating-input">
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((starIndex) => {
          const fullValue = starIndex;
          const halfValue = starIndex - 0.5;
          const isFull = localRating != null && localRating >= fullValue;
          const isHalf = !isFull && localRating != null && localRating >= halfValue;

          return (
            <Pressable
              key={starIndex}
              style={[styles.starWrapper, { width: STAR_SIZE, height: STAR_SIZE }]}
              testID={`rating-star-${starIndex}`}
              onPressIn={() => handleStarPress(starIndex)}
              unstable_pressDelay={0}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${starIndex} stars`}
            >
              <Star
                size={STAR_SIZE}
                color={EMPTY_COLOR}
                strokeWidth={1.5}
                style={styles.starIcon}
              />

              {(isFull || isHalf) && (
                <View
                  style={[
                    styles.filledOverlay,
                    isHalf && { width: STAR_SIZE / 2 },
                  ]}
                  pointerEvents="none"
                >
                  <Star
                    size={STAR_SIZE}
                    color={GOLD}
                    fill={GOLD}
                    strokeWidth={1.5}
                  />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {localRating != null && (
        <Pressable
          onPress={handleClear}
          style={styles.clearButton}
          testID="rating-clear"
          accessibilityRole="button"
          accessibilityLabel="Clear rating"
        >
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: STAR_GAP,
  },
  starWrapper: {
    position: "relative",
  },
  starIcon: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  filledOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: STAR_SIZE,
    height: STAR_SIZE,
    overflow: "hidden",
  },
  clearButton: {
    marginTop: 6,
    alignSelf: "flex-start",
  },
  clearText: {
    fontSize: 13,
    color: "#6b7280",
  },
});
