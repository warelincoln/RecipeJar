import React, { useEffect, useRef } from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useImportQueueStore } from "../stores/importQueue.store";
import type { NavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation/types";

const HIDDEN_SCREENS = new Set(["ImportFlow", "ImportHub", "WebRecipeImport"]);

function useCurrentRouteName(
  navigationRef: React.RefObject<NavigationContainerRef<RootStackParamList>>,
) {
  const [routeName, setRouteName] = React.useState<string | undefined>();

  useEffect(() => {
    const ref = navigationRef.current;
    if (!ref) return;

    const update = () => {
      const state = ref.getRootState?.();
      if (state) {
        const route = state.routes[state.index];
        setRouteName(route?.name);
      }
    };

    update();
    const unsubscribe = ref.addListener("state", update);
    return () => unsubscribe();
  }, [navigationRef]);

  return routeName;
}

interface Props {
  navigationRef: React.RefObject<NavigationContainerRef<RootStackParamList>>;
}

export function PendingImportsBanner({ navigationRef }: Props) {
  const insets = useSafeAreaInsets();
  const entries = useImportQueueStore((s) => s.entries);
  const routeName = useCurrentRouteName(navigationRef);

  const translateY = useRef(new Animated.Value(-8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dotOpacity = useRef(new Animated.Value(1)).current;

  const shouldHide =
    entries.length === 0 || (routeName && HIDDEN_SCREENS.has(routeName));

  useEffect(() => {
    if (!shouldHide) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
          tension: 100,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [shouldHide, translateY, opacity]);

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(dotOpacity, {
          toValue: 0.15,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    blink.start();
    return () => blink.stop();
  }, [dotOpacity]);

  if (shouldHide) return null;

  const anyParsing = entries.some(
    (e) => e.status === "parsing" || e.status === "uploading",
  );
  const readyCount = entries.filter(
    (e) => e.status === "parsed" || e.status === "needs_retake",
  ).length;

  let label: string;
  if (anyParsing && readyCount > 0) {
    label = `${entries.length} importing`;
  } else if (anyParsing) {
    label = entries.length === 1 ? "Parsing..." : `${entries.length} parsing`;
  } else {
    label = readyCount === 1 ? "1 ready" : `${readyCount} ready`;
  }

  const dotColor = anyParsing ? "#fb923c" : "#16a34a";

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: insets.top + 54,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents={shouldHide ? "none" : "auto"}
    >
      <TouchableOpacity
        style={styles.pill}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => {
          navigationRef.current?.navigate("ImportHub");
        }}
      >
        <Animated.View
          style={[
            styles.dot,
            { backgroundColor: dotColor, opacity: dotOpacity },
          ]}
        />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    right: 16,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#374151",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
});
