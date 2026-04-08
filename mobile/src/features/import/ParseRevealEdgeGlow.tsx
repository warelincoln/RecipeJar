import React, { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/** Oscillates overall strength; gradient itself fades to transparent inward. */
const OPACITY_MIN = 0.38;
const OPACITY_RANGE = 0.34;
const CYCLE_MS = 2800;

const TOP_BAND_H = 88;
const SIDE_BAND_W = 52;

interface ParseRevealEdgeGlowProps {
  active: boolean;
}

/**
 * Warm, soft edge glow (SVG gradients) while parse text reveals — not solid bars.
 * Uses % gradient vector coords + numeric Svg sizes to avoid RN SVG layout warnings.
 */
export default function ParseRevealEdgeGlow({ active }: ParseRevealEdgeGlowProps) {
  const { width: winW, height: winH } = useWindowDimensions();
  const t = useSharedValue(0);

  const topW = Math.max(1, Math.round(winW - 2 * SIDE_BAND_W));
  const sideH = Math.max(1, Math.round(winH));

  useEffect(() => {
    if (!active) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withTiming(1, {
        duration: CYCLE_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [active, t]);

  const topStyle = useAnimatedStyle(() => {
    const v = Math.sin(t.value * Math.PI * 2) * 0.5 + 0.5;
    return { opacity: OPACITY_MIN + v * OPACITY_RANGE };
  });
  const rightStyle = useAnimatedStyle(() => {
    const v = Math.sin(t.value * Math.PI * 2 + Math.PI / 2) * 0.5 + 0.5;
    return { opacity: OPACITY_MIN + v * OPACITY_RANGE };
  });
  const bottomStyle = useAnimatedStyle(() => {
    const v = Math.sin(t.value * Math.PI * 2 + Math.PI) * 0.5 + 0.5;
    return { opacity: OPACITY_MIN + v * OPACITY_RANGE };
  });
  const leftStyle = useAnimatedStyle(() => {
    const v = Math.sin(t.value * Math.PI * 2 + (3 * Math.PI) / 2) * 0.5 + 0.5;
    return { opacity: OPACITY_MIN + v * OPACITY_RANGE };
  });

  if (!active) {
    return null;
  }

  return (
    <View style={styles.root} pointerEvents="none">
      <Animated.View
        style={[styles.edgeTop, topStyle]}
        collapsable={false}
      >
        <Svg width={topW} height={TOP_BAND_H} viewBox={`0 0 ${topW} ${TOP_BAND_H}`}>
          <Defs>
            <LinearGradient id="orzoGlowTop" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#ea580c" stopOpacity={0.55} />
              <Stop offset="28%" stopColor="#f97316" stopOpacity={0.32} />
              <Stop offset="55%" stopColor="#fbbf24" stopOpacity={0.14} />
              <Stop offset="82%" stopColor="#fde68a" stopOpacity={0.04} />
              <Stop offset="100%" stopColor="#fff7ed" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={topW} height={TOP_BAND_H} fill="url(#orzoGlowTop)" />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[styles.edgeBottom, bottomStyle]}
        collapsable={false}
      >
        <Svg width={topW} height={TOP_BAND_H} viewBox={`0 0 ${topW} ${TOP_BAND_H}`}>
          <Defs>
            <LinearGradient id="orzoGlowBottom" x1="0%" y1="100%" x2="0%" y2="0%">
              <Stop offset="0%" stopColor="#c2410c" stopOpacity={0.5} />
              <Stop offset="30%" stopColor="#ea580c" stopOpacity={0.3} />
              <Stop offset="58%" stopColor="#fb923c" stopOpacity={0.12} />
              <Stop offset="85%" stopColor="#fcd34d" stopOpacity={0.03} />
              <Stop offset="100%" stopColor="#fffbeb" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={topW} height={TOP_BAND_H} fill="url(#orzoGlowBottom)" />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[styles.edgeLeft, leftStyle]}
        collapsable={false}
      >
        <Svg
          width={SIDE_BAND_W}
          height={sideH}
          viewBox={`0 0 ${SIDE_BAND_W} ${sideH}`}
        >
          <Defs>
            <LinearGradient id="orzoGlowLeft" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#ea580c" stopOpacity={0.52} />
              <Stop offset="32%" stopColor="#f97316" stopOpacity={0.28} />
              <Stop offset="62%" stopColor="#fbbf24" stopOpacity={0.1} />
              <Stop offset="100%" stopColor="#fff7ed" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={SIDE_BAND_W} height={sideH} fill="url(#orzoGlowLeft)" />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[styles.edgeRight, rightStyle]}
        collapsable={false}
      >
        <Svg
          width={SIDE_BAND_W}
          height={sideH}
          viewBox={`0 0 ${SIDE_BAND_W} ${sideH}`}
        >
          <Defs>
            <LinearGradient id="orzoGlowRight" x1="100%" y1="0%" x2="0%" y2="0%">
              <Stop offset="0%" stopColor="#ea580c" stopOpacity={0.52} />
              <Stop offset="32%" stopColor="#f97316" stopOpacity={0.28} />
              <Stop offset="62%" stopColor="#fbbf24" stopOpacity={0.1} />
              <Stop offset="100%" stopColor="#fff7ed" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={SIDE_BAND_W} height={sideH} fill="url(#orzoGlowRight)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  edgeTop: {
    position: "absolute",
    top: 0,
    left: SIDE_BAND_W,
    right: SIDE_BAND_W,
    height: TOP_BAND_H,
    overflow: "hidden",
  },
  edgeBottom: {
    position: "absolute",
    bottom: 0,
    left: SIDE_BAND_W,
    right: SIDE_BAND_W,
    height: TOP_BAND_H,
    overflow: "hidden",
  },
  edgeLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDE_BAND_W,
    overflow: "hidden",
  },
  edgeRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: SIDE_BAND_W,
    overflow: "hidden",
  },
});
