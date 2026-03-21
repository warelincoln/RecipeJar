import React from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import type { ValidationIssue } from "@recipejar/shared";

interface RetakeRequiredViewProps {
  pages: { pageId: string; imageUri: string; retakeCount: number }[];
  issues: ValidationIssue[];
  onRetake: (pageId: string) => void;
  onEnterCorrection: () => void;
}

export function RetakeRequiredView({
  pages,
  issues,
  onRetake,
  onEnterCorrection,
}: RetakeRequiredViewProps) {
  const retakeIssues = issues.filter(
    (i) => i.severity === "RETAKE" || i.code === "POOR_IMAGE_QUALITY",
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Retake Required</Text>
      <Text style={styles.subtitle}>
        Image quality or confidence is too low to extract the recipe reliably.
        Please retake the affected page(s).
      </Text>

      {retakeIssues.map((issue) => (
        <View key={issue.issueId} style={styles.issueBanner}>
          <Text style={styles.issueText}>{issue.message}</Text>
        </View>
      ))}

      <FlatList
        data={pages}
        keyExtractor={(item) => item.pageId}
        renderItem={({ item, index }) => (
          <View style={styles.pageRow}>
            <Image source={{ uri: item.imageUri }} style={styles.thumbnail} />
            <View style={styles.pageInfo}>
              <Text style={styles.pageLabel}>Page {index + 1}</Text>
              <Text style={styles.retakeCount}>
                Retakes: {item.retakeCount}/2
              </Text>
            </View>
            {item.retakeCount < 2 && (
              <TouchableOpacity
                style={styles.retakeButton}
                onPress={() => onRetake(item.pageId)}
              >
                <Text style={styles.retakeButtonText}>Retake</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        style={styles.list}
      />

      <TouchableOpacity
        style={styles.correctionButton}
        onPress={onEnterCorrection}
      >
        <Text style={styles.correctionText}>Enter Manual Correction</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#6b7280", marginBottom: 16, lineHeight: 20 },
  issueBanner: {
    backgroundColor: "#fef2f2", padding: 12,
    borderRadius: 8, marginBottom: 8,
  },
  issueText: { color: "#dc2626", fontSize: 13 },
  list: { flex: 1 },
  pageRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  thumbnail: { width: 48, height: 64, borderRadius: 4, marginRight: 12 },
  pageInfo: { flex: 1 },
  pageLabel: { fontSize: 16, fontWeight: "500" },
  retakeCount: { fontSize: 12, color: "#6b7280" },
  retakeButton: {
    backgroundColor: "#2563eb", paddingHorizontal: 16,
    paddingVertical: 8, borderRadius: 8,
  },
  retakeButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  correctionButton: {
    backgroundColor: "#ea580c", paddingVertical: 14,
    borderRadius: 12, alignItems: "center", marginTop: 16,
  },
  correctionText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
