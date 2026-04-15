import React from "react";
import { displayMessageForIssue } from "./issueDisplayMessage";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import type { ValidationIssue } from "@orzo/shared";
import {
  PRIMARY,
  TEXT_SECONDARY,
  DIVIDER,
  ERROR,
  WHITE,
  TINT_RED,
} from "../../theme/colors";

interface RetakeRequiredViewProps {
  pages: { pageId: string; imageUri: string; retakeCount: number }[];
  issues: ValidationIssue[];
  onRetake: (pageId: string) => void;
  isPhotosEntry?: boolean;
  onGoHome?: () => void;
}

export function RetakeRequiredView({
  pages,
  issues,
  onRetake,
  isPhotosEntry,
  onGoHome,
}: RetakeRequiredViewProps) {
  const retakeIssues = issues.filter(
    (i) => i.severity === "RETAKE" || i.code === "POOR_IMAGE_QUALITY",
  );

  return (
    <View style={styles.container} testID="retake-screen">
      <Text style={styles.title} testID="retake-title">
        {isPhotosEntry ? "Could Not Read Photo" : "Retake Required"}
      </Text>
      <Text style={styles.subtitle}>
        {isPhotosEntry
          ? "We weren\u2019t able to extract a recipe from this photo. Try a different photo or use the camera for a clearer shot."
          : "Image quality or confidence is too low to extract the recipe reliably. Please retake the affected page(s)."}
      </Text>

      {retakeIssues.map((issue) => (
        <View key={issue.issueId} style={styles.issueBanner}>
          <Text style={styles.issueText}>{displayMessageForIssue(issue)}</Text>
        </View>
      ))}

      {isPhotosEntry && onGoHome ? (
        <TouchableOpacity
          style={styles.goHomeButton}
          onPress={onGoHome}
          testID="retake-go-home"
          accessibilityRole="button"
        >
          <Text style={styles.goHomeText}>Go Home</Text>
        </TouchableOpacity>
      ) : (
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
                  testID={`retake-button-${index}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.retakeButtonText}>Retake</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          style={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE, paddingHorizontal: 24, paddingTop: 16 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14, color: TEXT_SECONDARY, marginBottom: 16, lineHeight: 20 },
  issueBanner: {
    backgroundColor: TINT_RED, padding: 12,
    borderRadius: 8, marginBottom: 8,
  },
  issueText: { color: ERROR, fontSize: 13 },
  list: { flex: 1 },
  pageRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: DIVIDER,
  },
  thumbnail: { width: 48, height: 64, borderRadius: 4, marginRight: 12 },
  pageInfo: { flex: 1 },
  pageLabel: { fontSize: 16, fontWeight: "500" },
  retakeCount: { fontSize: 12, color: TEXT_SECONDARY },
  retakeButton: {
    backgroundColor: PRIMARY, paddingHorizontal: 16,
    paddingVertical: 8, borderRadius: 8,
  },
  retakeButtonText: { color: WHITE, fontSize: 14, fontWeight: "600" },
  goHomeButton: {
    backgroundColor: PRIMARY, paddingHorizontal: 24,
    paddingVertical: 14, borderRadius: 12, alignSelf: "center", marginTop: 24,
  },
  goHomeText: { color: WHITE, fontSize: 16, fontWeight: "600" },
});
