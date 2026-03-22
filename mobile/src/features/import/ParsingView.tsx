import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
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

export function ParsingView() {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

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

  const IconComponent = ICONS[index];

  return (
    <View style={styles.container} testID="parsing-screen">
      <Animated.View
        style={[
          styles.iconWrap,
          { transform: [{ scale: scaleAnim }], opacity: fadeAnim },
        ]}
      >
        <IconComponent size={64} color="#2563eb" />
      </Animated.View>
      <Text style={styles.title} testID="parsing-title">
        Extracting Recipe
      </Text>
      <Animated.Text style={[styles.subtitle, { opacity: fadeAnim }]}>
        {MESSAGES[index]}
      </Animated.Text>
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
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "700", marginTop: 28 },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 22,
    minHeight: 44,
  },
});
