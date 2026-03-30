import React, { useMemo, useEffect } from "react";
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import FastImage from "react-native-fast-image";
import { X } from "lucide-react-native";
import { RecipeImagePlaceholder } from "./RecipeImagePlaceholder";

interface FullScreenImageViewerProps {
  visible: boolean;
  imageUrl?: string | null;
  onClose: () => void;
}

export function FullScreenImageViewer({
  visible,
  imageUrl,
  onClose,
}: FullScreenImageViewerProps) {
  const insets = useSafeAreaInsets();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [visible, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY]);

  const source = useMemo(() => (imageUrl ? { uri: imageUrl } : null), [imageUrl]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(5, Math.max(1, savedScale.value * event.scale));
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withTiming(1, { duration: 180 });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: 180 });
        translateY.value = withTiming(0, { duration: 180 });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .minPointers(1)
    .onUpdate((event) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + event.translationX;
        translateY.value = savedTranslateY.value + event.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 12 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close full screen image"
        >
          <X size={20} color="#fff" />
        </TouchableOpacity>
        <GestureDetector gesture={composed}>
          <Animated.View style={styles.gestureArea}>
            <Animated.View style={[styles.imageWrap, imageStyle]}>
              {source ? (
                <FastImage
                  source={source}
                  style={styles.image}
                  resizeMode={FastImage.resizeMode.contain}
                />
              ) : (
                <RecipeImagePlaceholder style={styles.image} />
              )}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#000",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 2,
  },
  gestureArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrap: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
