import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import type { ValidationIssue } from "@recipejar/shared";

interface WarningGateViewProps {
  warnings: ValidationIssue[];
  onReview: () => void;
  onSaveAnyway: () => void;
}

export function WarningGateView({
  warnings,
  onReview,
  onSaveAnyway,
}: WarningGateViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.icon}>⚠</Text>
        <Text style={styles.title}>Warnings Before Saving</Text>
        <Text style={styles.subtitle}>
          This recipe has {warnings.length} warning
          {warnings.length !== 1 ? "s" : ""}. These may affect cooking
          accuracy. Review them or save as-is.
        </Text>
      </View>

      <ScrollView style={styles.warningList}>
        {warnings.map((warning) => (
          <View key={warning.issueId} style={styles.warningCard}>
            <Text style={styles.warningCode}>{warning.code}</Text>
            <Text style={styles.warningMessage}>{warning.message}</Text>
            {warning.fieldPath && (
              <Text style={styles.warningField}>
                Field: {warning.fieldPath}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.reviewButton} onPress={onReview}>
          <Text style={styles.reviewText}>Review</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveAnywayButton} onPress={onSaveAnyway}>
          <Text style={styles.saveAnywayText}>Save Anyway</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.riskNote}>
        Saving with warnings marks the recipe as user-verified. You can still
        edit it later.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  header: { alignItems: "center", marginBottom: 20 },
  icon: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: {
    fontSize: 14, color: "#6b7280",
    textAlign: "center", lineHeight: 20,
  },
  warningList: { flex: 1 },
  warningCard: {
    backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a",
    borderRadius: 8, padding: 12, marginBottom: 8,
  },
  warningCode: { fontSize: 11, fontWeight: "700", color: "#b45309", marginBottom: 4 },
  warningMessage: { fontSize: 14, color: "#374151" },
  warningField: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  actions: {
    flexDirection: "row", gap: 12, marginTop: 16,
  },
  reviewButton: {
    flex: 1, backgroundColor: "#e5e7eb",
    paddingVertical: 14, borderRadius: 12, alignItems: "center",
  },
  reviewText: { fontSize: 16, fontWeight: "600", color: "#374151" },
  saveAnywayButton: {
    flex: 1, backgroundColor: "#ca8a04",
    paddingVertical: 14, borderRadius: 12, alignItems: "center",
  },
  saveAnywayText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  riskNote: {
    fontSize: 12, color: "#6b7280",
    textAlign: "center", marginTop: 12, lineHeight: 18,
  },
});
