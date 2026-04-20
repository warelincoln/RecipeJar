import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BLACK, PRIMARY, WHITE } from "../../theme/colors";

interface ReviewViewProps {
  imageUri: string;
  /** 1-indexed page number being reviewed (page 1 = the first shot). */
  pageNumber: number;
  onKeep: () => void;
  onRetake: () => void;
  onCancel: () => void;
}

/**
 * Full-screen per-shot review screen. Renders between camera capture and the
 * next shot so the user can verify framing/focus before committing.
 *
 * Designed for the dad-test scenario (2026-04-19): older user, shaky hands,
 * needs large buttons, distinct visual targets, and a clear announcement on
 * VoiceOver mount. Two buttons only: Retake (discards pending) or
 * Use This Photo (commits and re-arms camera). Cancel discards the entire
 * import (consistent with capture-state Cancel).
 *
 * Portrait-locked at the screen level isn't enforced here yet — the project
 * doesn't use a screen-orientation library. Layout is portrait-friendly;
 * landscape will look cramped but isn't blocked.
 */
export function ReviewView({
  imageUri,
  pageNumber,
  onKeep,
  onRetake,
  onCancel,
}: ReviewViewProps) {
  const insets = useSafeAreaInsets();
  const headerRef = useRef<Text>(null);

  useEffect(() => {
    // VoiceOver: jump focus to the header on mount so the announcement
    // reads cleanly. accessibilityFocus + findNodeHandle is more reliable
    // across RN versions than announceForAccessibility, which races with
    // screen-mount focus shift.
    const node = findNodeHandle(headerRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, []);

  return (
    <View style={styles.container} testID="review-screen">
      <TouchableOpacity
        style={[styles.cancelButton, { top: insets.top + 8 }]}
        onPress={onCancel}
        testID="review-cancel"
        accessibilityRole="button"
        accessibilityLabel="Cancel import"
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>

      <Text
        ref={headerRef}
        style={[styles.header, { marginTop: insets.top + 48 }]}
        testID="review-header"
        accessibilityLabel={`Photo ${pageNumber} captured. Review and choose: Retake or Use This Photo.`}
      >
        Does this look right?
      </Text>

      <View style={styles.imageContainer}>
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="contain"
          testID="review-photo"
          accessibilityLabel="Captured photo, review for clarity"
        />
      </View>

      <View
        style={[styles.buttonRow, { marginBottom: insets.bottom + 24 }]}
      >
        <TouchableOpacity
          style={[styles.button, styles.retakeButton]}
          onPress={onRetake}
          testID="review-retake"
          accessibilityRole="button"
          accessibilityLabel="Retake photo"
        >
          <Text style={styles.retakeText}>Retake</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.keepButton]}
          onPress={onKeep}
          testID="review-keep"
          accessibilityRole="button"
          accessibilityLabel="Use this photo"
        >
          <Text style={styles.keepText}>Use This Photo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BLACK },
  cancelButton: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  cancelText: { color: WHITE, fontSize: 16, fontWeight: "600" },
  header: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    paddingHorizontal: 16,
  },
  imageContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  image: { width: "100%", height: "100%" },
  buttonRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 16,
  },
  button: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  retakeButton: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: WHITE,
  },
  retakeText: { color: WHITE, fontSize: 16, fontWeight: "600" },
  keepButton: { backgroundColor: PRIMARY },
  keepText: { color: WHITE, fontSize: 16, fontWeight: "600" },
});
