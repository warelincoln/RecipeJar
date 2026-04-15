import React, { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { DIVIDER } from "../theme/colors";

interface ShimmerPlaceholderProps {
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
}

export function ShimmerPlaceholder({
  style,
  borderRadius = 12,
}: ShimmerPlaceholderProps) {
  const translate = useSharedValue(-220);

  useEffect(() => {
    translate.value = withRepeat(
      withTiming(220, { duration: 1100, easing: Easing.linear }),
      -1,
      false,
    );
  }, [translate]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
  }));

  return (
    <View style={[styles.container, { borderRadius }, style]}>
      <Animated.View style={[styles.band, shimmerStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: DIVIDER,
  },
  band: {
    width: 120,
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
});
