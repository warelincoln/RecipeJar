import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from "react-native";
import {
  CookingPot,
  ChefHat,
  Wheat,
  Croissant,
  Drumstick,
  Salad,
  Egg,
  Soup,
  UtensilsCrossed,
  Flame,
} from "lucide-react-native";
import { LUCIDE } from "../../theme/lucideSizes";
import type { QueueEntry } from "../../stores/importQueue.store";

const ICONS = [
  CookingPot,
  ChefHat,
  Wheat,
  Croissant,
  Drumstick,
  Salad,
  Egg,
  Soup,
  UtensilsCrossed,
  Flame,
];

const MESSAGES = [
  "Reading your recipe page...",
  "Identifying ingredients and quantities...",
  "Separating steps from the rest...",
  "Detecting structure and headers...",
  "Cross-checking for missing items...",
  "Hairline receding...",
  "Analyzing image clarity...",
  "Extracting the good stuff...",
  "Emitting CO2...",
  "Almost there, plating up...",
  "Seasoning with a pinch of AI magic...",
  "Letting the flavors come together...",
];

const ACTION_DELAY_MS = 2500;
const ACTION_FADE_DURATION = 400;

interface ParsingViewProps {
  queueEntries?: QueueEntry[];
  onImportAnother?: () => void;
  onReviewRecipes?: () => void;
}

export function ParsingView({
  queueEntries,
  onImportAnother,
  onReviewRecipes,
}: ParsingViewProps) {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const actionsOpacity = useRef(new Animated.Value(0)).current;

  const hasQueue = queueEntries && queueEntries.length > 0;
  const canImportMore = !queueEntries || queueEntries.length < 3;
  const hasReady = queueEntries?.some(
    (e) => e.status === "parsed" || e.status === "needs_retake",
  );

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.15,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [scaleAnim]);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setIndex((prev) => (prev + 1) % ICONS.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [fadeAnim]);

  useEffect(() => {
    if (!hasQueue) return;
    const timer = setTimeout(() => {
      Animated.timing(actionsOpacity, {
        toValue: 1,
        duration: ACTION_FADE_DURATION,
        useNativeDriver: true,
      }).start();
    }, ACTION_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hasQueue, actionsOpacity]);

  const IconComponent = ICONS[index];

  const otherEntries = queueEntries?.filter(
    (e) => e.status !== "uploading" || e.draftId,
  );
  const parsingCount =
    otherEntries?.filter(
      (e) => e.status === "parsing" || e.status === "uploading",
    ).length ?? 0;
  const readyCount =
    otherEntries?.filter(
      (e) => e.status === "parsed" || e.status === "needs_retake",
    ).length ?? 0;

  let queueSummary = "";
  if (parsingCount > 0 && readyCount > 0) {
    queueSummary = `${parsingCount + readyCount} recipes: ${readyCount} ready, ${parsingCount} parsing`;
  } else if (parsingCount > 0) {
    queueSummary =
      parsingCount === 1
        ? "1 other recipe parsing..."
        : `${parsingCount} other recipes parsing...`;
  } else if (readyCount > 0) {
    queueSummary =
      readyCount === 1
        ? "1 recipe ready for review"
        : `${readyCount} recipes ready for review`;
  }

  return (
    <View style={styles.container} testID="parsing-screen">
      <Animated.View
        style={[
          styles.iconWrap,
          { transform: [{ scale: scaleAnim }], opacity: fadeAnim },
        ]}
      >
        <IconComponent size={LUCIDE.importParsingHero} color="#2563eb" />
      </Animated.View>
      <Text style={styles.title} testID="parsing-title">
        Extracting Recipe
      </Text>
      <Animated.Text style={[styles.subtitle, { opacity: fadeAnim }]}>
        {MESSAGES[index]}
      </Animated.Text>

      {hasQueue && (
        <Animated.View style={[styles.queueSection, { opacity: actionsOpacity }]}>
          {otherEntries && otherEntries.length > 0 && (
            <>
              <View style={styles.thumbnailRow}>
                {otherEntries.slice(0, 3).map((e, i) => (
                  <Image
                    key={e.localId}
                    source={{ uri: e.thumbnailUri }}
                    style={[
                      styles.thumbnailCircle,
                      i > 0 && { marginLeft: -8 },
                    ]}
                  />
                ))}
              </View>
              {queueSummary !== "" && (
                <Text style={styles.queueSummary}>{queueSummary}</Text>
              )}
            </>
          )}

          <View style={styles.actionButtons}>
            {canImportMore && onImportAnother && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={onImportAnother}
              >
                <Text style={styles.primaryButtonText}>Import Another</Text>
              </TouchableOpacity>
            )}
            {onReviewRecipes && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onReviewRecipes}
              >
                {hasReady && <View style={styles.greenDot} />}
                <Text style={styles.secondaryButtonText}>Review Recipes</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "700", marginTop: 32 },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 22,
    minHeight: 44,
  },
  queueSection: {
    marginTop: 32,
    alignItems: "center",
    width: "100%",
  },
  thumbnailRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 8,
  },
  thumbnailCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#f3f4f6",
  },
  queueSummary: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 4,
  },
  actionButtons: {
    gap: 10,
    marginTop: 24,
    width: "100%",
  },
  primaryButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#e5e7eb",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16a34a",
  },
});
