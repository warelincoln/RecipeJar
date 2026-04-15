import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, useCameraDevice } from "react-native-vision-camera";
import { PRIMARY, WHITE, BLACK } from "../../theme/colors";

interface CaptureViewProps {
  pages: { imageUri: string; orderIndex: number }[];
  onCapture: (imageUri: string) => void;
  onDone: () => void;
  onCancel: () => void;
}

export function CaptureView({ pages, onCapture, onDone, onCancel }: CaptureViewProps) {
  const insets = useSafeAreaInsets();
  const device = useCameraDevice("back");
  const cameraRef = useRef<Camera>(null);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePhoto();
    onCapture(`file://${photo.path}`);
  }, [onCapture]);

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
      />

      <TouchableOpacity style={[styles.cancelButton, { top: insets.top + 8 }]} onPress={onCancel} testID="capture-cancel" accessibilityRole="button" accessibilityLabel="capture-cancel">
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

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.captureButton} onPress={handleCapture} testID="capture-shutter" accessibilityRole="button" accessibilityLabel="capture-shutter">
            <View style={styles.captureInner} />
          </TouchableOpacity>
        </View>

        {pages.length > 0 && (
          <TouchableOpacity style={styles.doneButton} onPress={onDone} testID="capture-done" accessibilityRole="button" accessibilityLabel="capture-done">
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
  cancelButton: { position: "absolute", left: 16, zIndex: 10, padding: 8 },
  cancelText: { color: WHITE, fontSize: 16, fontWeight: "600" },
  controls: { position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: 50 },
  thumbnailList: { paddingHorizontal: 16, marginBottom: 16 },
  thumbnail: { width: 48, height: 64, borderRadius: 6, marginRight: 8, borderWidth: 1, borderColor: WHITE },
  buttonRow: { alignItems: "center", marginBottom: 16 },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: WHITE,
    alignItems: "center", justifyContent: "center",
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: WHITE },
  doneButton: {
    alignSelf: "center", backgroundColor: PRIMARY,
    paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24,
  },
  doneText: { color: WHITE, fontSize: 16, fontWeight: "600" },
  errorText: { color: WHITE, fontSize: 16, textAlign: "center", marginTop: 100 },
});
