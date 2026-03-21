import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
} from "react-native";
import { Camera, useCameraDevice } from "react-native-vision-camera";

interface CaptureViewProps {
  pages: { imageUri: string; orderIndex: number }[];
  onCapture: (imageUri: string) => void;
  onDone: () => void;
}

export function CaptureView({ pages, onCapture, onDone }: CaptureViewProps) {
  const device = useCameraDevice("back");
  const cameraRef = useRef<Camera>(null);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePhoto({ qualityPrioritization: "quality" });
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
          />
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
        </View>

        {pages.length > 0 && (
          <TouchableOpacity style={styles.doneButton} onPress={onDone}>
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
  container: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  controls: { position: "absolute", bottom: 0, left: 0, right: 0, paddingBottom: 40 },
  thumbnailList: { paddingHorizontal: 16, marginBottom: 16 },
  thumbnail: { width: 48, height: 64, borderRadius: 6, marginRight: 8, borderWidth: 1, borderColor: "#fff" },
  buttonRow: { alignItems: "center", marginBottom: 16 },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },
  doneButton: {
    alignSelf: "center", backgroundColor: "#2563eb",
    paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24,
  },
  doneText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  errorText: { color: "#fff", fontSize: 16, textAlign: "center", marginTop: 100 },
});
