import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Animated,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, useCameraDevice } from "react-native-vision-camera";
import HapticFeedback from "react-native-haptic-feedback";
import * as Sentry from "@sentry/react-native";
import { BLACK, PRIMARY, WHITE } from "../../theme/colors";
import { analytics } from "../../services/analytics";

interface CaptureViewProps {
  pages: { imageUri: string; orderIndex: number }[];
  onCapture: (imageUri: string) => void;
  onDone: () => void;
  onCancel: () => void;
}

const HAPTIC_OPTS = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

export function CaptureView({ pages, onCapture, onDone, onCancel }: CaptureViewProps) {
  const insets = useSafeAreaInsets();
  const device = useCameraDevice("back");
  const cameraRef = useRef<Camera>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  // Async-aware reduce-motion hook. AccessibilityInfo.isReduceMotionEnabled
  // returns a Promise; calling it inline as if it were sync silently sets a
  // truthy value on every device and breaks the accessibility intent.
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const triggerFlash = useCallback(() => {
    flashOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(flashOpacity, {
        toValue: 1,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [flashOpacity]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;

    // CRITICAL ORDER: feedback fires synchronously BEFORE awaiting takePhoto.
    // takePhoto can take 200-400ms on older iPhones; delaying the haptic + flash
    // until after the await is exactly the failure mode the dad-test surfaced
    // ("did the shutter even fire?"). Source-of-truth: design doc 2026-04-19.
    HapticFeedback.trigger("impactMedium", HAPTIC_OPTS);
    if (!reduceMotion) triggerFlash();
    analytics.track("capture_shot_taken", {
      page_index: pages.length,
    });

    try {
      const photo = await cameraRef.current.takePhoto();
      onCapture(`file://${photo.path}`);
    } catch (err) {
      // takePhoto can reject (camera busy, permission revoked mid-flow,
      // disk full). Log to Sentry, surface a plain Alert, stay on camera.
      Sentry.captureException(err);
      Alert.alert("Photo failed", "Couldn't take that photo. Try again.");
    }
  }, [onCapture, reduceMotion, triggerFlash, pages.length]);

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No camera device available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        device={device}
        isActive={true}
        photo={true}
        // WYSIWYG capture: default "cover" crops the 3:4 sensor preview to
        // fill the taller screen, hiding the horizontal edges of what the
        // camera will actually capture. Users framed pages tightly in the
        // preview and then got a much wider capture with the page tiny in
        // the middle — which crushed OCR accuracy because the text
        // rendered smaller than expected in the captured pixels. "contain"
        // shows the real 3:4 frame with black letterboxes above/below, so
        // the preview matches the capture. Users can get physically
        // closer to the page and the OCR sees what the user thought they
        // were sending. Root-cause find 2026-04-21.
        resizeMode="contain"
      />

      {/*
        Flash overlay — sibling of <Camera>, positioned above it via z-index
        but below the controls (Cancel/Done) so it never obscures the
        affordances. pointerEvents="none" so taps fall through to the camera.
      */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flash, { opacity: flashOpacity }]}
      />

      <TouchableOpacity
        style={[styles.cancelButton, { top: insets.top + 8 }]}
        onPress={onCancel}
        testID="capture-cancel"
        accessibilityRole="button"
        accessibilityLabel="capture-cancel"
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>

      <View style={styles.controls}>
        {pages.length > 0 && (
          <FlatList
            horizontal
            data={pages}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <Image source={{ uri: item.imageUri }} style={styles.thumbnail} />
            )}
            style={styles.thumbnailList}
            testID="capture-thumbnails"
          />
        )}

        {pages.length > 0 && (
          <Text style={styles.pageCounter} testID="capture-page-counter">
            Page {pages.length + 1}
          </Text>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.captureButton}
            onPress={handleCapture}
            testID="capture-shutter"
            accessibilityRole="button"
            accessibilityLabel="capture-shutter"
          >
            <View style={styles.captureInner} />
          </TouchableOpacity>
        </View>

        {pages.length > 0 && (
          <TouchableOpacity
            style={styles.doneButton}
            onPress={onDone}
            testID="capture-done"
            accessibilityRole="button"
            accessibilityLabel="capture-done"
          >
            <Text style={styles.doneText}>
              Done ({pages.length} page{pages.length !== 1 ? "s" : ""})
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BLACK },
  camera: { flex: 1 },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: WHITE,
  },
  cancelButton: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  cancelText: { color: WHITE, fontSize: 16, fontWeight: "600" },
  controls: { position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: 50 },
  thumbnailList: { paddingHorizontal: 16, marginBottom: 8 },
  thumbnail: {
    width: 48,
    height: 64,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: WHITE,
  },
  pageCounter: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    opacity: 0.85,
    marginBottom: 8,
  },
  buttonRow: { alignItems: "center", marginBottom: 16 },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: WHITE },
  doneButton: {
    alignSelf: "center",
    backgroundColor: PRIMARY,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  doneText: { color: WHITE, fontSize: 16, fontWeight: "600" },
  errorText: { color: WHITE, fontSize: 16, textAlign: "center", marginTop: 100 },
});
