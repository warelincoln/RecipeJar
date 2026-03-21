import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";

export function ParsingView() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.title}>Extracting Recipe</Text>
      <Text style={styles.subtitle}>
        Reading your pages and identifying ingredients, steps, and structure...
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center", padding: 32,
  },
  title: { fontSize: 20, fontWeight: "700", marginTop: 24 },
  subtitle: {
    fontSize: 14, color: "#6b7280",
    textAlign: "center", marginTop: 8, lineHeight: 20,
  },
});
